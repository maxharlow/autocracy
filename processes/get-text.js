import autocracy from './../autocracy.js'

function initialise(origin, destination, options = { forceOCR: false, language: 'eng' }, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cacheTextPages = '.autocracy-cache/text-pages'
    const operations = [
        !options.forceOCR && {
            name: 'Extracting PDFs to full texts',
            setup: () => autocracy.operations.extractPDFToText(
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
                    density: 300
                },
                verbose,
                alert
            )
        },
        {
            name: 'Converting image pages to text pages',
            setup: () => autocracy.operations.convertImagePagesToTextPages(
                cacheImagePages,
                cacheTextPages,
                {
                    originInitial: origin,
                    method: 'shell',
                    language: options.language,
                    density: 300
                },
                verbose,
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
                verbose,
                alert
            )
        }
    ]
    return operations.filter(x => x)
}

export default initialise
