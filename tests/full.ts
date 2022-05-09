import { deepStrictEqual, strictEqual, ok } from 'assert'
import { datum, compose, toReadonly } from '../index'
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
    ok(datumMemory < dummyMemory * 4)
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
    console.log('seen:', seenEnemies.get())
    deepStrictEqual(seenEnemies.get(), [1, 2, 5, 17])
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
    strictEqual(seenIds.get().length, 1_000_000)
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
    const r = toReadonly(d)
    strictEqual(d.constructor.name, 'Datum')
    strictEqual(c.constructor.name, 'Composed')
    strictEqual(r.constructor.name, 'RODatum')
}

function composeMixed() {
    const d = datum(1)
    const c = compose(({ d }) => d * 2, { d })
    const r = toReadonly(c)
    const c2 = compose(({ d, c, r }) => d + c + r, { d, c, r })
    let counter = 0
    c2.onChange(() => counter++)
    d.set(2)
    d.set(3)
    d.set(100)
    d.set(3)
    strictEqual(counter, 4)
    strictEqual(c2.get(), 15)
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
        composeMixed,
        testMemory,
        testCompose,
        reducerPattern,
        efficientReducer,
        classNamesArePreserved,
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
