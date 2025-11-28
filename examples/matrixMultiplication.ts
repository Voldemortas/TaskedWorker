import makeTaskedWorkers from '@voldemortas/taskedworker'

// A is a 3x4 Matrix
const A = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [9, 10, 11, 12],
]
// B is a 4x2 Matrix
const B = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
]

// The resulting Matrix thus shall be 3X2:
// 28 34
// 76 98
// 156 178
const C = [
  [ // deno-fmt-ignore
    A[0][0] * B[0][0] + A[0][1] * B[1][0] + A[0][2] * B[2][0] + A[0][3] * B[3][0],
    // deno-fmt-ignore
    A[0][0] * B[0][1] + A[0][1] * B[1][1] + A[0][2] * B[2][1] + A[0][3] * B[3][1],
  ],
  [
    // deno-fmt-ignore
    A[1][0] * B[0][0] + A[1][1] * B[1][0] + A[1][2] * B[2][0] + A[1][3] * B[3][0],
    // deno-fmt-ignore
    A[1][0] * B[0][1] + A[1][1] * B[1][1] + A[1][2] * B[2][1] + A[1][3] * B[3][1],
  ],
  [
    // deno-fmt-ignore
    A[2][0] * B[0][0] + A[2][1] * B[1][0] + A[2][2] * B[2][0] + A[2][3] * B[3][0],
    // deno-fmt-ignore
    A[2][0] * B[0][1] + A[2][1] * B[1][1] + A[2][2] * B[2][1] + A[2][3] * B[3][1],
  ],
]

function calculateMatrixCell(
  matrixA: number[][],
  matrixB: number[][],
  i: number,
  j: number,
): number {
  let result = 0
  for (let p = 0; p < matrixB.length; p++) {
    result += matrixA[i][p] * matrixB[p][j]
  }
  return result
}

//same as Matrix D but calculated using calculateMatrixCell()
const D = [
  [calculateMatrixCell(A, B, 0, 0), calculateMatrixCell(A, B, 0, 1)],
  [calculateMatrixCell(A, B, 1, 0), calculateMatrixCell(A, B, 1, 1)],
  [calculateMatrixCell(A, B, 2, 0), calculateMatrixCell(A, B, 2, 1)],
]

//same as above, however, instead of providing coordinates (i, j), we provide the cell ID such as
//[
//  [0, 1],
//  [2, 3],
//  [4, 5]
//]
function calculateMatrixCell2(
  matrixA: number[][],
  matrixB: number[][],
  id: number,
): number {
  const matrixWidth = matrixB[0].length
  const i = Math.floor(id / matrixWidth)
  const j = id % matrixWidth
  let result = 0
  for (let p = 0; p < matrixB.length; p++) {
    result += matrixA[i][p] * matrixB[p][j]
  }
  return result
}

//same as Matrix D but calculated using calculateMatrixCell()
const E = [
  [calculateMatrixCell2(A, B, 0), calculateMatrixCell2(A, B, 1)],
  [calculateMatrixCell2(A, B, 2), calculateMatrixCell2(A, B, 3)],
  [calculateMatrixCell2(A, B, 4), calculateMatrixCell2(A, B, 5)],
]

console.assert(JSON.stringify(C) == JSON.stringify(D))
console.assert(JSON.stringify(C) == JSON.stringify(E))

{
  // deno-lint-ignore no-inner-declarations
  function to2DArray(array: number[], width: number): number[][] {
    const result: number[][] = []
    array.forEach((value, i) => {
      const height = Math.floor(i / width)
      if (i % width === 0) {
        result[height] = []
      }
      result[height].push(value)
    })
    return result
  }
  //3x2 doesn't really divide by 5 so we're doing the edge case scenario where we'd later transpose vector into a matrix
  const workerCount = 5
  const workers = makeTaskedWorkers({
    data: {
      count: A.length * B[0].length,
      func: (id) => calculateMatrixCell2(A, B, id),
    },
    workerCount,
    workerCallback: (data) => data, //the worker computation is actually done by the data.func
    responseHandler: (item, array: number[] | undefined) =>
      array ? [...array, item] : [item],
  })
  workers.run()
  const cells = await workers.getResultsAsync((x) => x.flat())
  const matrix = to2DArray(cells, B[0].length)

  console.assert(JSON.stringify(C) == JSON.stringify(matrix))
}

{
  //since the expected result is 3 lines - a perfect scenario, we wouldn't need to do any transposing later on
  const workerCount = 3
  const workers = makeTaskedWorkers({
    data: {
      count: A.length * B[0].length,
      func: (id) => calculateMatrixCell2(A, B, id),
    },
    workerCount,
    workerCallback: (data) => data,
    responseHandler: (item, array: number[] | undefined) =>
      array ? [...array, item] : [item],
  })
  workers.run()
  const matrix = await workers.getResultsAsync()

  console.assert(JSON.stringify(C) == JSON.stringify(matrix))
}
