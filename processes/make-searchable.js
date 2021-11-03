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
    const cachePDFTextPages = '.autocracy-cache/pdf-text-pages'
    const cachePDFText = '.autocracy-cache/pdf-text'
    const density = 300
    const segments = [
        !options.forceOCR && {
            name: 'Copying already-tagged PDFs',
            setup: () => autocracy.operations.copyPDFTagged(
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
            name: 'Converting image pages to PDF text pages',
            setup: () => autocracy.operations.convertImagePagesToPDFTextPages(
                options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                cachePDFTextPages,
                {
                    originInitial: origin,
                    method: 'shell',
                    language: options.language,
                    timeout: 5 * 60,
                    density
                },
                alert
            )
        },
        {
            name: 'Combining PDF text pages',
            setup: () => autocracy.operations.combinePDFPages(
                cachePDFTextPages,
                cachePDFText,
                {
                    originInitial: origin,
                    originPrior: cacheImagePages,
                    method: 'shell'
                },
                alert
            )
        },
        {
            name: 'Blending PDF text pages with original pages',
            setup: () => autocracy.operations.blendPDFTextPages(
                origin,
                cachePDFText,
                destination,
                {
                    method: 'shell'
                },
                alert
            )
        }
    ]
    return segments.filter(x => x)
}

export default initialise
