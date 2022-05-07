const { deepStrictEqual, strictEqual, ok } = require('assert')
const { datum, compose } = require('../dist/index.cjs')

function testMemory() {
    const mem = () =>
        console.log('MB memory:', process.memoryUsage().heapUsed / 1024 / 1024)

    mem()

    class C {
        constructor() {
            this.x = Math.random()
        }
        f() {
            return this.x
        }
    }

    const arr = []
    const start = performance.now()
    for (let i = 0; i < 1_000_000; i++) {
        // arr.push(datum(0))
        arr.push(new C())
    }
    const end = performance.now()
    console.log('elapsed:', ((end - start) | 0) / 1000)

    mem()
}

function testCompose() {
    const x = datum(1)
    const yz = datum({ y: 2, z: 3 })
    const product = compose(({ x, yz }) => x * yz.y * yz.z, { x, yz })
    product.onChange(p => console.log('product:', p))
    x.set(10)
    yz.set({ y: 3, z: 2 })
    yz.set({ y: 6, z: 1 })
    yz.set({ y: 6, z: 6 })
}

/** You can use the lastValue arg in your compute callback to make a reducer */
function reducerPattern() {
    const enemyId = datum(1)
    const seenEnemies = compose(
        ({ enemyId }, last) => (last == null ? [enemyId] : [...last, enemyId]),
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
        ({ id }, last) => {
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

function startClock() {
    const start = performance.now()
    return function stopClock() {
        const end = performance.now()
        return end - start
    }
}

efficientReducer()
