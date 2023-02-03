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
        .completion('completion', false)
        .option('V', { alias: 'verbose', type: 'boolean', describe: 'Print details', default: false })
        .help('?').alias('?', 'help')
        .version().alias('v', 'version')
    instructions.command('get-text', 'Output text files', args => {
        args
            .usage('Usage: autocracy get-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output text files to' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language the origin documents are written in', default: 'eng' })
    })
    instructions.command('make-searchable', 'Output new PDF files with embedded text', args => {
        args
            .usage('Usage: autocracy make-searchable <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDFs' })
            .positional('destination', { type: 'string', describe: 'Directory to output searchable PDF files to' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged-text even if it is available', default: false })
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language the origin documents are written in', default: 'eng' })
    })
    instructions.command('extract-pdf-to-text', false, args => {
        args
            .usage('Usage: autocracy extract-pdf-to-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output text files to' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Extraction method to use', choices: ['shell'], default: 'shell' })
    })
    instructions.command('copy-pdf-tagged', false, args => {
        args
            .usage('Usage: autocracy copy-pdf-tagged <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to copy PDF files to if they have tagged-text' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Tagged-text detection method to use', choices: ['shell'], default: 'shell' })
    })
    instructions.command('symlink-missing', false, args => {
        args
            .usage('Usage: autocracy symlink-missing <origin> <alternative> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('alternative', { type: 'string', describe: 'Directory containing alternative versions of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output symlinks in cases where no alternative version exists' })
    })
    instructions.command('convert-pdf-to-image-pages', false, args => {
        args
            .usage('Usage: autocracy convert-pdf-to-image-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output subdirectories containing an image file for each page' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
    })
    instructions.command('preprocess-image-pages', false, args => {
        args
            .usage('Usage: autocracy preprocess-image-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory containing subdirectories with an input image for each page' })
            .positional('destination', { type: 'string', describe: 'Directory to output matching subdirectories with a preprocessed image for each page' })
    })
    instructions.command('convert-image-pages-to-text-pages', false, args => {
        args
            .usage('Usage: autocracy convert-image-pages-to-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory containing subdirectories with an input image for each page' })
            .positional('destination', { type: 'string', describe: 'Directory to output matching subdirectories with a text file for each page' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['aws-textract', 'library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find (ignored by AWS)', default: 'eng' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
            .option('t', { alias: 'timeout', type: 'number', describe: 'The maximum amount of time that the OCR should take, in seconds', default: 5 * 60 })
            .option('a', { alias: 'aws-region', type: 'string', describe: 'The AWS region, if applicable', default: 'eu-west-1' })
    })
    instructions.command('convert-image-pages-to-pdf-text-pages', false, args => {
        args
            .usage('Usage: autocracy convert-image-pages-to-pdf-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory containing subdirectories with an input image for each page' })
            .positional('destination', { type: 'string', describe: 'Directory to output matching subdirectories with an invisible-text PDF file for each page' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
            .option('l', { alias: 'language', type: 'string', describe: 'Language to expect to find', default: 'eng' })
            .option('d', { alias: 'density', type: 'number', describe: 'Image resolution, in dots per inch', default: 300 })
            .option('t', { alias: 'timeout', type: 'number', describe: 'The maximum amount of time that the OCR should take, in seconds', default: 5 * 60 })
    })
    instructions.command('combine-text-pages', false, args => {
        args
            .usage('Usage: autocracy combine-text-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory containing subdirectories with an input text file for each page' })
            .positional('destination', { type: 'string', describe: 'Directory to output a single text file' })
    })
    instructions.command('combine-pdf-pages', false, args => {
        args
            .usage('Usage: autocracy combine-pdf-pages <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory containing subdirectories with an input PDF file for each page' })
            .positional('destination', { type: 'string', describe: 'Directory to output a single PDF file' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Combination method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('blend-pdf-text-pages', false, args => {
        args
            .usage('Usage: autocracy blend-pdf-text-pages <origin> <origin-text> <destination>')
            .demandCommand(3, '')
            .positional('origin', { type: 'string', describe: 'Directory containing original input PDF files with no tagged-text' })
            .positional('origin-text', { type: 'string', describe: 'Directory containing invisible-text PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output blended PDF files' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Blend method to use', choices: ['shell'], default: 'shell' })
    })
    if (instructions.argv._.length === 0) instructions.showHelp().exit(0)
    if (instructions.argv['get-yargs-completions']) Process.exit(0)
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
                timeout,
                awsRegion
            } = instructions.argv
            const parameters = { method, language, density, timeout, awsRegion }
            const operation = await autocracy.operations.convertImagePagesToTextPages(origin, destination, parameters, alert)
            await runOperation(operation, progress)
        }
        else if (command === 'convert-image-pages-to-pdf-text-pages') {
            const {
                _: [, origin, destination],
                method,
                language,
                density,
                timeout
            } = instructions.argv
            const parameters = { method, language, density, timeout }
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
        await finalise('complete')
    }
    catch (e) {
        await finalise('error')
        console.error(instructions.argv.verbose ? e.stack : e.message)
        Process.exit(1)
    }
}

setup()
