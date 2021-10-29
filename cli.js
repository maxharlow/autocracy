import Process from 'process'
import Yargs from 'yargs'
import Chalk from 'chalk'
import autocracy from './autocracy.js'

function renderer() {
    let isFinal = false
    let isDirty = true
    let alerts = {}
    let tickers = {}
    const truncate = (space, ...texts) => {
        if (texts.reduce((a, text) => a + text.length, 0) <= space) return texts
        const slotSpace = Math.min(space / texts.length)
        const slotRemainder = space % texts.length
        return texts.map((text, i) => '…' + text.slice(-slotSpace - (i === 0 ? slotRemainder : 0)))
    }
    const draw = linesPrevious => {
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
                details.isError ? Chalk.red.bold(details.message)
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
        const key = [details.operation, details.input, details.output].filter(x => x).join('-')
        alerts[key] = details
        isDirty = true
    }
    const finalise = () => isFinal = true
    draw() // start loop
    return { progress, alert, finalise }
}

function runProcess(segments, progress) {
    const longest = Math.max(...segments.map(segment => segment.name.length))
    return segments.reduce(async (previous, segment) => {
        await previous
        const operation = await segment.setup()
        const total = await operation.length()
        return operation.run().each(progress(`${segment.name}...`.padEnd(longest + 3, ' '), total)).whenEnd()
    }, Promise.resolve())
}

async function runOperation(operation, progress) {
    const total = await operation.length()
    await operation.run().each(progress('Working...', total)).whenEnd()
    if (operation.terminate) await operation.terminate()
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
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find', default: 'eng' })
    })
    instructions.command('make-searchable', 'Extract or, if necessary, OCR each PDF, and output new PDFs with the text embedded', args => {
        args
            .usage('Usage: autocracy make-searchable <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find', default: 'eng' })
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
    instructions.command('preprocess-image-pages', false, args => {
        args
            .usage('Usage: autocracy preprocess-image-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
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
            .option('a', { alias: 'aws-region', type: 'string', describe: 'The AWS region, if using that method', default: 'eu-west-1' })
    })
    instructions.command('convert-image-pages-to-pdf-text-pages', false, args => {
        args
            .usage('Usage: autocracy convert-image-pages-to-pdf-text-pages <origin> <destination>')
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
            .option('m', { alias: 'method', type: 'choices', describe: 'Combination method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('blend-pdf-text-pages', false, args => {
        args
            .usage('Usage: autocracy blend-pdf-text-pages <origin> <origin-text> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('origin-text', { type: 'string', describe: 'Origin text directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Combination method to use', choices: ['shell'], default: 'shell' })
    })
    if (instructions.argv._.length === 0) instructions.showHelp().exit(0)
    const command = instructions.argv._[0]
    const { alert, progress, finalise } = renderer()
    console.error('Starting up...')
    try {
        if (command === 'get-text') {
            const {
                _: [, origin, destination],
                forceOcr,
                preprocess,
                language,
                verbose
            } = instructions.argv
            const parameters = { forceOCR: forceOcr, preprocess, language }
            const segments = autocracy.getText(origin, destination, parameters, verbose, alert)
            await runProcess(segments, progress)
        }
        else if (command === 'make-searchable') {
            const {
                _: [, origin, destination],
                forceOcr,
                preprocess,
                language,
                verbose
            } = instructions.argv
            const parameters = { forceOCR: forceOcr, preprocess, language }
            const segments = autocracy.makeSearchable(origin, destination, parameters, verbose, alert)
            await runProcess(segments, progress)
        }
        else if (command === 'extract-pdf-to-text') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.extractPDFToText(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'copy-pdf-tagged') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.copyPDFTagged(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'symlink-missing') {
            const {
                _: [, origin, intermediate, destination],
                verbose
            } = instructions.argv
            const operation = await autocracy.operations.symlinkMissing(origin, intermediate, destination, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-pdf-to-image-pages') {
            const {
                _: [, origin, destination],
                method,
                density,
                verbose
            } = instructions.argv
            const parameters = { method, density }
            const operation = await autocracy.operations.convertPDFToImagePages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'preprocess-image-pages') {
            const {
                _: [, origin, destination],
                verbose
            } = instructions.argv
            const parameters = {}
            const operation = await autocracy.operations.preprocessImagePages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-image-pages-to-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                awsRegion,
                verbose
            } = instructions.argv
            const parameters = { method, language, density, awsRegion }
            const operation = await autocracy.operations.convertImagePagesToTextPages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-image-pages-to-pdf-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                verbose
            } = instructions.argv
            const parameters = { method, language, density }
            const operation = await autocracy.operations.convertImagePagesToPDFPages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'combine-text-pages') {
            const {
                _: [, origin, destination],
                verbose
            } = instructions.argv
            const parameters = {}
            const operation = await autocracy.operations.combineTextPages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'combine-pdf-pages') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.combinePDFPages(origin, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'blend-pdf-text-pages') {
            const {
                _: [, origin, originText, destination],
                method,
                verbose
            } = instructions.argv
            const parameters =  { method }
            const operation = await autocracy.operations.blendPDFTextPages(origin, originText, destination, parameters, verbose, alert)
            await runOperation(operation, progress)
        }
        else {
            throw new Error(`${command}: unknown command`)
        }
        finalise()
    }
    catch (e) {
        console.error(instructions.argv.verbose ? e.stack : e.message)
        Process.exit(1)
    }

}

setup()
