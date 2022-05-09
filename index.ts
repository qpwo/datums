import { deepEqual } from 'fast-equals'

type ChangeListener<T> = (val: T, prev: T, unsub: Unsubscribe) => void

type Unsubscribe = () => void

/** A Datum, ComposedDatum, or RODatum */
export interface AnyDatum<T> {
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe
    val: T
}

export function datum<T>(initial: T): Datum<T> {
    return new Datum(initial)
}

export function toReadonly<T>(d: AnyDatum<T>): RODatum<T> {
    return new RODatum(d)
}

export function compose<Out, Ds extends DatumMap>(
    compute: (
        vals: { [K in keyof Ds]: Ds[K]['val'] },
        lastOut: Out | null
    ) => Out,
    cursors: Ds
): Composed<Ds, Out> {
    return new Composed(compute, cursors)
}

class Datum<T> implements AnyDatum<T> {
    #val: T
    #listeners: (ChangeListener<T> | undefined)[] = []
    constructor(initial: T) {
        this.#val = initial
    }
    get val() {
        return this.#val
    }
    set(newVal: T) {
        if (deepEqual(this.#val, newVal)) return
        const oldVal = this.#val
        this.#val = newVal
        for (let i = 0; i < this.#listeners.length; i++) {
            const listener = this.#listeners[i]
            if (listener)
                listener(newVal, oldVal, () => (this.#listeners[i] = undefined))
        }
    }
    apply(update: (old: T) => T) {
        const newVal = update(this.#val)
        this.set(newVal)
    }
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe {
        let i = 0
        while (true) {
            if (this.#listeners[i] === undefined) {
                this.#listeners[i] = cb
                if (runImmediately) cb(this.#val, this.#val, () => {})
                return () => (this.#listeners[i] = undefined)
            }
            i++
        }
    }
}

type DatumMap = Record<string, AnyDatum<any>>

class Composed<Ds extends DatumMap, Out> implements AnyDatum<Out> {
    #listeners: (ChangeListener<Out> | undefined)[] = []
    #destroyed = false
    #onDestroy: Unsubscribe[] = []
    #val: Out
    #compute: (
        vals: { [K in keyof Ds]: ReturnType<Ds[K]['val']> },
        lastOut: Out | null
    ) => Out
    #cursors: Ds

    constructor(
        compute: (
            vals: { [K in keyof Ds]: Ds[K]['val'] },
            lastOut: Out | null
        ) => Out,
        cursors: Ds
    ) {
        this.#compute = compute
        this.#cursors = cursors
        for (const k in cursors) {
            this.#onDestroy.push(
                cursors[k].onChange(() => this.#handleUpdate())
            )
        }
        this.#val = this.#compute(this.#getAll(), null)
    }

    get val(): Out {
        return this.#val
    }

    onChange(cb: ChangeListener<Out>, runImmediately?: boolean): Unsubscribe {
        if (this.#destroyed)
            throw Error('Cannot listen to destroyed Composed datum')
        let i = 0
        while (true) {
            if (this.#listeners[i] === undefined) {
                this.#listeners[i] = cb
                if (runImmediately) cb(this.#val, this.#val, () => {})
                return () => (this.#listeners[i] = undefined)
            }
            i++
        }
    }

    stopListening() {
        for (const unsub of this.#onDestroy) {
            unsub()
        }
        this.#listeners.length = 0
        this.#onDestroy.length = 0
        this.#destroyed = true
    }

    #handleUpdate() {
        const oldVal = this.#val
        this.#val = this.#compute(this.#getAll(), oldVal)
        if (deepEqual(this.#val, oldVal)) return
        for (let i = 0; i < this.#listeners.length; i++) {
            const listener = this.#listeners[i]
            if (listener) {
                listener(
                    this.#val,
                    oldVal,
                    () => (this.#listeners[i] = undefined)
                )
            }
        }
    }

    #getAll() {
        const o: any = {}
        for (const k in this.#cursors) {
            o[k] = this.#cursors[k].val
        }

        return o as { [K in keyof Ds]: Ds[K]['val'] }
    }
}

class RODatum<T> implements AnyDatum<T> {
    #datum: AnyDatum<T>
    constructor(datum: AnyDatum<T>) {
        this.#datum = datum
    }
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe {
        return this.#datum.onChange(cb, runImmediately)
    }
    get val(): T {
        return this.#datum.val
    }
}

export type { Datum, Composed, RODatum }
