import ocracy from './../ocracy.js'

async function initialise(origin, destination, forceOCR, verbose, alert) {

    async function setup() {
        const cacheUntagged = '.ocracy-cache/untagged'
        const cacheJpegPages = '.ocracy-cache/jpeg-pages'
        const cacheTextPages = '.ocracy-cache/text-pages'
        const sequence = [
            !forceOCR && {
                name: 'Extracting PDF to text',
                setup: () => ocracy.operations.extractPDFToText(origin, destination, 'shell', verbose, alert)
            },
            !forceOCR && {
                name: 'Symlinking untagged PDFs',
                setup: () => ocracy.operations.symlinkMissing(origin, destination, cacheUntagged, verbose, alert)
            },
            {
                name: forceOCR ? 'Converting PDFs to JPEG pages' : 'Converting untagged PDFs to JPEG pages',
                setup: () => ocracy.operations.convertPDFToJPEGPages(forceOCR ? origin : cacheUntagged, cacheJpegPages, 'shell', 300, verbose, alert)
            },
            {
                name: 'Converting JPEG pages to text pages',
                setup: () => ocracy.operations.convertJPEGPagesToTextPages(cacheJpegPages, cacheTextPages, 'shell', 'eng', verbose, alert)
            },
            {
                name: 'Combining text pages',
                setup: () => ocracy.operations.combineTextPages(cacheTextPages, destination, verbose, alert)
            }
        ]
        return sequence.filter(x => x)
    }

    return setup()

}

export default initialise
