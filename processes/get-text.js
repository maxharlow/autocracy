import autocracy from './../autocracy.js'

function initialise(origin, destination, parameters, alert) {
    const options = {
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
                    method: options.extractPDFToTextWith
                },
                alert
            )
        },
        !options.forceOCR && {
            name: 'Symlinking untagged PDFs',
            setup: () => autocracy.operations.symlinkMissing(
                origin,
                destination,
                cacheUntagged,
                alert
            )
        },
        {
            name: options.forceOCR ? 'Converting PDFs to image pages' : 'Converting untagged PDFs to image pages',
            setup: () => autocracy.operations.convertPDFToImagePages(
                options.forceOCR ? origin : cacheUntagged,
                cacheImagePages,
                {
                    method: options.convertPDFToImagePagesWith,
                    density
                },
                alert
            )
        },
        options.preprocess && {
            name: 'Preprocessing image pages',
            setup: () => autocracy.operations.preprocessImagePages(
                cacheImagePages,
                cacheImagePagesPreprocessed,
                {},
                alert
            )
        },
        {
            name: 'Converting image pages to text pages',
            setup: () => autocracy.operations.convertImagePagesToTextPages(
                options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                cacheTextPages,
                {
                    method: options.convertImagePagesToTextPagesWith,
                    language: options.language,
                    timeout: 5 * 60,
                    density
                },
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
                    originPrior: cacheImagePages
                },
                alert
            )
        }
    ]
    return segments.filter(x => x)
}

export default initialise
