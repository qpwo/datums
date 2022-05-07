const { deepStrictEqual, strictEqual, ok } = require('assert')
const { datum, compose } = require('../dist/index.cjs')

/** Datums use very little memory and have zero background activity,
 * so you can use millions of them in a single application.
 */
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

function htmlExample() {
    const username = datum('tom')
    const birthday = datum(new Date('1/1/1980'))
    const year = 365 * 24 * 60 * 60 * 1000
    const welcome = compose(
        data => `
            <div>
                <h1>Welcome ${data.username}!</h1>
                <p>You are ${
                    ((Date.now() - data.birthday) / year) | 0
                } years old.</p>
            </div>
        `,
        { username, birthday }
    )
    return welcome
}

function htmlRenderExample() {
    const container = document.getElementById('container')
    const welcome = htmlExample()
    welcome.onChange(html => (container.innerHTML = html))
}

efficientReducer()
