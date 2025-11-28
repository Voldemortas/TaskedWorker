/**
 * Data for workers to work with, can be either array or a function which returns a based on the data's index
 * @template T
 * @example
 * ```
 * //good when data is simple
 * ['hello', 'world']
 * ```
 * @example
 * ```
 * //good when it takes time to compute the value
 * //the computation is done inside the worker
 * {count: 2, func: (index) => ['hello', 'world'][index]}
 * ```
 */
export type ArrayOrFunction<T> =
  | T[]
  | { func: (index: number) => T; count: number }
/**
 * Callback function that each worker runs with each piece of data
 * @template T input for worker to work with
 * @template U output the worker returns
 *
 * @example
 * ```
 * //magicNumbers = [4, 2]
 * (data: string, workerIndex: number, magicNumber: number[]) => {
 *  return string + magicNumber[workerIndex ]
 * }
 * ```
 */
export type WorkerFunction<T, U> = (
  data: T,
  workerIndex: number,
  // deno-lint-ignore no-explicit-any
  ...aditionalParams: any
) => U | Promise<U>
type Status =
  | 'neverStarted'
  | 'isPaused'
  | 'isRunning'
  | 'hasCompleted'
  | 'wasTerminated'
/**
 * Function to aggregate the data WorkerFunction retrieved
 * @example
 * ```
 * //most common use - just flat arrays into one array
 * (data) => data.flat()
 * ```
 * @example
 * ```
 * //let's say each worker found the most common word in their sets of data
 * //and you want to make a sentence out of those words
 * (data: string[]) => data.join(' ')
 * ```
 */
export type ResultsCallback<V, Z> = (data: V[]) => Z
type WorkerResponse<U> = { data: U; id: number }

function identity<T>(x: T) {
  return x
}

function fromTo(
  count: number,
  groups: number,
): { from: number; to: number }[] {
  if (groups === 1) {
    return [{ from: 0, to: count }]
  }
  const groupSize = Math.floor(count / groups)
  return [
    ...fromTo(count - groupSize, groups - 1),
    { from: count - groupSize, to: count },
  ]
}

/**
 * Creates a wrapper that lets control you workers by running, pausing, terminating them.
 * Also provides ways to observe data
 * @template T input type for worker to work with
 * @template U the output worker returns
 * @template V the aggregated data from different workers
 *
 * @param param0
 * @param moreParams
 * @returns TaskedWorker
 */
export default function makeTaskedWorkers<T, U, V>(
  {
    data,
    workerCount,
    workerCallback,
    responseHandler,
    scripts = [],
  }: {
    data: ArrayOrFunction<T>
    workerCount: number
    workerCallback: WorkerFunction<T, U>
    responseHandler: (item: U, acc: V | undefined) => V
    scripts?: string[]
  },
  // deno-lint-ignore no-explicit-any
  ...moreParams: any[]
): {
  getStatus: () => Status
  run: () => void
  pause: () => void
  getResults: <Z>(callback?: ResultsCallback<V, Z>) => Z
  terminate: () => void
  getResultsAsync: <Z>(callback?: ResultsCallback<V, Z>) => Promise<Z>
  getProgress: () => {
    finished: number
    running: number
    from: number
    to: number
  }[]
} {
  let status: Status = 'neverStarted'
  const emptyWorkerSizedArray = Array.from({ length: workerCount }) as V[]
  const workerSizedArrayWithId = Array.from({ length: workerCount }).map((
    _,
    i,
  ) => i)
  const results: V[] = emptyWorkerSizedArray
  const total = Array.isArray(data) ? data.length : data.count
  const progresses = fromTo(total, workerCount).map((x) => ({
    ...x,
    finished: -1,
    running: -1,
  }))
  const terminationError = new Error('Workers have been Terminated')
  const completedError = new Error('Workers have completed the task')
  const workers: Worker[] = []
  let promise: Promise<V[]>
  const abortController = new AbortController()

  function start() {
    const firstWorkerLayer = getBody(firstWorker)

    const secondWorker = (id: number) => `
      ${
      scripts.length === 0
        ? ''
        : scripts.map((url, i) => `import * as import_${i} from '${url}'`)
          .join(
            '\n',
          )
    }
      self.onmessage = async ({ data }) => {
        const awaited = await (${workerCallback.toString()})(data, ${id}, ${moreParams})
        postMessage(awaited) 
      }`

    const getSecondBlobUrl = (id: number) => makeBlobUrl(secondWorker(id))
    const getFirstBlobUrl = (id: number) =>
      makeBlobUrl(
        firstWorkerLayer.replace('replaceMe', getSecondBlobUrl(id)),
      )
    status = 'isRunning'

    promise = new Promise((resolve) => {
      abortController.signal.addEventListener('abort', () => {
        resolve(results)
      })

      workerSizedArrayWithId.forEach((id) => {
        const worker = new Worker(getFirstBlobUrl(id), { type: 'module' })
        worker.onmessage = (event: MessageEvent<WorkerResponse<U>>) => {
          const eventID = event.data.id
          results[id] = responseHandler(event.data.data, results[id!]!)
          progresses[id]!.finished = eventID
          if (progresses.every(({ finished, to }) => finished + 1 === to)) {
            status = 'hasCompleted'
            worker.terminate()
            resolve(results)
          }
          if (status === 'isRunning') {
            if (progresses[id]!.finished + 1 !== progresses[id]!.to) {
              worker.postMessage({
                type: 'compute',
                id: eventID + 1,
                item: Array.isArray(data)
                  ? data[eventID + 1]!
                  : data.func(eventID + 1),
              })
              progresses[id]!.running = eventID + 1
            } else {
              worker.terminate()
            }
          }
        }
        const eventID = progresses[id]!.from
        worker.postMessage({
          type: 'compute',
          id: eventID,
          item: Array.isArray(data) ? data[eventID]! : data.func(eventID),
        })
        progresses[id]!.running = eventID
        workers.push(worker)
      })
    })
  }

  function getStatus(): Status {
    return status
  }

  function run() {
    checkIfNotTerminated()
    checkIfCompleted()
    if (status === 'neverStarted') {
      start()
    }
    if (status === 'isPaused') {
      status = 'isRunning'
      progresses.forEach(({ finished, running, to }, id) => {
        if (running === finished && finished + 1 !== to) {
          const eventID = running + 1
          workers[id]!.postMessage({
            type: 'compute',
            id: eventID,
            item: Array.isArray(data) ? data[eventID]! : data.func(eventID),
          })
        }
      })
    }
  }

  function pause() {
    checkIfNotTerminated()
    checkIfCompleted()
    if (status !== 'isPaused') {
      status = 'isPaused'
    }
  }

  function terminate() {
    checkIfNotTerminated()
    checkIfCompleted()
    abortController.abort()
    workers.forEach((w) => {
      w.terminate()
    })
    status = 'wasTerminated'
  }

  function getProgress() {
    return [...progresses]
  }

  function getResults<Z>(
    callback: ResultsCallback<V, Z> = identity as ResultsCallback<V, Z>,
  ) {
    return callback([...results])
  }

  async function getResultsAsync<Z>(
    callback: ResultsCallback<V, Z> = identity as ResultsCallback<V, Z>,
  ) {
    const awaited = await promise
    return callback(awaited)
  }

  function checkIfNotTerminated() {
    if (status === 'wasTerminated') {
      throw terminationError
    }
  }

  function checkIfCompleted() {
    if (status === 'hasCompleted') {
      throw completedError
    }
  }

  return {
    getStatus,
    run,
    pause,
    getResults,
    terminate,
    getResultsAsync,
    getProgress,
  }
}

function makeBlobUrl(workerBody: string) {
  const blob = new Blob([workerBody], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}

// deno-lint-ignore no-explicit-any
function getBody(func: (...w: any) => any) {
  const entire = func.toString()
  return entire.substring(entire.indexOf('{') + 1, entire.lastIndexOf('}'))
}

const firstWorker = (self: Worker) => {
  type WorkerEvent<U> =
    | { type: 'terminate' }
    | { item: U; id: number; type: 'compute' }

  let worker: Worker

  self.onmessage = (event: MessageEvent<WorkerEvent<string>>) => {
    const { type } = event.data
    if (type === 'compute') {
      const { item, id } = event.data
      worker = new Worker('replaceMe', { type: 'module' })
      worker.postMessage(item)
      worker.onmessage = ({ data }) => {
        self.postMessage({ data, id })
        worker.terminate()
      }
    } else if (worker) {
      worker.terminate()
    }
  }
}
