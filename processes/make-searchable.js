import autocracy from './../autocracy.js'

function initialise(origin, destination, forceOCR, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheImagePages = '.autocracy-cache/image-pages'
    const cachePDFPages = '.autocracy-cache/pdf-pages'
    const operations = [
        !forceOCR && {
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
                    method: 'library',
                    density: 300
                },
                verbose,
                alert
            )
        },
        {
            name: 'Converting image pages to PDF pages',
            setup: () => autocracy.operations.convertImagePagesToPDFPages(
                cacheImagePages,
                cachePDFPages,
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
            name: 'Combining PDF pages',
            setup: () => autocracy.operations.combinePDFPages(
                cachePDFPages,
                destination,
                {
                    originInitial: origin,
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
