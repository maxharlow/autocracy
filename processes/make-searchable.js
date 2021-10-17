import autocracy from './../autocracy.js'

function initialise(origin, destination, forceOCR, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheJpegPages = '.autocracy-cache/jpeg-pages'
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
            name: forceOCR ? 'Converting PDFs to JPEG pages' : 'Converting untagged PDFs to JPEG pages',
            setup: () => autocracy.operations.convertPDFToJpegPages(
                forceOCR ? origin : cacheUntagged,
                cacheJpegPages,
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
            name: 'Converting JPEG pages to PDF pages',
            setup: () => autocracy.operations.convertJpegPagesToPDFPages(
                cacheJpegPages,
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
