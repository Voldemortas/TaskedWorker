import makeTaskedWorkers from '@voldemortas/taskedworker'

async function perform(callback: () => Promise<number> | number) {
  const t0 = performance.now()
  const result = await callback()
  const t1 = performance.now()
  console.log(`${t1 - t0}ms`)
  console.log(result)
}

const identity = <T>(x: T) => x
const sum = (a: number, b: number) => a + b
const COUNT = 100000000
const dataCount = 10
const workerCount = 7

const worker = makeTaskedWorkers<number, number, number>(
  {
    data: {
      count: dataCount,
      func: identity,
    },
    workerCount,
    responseHandler: (cur, acc: undefined | number) => acc ? acc + cur : cur,
    workerCallback: (dataPiece: number, _workerId: number, sumFn, count) => {
      return Array.from({ length: count }).map((_, i) => dataPiece * count + i)
        .reduce(
          sumFn,
          0,
        )
    },
  },
  sum,
  COUNT / dataCount,
)

await perform(() =>
  Array.from({ length: COUNT }).map((_, i) => i).reduce(
    (acc, cur) => acc + cur,
    0,
  )
)

await perform(() => {
  worker.run()
  return (worker.getResultsAsync((arr) => arr.reduce(sum)))
})
