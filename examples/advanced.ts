import makeTaskedWorkers from '@voldemortas/taskedworker'

declare const import_0: {
  decorate: (x: number) => string
}

const data = [0, 1, 2, 3, 4, 5]
const workerCount = 6
const responseHandler = <T>(item: T, array: T[] | undefined) =>
  !array ? [item] : [...array, item]

const scripts = [
  URL.createObjectURL(
    new Blob([`export function decorate(x){return "D" + x}`], {
      type: 'application/javascript',
    }),
  ),
]

const workerCallback = async (data: number) => {
  const promise = new Promise((resolve: (value: number) => void) => {
    setTimeout(() => resolve(data as number), data * 10)
  })
  const awaitedData = await promise
  return import_0.decorate(awaitedData ** 2)
}

{
  const worker = makeTaskedWorkers({
    data,
    workerCount,
    responseHandler: responseHandler<string>,
    workerCallback,
    scripts,
  })
  console.log(worker.getStatus()) //neverStarted
  worker.run()
  console.log(worker.getStatus()) //isRunning
  worker.pause()
  console.log(worker.getStatus()) //isPaused
  worker.run()
  console.log(worker.getStatus()) //isRunning
  const timer = setTimeout(() => {
    console.log(worker.getProgress())
    /**
     [
      { from: 0, to: 1, finished: 0, running: 0 },
      { from: 1, to: 2, finished: 1, running: 1 },
      { from: 2, to: 3, finished: 2, running: 2 },
      { from: 3, to: 4, finished: -1, running: 3 },
      { from: 4, to: 5, finished: -1, running: 4 },
      { from: 5, to: 6, finished: -1, running: 5 }
    ]
     */
    const results = worker.getResults((x) => x)
    console.log(results[0]) //['D0']
    console.log(results[5]) //undefined
    clearTimeout(timer)
  }, 10)
  const res = await worker.getResultsAsync((x) => x.flat())
  console.log(worker.getStatus()) //hasCompleted
  console.log(res) //['D0', 'D1', 'D4', 'D9', 'D16', 'D25']
}

{
  const worker = makeTaskedWorkers({
    data,
    workerCount,
    responseHandler: responseHandler<string>,
    workerCallback,
    scripts,
  })
  console.log(worker.getStatus()) //neverStarted
  worker.run()
  console.log(worker.getStatus()) //isRunning
  worker.pause()
  console.log(worker.getStatus()) //isPaused
  worker.run()
  console.log(worker.getStatus()) //isRunning
  const timer = setTimeout(() => {
    worker.terminate()
    clearTimeout(timer)
  }, 10)
  const res = await worker.getResultsAsync((x) => x)
  console.log(worker.getStatus()) //wasTerminated
  console.log(res[0]) //['D0']
  console.log(res[5]) //undefined
}
