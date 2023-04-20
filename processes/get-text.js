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
    const segments = [
        !options.forceOCR && {
            name: 'Extracting PDFs to full texts',
            setup: () => autocracy.operations.extractPDFToText(
                origin,
                destination,
                {
                    useCache: options.useCache,
                    method: options.extractPDFToTextWith
                },
                progress,
                alert
            )
        },
        !options.forceOCR && {
            name: 'Symlinking untagged PDFs',
            setup: () => autocracy.operations.symlinkMissing(
                origin,
                destination,
                cacheUntagged,
                {
                    useCache: options.useCache
                },
                progress,
                alert
            )
        },
        {
            name: options.forceOCR ? 'Converting PDFs to image pages' : 'Converting untagged PDFs to image pages',
            setup: () => autocracy.operations.convertPDFToImagePages(
                options.forceOCR ? origin : cacheUntagged,
                cacheImagePages,
                {
                    useCache: options.useCache,
                    method: options.convertPDFToImagePagesWith,
                    density
                },
                progress,
                alert
            )
        },
        options.preprocess && {
            name: 'Preprocessing image pages',
            setup: () => autocracy.operations.preprocessImagePages(
                cacheImagePages,
                cacheImagePagesPreprocessed,
                {
                    useCache: options.useCache
                },
                progress,
                alert
            )
        },
        {
            name: 'Converting image pages to text pages',
            setup: () => autocracy.operations.convertImagePagesToTextPages(
                options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                cacheTextPages,
                {
                    useCache: options.useCache,
                    method: options.convertImagePagesToTextPagesWith,
                    language: options.language,
                    timeout: 5 * 60,
                    density
                },
                progress,
                alert
            )
        },
        {
            name: 'Combining text pages into full texts',
            setup: () => autocracy.operations.combineTextPages(
                origin,
                cacheTextPages,
                destination,
                {
                    useCache: options.useCache,
                    originPrior: cacheImagePages
                },
                progress,
                alert
            )
        }
    ]
    return shared.runProcess(segments.filter(x => x), progress)
}

export default initialise
