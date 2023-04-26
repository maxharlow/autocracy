import autocracy from './../autocracy.js'
import shared from './../shared.js'

function initialise(origin, destination, parameters, progress, alert) {
    const options = {
        useCache: false,
        forceOCR: false,
        preprocess: false,
        language: 'eng',
        extractPDFToTextWith: 'mupdf',
        convertPDFToImagePagesWith: 'mupdf',
        convertImagePagesToTextPagesWith: 'tesseract',
        ...parameters
    }
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cacheImagePagesPreprocessed = '.autocracy-cache/image-pages-preprocessed'
    const cacheTextPages = '.autocracy-cache/text-pages'
    const density = 300
    const stages = [
        !options.forceOCR && {
            setup: length => {
                const tick = progress('Extracting PDFs to full texts...'.padEnd(45, ' '), length)
                return autocracy.operations.extractPDFToText(
                    origin,
                    destination,
                    {
                        useCache: options.useCache,
                        method: options.extractPDFToTextWith
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
                const tick = progress('Converting image pages to text pages...'.padEnd(45, ' '), length)
                return autocracy.operations.convertImagePagesToTextPages(
                    options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                    cacheTextPages,
                    {
                        useCache: options.useCache,
                        method: options.convertImagePagesToTextPagesWith,
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
                const tick = progress('Combining text pages into full texts...'.padEnd(45, ' '), length)
                return autocracy.operations.combineTextPages(
                    cacheTextPages,
                    destination,
                    {
                        useCache: options.useCache,
                        originPrior: cacheImagePages
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
