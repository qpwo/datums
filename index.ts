/** Instant and composable reactive data */

import { deepEqual, shallowEqual } from 'fast-equals'

type ChangeListener<T> = (val: T, prev: T, unsub: Unsubscribe) => void
type Unsubscribe = () => void

/** Read-only datum (matches result from {@link datum} or {@link compose}).
 *
 *  Can use as a parameter type for non-mutating functions.
 *  @example
 *      function Header(title: RODatum<string>) {
 *         return compose(([ title ]) => `<h1>${title}</h1>`, title)
 *      }
 *
 *  Also useful for exporting a value from a module.
 *  @example
 *    const health_ = datum(100)
 *    export const health: RODatum<number> = health_
 *    // other modules will get type error if they `.set()`
 */
export interface RODatum<T> {
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe
    val: T
}

/** A reactive piece of data. Has `set`, `val`, and `onChange`.
 *  `onChange` is only triggered if deepEquals(newVal, oldVal) is false.
 * @example
 *     const d = datum(2)
 *     d.onChange((val, prev, _unsubscribe) =>
 *         console.log(`changed from ${prev} to ${val}`)
 *     )
 *     d.set(d.val * 3)
 *     d.val // => 6
 */
export function datum<T>(initial: T): Datum<T> {
    return new Datum(initial)
}

type Compute<Out, Datums extends DatumArr> = (vals: ValsOf<Datums>, lastOut: Out | undefined, unsub: Unsubscribe) => Out

/** Compute one or more datums into a read-only datum.
 *  `onChange` is only triggered if deepEquals(newVal, oldVal) is false.
 * @example
 *    const x = datum(3)
 *    const y = datum(5)
 *    const product = compose(([ x, y ]) => x * y, x, y)
 *    product.val // => 15
 *    product.onChange(console.log)
 */
export function compose<Out, Datums extends DatumArr>(
    compute: Compute<Out, Datums>,
    ...datums: Datums
): Composed<Out, Datums> {
    return new Composed(compute, ...datums)
}

/** Convenience method to make multiple datums simultaneously
 * @example
 *   const [id, count, name] = datums(111, 0, 'Bob')
 *   count.set(count.val + 1)
 */
export function datums<T extends any[]>(
    ...args: T
): { [K in keyof T]: Datum<T[K]> } {
    // @ts-expect-error
    return args.map(x => new Datum(x))
}

/** Set several datums and don't trigger listeners or update `.val` until the end
 * @example
 *     const [base, exp] = datums(3, 4)
 *     const bToE = compose(([ base, exp ]) => base ** exp, base, exp)
 *     bToE.onChange(console.log)
 *     setMany([base, 9], [exp, 2])
 *     // onChange is not triggered because the final result is the same.
 *
 * @example
 *     const [x, y, z] = datums(1, 2, 3)
 *     setMany([x, y.val], [y, z.val], [z, x.val])
 *     [x.val, y.val, z.val] // => [2, 3, 1]
 */
export function setMany<T extends any[]>(
    ...pairs: { [K in keyof T]: [Datum<T[K]>, T[K]] }
): void {
    // @ts-expect-error
    for (const [d, v] of pairs) d._setLater(v)
    // @ts-expect-error
    for (const [d] of pairs) d._flush()
}

export type { Datum, Composed }

const UNSET = Symbol('UNSET')
/** The result of {@link datum} */
class Datum<T> implements RODatum<T> {
    #val: T
    #listeners: (ChangeListener<T> | undefined)[] | undefined
    /** just for _setLater() and _flush() */
    #lastVal: T | typeof UNSET = UNSET

    constructor(initial: T) {
        this.#val = initial
    }
    /** Current value of datum */
    get val() {
        return this.#val
    }

    /** Change value of datum and trigger any listeners */
    set(newVal: T) {
        const oldVal = this.#val
        this.#val = newVal
        maybeNotifyListeners(this.#listeners, newVal, oldVal)
    }

    /** Trigger this callback whenever val changes
     * @param cb - callback taking newVal, oldVal, and unsubscribe
     * @param runImmediately - if true, run callback immediately
     */
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe {
        if (this.#listeners === undefined) this.#listeners = []
        return insertListener(this.#listeners, cb, this.#val, runImmediately)
    }

    /** just for setMany */
    private _setLater(v: T) {
        if (this.#lastVal === UNSET) {
            this.#lastVal = this.#val
        }
        this.#val = v
    }

    /** just for setMany */
    private _flush() {
        if (this.#lastVal === UNSET) return
        const oldVal = this.#lastVal
        this.#lastVal = UNSET
        maybeNotifyListeners(this.#listeners, this.#val, oldVal)
    }
}

type DatumArr = RODatum<any>[]
// @ts-ignore
type ValsOf<Datums extends DatumArr> = { [K in keyof Datums]: Datums[K]['val'] }
/** The result of {@link compose} */
class Composed<Out, Datums extends DatumArr> implements RODatum<Out> {
    #listeners: (ChangeListener<Out> | undefined)[] | undefined
    #destroyed = false
    #onDestroy: Unsubscribe[] = []
    #val: Out
    #compute: Compute<Out, Datums>
    #datums: Datums
    #lastIn: ValsOf<Datums>

    constructor(
        compute: Compute<Out, Datums>,
        ...datums: Datums
    ) {
        this.#compute = compute
        this.#datums = datums
        for (let idx = 0; idx < datums.length; idx++) {
            this.#onDestroy.push(
                datums[idx].onChange(v => this.#handleUpdate(idx, v))
            )
        }
        const collected = this.#getAll()
        this.#lastIn = collected
        this.#val = this.#compute(collected, undefined, () => this.unsub())
    }

    /** Computed value from datums */
    get val(): Out {
        if (this.#destroyed) throw new Error('cannot read val from destroyed cursor')
        return this.#val
    }

    get destroyed(): boolean {
        return this.#destroyed
    }

    /** Trigger this callback whenever the computed value changes. (Is not deepEqual to the previous output.)
     * @param cb - callback taking newVal, oldVal, and unsubscribe
     * @param runImmediately - if true, run callback immediately
     */
    onChange(cb: ChangeListener<Out>, runImmediately?: boolean): Unsubscribe {
        if (this.#destroyed)
            throw Error('Cannot listen to destroyed Composed datum')
        if (this.#listeners === undefined) this.#listeners = []
        return insertListener(this.#listeners, cb, this.#val, runImmediately)
    }

    /** Destroy this composed datum. Stop listening to the initial datums.
     * If you try to add a cursor (`.onChange`) after this, it will throw an error.
     */
    unsub() {
        for (const unsubscribe of this.#onDestroy) {
            unsubscribe()
        }
        this.#listeners = undefined
        this.#destroyed = true
        // @ts-expect-error
        this.#onDestroy = undefined
        // @ts-expect-error
        this.#val = undefined
        // @ts-expect-error
        this.#compute = undefined
        // @ts-expect-error
        this.#datums = undefined
        // @ts-expect-error
        this.#lastIn = undefined

    }

    #handleUpdate<Idx extends number>(idx: Idx, v: Datums[Idx]['val']) {
        if (shallowEqual(v, this.#lastIn[idx])) return
        const oldVal = this.#val
        const collected = this.#getAll()
        this.#lastIn = collected
        this.#val = this.#compute(collected, oldVal, () => this.unsub())
        maybeNotifyListeners(this.#listeners, this.#val, oldVal)
    }

    #getAll(): ValsOf<Datums> {
        // @ts-expect-error
        return this.#datums.map(d => d.val)
    }
}

function insertListener<T>(
    listeners: (ChangeListener<T> | undefined)[],
    cb: ChangeListener<T>,
    val: T,
    runImmediately?: boolean
): Unsubscribe {
    const n = listeners.length
    listeners.push(cb)
    const unsub = () => (listeners[n] = undefined)
    if (runImmediately) cb(val, val, unsub)
    return unsub
}

function maybeNotifyListeners<T>(
    listeners: (ChangeListener<T> | undefined)[] | undefined,
    newVal: T,
    oldVal: T
) {
    if (listeners === undefined) return
    if (deepEqual(newVal, oldVal)) return
    let undefinedCount = 0
    for (let i = 0; i < listeners.length; i++) {
        const listener = listeners[i]
        if (listener) {
            listener(newVal, oldVal, () => (listeners[i] = undefined))
        } else {
            undefinedCount++
        }
    }

    // periodically remove undefined listeners for use cases where listeners are added and removed frequently
    if (
        listeners.length > 1000 &&
        undefinedCount > (listeners.length * 3) / 4
    ) {
        let j = 0
        for (let i = 0; i < listeners.length; i++) {
            if (listeners[i]) {
                listeners[j] = listeners[i]
                j++
            }
        }
        listeners.length = j
    }
}
