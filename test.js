const { datum, compose } = require('./index.js')

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

testCompose()
