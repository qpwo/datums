/// <reference lib="dom" />
import { compose, Datum, datum, datums } from "../index"

/** Make sure a certain relationship between different data is always satisfied,
 *  and catch the error right when it happens */
function constraintSystem() {
    const depositsAndWithdrawals = datum([10, 20, 5, -10, 6])
    const total = compose(([vals]) => sum(vals), depositsAndWithdrawals)
    total.onChange(t => {
        if (t !== myDb.get(userId, 'balance'))
            throw Error('balance desynced from db')
    })
    total.onChange(t => {
        if (t < 0) throw Error('total is negative')
    })
}

/** What if you need to wait until you've fetched some
 * data and the user has made a choice?
 */
function resourcesAndInput() {
    const data = datum<any>(null)
    const choice = datum<any>(null)
    compose(([data, choice], _, unsub) => {
        if (data && choice) {
            applyChoice(data, choice)
            unsub()
        }
    }, data, choice)

    const input = document.getElementById('selector') as HTMLSelectElement
    fetch('url').then(res => res.json()).then(data.set)
}


function htmlExample() {
    const username = datum('tom')
    const birthday = datum(new Date('1/1/1980'))
    const year = 365 * 24 * 60 * 60 * 1000
    const welcome = compose(
        ([username, birthday]) => `
            <div>
                <h1>Welcome ${username}!</h1>
                <p>You are ${((Date.now() - birthday.getTime()) / year) | 0
            } years old.</p>
            </div>
        `,
        username, birthday
    )
    return welcome
}

function htmlRenderExample() {
    const document: any = null // remove for browser
    const container = document.getElementById('container')
    const welcome = htmlExample()
    welcome.onChange(html => (container.innerHTML = html))
}

/** Suppose the user wants to pick a card in the deck and
 *  an enemy on the page, connecting an arrow between them.
 *  The selector needs to pass the result up to its parent and
 *  the the chosen item down to the arrow.
 *
 *  The data flow is simple and legible with datums.
 */
function childComponentPassback() {
    type Selected = Datum<string | null>
    function attack() {
        const card = datum<string | null>(null)
        const enemy = datum<string | null>(null)
        select(card, enemy)
        compose(([c, e], _, unsub) => {
            if (c && e) {
                doAttack(c, e)
                unsub()
            }
        }, card, enemy)
    }
    function select(card: Selected, enemy: Selected) {
        const [origin, dest] = datums([0, 0], [0, 0])
        placeArrow(origin, dest)
        document.onpointerdown = (e: any) => {
            dest.set([e.clientX, e.clientY])
            if (e.target.class === 'card') {
                card.set(e.target.id)
                origin.set([e.clientX, e.clientY])
            }
            if (e.target.class === 'enemy') enemy.set(e.target.id)
        }
    }
}

function reactUsage() {
    function useDatum<T>(initial: T) {
        const d = datum(initial)
        const [x, setX] = useState(d.val)
        d.onChange(v => setX(v))
        return {
            set: (x: T) => d.set(x),
            val: x,
            onChange: (...args: Parameters<typeof d.onChange>) => d.onChange(...args),
        }
    }
    function App() {
        const count = useDatum(1)
        return `<div>
            <h1>Count is: {count.val}</h1>
            <button onClick={() => count.set(count.val + 1)}>+</button>
        </div>`
    }
}


function sum(vals: number[]) {
    return vals.reduce((acc, v) => acc + v, 0)
}

// Dummy data / functions to avoid TS errors and keep examples clean

const userId = 'bob'
const myDb = { get(userId: string, key: string) { return 0 } }
const useState = (initial: any) => [initial, () => { }]

const doAttack = (...args: any[]) => { }
const placeArrow = (...args: any[]) => { }
const applyChoice = (...args: any[]) => { }
