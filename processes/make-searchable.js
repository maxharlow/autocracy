import autocracy from './../autocracy.js'

function initialise(origin, destination, parameters, alert) {
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
    const segments = [
        !options.forceOCR && {
            name: 'Copying already-tagged PDFs',
            setup: () => autocracy.operations.copyPDFTagged(
                origin,
                destination,
                {
                    useCache: options.useCache,
                    method: options.copyPDFTaggedWith
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
                {
                    useCache: options.useCache
                },
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
                alert
            )
        },
        {
            name: 'Converting image pages to PDF text pages',
            setup: () => autocracy.operations.convertImagePagesToPDFTextPages(
                options.preprocess ? cacheImagePagesPreprocessed : cacheImagePages,
                cachePDFTextPages,
                {
                    useCache: options.useCache,
                    method: options.convertImagePagesToPDFTextPagesWith,
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
                origin,
                cachePDFTextPages,
                cachePDFText,
                {
                    useCache: options.useCache,
                    originPrior: cacheImagePages,
                    method: options.combinePDFPagesWith
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
                    useCache: options.useCache,
                    method: options.blendPDFTextPagesWith
                },
                alert
            )
        }
    ]
    return segments.filter(x => x)
}

export default initialise
