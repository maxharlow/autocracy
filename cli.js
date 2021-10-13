import Readline from 'readline'
import Process from 'process'
import Yargs from 'yargs'
import Progress from 'progress'
import ocracy from './ocracy.js'

function alert(message) {
    Readline.clearLine(process.stderr)
    Readline.cursorTo(process.stderr, 0)
    console.error(message)
}

function ticker(text, total) {
    const progress = new Progress(text + ' |:bar| :percent / :etas left', {
        total,
        width: Infinity,
        complete: '█',
        incomplete: ' '
    })
    return () => progress.tick()
}

async function setup() {
    const instructions = Yargs(Process.argv.slice(2))
        .usage('Usage: ocracy <command>')
        .wrap(null)
        .option('V', { alias: 'verbose', type: 'boolean', describe: 'Print details', default: false })
        .help('?').alias('?', 'help')
        .version().alias('v', 'version')
    instructions.command('get-text', 'Extract or, if necessary, OCR each PDF, and output a text file', args => {
        args
            .usage('Usage: ocracy get-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
    })
    instructions.command('make-searchable', 'Extract or, if necessary, OCR each PDF, and output new PDFs with the text embedded', args => {
        args
            .usage('Usage: ocracy make-searchable <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
    })
    instructions.command('extract-pdf-to-text', false, args => {
        args
            .usage('Usage: ocracy extract-pdf-to-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('copy-pdf-if-tagged', false, args => {
        args
            .usage('Usage: ocracy copy-pdf-if-tagged <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('symlink-missing', false, args => {
        args
            .usage('Usage: ocracy symlink-missing <origin> <intermedidate> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('intermediate', { type: 'string', describe: 'Intermediate directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
    })
    instructions.command('convert-pdf-to-jpeg-pages', false, args => {
        args
            .usage('Usage: ocracy convert-pdf-to-jpeg-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
    })
    instructions.command('convert-jpeg-pages-to-text-pages', false, args => {
        args
            .usage('Usage: ocracy convert-jpeg-pages-to-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['aws', 'library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find (not used by AWS)', default: 'eng' })
    })
    instructions.command('convert-jpeg-pages-to-pdf-pages', false, args => {
        args
            .usage('Usage: ocracy convert-jpeg-pages-to-pdf-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['aws', 'library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find (not used by AWS)', default: 'eng' })
    })
    instructions.command('combine-text-pages', false, args => {
        args
            .usage('Usage: ocracy combine-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
    })
    instructions.command('combine-pdf-pages', false, args => {
        args
            .usage('Usage: ocracy combine-pdf-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Combination method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    if (instructions.argv._.length === 0) instructions.showHelp().exit(0)
    const command = instructions.argv._[0]
    try {
        if (command === 'get-text') {
            const {
                _: [, origin, destination],
                forceOCR,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const procedures = await ocracy.getText(origin, destination, forceOCR, verbose, alert)
            await procedures.reduce(async (previous, procedure) => {
                await previous
                const process = await procedure.setup()
                const total = await process.length()
                await process.run().each(ticker(`${procedure.name}...`.padEnd(41, ' '), total)).whenEnd()
                return
            }, Promise.resolve())
        }
        else if (command === 'make-searchable') {
            const {
                _: [, origin, destination],
                forceOCR,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const procedures = await ocracy.makeSearchable(origin, destination, forceOCR, verbose, alert)
            await procedures.reduce(async (previous, procedure) => {
                await previous
                const process = await procedure.setup()
                const total = await process.length()
                await process.run().each(ticker(`${procedure.name}...`.padEnd(41, ' '), total)).whenEnd()
                return
            }, Promise.resolve())
        }
        else if (command === 'extract-pdf-to-text') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.extractPDFToText(origin, destination, method, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
        }
        else if (command === 'copy-pdf-if-tagged') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.copyPDFIfTagged(origin, destination, method, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
        }
        else if (command === 'symlink-missing') {
            const {
                _: [, origin, intermediate, destination],
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.symlinkMissing(origin, intermediate, destination, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
        }
        else if (command === 'convert-pdf-to-jpeg-pages') {
            const {
                _: [, origin, destination],
                method,
                density,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.convertPDFToJPEGPages(origin, destination, method, density, verbose, alert)
            const total = await process.length()
            process.run().each(ticker('Working...', total))
        }
        else if (command === 'convert-jpeg-pages-to-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.convertJPEGPagesToTextPages(origin, destination, method, language, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
            await process.terminate()
        }
        else if (command === 'convert-jpeg-pages-to-pdf-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.convertJPEGPagesToPDFPages(origin, destination, method, language, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
            await process.terminate()
        }
        else if (command === 'combine-text-pages') {
            const {
                _: [, origin, destination],
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.combineTextPages(origin, destination, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
        }
        else if (command === 'combine-pdf-pages') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.operations.combinePDFPages(origin, destination, method, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
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
