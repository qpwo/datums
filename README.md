# datums

Very light reactive data. Efficient & composable. Very simple. Full type checking and editor hints on all functions and methods. A bit different from redux or baobab.

```sh
npm i datums
```

**Basic API**: Make a datum with `datum(value)`. It has `.val`, `.set`, and `.onChange`. Compose datums with `compose(compute, ...datums)` to get a reactive computation. You can compute or store a number, a resource, html, a string, a class instance, anything. It's a very expressive & efficient pattern.

They're similar to mithril's `stream`s and solid js's `signal`s, but simpler and easier to understand.

![memory](https://user-images.githubusercontent.com/10591373/167476373-1e3e0ec2-7a86-4299-93fe-7498a507e5bb.png)

Some useful things to do with datums, look in [patterns.ts](tests/patterns.ts) for some examples:

-   Impose a **constraint system**
-   Manage a network of asynchronous events (user input, network requests) without callback hell
-   Dynamically change DOM or graphics values without triggering massive re-renders
-   Create an entire rendering system in a few lines

## Example

```ts
import { datum, compose, setMany, datums } from 'datums'

// These things cost nothing
const throwaway = new Array(10_000_000).fill(null).map(() => datum(0))

const page = datum('Home')
page.onChange(p => {
    destroyPage()
    renderPage(p)
})
page.set('About')
const history = compose(([page], prev) => [...(prev ?? []), page], page)

const [w, h] = datums(100, 10)
const area = compose(([w, h]) => w * h, w, h)
const unsub = area.onChange(() => {
    throw Error('Area must never change')
})
setMany([w, 50], [h, 20]) // area does not change
unsub()

const status = datum('loading')
const result = datum(null)
status.onChange(s => (div.innerText = s), true) // fires immediately
result.onChange(r => fireUpApp(r))
fetch('example.com/data.json')
    .then(d => {
        status.set('parsing')
        return d.json()
    })
    .then(json => {
        status.set('done')
        result.set(json)
    })
```

# Full API

## Functions

### `datum(initial): Datum`

Make a reactive piece of data. Has `set`, `val`, and `onChange`.\
`onChange` is only triggered if `deepEquals(newVal, oldVal)` is false.

```ts
const d = datum(2)
const unsub = d.onChange((val, prev, _unsub) =>
    console.log(`changed from ${prev} to ${val}`)
)
d.set(d.val * 3)
d.val // => 6
unsub()
```

### `compose(compute, ...datums): Composed`

Compute one or more datums into a read-only datum.\
`onChange` is only triggered if `deepEquals(out, lastOut)` is false.

-   `compute: (datumValues, lastOutput, unsubscribe) => Out`

```ts
const x = datum(3)
const y = datum(5)
const product = compose(([x, y]) => x * y, x, y)
product.val // => 15
product.onChange(console.log)
```

### `datums(...initialValues)`

Convenience function to make multiple datums simultaneously

```ts
const [id, count, name] = datums(111, 0, 'Bob')
count.set(count.val + 1)
```

### `setMany(...pairs)`

Set several datums and don't trigger listeners or update `.val` until the end

```ts
const [base, exp] = datums(3, 4)
const bToE = compose(([b, e]) => b ** e, base, exp)
bToE.onChange(console.log)
setMany([base, 9], [exp, 2])
// onChange is not triggered because the final result is the same.
```

## Interfaces

### `RODatum<T>`

Read-only datum (matches result from `datum` or `compose`).

```ts
// Can use as a parameter type for non-mutating functions.
function Header(title: RODatum<string>) {
    return compose(title => `<h1>${title}</h1>`, title)
}

// Also useful for exporting a value from a module.
const health_ = datum(100)
export const health: RODatum<number> = health_
// other modules will get type error if they `.set()`
```

-   `onChange(listener(val, prev, unsub), runImmediately?): Unsubscribe`
    -   Trigger this callback whenever val changes
-   `val: T`
    -   Current value of datum

### `Datum<T>`

The result of `datum`, a reactive value.

-   `onChange`: same as above
-   `val`: same as above
-   `set(newVal)`: change the value and trigger listeners

### `Composed<Datums, Result>`

The result of `compose`, a computed value over datums

-   `onChange`: listeners triggered when the result of the computation changes
-   `val`: the computed value
-   `unsub`: Destroy this composed datum: stop listening to the initial datums and unsubscribe all listeners on the composition.
    -   Getting `.val` or adding a listener with `onChange` after a composition has been destroyed will throw an error
