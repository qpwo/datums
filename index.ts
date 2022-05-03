type ChangeListener<T> = (newVal: T, oldVal: T) => void

type Unsubscribe = () => void

interface Datum<T = unknown> {
    get(): T
    set(newVal: T): void
    apply(update: (old: T) => T): void
    onChange(cb: ChangeListener<T>): Unsubscribe
}

interface RODatum<T> {
    get(): T
    onChange(cb: ChangeListener<T>): Unsubscribe
}

function datum<T>(initial: T): Datum<T> {
    let val = initial
    const listeners: (ChangeListener<T> | undefined)[] = []
    const result: Datum<T> = {
        get() {
            return val
        },
        set(newVal) {
            if (deepEquals(val, newVal)) return
            const oldVal = val
            val = newVal
            for (const listener of listeners) {
                if (listener) listener(newVal, oldVal)
            }
        },
        apply(update) {
            const newVal = update(val)
            result.set(newVal)
        },
        onChange(cb) {
            listeners.push(cb)
            const i = listeners.length - 1
            return () => (listeners[i] = undefined)
        },
    }
    return result
}

function readonly<T>(d: Datum<T>): RODatum<T> {
    return { onChange: d.onChange, get: d.get }
}

function compose<Ds extends Record<string, RODatum<any>>, Out>(
    compute: (vals: { [K in keyof Ds]: Ds[K]['get'] }) => Out,
    cursors: Ds
): RODatum<Out> & { destroy(): void } {
    const listeners: (ChangeListener<Out> | undefined)[] = []
    let destroyed = false
    let val: Out | null = null

    const onDestroy = []
    for (const k in cursors) {
        onDestroy.push(cursors[k].onChange(handleUpdate))
    }

    const result: RODatum<Out> & { destroy(): void } = {
        get() {
            if (val === null) {
                val = compute(getAll())
            }
            return val
        },
        onChange(cb) {
            listeners.push(cb)
            if (destroyed)
                throw Error('Cannot add listener to destroyed composed datum')
            const i = listeners.length - 1
            return () => (listeners[i] = undefined)
        },
        destroy() {
            for (const unsub of onDestroy) {
                unsub()
            }
            destroyed = true
        },
    }

    function handleUpdate() {
        const oldVal = val
        val = compute(getAll())
        if (deepEquals(val, oldVal)) return
        for (const listener of listeners) {
            listener(val, oldVal)
        }
    }

    function getAll() {
        const o: any = {}
        for (const k in cursors) {
            o[k] = cursors[k].get()
        }

        return o as { [K in keyof Ds]: Ds[K]['get'] }
    }
    return result
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
    for (const k in a) if (!deepEquals(a[k], b[k])) return false
    return true
}
