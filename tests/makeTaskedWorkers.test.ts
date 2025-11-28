import { expect } from '@std/expect'
import { describe, it } from '@std/testing/bdd'
import makeTaskedWorkers from '../makeTaskedWorkers.ts'

declare const import_0: {
  // deno-lint-ignore no-explicit-any
  decorate: (x: any) => string
}

const data = [0, 1, 2, 3, 4, 5]
const fnData = {
  count: 6,
  func: (i: number) => i,
}
const workerCount = 4
const responseHandler = <T>(item: T, array: T[] | undefined) =>
  !array ? [item] : [...array, item]
const scripts = [
  URL.createObjectURL(
    new Blob([`export function decorate(x){return "D" + x}`], {
      type: 'application/javascript',
    }),
  ),
]
const toSquared = (x: number) => x ** 2
const expectedAnswer = [['D0', 'D1'], ['D4', 'D9'], ['D16'], ['D25']]

describe('makeTaskedWorkers', () => {
  describe('results only', () => {
    describe('no deps, no scripts', () => {
      const workerCallback = (data: number) => {
        return data ** 2
      }
      it('works properly with data=array', async () => {
        const worker = makeTaskedWorkers({
          data,
          workerCount,
          responseHandler: responseHandler<number>,
          workerCallback,
        })
        worker.run()
        const res = await worker.getResultsAsync((outerArr) =>
          outerArr.map((innerArr) => innerArr.map((x) => 'D' + x))
        )
        expect(res).toStrictEqual(expectedAnswer)
      })
      it('works properly with data=fn', async () => {
        const worker = makeTaskedWorkers({
          data: fnData,
          workerCount,
          responseHandler: responseHandler<number>,
          workerCallback,
        })
        worker.run()
        const res = await worker.getResultsAsync((outerArr) =>
          outerArr.map((innerArr) => innerArr.map((x) => 'D' + x))
        )
        expect(res).toStrictEqual(expectedAnswer)
      })
    })

    describe('yes deps, no scripts', () => {
      const workerCallback = (
        data: number,
        _index: number,
        sq: typeof toSquared,
      ) => {
        return sq(data)
      }
      it('works properly with data=array', async () => {
        const worker = makeTaskedWorkers({
          data,
          workerCount,
          responseHandler: responseHandler<number>,
          workerCallback,
        }, toSquared)
        worker.run()
        const res = await worker.getResultsAsync((outerArr) =>
          outerArr.map((innerArr) => innerArr.map((x) => 'D' + x))
        )
        expect(res).toStrictEqual(expectedAnswer)
      })
      it('works properly with data=fn', async () => {
        const worker = makeTaskedWorkers({
          data: fnData,
          workerCount,
          responseHandler: responseHandler<number>,
          workerCallback,
        }, toSquared)
        worker.run()
        const res = await worker.getResultsAsync((outerArr) =>
          outerArr.map((innerArr) => innerArr.map((x) => 'D' + x))
        )
        expect(res).toStrictEqual(expectedAnswer)
      })
    })

    describe('no deps, yes scripts', () => {
      const workerCallback = (data: number) => {
        return import_0.decorate(data ** 2)
      }
      it('works properly with data=array', async () => {
        const worker = makeTaskedWorkers({
          data,
          workerCount,
          responseHandler: responseHandler<string>,
          workerCallback,
          scripts,
        })
        worker.run()
        const res = await worker.getResultsAsync()
        expect(res).toStrictEqual(expectedAnswer)
      })
      it('works properly with data=fn', async () => {
        const worker = makeTaskedWorkers({
          data: fnData,
          workerCount,
          responseHandler: responseHandler<string>,
          workerCallback,
          scripts,
        })
        worker.run()
        const res = await worker.getResultsAsync()
        expect(res).toStrictEqual(expectedAnswer)
      })
    })

    describe('yes deps, yes scripts', () => {
      const workerCallback = (
        data: number,
        _index: number,
        sq: typeof toSquared,
      ) => {
        return import_0.decorate(sq(data))
      }
      it('works properly with data=array', async () => {
        const worker = makeTaskedWorkers({
          data,
          workerCount,
          responseHandler: responseHandler<string>,
          workerCallback,
          scripts,
        }, toSquared)
        worker.run()
        const res = await worker.getResultsAsync()
        expect(res).toStrictEqual(expectedAnswer)
      })
      it('works properly with data=fn', async () => {
        const worker = makeTaskedWorkers({
          data: fnData,
          workerCount,
          responseHandler: responseHandler<string>,
          workerCallback,
          scripts,
        }, toSquared)
        worker.run()
        const res = await worker.getResultsAsync()
        expect(res).toStrictEqual(expectedAnswer)
      })
    })
  })
  describe('promises', () => {
    const workerCallback = async (data: number) => {
      const promise = new Promise((resolve: (value: number) => void) => {
        setTimeout(() => resolve(data as number), data * 10)
      })
      const awaitedData = await promise
      return awaitedData ** 2
    }
    it('works fine without termination', async () => {
      const worker = makeTaskedWorkers({
        data: fnData,
        workerCount: 6,
        responseHandler: responseHandler<number>,
        workerCallback,
      })
      expect(worker.getStatus()).toStrictEqual('neverStarted')
      worker.run()
      expect(worker.getStatus()).toStrictEqual('isRunning')
      worker.pause()
      expect(worker.getStatus()).toStrictEqual('isPaused')
      worker.run()
      expect(worker.getStatus()).toStrictEqual('isRunning')
      const timer = setTimeout(() => {
        const results = worker.getResults((x) => x)
        expect(results[0]).toStrictEqual([0])
        expect(results[5]).toBeUndefined()
        clearTimeout(timer)
      }, 10)
      const res = await worker.getResultsAsync((x) => x.flat())
      expect(worker.getStatus()).toStrictEqual('hasCompleted')
      expect(res).toStrictEqual([0, 1, 4, 9, 16, 25])
    })
    it('terminates', async () => {
      const worker = makeTaskedWorkers({
        data: fnData,
        workerCount: 6,
        responseHandler: responseHandler<number>,
        workerCallback,
      })
      expect(worker.getStatus()).toStrictEqual('neverStarted')
      worker.run()
      expect(worker.getStatus()).toStrictEqual('isRunning')
      worker.pause()
      expect(worker.getStatus()).toStrictEqual('isPaused')
      worker.run()
      expect(worker.getStatus()).toStrictEqual('isRunning')
      const timer = setTimeout(() => {
        worker.terminate()
        clearTimeout(timer)
      }, 10)
      const res = await worker.getResultsAsync((x) => x)
      expect(worker.getStatus()).toStrictEqual('wasTerminated')
      expect(res[0]).toStrictEqual([0])
      expect(res[5]).toBeUndefined()
    })
  })
})
