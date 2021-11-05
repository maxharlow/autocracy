import Process from 'process'
import Events from 'events'
import Chalk from 'chalk'
import SimpleWCSWidth from 'simple-wcswidth'

const events = new Events.EventEmitter()
let isFinal = false
let isDirty = true
let isAlternate = false
let alerts = {}
let tickers = {}

function toAlternateScreen() {
    if (isAlternate) return
    Process.stderr.write(Buffer.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68]))
    isAlternate = true
}

function toMainScreen() {
    if (!isAlternate) return
    Process.stderr.write(Buffer.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c]))
    isAlternate = false
}

function truncate(space, textA, textB) {
    const textAWidth = SimpleWCSWidth.wcswidth(textA)
    const textBWidth = SimpleWCSWidth.wcswidth(textB)
    const slot = Math.floor(space / 2)
    if (textAWidth <= slot && textBWidth <= slot) return [textA, textB]
    const tail = (width, text) => {
        const letters = text.split('').reverse()
        return '…' + letters.reduce((a, character) => SimpleWCSWidth.wcswidth(a) >= width - 1 ? a : character + a, '')
    }
    if (textAWidth <= slot && textBWidth > slot) return [textA, tail(space - textAWidth, textB)]
    if (textAWidth > slot && textBWidth <= slot) return [tail(space - textBWidth, textA), textB]
    return [tail(slot + space % 2, textA), tail(slot, textB)]
}

function draw(linesDrawn) {
    if (!isDirty && !isFinal) {
        setTimeout(() => draw(linesDrawn), 100)
        return
    }
    const linesFull = [
        ...Object.values(alerts).map(details => {
            const width = Process.stderr.columns - (details.operation.length + details.message.length + 6)
            const [inputTruncated, outputTruncated] = truncate(width, details.input.replaceAll('\n', '\\n'), details.output.replaceAll('\n', '\\n'))
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
                    : Chalk.magenta(details.message.replaceAll('\n', ' '))
            ]
            return elements.filter(x => x).join('').slice(0, Process.stderr.cols)
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
    Process.stderr.moveCursor(0, -Math.min(linesDrawn, scrollback))
    Process.stderr.clearScreenDown()
    if (linesFull.length >= scrollback) toAlternateScreen()
    if (isAlternate && !isFinal) console.error('\n'.repeat(scrollback - lines.length)) // write at bottom of screen
    if (isFinal) toMainScreen()
    if (lines.length > 0) console.error(lines.join('\n'))
    isDirty = false
    if (!isFinal) setTimeout(() => draw(lines.length), 1) // loop
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
            console.error(Chalk.bgRedBright.white('Stopping...'))
            Process.stderr.moveCursor(0, -1)
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
