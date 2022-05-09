import { deepStrictEqual, strictEqual, ok } from 'assert'
import { datum, compose, datums, setMany } from '../index'
import { performance } from 'perf_hooks'

/** Datums use very little memory and have zero background activity,
 * so you can use millions of them in a single application.
 */
function testMemory() {
    class Dummy {
        x: number
        constructor() {
            this.x = Math.random()
        }
        f() {
            return this.x
        }
    }
    const mem0 = getMemoryMb()
    const dummies = Array.from({ length: 1_000_000 }, () => new Dummy())
    const mem1 = getMemoryMb()
    const datums = Array.from({ length: 1_000_000 }, () => datum(Math.random()))
    const mem2 = getMemoryMb()
    const dummyMemory = mem1 - mem0
    const datumMemory = mem2 - mem1
    console.log({ dummyMemory, datumMemory })
    ok(datumMemory < dummyMemory * 4)
}

function testSpeed() {
    const stopBaselineClock = startClock()
    Array.from({ length: 10_000_000 }, () => Math.random())
    const baseline = stopBaselineClock()
    const stopDatumClock = startClock()
    Array.from({ length: 10_000_000 }, () => datum(Math.random()))
    const datumTime = stopDatumClock()
    console.log({ baseline, datumTime })
    ok(datumTime < baseline * 4)
}

/** A simple example of composing datums */
function testCompose() {
    const x = datum(1)
    const yz = datum({ y: 2, z: 3 })
    const product = compose(({ x, yz }) => x * yz.y * yz.z, { x, yz })
    product.onChange(p => console.log('product:', p))
    x.set(10)
    yz.set({ y: 3, z: 2 }) // no change
    yz.set({ y: 6, z: 1 }) // no change
    yz.set({ y: 6, z: 6 }) // new product
}

/** You can use the lastValue arg in your compute callback to make a reducer */
function reducerPattern() {
    const enemyId = datum(1)
    const seenEnemies = compose(
        ({ enemyId }, last: number[] | null) =>
            last == null ? [enemyId] : [...last, enemyId],
        { enemyId }
    )
    enemyId.set(2)
    enemyId.set(5)
    enemyId.set(17)
    console.log('seen:', seenEnemies.val)
    deepStrictEqual(seenEnemies.val, [1, 2, 5, 17])
}

/** If you don't need onChange to fire, then you can make your reducer
 *  memory-efficient by mutating the old value instead of creating a new one.
 */
function efficientReducer() {
    const stopClock = startClock()
    const id = datum(0)
    const seenIds = compose(
        ({ id }, last: number[] | null) => {
            if (last == null) return [id]
            last.push(id)
            return last
        },
        { id }
    )
    for (let i = 0; i < 1_000_000; i++) {
        id.set(i)
    }
    const elapsed = stopClock()
    strictEqual(seenIds.val.length, 1_000_000)
    ok(elapsed < 1_000)
}

function htmlExample() {
    const username = datum('tom')
    const birthday = datum(new Date('1/1/1980'))
    const year = 365 * 24 * 60 * 60 * 1000
    const welcome = compose(
        data => `
            <div>
                <h1>Welcome ${data.username}!</h1>
                <p>You are ${
                    ((Date.now() - data.birthday.getTime()) / year) | 0
                } years old.</p>
            </div>
        `,
        { username, birthday }
    )
    return welcome
}

function htmlRenderExample() {
    const document: any = null // remove for browser
    const container = document.getElementById('container')
    const welcome = htmlExample()
    welcome.onChange(html => (container.innerHTML = html))
}

function classNamesArePreserved() {
    const d = datum(1)
    const c = compose(({ d }) => d * 2, { d })
    strictEqual(d.constructor.name, 'Datum')
    strictEqual(c.constructor.name, 'Composed')
}

function composeMixed() {
    const d = datum(1)
    const c0 = compose(({ d }) => d * 2, { d })
    const c1 = compose(({ c0 }) => c0 * 3, { c0 })
    const c2 = compose(({ d, c0, c1 }) => d + c0 + c1, { d, c0, c1 })
    let counter = 0
    c2.onChange(() => counter++)
    d.set(2)
    d.set(3)
    d.set(100)
    d.set(3)
    strictEqual(counter, 4)
    strictEqual(c2.val, 27)
}

function testDatums() {
    const [x, y, z] = datums(1, 'two', 3)
    strictEqual(x.val, 1)
    strictEqual(y.val, 'two')
    strictEqual(z.val, 3)
}

function testSetMany() {
    const [x, y, z] = datums(12, 12, 12)
    let x2Count = 0
    const x2 = compose(
        ({ x }) => {
            x2Count++
            return x * x
        },
        { x }
    )
    setMany([x, 1], [x, 2], [x, 3], [x, 12])
    strictEqual(x2Count, 1, 'x2Count')
    let productCount = 0
    let productChanges = 0
    const product = compose(
        ({ x, y, z }) => {
            productCount += 1
            return x * y * z
        },
        { x, y, z }
    )
    product.onChange(() => productChanges++)
    setMany([x, 24], [y, 1], [z, 72])
    setMany([x, 12], [y, 12], [z, 12])
    setMany([x, 12], [y, 12], [z, 13])
    strictEqual(productCount, 4, 'productCount')
    strictEqual(productChanges, 1, 'productChanges')
    strictEqual(product.val, 12 * 12 * 13)
}

function setManyCycle() {
    const [x, y, z] = datums(1, 2, 3)
    setMany([x, y.val], [y, z.val], [z, x.val])
    deepStrictEqual([x.val, y.val, z.val], [2, 3, 1])
}

/** 500k listeners spread over 10k datums then trigger 10k random ones once each */
function lotsOfListeners() {
    const start = performance.now()
    const datums = Array.from({ length: 10_000 }, () => datum(Math.random()))
    for (let i = 0; i < 10_000; i++) {
        const idx = Math.floor(Math.random() * 10_000)
        for (let j = 0; j < 500; j++) {
            datums[idx].onChange(() => {})
        }
    }
    const attached = performance.now()
    for (let i = 0; i < 10_000; i++) {
        const idx = Math.floor(Math.random() * 10_000)
        datums[idx].set(Math.random())
    }
    const sentAll = performance.now()
    const attachTime = attached - start
    const sendTime = sentAll - attached
    console.log({ attachTime, sendTime })
    ok(sentAll - start < 2_000)
}

function frequentUnsub() {
    const d = datum(1)
    const stopClock = startClock()
    const unsubStack: (() => void)[] = []
    for (let i = 0; i < 10_000_000; i++) {
        if (Math.random() > 0.6 && unsubStack.length > 0) {
            unsubStack.pop()!()
        } else {
            unsubStack.push(d.onChange(() => {}))
        }
    }
    const elapsed = stopClock()
    console.log({ elapsed })
    ok(elapsed < 3_000)
}

// ===== UTILITIES =====

function getMemoryMb(): any {
    return process.memoryUsage().heapUsed / 1024 / 1024
}

function startClock() {
    const start = performance.now()
    return function stopClock() {
        const end = performance.now()
        return end - start
    }
}

// ==========

function main() {
    const tests = [
        setManyCycle,
        testSetMany,
        testDatums,
        composeMixed,
        testCompose,
        reducerPattern,
        efficientReducer,
        classNamesArePreserved,
        testMemory,
        testSpeed,
        lotsOfListeners,
        frequentUnsub,
    ]
    for (const t of tests) {
        console.log(`\n\nstarting test ${t.name}`)
        try {
            t()
        } catch (e_) {
            const e = e_ as Error
            console.error(`${t.name} FAILED:`, e.message)
            process.exitCode = 1
            continue
        }
        console.log(`test ${t.name} passed`)
    }
}
main()
