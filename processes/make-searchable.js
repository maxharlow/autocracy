import autocracy from './../autocracy.js'
import shared from './../shared.js'

function initialise(origin, destination, parameters, progress, alert) {
    const options = {
        useCache: false,
        forceOCR: false,
        preprocess: false,
        language: 'eng',
        copyPDFTaggedWith: 'mupdf',
        convertPDFToImagePagesWith: 'mupdf',
        convertImagePagesToPDFTextPagesWith: 'tesseract',
        combinePDFPagesWith: 'mupdf',
        blendPDFTextPagesWith: 'qpdf',
        ...parameters
    }
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cacheImagePagesPreprocessed = '.autocracy-cache/image-pages-preprocessed'
    const cachePDFTextPages = '.autocracy-cache/pdf-text-pages'
    const cachePDFText = '.autocracy-cache/pdf-text'
    const density = 300
    const stages = [
        !options.forceOCR && {
            setup: length => {
                const tick = progress('Copying already-tagged PDFs...'.padEnd(45, ' '), length)
                return autocracy.operations.copyPDFTagged(
                    origin,
                    destination,
                    {
                        useCache: options.useCache,
                        method: options.copyPDFTaggedWith
                    },
                    tick,
                    alert
                )
            }
        },
        !options.forceOCR && {
            setup: length => {
                const tick = progress('Symlinking untagged PDFs...'.padEnd(45, ' '), length)
                return autocracy.operations.symlinkMissing(
                    origin,
                    destination,
                    cacheUntagged,
                    {
                        useCache: options.useCache
                    },
                    tick,
                    alert
                )
            }
        },
        {
            setup: length => {
                const tick = progress((options.forceOCR ? 'Converting PDFs to image pages...' : 'Converting untagged PDFs to image pages...').padEnd(45, ' '), length)
                return autocracy.operations.convertPDFToImagePages(
                    options.forceOCR ? origin : cacheUntagged,
                    cacheImagePages,
                    {
                        useCache: options.useCache,
                        method: options.convertPDFToImagePagesWith,
                        density
                    },
                    tick,
                    alert
                )
            }
        },
        options.preprocess && {
            setup: length => {
                const tick = progress('Preprocessing image pages...'.padEnd(45, ' '), length)
                return autocracy.operations.preprocessImagePages(
                    cacheImagePages,
                    cacheImagePagesPreprocessed,
                    {
                        useCache: options.useCache
                    },
                    tick,
                    alert
                )
            }
        },
        {
            setup: length => {
                const tick = progress('Converting image pages to PDF text pages...'.padEnd(45, ' '), length)
                return autocracy.operations.convertImagePagesToPDFTextPages(
                    options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                    cachePDFTextPages,
                    {
                        useCache: options.useCache,
                        method: options.convertImagePagesToPDFTextPagesWith,
                        language: options.language,
                        timeout: 5 * 60,
                        density
                    },
                    tick,
                    alert
                )
            }
        },
        {
            setup: length => {
                const tick = progress('Combining PDF text pages...'.padEnd(45, ' '), length)
                return autocracy.operations.combinePDFPages(
                    cachePDFTextPages,
                    cachePDFText,
                    {
                        useCache: options.useCache,
                        originPrior: cacheImagePages,
                        method: options.combinePDFPagesWith
                    },
                    tick,
                    alert
                )
            }
        },
        {
            setup: length => {
                const tick = progress('Blending untagged PDFs with text-only PDFs...'.padEnd(45, ' '), length)
                return autocracy.operations.blendPDFTextPages(
                    origin,
                    cachePDFText,
                    destination,
                    {
                        useCache: options.useCache,
                        method: options.blendPDFTextPagesWith
                    },
                    tick,
                    alert
                )
            }
        }
    ]
    return shared.pipeline(origin, destination, stages.filter(x => x))
}

export default initialise
