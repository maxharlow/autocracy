import getText from './processes/get-text.js'
import extractPDFToText from './operations/extract-pdf-to-text.js'
import symlinkMissing from './operations/symlink-missing.js'
import convertPDFToJPEGPages from './operations/convert-pdf-to-jpeg-pages.js'
import convertJPEGPagesToTextPages from './operations/convert-jpeg-pages-to-text-pages.js'
import combineTextPages from './operations/combine-text-pages.js'

export default {
    getText,
    operations: {
        extractPDFToText,
        symlinkMissing,
        convertPDFToJPEGPages,
        convertJPEGPagesToTextPages,
        combineTextPages
    }
}
