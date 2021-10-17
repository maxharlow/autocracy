import autocracy from './../autocracy.js'

async function initialise(origin, destination, forceOCR, verbose, alert) {
    const cacheUntagged = '.autocracy-cache/untagged'
    const cacheJpegPages = '.autocracy-cache/jpeg-pages'
    const cacheTextPages = '.autocracy-cache/text-pages'
    const sequence = [
        !forceOCR && {
            name: 'Extracting PDFs to texts',
            setup: () => autocracy.operations.extractPDFToText(origin, destination, 'shell', verbose, alert)
        },
        !forceOCR && {
            name: 'Symlinking untagged PDFs',
            setup: () => autocracy.operations.symlinkMissing(origin, destination, cacheUntagged, verbose, alert)
        },
        {
            name: forceOCR ? 'Converting PDFs to JPEG pages' : 'Converting untagged PDFs to JPEG pages',
            setup: () => autocracy.operations.convertPDFToJpegPages(forceOCR ? origin : cacheUntagged, cacheJpegPages, 'shell', 300, verbose, alert)
        },
        {
            name: 'Converting JPEG pages to text pages',
            setup: () => autocracy.operations.convertJpegPagesToTextPages(cacheJpegPages, cacheTextPages, 'shell', 'eng', 300, verbose, alert)
        },
        {
            name: 'Combining text pages',
            setup: () => autocracy.operations.combineTextPages(cacheTextPages, destination, verbose, alert)
        }
    ]
    return sequence.filter(x => x)
}

export default initialise
