import autocracy from './../autocracy.js'

function initialise(origin, destination, parameters, verbose, alert) {
    const options = {
        forceOCR: false,
        language: 'eng',
        ...parameters
    }
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cachePDFTextPages = '.autocracy-cache/pdf-text-pages'
    const cachePDFText = '.autocracy-cache/pdf-text'
    const density = 300
    const operations = [
        !options.forceOCR && {
            name: 'Copying already-tagged PDFs',
            setup: () => autocracy.operations.copyPDFTagged(
                origin,
                destination,
                {
                    method: 'shell'
                },
                verbose,
                alert
            )
        },
        !options.forceOCR && {
            name: 'Symlinking untagged PDFs',
            setup: () => autocracy.operations.symlinkMissing(
                origin,
                destination,
                cacheUntagged,
                verbose,
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
                verbose,
                alert
            )
        },
        {
            name: 'Converting image pages to PDF text pages',
            setup: () => autocracy.operations.convertImagePagesToPDFTextPages(
                cacheImagePages,
                cachePDFTextPages,
                {
                    originInitial: origin,
                    method: 'shell',
                    language: options.language,
                    density
                },
                verbose,
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
                verbose,
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
                verbose,
                alert
            )
        }
    ]
    return operations.filter(x => x)
}

export default initialise
