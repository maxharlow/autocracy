import autocracy from './../autocracy.js'

function initialise(origin, destination, forceOCR, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cacheTextPages = '.autocracy-cache/text-pages'
    const operations = [
        !forceOCR && {
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
        !forceOCR && {
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
            name: forceOCR ? 'Converting PDFs to image pages' : 'Converting untagged PDFs to image pages',
            setup: () => autocracy.operations.convertPDFToImagePages(
                forceOCR ? origin : cacheUntagged,
                cacheImagePages,
                {
                    ...forceOCR ? {} : { originInitial: origin },
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
                    language: 'eng',
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
