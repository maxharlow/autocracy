import Process from 'process'
import Events from 'events'
import Chalk from 'chalk'

const events = new Events.EventEmitter()
let isFinal = false
let isDirty = true
let alerts = {}
let tickers = {}

function toAlternateScreen() {
    Process.stderr.write(Buffer.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68]))
}

function toMainScreen() {
    Process.stderr.write(Buffer.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c]))
}

function truncate(space, ...texts) {
    if (texts.reduce((a, text) => a + text.length, 0) <= space) return texts
    const slotSpace = Math.min(space / texts.length)
    const slotRemainder = space % texts.length
    return texts.map((text, i) => '…' + text.slice(-slotSpace - (i === 0 ? slotRemainder : 0)))
}

function draw(linesDrawn) {
    if (!isDirty && !isFinal) {
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
    Process.stderr.moveCursor(0, -linesDrawn)
    Process.stderr.clearScreenDown()
    if (linesFull.length >= scrollback && linesDrawn < scrollback) toAlternateScreen()
    if (linesFull >= scrollback) console.error('\n'.repeat(scrollback - lines.length)) // write at bottom of screen
    if (linesDrawn === scrollback && isFinal) toMainScreen()
    if (lines.length > 0) console.error(lines.join('\n'))
    isDirty = false
    if (!isFinal) setTimeout(() => draw(lines.length), 1000) // loop
    else events.emit('finished')
}

function setup(verbose) {
    const progress = (key, total) => {
        let ticks = 0
        tickers[key] = 0
        return () => {
            if (isFinal) return
            ticks = ticks + 1
            tickers[key] = ticks / total
            isDirty = true
        }
    }
    const alert = details => {
        if (isFinal) return
        if (!verbose && !details.importance) return
        const key = [details.operation, details.input, details.output].filter(x => x).join('-')
        alerts[key] = details
        isDirty = true
    }
    const finalise = () => {
        isFinal = true
        return new Promise(resolve => events.on('finished', resolve))
    }
    Process.stdin.setRawMode(true)
    Process.stdin.setEncoding('utf8')
    Process.stdin.on('data', async data => {
        if (data === '\u0003') {
            await finalise()
            Process.exit(0)
        }
    })
    Process.stdin.unref()
    Process.stderr.on('resize', () => isDirty = true)
    draw() // start loop
    return { progress, alert, finalise }
}

export default setup
