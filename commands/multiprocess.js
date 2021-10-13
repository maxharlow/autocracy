import ocracy from './../ocracy.js'

async function initialise(origin, destination, verbose, alert) {

    async function setup() {
        return [
            {
                name: 'Extracting PDF to text',
                setup: () => ocracy.extractPDFToText(origin, destination, 'shell', verbose, alert)
            },
            {
                name: 'Symlinking untagged PDFs',
                setup: () => ocracy.symlinkMissing(origin, destination, '.ocracy-cache/untagged', verbose, alert)
            },
            {
                name: 'Converting untagged PDFs to JPEG pages',
                setup: () => ocracy.convertPDFToJPEGPages('.ocracy-cache/untagged', '.ocracy-cache/untagged-image-pages', 'shell', 300, verbose, alert)
            },
            {
                name: 'Converting JPEG pages to text pages',
                setup: () => ocracy.convertJPEGPagesToTextPages('.ocracy-cache/untagged-image-pages', '.ocracy-cache/untagged-text-pages', 'shell', verbose, alert)
            },
            {
                name: 'Combining text pages',
                setup: () => ocracy.combineTextPages('.ocracy-cache/untagged-text-pages', destination, verbose, alert)
            }
        ]
    }

    return setup()

}

export default initialise
