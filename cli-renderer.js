import Process from 'process'
import Events from 'events'
import Chalk from 'chalk'
import * as Luxon from 'luxon'
import SimpleWCSWidth from 'simple-wcswidth'

const events = new Events.EventEmitter()
const beginning = new Date()
let isDirty = true
let isAlternate = false
let finalisation = null
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

function formatDuration(milliseconds, prefix = '', suffix = '') {
    const [days, hours, minutes, seconds] = Luxon.Duration.fromMillis(milliseconds).toFormat('d:h:m:s').split(':').map(Number)
    const units = [
        days > 0 && days < 100000 ? `${days}d` : '',
        hours > 0 && days < 100 ? `${hours}h` : '',
        minutes > 0 && days === 0 ? `${minutes}m` : '',
        seconds > 0 && hours === 0 && days === 0 ? `${seconds}s` : ''
    ].join('')
    if (!units) return ''
    return prefix + units + suffix
}

function formatFinalisation(mode) {
    if (mode === 'complete') return [formatDuration(new Date() - beginning, 'Completed in ', '!') || 'Completed!']
    else if (mode === 'interrupt') return ['Interrupted!']
    else return []
}

function predict(start, timings, left) {
    if (left === 0) return formatDuration(new Date() - start, 'took ')
    if (timings.length <= 1) return ''
    const differences = timings.map((timing, i) => timings[i + 1] - timing).slice(0, -1)
    const mean = differences.reduce((a, n) => a + n, 0) / differences.length
    const milliseconds = mean * left
    return formatDuration(milliseconds, '', ' left')
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
    if (!isDirty && !finalisation) {
        setTimeout(() => draw(linesDrawn), 100)
        return
    }
    const linesFull = [
        ...Object.values(alerts).map(details => {
            const width = Process.stderr.columns - (details.operation.length + details.message.length + 5)
            const [inputTruncated, outputTruncated] = truncate(width, details.input.replaceAll('\n', '\\n'), details.output.replaceAll('\n', '\\n'))
            const elements = [
                Chalk.blue(details.operation),
                ' ',
                inputTruncated,
                Chalk.blue(' → '),
                outputTruncated,
                ' ',
                details.importance === 'error' ? Chalk.red.bold(details.message)
                    : details.importance === 'warning' ? Chalk.magenta.bold(details.message)
                    : details.message.endsWith('...') ? Chalk.yellow(details.message)
                    : details.message.toLowerCase().startsWith('done') ? Chalk.green(details.message)
                    : Chalk.magenta(details.message.replaceAll('\n', ' '))
            ]
            return elements.filter(x => x).join('').slice(0, Process.stderr.cols)
        }),
        ...Object.entries(tickers).map(([operation, { proportion, prediction }]) => {
            const width = Process.stderr.columns - (operation.length + 20)
            const barWidth = Math.floor(proportion * width)
            const bar = '█'.repeat(barWidth) + ' '.repeat(width - barWidth)
            const percentage = Math.floor(proportion * 100) + '%'
            return `${operation} |${bar}| ${percentage.padStart(4)} ${prediction.padStart(11)}`
        }),
        ...formatFinalisation(finalisation)
    ]
    const scrollback = Process.stderr.rows - 1
    const lines = !finalisation && linesFull.length > scrollback
        ? linesFull.slice(-scrollback)
        : linesFull
    Process.stderr.moveCursor(0, -Math.min(linesDrawn, scrollback))
    Process.stderr.clearScreenDown()
    if (linesFull.length >= scrollback) toAlternateScreen()
    if (isAlternate && !finalisation) console.error('\n'.repeat(scrollback - lines.length)) // write at bottom of screen
    if (finalisation) toMainScreen()
    if (lines.length > 0) console.error(lines.join('\n'))
    isDirty = false
    if (!finalisation) setTimeout(() => draw(lines.length), 1) // loop
    else events.emit('finished')
}

function setup(verbose) {
    const doRedisplay = Process.stderr.isTTY === true
    const progress = (key, total) => {
        let ticks = 0
        tickers[key] = {
            started: new Date(),
            proportion: 0,
            timings: [],
            prediction: ''
        }
        return entry => {
            if (finalisation) return
            ticks = ticks + 1
            const timings = entry.skip ? tickers[key].timings : tickers[key].timings.slice(-99).concat(new Date())
            tickers[key] = {
                started: tickers[key].started,
                proportion: ticks / total,
                timings,
                prediction: predict(tickers[key].started, timings, total - ticks)
            }
            isDirty = true
        }
    }
    const alert = details => {
        if (finalisation) return
        if (!verbose && !details.importance) return
        if (!doRedisplay) console.error([details.operation, details.input, '→', details.output].filter(x => x).join(' '))
        const key = [details.operation, details.input, details.output].filter(x => x).join('-')
        alerts[key] = details
        isDirty = true
    }
    const finalise = mode => {
        if (!doRedisplay && !finalisation) formatFinalisation(mode).map(text => console.error(text))
        finalisation = mode
        return new Promise(resolve => events.on('finished', resolve))
    }
    Process.stdin.setRawMode(true)
    Process.stdin.setEncoding('utf8')
    Process.stdin.on('data', async data => {
        if (data === '\u0003') {
            console.error(Chalk.bgRedBright.white('Stopping...'))
            if (doRedisplay) Process.stderr.moveCursor(0, -1)
            await finalise('interrupt')
            Process.exit(0)
        }
    })
    Process.stdin.unref()
    Process.stderr.on('resize', () => isDirty = true)
    if (doRedisplay) draw() // start loop
    return { progress, alert, finalise }
}

export default setup
