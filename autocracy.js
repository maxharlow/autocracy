import getText from './processes/get-text.js'
import makeSearchable from './processes/make-searchable.js'
import extractPDFToText from './operations/extract-pdf-to-text.js'
import copyPDFTagged from './operations/copy-pdf-tagged.js'
import symlinkMissing from './operations/symlink-missing.js'
import convertPDFToJpegPages from './operations/convert-pdf-to-jpeg-pages.js'
import convertJpegPagesToTextPages from './operations/convert-jpeg-pages-to-text-pages.js'
import convertJpegPagesToPDFPages from './operations/convert-jpeg-pages-to-pdf-pages.js'
import combineTextPages from './operations/combine-text-pages.js'
import combinePDFPages from './operations/combine-pdf-pages.js'

export default {
    getText,
    makeSearchable,
    operations: {
        extractPDFToText,
        copyPDFTagged,
        symlinkMissing,
        convertPDFToJpegPages,
        convertJpegPagesToTextPages,
        convertJpegPagesToPDFPages,
        combineTextPages,
        combinePDFPages
    }
}
