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
    instructions.command('convert-pdf-to-jpeg', 'Convert a directory of PDF files into JPEG images, split by page', args => {
        args
            .usage('Usage: ocracy convert-pdf-to-jpeg <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('convert-jpeg-to-text', 'Convert a directory of directories containing JPEG files for each page into text files including all pages', args => {
        args
            .usage('Usage: ocracy convert-jpeg-to-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['aws', 'library', 'shell'], default: 'shell' })
    })
    instructions.command('extract-pdf-to-text', 'Extract the tagged-text from a directory of PDF files', args => {
        args
            .usage('Usage: ocracy extract-pdf-to-text <origin> <destination>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin directory' })
            .positional('destination', { type: 'string', describe: 'Destination directory' })
            .option('m', { alias: 'method', type: 'choices', describe: 'Conversion method to use', choices: ['library', 'shell'], default: 'shell' })
    })
    instructions.command('create-aws-job', 'Create AWS Textract jobs for every file in an S3 Bucket', args => {
        args
            .usage('Usage: ocracy create-aws-job <origin> <jobfile>')
            .demandCommand(2, '')
            .positional('origin', { type: 'string', describe: 'Origin S3 Bucket path' })
            .positional('jobfile', { type: 'string', describe: 'A jobfile' })
    })
    instructions.command('get-aws-job-status', 'Get the status for every AWS Textract job in a jobfile', args => {
        args
            .usage('Usage: oracy get-aws-job-status <jobfile>')
            .demandCommand(1, '')
            .positional('jobfile', { type: 'string', describe: 'A jobfile' })
    })
    instructions.command('convert-aws-job-to-text', 'Extract the text from every AWS Textract job in a jobfile', args => {
        args
            .usage('Usage: oracy convert-aws-job-to-text <jobfile> <destination>')
            .demandCommand(1, '')
            .positional('jobfile', { type: 'string', describe: 'A jobfile' })
            .positional('destination', { type: 'string', describe: 'A destination directory to write text files' })
    })
    if (instructions.argv._.length === 0) instructions.showHelp().exit(0)
    const command = instructions.argv._[0]
    try {
        if (command === 'convert-pdf-to-jpeg') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.convertPDFToJPEG(origin, destination, method, verbose, alert)
            const total = await process.length()
            process.run().each(ticker('Working...', total))
        }
        else if (command === 'convert-jpeg-to-text') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.convertJPEGToText(origin, destination, method, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
            await process.terminate()
        }
        else if (command === 'extract-pdf-to-text') {
            const {
                _: [, origin, destination],
                method,
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.extractPDFToText(origin, destination, method, verbose, alert)
            const total = await process.length()
            await process.run().each(ticker('Working...', total))
        }
        else if (command === 'create-aws-job') {
            const {
                _: [, origin, jobfile],
                verbose
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.createAWSJob(origin, jobfile, verbose, alert)
            const total = await process.length()
            process.run().each(ticker('Working...', total))
        }
        else if (command === 'get-aws-job-status') {
            const {
                _: [, jobfile]
            } = instructions.argv
            const process = await ocracy.getAWSJobStatus(jobfile)
            process().each(job => alert(`${job.bucket}\t${job.prefix}\t${job.key}\t${job.state}`))
        }
        else if (command === 'convert-aws-job-to-text') {
            const {
                _: [, jobfile, destination]
            } = instructions.argv
            console.error('Starting up...')
            const process = await ocracy.convertAWSJobToText(jobfile, destination, alert)
            const total = await process.length()
            process.run().each(ticker('Working...', total))
        }
        else {
            throw new Error(`${command}: unknown command`)
        }
    }
    catch (e) {
        console.error(e.stack)
        Process.exit(1)
    }

}

setup()
