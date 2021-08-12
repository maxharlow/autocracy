import FSExtra from 'fs-extra'
import Scramjet from 'scramjet'
import AWS from 'aws-sdk'
import BetterSQLite3 from 'better-sqlite3'

async function setup(jobfile) {
    const jobfileExists = await FSExtra.pathExists(jobfile)
    if (!jobfileExists) throw new Error(`${jobfile}: jobfile not found`)
    const jobs = new BetterSQLite3(jobfile)
    const region = jobs.prepare('select value from meta where key = ?').pluck().get('region')
    const textract = new AWS.Textract({ region })
    const source = () => Scramjet.DataStream.from(jobs.prepare('select * from jobs').iterate())
    const state = async entry => {
        const response = await textract.getDocumentTextDetection({ JobId: entry.job }).promise()
        return {
            ...entry,
            state: response.JobStatus
        }
    }
    return () => source().setOptions({ maxParallel: 1 }).rate(5).map(state)
}

export default setup
