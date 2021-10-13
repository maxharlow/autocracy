import multiprocess from './commands/multiprocess.js'
import extractPDFToText from './commands/extract-pdf-to-text.js'
import symlinkMissing from './commands/symlink-missing.js'
import convertPDFToJPEGPages from './commands/convert-pdf-to-jpeg-pages.js'
import convertJPEGPagesToTextPages from './commands/convert-jpeg-pages-to-text-pages.js'
import combineTextPages from './commands/combine-text-pages.js'

export default {
    multiprocess,
    extractPDFToText,
    symlinkMissing,
    convertPDFToJPEGPages,
    convertJPEGPagesToTextPages,
    combineTextPages
}
