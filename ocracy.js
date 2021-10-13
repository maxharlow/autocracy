import getText from './processes/get-text.js'
import makeSearchable from './processes/make-searchable.js'
import extractPDFToText from './operations/extract-pdf-to-text.js'
import copyPDFIfTagged from './operations/copy-pdf-if-tagged.js'
import symlinkMissing from './operations/symlink-missing.js'
import convertPDFToJPEGPages from './operations/convert-pdf-to-jpeg-pages.js'
import convertJPEGPagesToTextPages from './operations/convert-jpeg-pages-to-text-pages.js'
import convertJPEGPagesToPDFPages from './operations/convert-jpeg-pages-to-pdf-pages.js'
import combineTextPages from './operations/combine-text-pages.js'
import combinePDFPages from './operations/combine-pdf-pages.js'

export default {
    getText,
    makeSearchable,
    operations: {
        extractPDFToText,
        copyPDFIfTagged,
        symlinkMissing,
        convertPDFToJPEGPages,
        convertJPEGPagesToTextPages,
        convertJPEGPagesToPDFPages,
        combineTextPages,
        combinePDFPages
    }
}
