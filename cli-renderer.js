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

function draw(linesPrevious) {
    if (!isDirty) {
        setTimeout(() => draw(linesPrevious), 100)
        return
    }
    Process.stderr.moveCursor(0, -linesPrevious)
    const lines = Object.values(alerts).length + Object.values(tickers).length
    Object.values(alerts).forEach(details => {
        Process.stderr.clearLine()
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
        console.error(elements.filter(x => x).join(''))
    })
    Object.entries(tickers).forEach(([operation, proportion]) => {
        Process.stderr.clearLine()
        const width = Process.stderr.columns - (operation.length + 8)
        const barWidth = Math.floor(proportion * width)
        const bar = '█'.repeat(barWidth) + ' '.repeat(width - barWidth)
        const percentage = `${Math.floor(proportion * 100)}%`.padStart(4, ' ')
        console.error(`${operation} |${bar}| ${percentage}`)
    })
    isDirty = false
    if (!isFinal) setTimeout(() => draw(lines), 100) // loop
}

function setup(verbose) {
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
