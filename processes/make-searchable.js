import ocracy from './../ocracy.js'

async function initialise(origin, destination, forceOCR, verbose, alert) {

    async function setup() {
        const cacheUntagged = '.ocracy-cache/untagged'
        const cacheUntaggedImagePages = '.ocracy-cache/untagged-image-pages'
        const cacheUntaggedPDFPages = '.ocracy-cache/untagged-pdf-pages'
        const sequence = [
            !forceOCR && {
                name: 'Copying tagged PDFs',
                setup: () => ocracy.operations.copyPDFIfTagged(origin, destination, 'shell', verbose, alert)
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
                name: 'Converting JPEG pages to PDF pages',
                setup: () => ocracy.operations.convertJPEGPagesToPDFPages(cacheUntaggedImagePages, cacheUntaggedPDFPages, 'shell', 'eng', verbose, alert)
            },
            {
                name: 'Combining PDF pages',
                setup: () => ocracy.operations.combinePDFPages(cacheUntaggedPDFPages, destination, 'shell', verbose, alert)
            }
        ]
        return sequence.filter(x => x)
    }

    return setup()

}

export default initialise
