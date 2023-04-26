import Process from 'process'
import Yargs from 'yargs'
import autocracy from './autocracy.js'
import cliRenderer from './cli-renderer.js'

async function setup() {
    const instructions = Yargs(Process.argv.slice(2))
        .usage('Usage: autocracy <command>')
        .wrap(null)
        .completion('completion', false)
        .option('C', { alias: 'use-cache', type: 'boolean', describe: 'Check a fast cache for whether it includes the file, and skip if so', default: false })
        .option('V', { alias: 'verbose', type: 'boolean', describe: 'Print details', default: false })
        .help('?').alias('?', 'help')
        .version().alias('v', 'version')
    instructions.command('get-text', 'Output text files', args => {
        args
            .usage('Usage: autocracy get-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDF files' })
            .positional('destination', { type: 'string', describe: 'Directory to output text files to' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged text even if it is available', default: false })
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language the origin documents are written in', default: 'eng' })
            .option('extract-pdf-to-text-with', { type: 'string', describe: 'Method to extract PDFs to text', choices: ['mupdf'], default: 'mupdf' })
            .option('convert-pdf-to-image-pages-with', { type: 'string', describe: 'Method to convert PDFs to image pages', choices: ['mupdfjs', 'mupdf'], default: 'mupdf' })
            .option('convert-image-pages-to-text-pages-with', { type: 'string', describe: 'Method to convert image pages to text pages', choices: ['aws-textract', 'tesseractjs', 'tesseract'], default: 'tesseract' })
    })
    instructions.command('make-searchable', 'Output new PDF files with tagged text', args => {
        args
            .usage('Usage: autocracy make-searchable <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Directory of input PDFs' })
            .positional('destination', { type: 'string', describe: 'Directory to output searchable PDF files to' })
            .option('f', { alias: 'force-ocr', type: 'boolean', describe: 'Do not use tagged text even if it is available', default: false })
            .option('p', { alias: 'preprocess', type: 'boolean', describe: 'Preprocess image files to attempt to improve OCR quality', default: false })
            .option('l', { alias: 'language', type: 'string', describe: 'Language the origin documents are written in', default: 'eng' })
            .option('copy-pdf-tagged-with', { type: 'string', describe: 'Method to copy tagged PDFs', choices: ['mupdf'], default: 'mupdf' })
            .option('convert-pdf-to-image-pages-with', { type: 'string', describe: 'Method to convert PDFs to image pages', choices: ['mupdfjs', 'mupdf'], default: 'mupdf' })
            .option('convert-image-pages-to-pdf-text-pages-with', { type: 'string', describe: 'Method to convert image pages to PDF text pages', choices: ['tesseractjs', 'tesseract'], default: 'tesseract' })
            .option('combine-pdf-pages-with', { type: 'string', describe: 'Method to combine PDF pages', choices: ['pdfjs', 'mupdf'], default: 'mupdf' })
            .option('blend-pdf-text-pages-with', { type: 'string', describe: 'Method to blend PDF text pages', choices: ['qpdf'], default: 'qpdf' })
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
                useCache,
                forceOcr,
                preprocess,
                language,
                extractPdfToTextWith,
                convertPdfToImagePagesWith,
                convertImagePagesToTextPagesWith
            } = instructions.argv
            const parameters = {
                useCache,
                forceOCR: forceOcr,
                preprocess,
                language,
                extractPDFToTextWith: extractPdfToTextWith,
                convertPDFToImagePagesWith: convertPdfToImagePagesWith,
                convertImagePagesToTextPagesWith
            }
            await autocracy.getText(origin, destination, parameters, progress, alert)
        }
        else if (command === 'make-searchable') {
            const {
                _: [, origin, destination],
                useCache,
                forceOcr,
                preprocess,
                language,
                copyPdfTaggedWith,
                convertPdfToImagePagesWith,
                convertImagePagesToPdfTextPagesWith,
                combinePdfPagesWith,
                blendPdfTextPagesWith
            } = instructions.argv
            const parameters = {
                useCache,
                forceOCR: forceOcr,
                preprocess,
                language,
                copyPDFTaggedWith: copyPdfTaggedWith,
                convertPDFToImagePagesWith: convertPdfToImagePagesWith,
                convertImagePagesToPDFTextPagesWith: convertImagePagesToPdfTextPagesWith,
                combinePDFPagesWith: combinePdfPagesWith,
                blendPDFTextPagesWith: blendPdfTextPagesWith
           }
            await autocracy.makeSearchable(origin, destination, parameters, progress, alert)
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
