/** Instant and composable reactive data */

import { deepEqual, shallowEqual } from 'fast-equals'

type ChangeListener<T> = (val: T, prev: T, unsub: Unsubscribe) => void
type Unsubscribe = () => void
/** Any readable datum (Datum, ComposedDatum, or ReadonlyDatum) */
export interface RODatum<T> {
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe
    val: T
}

export function datum<T>(initial: T): Datum<T> {
    return new Datum(initial)
}

export function toReadonly<T>(d: RODatum<T>): RODatum<T> {
    return new ReadonlyDatum(d)
}

export function compose<Out, Ds extends DatumMap>(
    compute: (vals: ValsOf<Ds>, lastOut: Out | null) => Out,
    cursors: Ds
): Composed<Out, Ds> {
    return new Composed(compute, cursors)
}

export function datums<T extends any[]>(
    ...args: T
): { [K in keyof T]: Datum<T[K]> } {
    // @ts-expect-error
    return args.map(x => new Datum(x))
}

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
class Datum<T> implements RODatum<T> {
    #val: T
    #listeners: (ChangeListener<T> | undefined)[] = []
    /** just for _setLater() and _flush() */
    #lastVal: T | typeof UNSET = UNSET

    constructor(initial: T) {
        this.#val = initial
    }
    get val() {
        return this.#val
    }
    set(newVal: T) {
        const oldVal = this.#val
        this.#val = newVal
        maybeNotifyListeners(this.#listeners, newVal, oldVal)
    }
    apply(update: (old: T) => T) {
        const newVal = update(this.#val)
        this.set(newVal)
    }

    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe {
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
        if (deepEqual(this.#val, oldVal)) return
        maybeNotifyListeners(this.#listeners, this.#val, oldVal)
    }
}

type DatumMap = Record<string, RODatum<any>>
type ValsOf<Ds extends DatumMap> = { [K in keyof Ds]: Ds[K]['val'] }
class Composed<Out, Ds extends DatumMap> implements RODatum<Out> {
    #listeners: (ChangeListener<Out> | undefined)[] = []
    #destroyed = false
    #onDestroy: Unsubscribe[] = []
    #val: Out
    #compute: (vals: ValsOf<Ds>, lastOut: Out | null) => Out
    #cursors: Ds
    #lastIn: ValsOf<Ds>

    constructor(
        compute: (vals: ValsOf<Ds>, lastOut: Out | null) => Out,
        cursors: Ds
    ) {
        this.#compute = compute
        this.#cursors = cursors
        for (const k in cursors) {
            this.#onDestroy.push(
                cursors[k].onChange(v => this.#handleUpdate(k, v))
            )
        }
        const collected = this.#getAll()
        this.#lastIn = collected
        this.#val = this.#compute(collected, null)
    }

    get val(): Out {
        return this.#val
    }

    onChange(cb: ChangeListener<Out>, runImmediately?: boolean): Unsubscribe {
        if (this.#destroyed)
            throw Error('Cannot listen to destroyed Composed datum')
        return insertListener(this.#listeners, cb, this.#val, runImmediately)
    }

    stopListening() {
        for (const unsub of this.#onDestroy) {
            unsub()
        }
        this.#listeners.length = 0
        this.#onDestroy.length = 0
        this.#destroyed = true
    }

    #handleUpdate<K extends keyof Ds>(k: K, v: Ds[K]['val']) {
        if (shallowEqual(v, this.#lastIn[k])) return
        const oldVal = this.#val
        const collected = this.#getAll()
        this.#lastIn = collected
        this.#val = this.#compute(collected, oldVal)
        maybeNotifyListeners(this.#listeners, this.#val, oldVal)
    }

    #getAll(): ValsOf<Ds> {
        const o: any = {}
        for (const k in this.#cursors) {
            o[k] = this.#cursors[k].val
        }

        return o
    }
}

class ReadonlyDatum<T> implements RODatum<T> {
    #datum: RODatum<T>
    constructor(datum: RODatum<T>) {
        this.#datum = datum
    }
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe {
        return this.#datum.onChange(cb, runImmediately)
    }
    get val(): T {
        return this.#datum.val
    }
}

function insertListener<T>(
    listeners: (ChangeListener<T> | undefined)[],
    cb: ChangeListener<T>,
    val: T,
    runImmediately?: boolean
): Unsubscribe {
    let i = 0
    while (true) {
        if (listeners[i] === undefined) {
            listeners[i] = cb
            const unsub = () => (listeners[i] = undefined)
            if (runImmediately) cb(val, val, unsub)
            return unsub
        }
        i++
    }
}

function maybeNotifyListeners<T>(
    listeners: (ChangeListener<T> | undefined)[],
    newVal: T,
    oldVal: T
) {
    if (deepEqual(newVal, oldVal)) return
    for (let i = 0; i < listeners.length; i++) {
        const listener = listeners[i]
        if (listener) {
            listener(newVal, oldVal, () => (listeners[i] = undefined))
        }
    }
}
