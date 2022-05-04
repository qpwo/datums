type ChangeListener<T> = (val: T, prev: T, unsub: Unsubscribe) => void

type Unsubscribe = () => void

export interface RODatum<T = unknown> {
    get(): T
    onChange(cb: ChangeListener<T>, runImmediately?: boolean): Unsubscribe
}

export interface Datum<T = unknown> extends RODatum<T> {
    set(newVal: T): void
    apply(update: (old: T) => T): void
}

export interface ComposedDatum<T = unknown> extends RODatum<T> {
    stopListening(): void
}

export function datum<T = unknown>(initial: T): Datum<T> {
    return new Datum_(initial)
}

export function toReadonly<T = unknown>(d: Datum<T>): RODatum<T> {
    return { onChange: (...args) => d.onChange(...args), get: () => d.get() }
}

export function compose<Ds extends DatumMap, Out = unknown>(
    compute: (vals: { [K in keyof Ds]: Ds[K]['get'] }) => Out,
    cursors: Ds
): ComposedDatum<Out> {
    return new Compose_(compute, cursors)
}

class Datum_<T> implements Datum<T> {
    #val: T
    #listeners: (ChangeListener<T> | undefined)[] = []
    constructor(initial: T) {
        this.#val = initial
    }
    get() {
        return this.#val
    }
    set(newVal: T) {
        if (deepEquals(this.#val, newVal)) return
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

type DatumMap = Record<string, RODatum<any>>

class Compose_<Ds extends DatumMap, Out> implements ComposedDatum<Out> {
    #listeners: (ChangeListener<Out> | undefined)[] = []
    #destroyed = false
    #onDestroy: Unsubscribe[] = []
    #val: Out
    #compute: (vals: { [K in keyof Ds]: Ds[K]['get'] }) => Out
    #cursors: Ds

    constructor(
        compute: (vals: { [K in keyof Ds]: Ds[K]['get'] }) => Out,
        cursors: Ds
    ) {
        this.#compute = compute
        this.#cursors = cursors
        for (const k in cursors) {
            this.#onDestroy.push(
                cursors[k].onChange(() => this.#handleUpdate())
            )
        }
        this.#val = this.#compute(this.#getAll())
    }

    get(): Out {
        return this.#val
    }

    onChange(cb: ChangeListener<Out>, runImmediately: boolean): Unsubscribe {
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
        this.#val = this.#compute(this.#getAll())
        if (deepEquals(this.#val, oldVal)) return
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
            o[k] = this.#cursors[k].get()
        }

        return o as { [K in keyof Ds]: Ds[K]['get'] }
    }
}

function deepEquals(a: unknown, b: unknown): boolean {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true

    // prettier-ignore
    if (typeof a !== typeof b || // different types
        typeof a !== "object" ||
        typeof b !== "object" || // nonequal primitives
        (a === null || b === null) // one is null but not other
    )
        return false

    // So a and b are both either arrays or objects

    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++)
            if (!deepEquals(a[i], b[i])) return false
        return true
    }
    // both regular objects
    for (const k in a) if (!(k in b)) return false
    for (const k in b) if (!(k in a)) return false
    // @ts-expect-error
    for (const k in a) if (!deepEquals(a[k], b[k])) return false
    return true
}
