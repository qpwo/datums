# datums

Very light reactive data. Efficient & composable. Very simple.

```sh
npm i datums
```

```ts
import { datum, compose, toReadonly, setMany } from 'datums'

const width = datum(100)
width.set(150)
width.val // 150
const height = datum(300)

const img = document.createElement('img')
document.body.appendChild(img)

const url = compose(
    ({ width, height }) => `https://picsum.photos/${width}/${height}`,
    { width, height }
)
url.onChange(val => (img.src = val), true) // `true` makes it fire immediately

// trigger change twice:
width.set(500)
height.set(500)

const area = compose(({ width, height }) => width * height, { width, height })
area.onChange(() => console.log('new image area'))

// above listener won't fire because product is unchanged, and url will only change once:
setMany([width, 250], [height, 1000])

// onChange gives you the old value too
area.onChange((val, prev) => console.log(`area changed by ${prev - val}`))

// compose gives you the last output too
const areaSum = compose(({ area }, lastOut) => area + (lastOut ?? 0), { area })
const areaHistory = compose(({ area }, lastOut) => [...(lastOut ?? []), area], {
    area,
})

// You get full type checking and editor completion for all methods and arguments

import { expensiveComputation } from 'somewhere'

const [x, y, z] = datums(5, 6, 7)
const result = compose(vals => expensiveComputation(vals), { x, y, z })
const text = compose(({ result }) => `the result is ${result}.`, { result })
text.onChange(val => console.log(val))

// Anything is possible.

// You can make millions of these. They are extremely fast.

// If you need a composed cursor to stop listening:
result.stopListening()
```
