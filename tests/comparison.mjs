import Baobab from 'baobab'
import { createStore } from 'redux'
import { datum } from 'datums'

const runs = 10
const n = 10_000

let baobabTime = 0
let baobabMemory = 0
let reduxTime = 0
let reduxMemory = 0
let datumTime = 0
let datumMemory = 0

for (let i = 0; i < runs; i++) {
    const m0 = getMemoryMb()
    const t0 = performance.now()

    const barr = Array.from({ length: n }, () => new Baobab())
    barr.forEach(b => b.get())

    const m1 = getMemoryMb()
    const t1 = performance.now()

    const rarr = Array.from({ length: n }, () => createStore(() => 0))
    rarr.forEach(r => r.getState())

    const m2 = getMemoryMb()
    const t2 = performance.now()

    const darr = Array.from({ length: n }, () => datum(0))
    darr.forEach(d => d.val)

    const m3 = getMemoryMb()
    const t3 = performance.now()

    baobabTime += t1 - t0
    baobabMemory += m1 - m0

    reduxTime += t2 - t1
    reduxMemory += m2 - m1

    datumTime += t3 - t2
    datumMemory += m3 - m2
}

console.log({
    baobabTime: baobabTime / runs,
    baobabMemory: baobabMemory / runs,
    reduxTime: reduxTime / runs,
    reduxMemory: reduxMemory / runs,
    datumTime: datumTime / runs,
    datumMemory: datumMemory / runs,
})

function getMemoryMb() {
    return process.memoryUsage().heapUsed / 1024 / 1024
}
