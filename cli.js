import Process from 'process'
import Yargs from 'yargs'
import autocracy from './autocracy.js'
import cliRenderer from './cli-renderer.js'

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
    if (operation.shutdown) await operation.shutdown()
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
            .usage('Usage: autocracy symlink-missing <origin> <alternative> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('alternative', { type: 'string', describe: 'Alternative directory' })
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
    console.error('Starting up...')
    const { alert, progress, finalise } = cliRenderer(instructions.argv.verbose)
    try {
        if (command === 'get-text') {
            const {
                _: [, origin, destination],
                forceOcr,
                preprocess,
                language
            } = instructions.argv
            const parameters = { forceOCR: forceOcr, preprocess, language }
            const segments = autocracy.getText(origin, destination, parameters, alert)
            await runProcess(segments, progress)
        }
        else if (command === 'make-searchable') {
            const {
                _: [, origin, destination],
                forceOcr,
                preprocess,
                language
            } = instructions.argv
            const parameters = { forceOCR: forceOcr, preprocess, language }
            const segments = autocracy.makeSearchable(origin, destination, parameters, alert)
            await runProcess(segments, progress)
        }
        else if (command === 'extract-pdf-to-text') {
            const {
                _: [, origin, destination],
                method
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.extractPDFToText(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'copy-pdf-tagged') {
            const {
                _: [, origin, destination],
                method
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.copyPDFTagged(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'symlink-missing') {
            const {
                _: [, origin, alternative, destination]
            } = instructions.argv
            const operation = await autocracy.operations.symlinkMissing(origin, alternative, destination, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-pdf-to-image-pages') {
            const {
                _: [, origin, destination],
                method,
                density
            } = instructions.argv
            const parameters = { method, density }
            const operation = await autocracy.operations.convertPDFToImagePages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'preprocess-image-pages') {
            const {
                _: [, origin, destination]
            } = instructions.argv
            const parameters = {}
            const operation = await autocracy.operations.preprocessImagePages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-image-pages-to-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                awsRegion
            } = instructions.argv
            const parameters = { method, language, density, awsRegion }
            const operation = await autocracy.operations.convertImagePagesToTextPages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-image-pages-to-pdf-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density
            } = instructions.argv
            const parameters = { method, language, density }
            const operation = await autocracy.operations.convertImagePagesToPDFPages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'combine-text-pages') {
            const {
                _: [, origin, destination]
            } = instructions.argv
            const parameters = {}
            const operation = await autocracy.operations.combineTextPages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'combine-pdf-pages') {
            const {
                _: [, origin, destination],
                method
            } = instructions.argv
            const parameters = { method }
            const operation = await autocracy.operations.combinePDFPages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'blend-pdf-text-pages') {
            const {
                _: [, origin, originText, destination],
                method
            } = instructions.argv
            const parameters =  { method }
            const operation = await autocracy.operations.blendPDFTextPages(origin, originText, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else {
            throw new Error(`${command}: unknown command`)
        }
        await finalise()
    }
    catch (e) {
        await finalise()
        console.error(instructions.argv.verbose ? e.stack : e.message)
        Process.exit(1)
    }
}

setup()
