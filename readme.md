# TaskedWorker

## Links

github: [Voldemortas/taskedworker](https://github.com/Voldemortas/TaskedWorker)\
jsr: [@voldemortas/taskedworker](https://jsr.io/@voldemortas/taskedworker)

## Instalation

To add it to your dependencies use one of the following

```bash
deno add jsr:@voldemortas/taskedworker
pnpm i jsr:@voldemortas/taskedworker
yarn add jsr:@voldemortas/taskedworker
npx jsr add @voldemortas/taskedworker
bunx jsr add @voldemortas/taskedworker
```

And import with

`import makeTaskedWorkers from "@voldemortas/taskedworker";`\
or if using browser:\
`import makeTaskedWorkers from "https://esm.sh/jsr/@voldemortas/taskedworker"`

## Usage

You can check examples by visiting [examples](examples) directory.

### Sum Example

Let's analyse [`examples/sum.ts`](examples/sum.ts) first to see how things work.

```ts
import makeTaskedWorkers from '@voldemortas/taskedworker'

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
worker.run()
const results = await worker.getResultsAsync((arr) => arr.reduce(sum)))
```

Let disect the parameters used in the `makeTaskedWorkers()` function: There are
3 parameters:

1. A long `config` object
2. `sum` - function defined above summing 2 numbers
3. `COUNT / dataCount` - a kind of constant

The `config` is the backbone, so let's analyse what it's made of:

- `data`: it can either be array of data or a function that returns a specific
  value based on the index and the total count of data points,
  `{count: 10, func: identity}` is equal to `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]`
- `workerCount` - pretty self explanatory (_except it's a lie, more about it
  later_)
- `workerCallback` - the most important thing. Firstly it accepts `2 + n`
  paramters:
  1. `dataPiece` - data for worker to operate on, since we just pass a simple
     array of numbers from `0` to `9`, the data will be `0`, or `1` or ... up to
     including `9`
  2. `workerId` - this is the id of worker, since the amount of workers is the
     same as the amount of data points it's equal to the `dataPiece` but
     `workerCount` can be any number lower or equal to `dataCount` so it can be
     handy in certain situations.
  3. `sumFn` and `count` - these refer to the last paramters of `sum` and
     `COUNT/dataCount` parameters used in the `makeTaskedWorkers()` because
     `Worker` is its own scope and cannot access data from the host. Under the
     hood these paramters get serialised and deserialised.
- `responseHandler` - this is the function that handles data returned by the
  `workerCallback`. Since we have _10 data points_ but _7 workers only_ it means
  that some workers will have to call the `workerCallback()` twice and in our
  case we want to add the returned values. The function accepts 2 paramters:
  1. `cur` - the data returned by the `workerCallback()`
  2. `acc` - previously accumulated value within the worker. Since initially the
     data is `undefined` it is handled with the ternary `acc ? acc + cur : cur`
     operator.

One can wonder why our `workerCallback` in this example is so complicated,
wouldn't it easier to have `100000000` data points and just use the _identity_
function? The answer is no! Remember the _`workerCount` lie_? Well actually the
amount of workers is double the amount of `workerCount` - each worker has its
own sub-worker and the actual computation is done inside the sub-worker, the
outer-worker only does things like using the `responseHandler()` on returned
value from the `workerCallback()` and allows some meddling that can be done with
the methods of the return object.

### Advanced Example

Now let's analyse [examples/advanced.ts](examples/advanced.ts)\
At first we find

```ts
import makeTaskedWorkers from '@voldemortas/taskedworker'

declare const import_0: {
  decorate: (x: number) => string
}

const scripts = [
  URL.createObjectURL(
    new Blob([`export function decorate(x){return "D" + x}`], {
      type: 'application/javascript',
    }),
  ),
]

const data = [0, 1, 2, 3, 4, 5]
const workerCount = 6
const responseHandler = <T>(item: T, array: T[] | undefined) =>
  !array ? [item] : [...array, item]

const workerCallback = async (data: number) => {
  const promise = new Promise((resolve: (value: number) => void) => {
    setTimeout(() => resolve(data as number), data * 10)
  })
  const awaitedData = await promise
  return import_0.decorate(awaitedData ** 2)
}

const worker = makeTaskedWorkers({
  data,
  workerCount,
  responseHandler: responseHandler<string>,
  workerCallback,
  scripts,
})
```

The first thing that stands out is the declared module `import_0`. This is the
_external_ module that our _sub-worker_ can import and use! This means we can
use use our custom functions without having to inject dependencies manually (but
nobody stops you from doing that if you dare). Later we find the `scripts`
array - it's an array of the urls we want to include our modules from. Since
we're defining our module inside this very example, the _code of the module_ is
first converted into a blob and then its url is made, however all of this is
optional and we can just create another file `/decorator.ts` with the content

```ts
export function decorate(x: number): string {
  return `D${x}`
}
```

and our `scripts` array would simply be `['/decorate.ts']`. You can pass
multiple modules and the way to access them is to use the reserved `import_N`
variables where `N` refers to index of the `scripts` array.

Later in the code we see

```ts
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
```

and the later sample with

```ts
worker.terminate()
```

These exposed methods of the `worker` object let's us manipulate/observe the
status/progress of the ongoing processess in our workers. That's why we have
_sub-workers_ within our _outer-workers_.

# License

The MIT License (MIT)

Copyright (c) 2025 Andrius Simanaitis

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
