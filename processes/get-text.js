import autocracy from './../autocracy.js'

function initialise(origin, destination, parameters, alert) {
    const options = {
        forceOCR: false,
        preprocess: false,
        language: 'eng',
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
                    method: 'shell'
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
                    ...options.forceOCR ? {} : { originInitial: origin },
                    method: 'shell',
                    density
                },
                alert
            )
        },
        options.preprocess && {
            name: 'Preprocessing image pages...',
            setup: () => autocracy.operations.preprocessImagePages(
                cacheImagePages,
                cacheImagePagesPreprocessed,
                {
                    originInitial: origin
                },
                alert
            )
        },
        {
            name: 'Converting image pages to text pages',
            setup: () => autocracy.operations.convertImagePagesToTextPages(
                options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                cacheTextPages,
                {
                    originInitial: origin,
                    method: 'shell',
                    language: options.language,
                    density
                },
                alert
            )
        },
        {
            name: 'Combining text pages into full texts',
            setup: () => autocracy.operations.combineTextPages(
                cacheTextPages,
                destination,
                {
                    originInitial: origin,
                    originPrior: cacheImagePages
                },
                alert
            )
        }
    ]
    return segments.filter(x => x)
}

export default initialise
