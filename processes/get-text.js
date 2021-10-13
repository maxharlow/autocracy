import ocracy from './../ocracy.js'

async function initialise(origin, destination, forceOCR, verbose, alert) {

    async function setup() {
        const cacheUntagged = '.ocracy-cache/untagged'
        const cacheUntaggedImagePages = '.ocracy-cache/untagged-image-pages'
        const cacheUntaggedTextPages = '.ocracy-cache/untagged-text-pages'
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
                setup: () => ocracy.operations.convertPDFToJPEGPages(forceOCR ? origin : cacheUntagged, cacheUntaggedImagePages, 'shell', 300, verbose, alert)
            },
            {
                name: 'Converting JPEG pages to text pages',
                setup: () => ocracy.operations.convertJPEGPagesToTextPages(cacheUntaggedImagePages, cacheUntaggedTextPages, 'shell', verbose, alert)
            },
            {
                name: 'Combining text pages',
                setup: () => ocracy.operations.combineTextPages(cacheUntaggedTextPages, destination, verbose, alert)
            }
        ]
        return sequence.filter(x => x)
    }

    return setup()

}

export default initialise
