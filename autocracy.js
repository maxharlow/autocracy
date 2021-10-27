import getText from './processes/get-text.js'
import makeSearchable from './processes/make-searchable.js'
import extractPDFToText from './operations/extract-pdf-to-text.js'
import copyPDFTagged from './operations/copy-pdf-tagged.js'
import symlinkMissing from './operations/symlink-missing.js'
import convertPDFToImagePages from './operations/convert-pdf-to-image-pages.js'
import convertImagePagesToTextPages from './operations/convert-image-pages-to-text-pages.js'
import convertImagePagesToPDFTextPages from './operations/convert-image-pages-to-pdf-text-pages.js'
import blendPDFTextPages from './operations/blend-pdf-text-pages.js'
import combineTextPages from './operations/combine-text-pages.js'
import combinePDFPages from './operations/combine-pdf-pages.js'

export default {
    getText,
    makeSearchable,
    operations: {
        extractPDFToText,
        copyPDFTagged,
        symlinkMissing,
        convertPDFToImagePages,
        convertImagePagesToTextPages,
        convertImagePagesToPDFTextPages,
        blendPDFTextPages,
        combineTextPages,
        combinePDFPages
    }
}
