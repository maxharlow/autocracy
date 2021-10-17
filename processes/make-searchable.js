import autocracy from './../autocracy.js'

function initialise(origin, destination, forceOCR, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheJpegPages = '.autocracy-cache/jpeg-pages'
    const cachePDFPages = '.autocracy-cache/pdf-pages'
    const sequence = [
        !forceOCR && {
            name: 'Copying already-tagged PDFs',
            setup: () => autocracy.operations.copyPDFTagged(
                origin,
                destination,
                'shell',
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
                'shell',
                300,
                verbose,
                alert
            )
        },
        {
            name: 'Converting JPEG pages to PDF pages',
            setup: () => autocracy.operations.convertJpegPagesToPDFPages(
                cacheJpegPages,
                cachePDFPages,
                'shell',
                'eng',
                300,
                verbose,
                alert
            )
        },
        {
            name: 'Combining PDF pages',
            setup: () => autocracy.operations.combinePDFPages(
                cachePDFPages,
                destination,
                'shell',
                verbose,
                alert
            )
        }
    ]
    return sequence.filter(x => x)
}

export default initialise
