import convertPDFToJPEG from './commands/convert-pdf-to-jpeg.js'
import convertJPEGToText from './commands/convert-jpeg-to-text.js'
import extractPDFToText from './commands/extract-pdf-to-text.js'
import createAWSJob from './commands/create-aws-job.js'
import getAWSJobStatus from './commands/get-aws-job-status.js'
import convertAWSJobToText from './commands/convert-aws-job-to-text.js'

export default {
    convertPDFToJPEG,
    convertJPEGToText,
    extractPDFToText,
    createAWSJob,
    getAWSJobStatus,
    convertAWSJobToText
}
