import ocracy from './../ocracy.js'

async function initialise(origin, destination, verbose, forceOCR, alert) {

    async function setup() {
        const cache = '.ocracy-cache'
        const cacheUntagged = `${cache}/untagged`
        const cacheUntaggedImagePages = `${cache}/untagged-image-pages`
        const cacheUntaggedTextPages = `${cache}/untagged-text-pages`
        const sequence = [
            !forceOCR && {
                name: 'Extracting PDF to text',
                setup: () => ocracy.extractPDFToText(origin, destination, 'shell', verbose, alert)
            },
            !forceOCR && {
                name: 'Symlinking untagged PDFs',
                setup: () => ocracy.symlinkMissing(origin, destination, cacheUntagged, verbose, alert)
            },
            {
                name: forceOCR ? 'Converting PDFs to JPEG pages' : 'Converting untagged PDFs to JPEG pages',
                setup: () => ocracy.convertPDFToJPEGPages(forceOCR ? origin : cacheUntagged, cacheUntaggedImagePages, 'shell', 300, verbose, alert)
            },
            {
                name: 'Converting JPEG pages to text pages',
                setup: () => ocracy.convertJPEGPagesToTextPages(cacheUntaggedImagePages, cacheUntaggedTextPages, 'shell', verbose, alert)
            },
            {
                name: 'Combining text pages',
                setup: () => ocracy.combineTextPages(cacheUntaggedTextPages, destination, verbose, alert)
            }
        ]
        return sequence.filter(x => x)
    }

    return setup()

}

export default initialise
