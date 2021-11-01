import Process from 'process'
import Chalk from 'chalk'

let isFinal = false
let isDirty = true
let alerts = {}
let tickers = {}

function truncate(space, ...texts) {
    if (texts.reduce((a, text) => a + text.length, 0) <= space) return texts
    const slotSpace = Math.min(space / texts.length)
    const slotRemainder = space % texts.length
    return texts.map((text, i) => '…' + text.slice(-slotSpace - (i === 0 ? slotRemainder : 0)))
}

function draw(linesDrawn) {
    if (!isDirty) {
        setTimeout(() => draw(linesDrawn), 100)
        return
    }
    const linesFull = [
        ...Object.values(alerts).map(details => {
            const width = Process.stderr.columns - (details.operation.length + details.message.length + 8)
            const [inputTruncated, outputTruncated] = truncate(width, details.input, details.output)
            const elements = [
                Chalk.blue(details.operation),
                ' ',
                inputTruncated,
                Chalk.blue(' → '),
                outputTruncated,
                ': ',
                details.importance === 'error' ? Chalk.red.bold(details.message)
                    : details.importance === 'warning' ? Chalk.magenta.bold(details.message)
                    : details.message.endsWith('...') ? Chalk.yellow(details.message)
                    : details.message.toLowerCase().startsWith('done') ? Chalk.green(details.message)
                    : Chalk.magenta(details.message)
            ]
            return elements.filter(x => x).join('')
        }),
        ...Object.entries(tickers).map(([operation, proportion]) => {
            const width = Process.stderr.columns - (operation.length + 8)
            const barWidth = Math.floor(proportion * width)
            const bar = '█'.repeat(barWidth) + ' '.repeat(width - barWidth)
            const percentage = `${Math.floor(proportion * 100)}%`.padStart(4, ' ')
            return `${operation} |${bar}| ${percentage}`
        })
    ]
    const scrollback = Process.stderr.rows - 1
    const lines = !isFinal && linesFull.length > scrollback
        ? linesFull.slice(-scrollback)
        : linesFull
    Array.from({ length: linesDrawn }).forEach(() => {
        Process.stderr.moveCursor(0, -1)
        Process.stderr.clearLine()
    })
    if (lines.length > 0) console.error(lines.join('\n'))
    isDirty = false
    if (!isFinal) setTimeout(() => draw(lines.length), 100) // loop
}

function setup(verbose) {
    Process.stderr.on('resize', () => isDirty = true)
    const progress = (key, total) => {
        let ticks = 0
        tickers[key] = 0
        return () => {
            ticks = ticks + 1
            tickers[key] = ticks / total
            isDirty = true
        }
    }
    const alert = details => {
        if (!verbose && !details.importance) return
        const key = [details.operation, details.input, details.output].filter(x => x).join('-')
        alerts[key] = details
        isDirty = true
    }
    const finalise = () => isFinal = true
    draw() // start loop
    return { progress, alert, finalise }
}

export default setup
