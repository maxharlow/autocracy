import Process from 'process'
import Yargs from 'yargs'
import Chalk from 'chalk'
import StripAnsi from 'strip-ansi'
import autocracy from './autocracy.js'

function renderer() {
    let alerts = {}
    let tickers = {}
    const draw = (key, value, type) => {
        const lines = Object.values(alerts).length + Object.values(tickers).length
        if (lines > 0) Process.stderr.moveCursor(0, -lines)
        if (type === 'alert') alerts[key] = value
        if (type === 'ticker') tickers[key] = value
        Object.values(alerts).forEach(line => {
            Process.stderr.clearLine()
            Process.stderr.write(line + '\n')
        })
        Object.values(tickers).forEach(ticker => {
            Process.stderr.clearLine()
            ticker()
        })
    }
    const progress = (text, total) => {
        let tick = 0
        const update = () => {
            const width = Process.stderr.columns - text.length - 8
            const proportion = tick / total
            const barWidth = Math.floor(proportion * width)
            const bar = '█'.repeat(barWidth) + ' '.repeat(width - barWidth)
            const percentage = `${Math.floor(proportion * 100)}%`.padStart(4, ' ')
            console.error(`${text} |${bar}| ${percentage}`)
        }
        draw(text, update, 'ticker')
        return () => {
            tick = tick + 1
            draw(text, update, 'ticker')
        }
    }
    const truncate = (space, ...texts) => {
        if (texts.reduce((a, text) => a + text.length, 0) <= space) return texts
        const slotSpace = Math.min(space / texts.length)
        const slotRemainder = space % texts.length
        return texts.map((text, i) => '…' + text.slice(-slotSpace - (i === 0 ? slotRemainder : 0)))
    }
    const alert = ({ operation, input, output, message, isError }) => {
        const key = [operation, input, output].filter(x => x).join('-')
        const space = Process.stderr.columns - (StripAnsi(operation).length + StripAnsi(message).length + 8)
        const [inputTruncated, outputTruncated] = truncate(space, input, output)
        const elements = [
            Chalk.blue(operation),
            ' ',
            inputTruncated,
            Chalk.blue(' → '),
            outputTruncated,
            ': ',
            isError ? Chalk.red.bold(message)
                : message.endsWith('...') ? Chalk.yellow(message)
                : message.toLowerCase().startsWith('done') ? Chalk.green(message)
                : Chalk.magenta(message)
        ]
        const value = elements.filter(x => x).join('')
        draw(key, value, 'alert')
    }
    return { progress, alert }
}

async function setup() {
    const instructions = Yargs(Process.argv.slice(2))
        .usage('Usage: autocracy <command>')
        .wrap(null)
        .option('V', { alias: 'verbose', type: 'boolean', describe: 'Print details', default: false })
        .help('?').alias('?', 'help')
        .version().alias('v', 'version')
    instructions.command('get-text', 'Extract or, if necessary, OCR each PDF, and output a text file', args => {
        args
            .usage('Usage: autocracy get-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
    })
    instructions.command('make-searchable', 'Extract or, if necessary, OCR each PDF, and output new PDFs with the text embedded', args => {
        args
            .usage('Usage: autocracy make-searchable <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
    })
    instructions.command('extract-pdf-to-text', false, args => {
        args
            .usage('Usage: autocracy extract-pdf-to-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['shell'], default: 'shell' })
    })
    instructions.command('copy-pdf-tagged', false, args => {
        args
            .usage('Usage: autocracy copy-pdf-tagged <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['shell'], default: 'shell' })
    })
    instructions.command('symlink-missing', false, args => {
        args
            .usage('Usage: autocracy symlink-missing <origin> <intermedidate> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('intermediate', { type: 'string', describe: 'Intermediate directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
    })
    instructions.command('convert-pdf-to-image-pages', false, args => {
        args
            .usage('Usage: autocracy convert-pdf-to-image-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
    })
    instructions.command('convert-image-pages-to-text-pages', false, args => {
        args
            .usage('Usage: autocracy convert-image-pages-to-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['aws-textract', 'library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find (not used by AWS)', default: 'eng' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
    })
    instructions.command('convert-image-pages-to-pdf-pages', false, args => {
        args
            .usage('Usage: autocracy convert-image-pages-to-pdf-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find', default: 'eng' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
    })
    instructions.command('combine-text-pages', false, args => {
        args
            .usage('Usage: autocracy combine-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
    })
    instructions.command('combine-pdf-pages', false, args => {
        args
            .usage('Usage: autocracy combine-pdf-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Combination method to use', choices: ['shell'], default: 'shell' })
    })
    if (instructions.argv._.length === 0) instructions.showHelp().exit(0)
    const command = instructions.argv._[0]
    const { alert, progress } = renderer()
    try {
        if (command === 'get-text') {
            const {
                _: [, origin, destination],
                forceOcr,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const procedures = autocracy.getText(origin, destination, forceOcr, verbose, alert)
            await procedures.reduce(async (previous, procedure) => {
                await previous
                const process = await procedure.setup()
                const total = await process.length()
                return process.run().each(progress(`${procedure.name}...`.padEnd(42, ' '), total)).whenEnd()
            }, Promise.resolve())
        }
        else if (command === 'make-searchable') {
            const {
                _: [, origin, destination],
                forceOcr,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const procedures = autocracy.makeSearchable(origin, destination, forceOcr, verbose, alert)
            await procedures.reduce(async (previous, procedure) => {
                await previous
                const process = await procedure.setup()
                const total = await process.length()
                return process.run().each(progress(`${procedure.name}...`.padEnd(42, ' '), total)).whenEnd()
            }, Promise.resolve())
        }
        else if (command === 'extract-pdf-to-text') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.extractPDFToText(origin, destination, { method }, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else if (command === 'copy-pdf-tagged') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.copyPDFTagged(origin, destination, { method }, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else if (command === 'symlink-missing') {
            const {
                _: [, origin, intermediate, destination],
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.symlinkMissing(origin, intermediate, destination, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else if (command === 'convert-pdf-to-image-pages') {
            const {
                _: [, origin, destination],
                method,
                density,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.convertPDFToImagePages(origin, destination, { method, density }, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else if (command === 'convert-image-pages-to-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.convertImagePagesToTextPages(origin, destination, { method, language, density }, verbose, alert)
            const total = await process.length()
            await process.run().each(progress('Working...', total)).whenEnd()
            await process.terminate()
        }
        else if (command === 'convert-image-pages-to-pdf-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.convertImagePagesToPDFPages(origin, destination, { method, language, density }, verbose, alert)
            const total = await process.length()
            await process.run().each(progress('Working...', total)).whenEnd()
            await process.terminate()
        }
        else if (command === 'combine-text-pages') {
            const {
                _: [, origin, destination],
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.combineTextPages(origin, destination, {}, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else if (command === 'combine-pdf-pages') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await autocracy.operations.combinePDFPages(origin, destination, { method }, verbose, alert)
            const total = await process.length()
            process.run().each(progress('Working...', total))
        }
        else {
            throw new Error(`${command}: unknown command`)
        }
    }
    catch (e) {
        console.error(instructions.argv.verbose ? e.stack : e.message)
        Process.exit(1)
    }

}

setup()
