import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import AWS from 'aws-sdk'
import BetterSQLite3 from 'better-sqlite3'

async function setup(jobfile, destination, alert) {
    await FSExtra.ensureDir(destination)
    const jobfileExists = await FSExtra.pathExists(jobfile)
    if (!jobfileExists) throw new Error(`${jobfile}: jobfile not found`)
    const jobs = new BetterSQLite3(jobfile)
    const region = jobs.prepare('select value from meta where key = ?').pluck().get('region')
    const textract = new AWS.Textract({ region })
    const source = () => Scramjet.DataStream.from(jobs.prepare('select * from jobs').iterate())
    const text = async (entry, accumulator) => {
        const exists = await FSExtra.exists(`${destination}/${entry.key}`)
        if (exists) return null
        const params = {
            JobId: entry.job,
            ...(accumulator?.token ? { NextToken: accumulator.token } : {})
        }
        const response = await textract.getDocumentTextDetection(params).promise()
        if (response.JobStatus !== 'SUCCEEDED') {
            alert(`Could not extract text from job as status is ${response.JobStatus}`)
            return null
        }
        const contents = (accumulator?.contents || '') + response.Blocks.filter(block => block.BlockType == 'LINE').map(block => block.Text).join(' ')
        if (response.NextToken) return text(entry, { contents, token: response.NextToken })
        return { ...entry, contents }
    }
    const write = item => {
        return FSExtra.writeFile(`${destination}/${item.key}`, item.contents)
    }
    const length = () => source().reduce(a => a + 1, 0)
    const run = () => source().setOptions({ maxParallel: 1 }).rate(5).map(text).filter(x => x).each(write)
    return { run, length }
}

export default setup
