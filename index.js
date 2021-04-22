const core = require('@actions/core')
const glob = require('@actions/glob')
const axios = require('axios').default
const FormData = require('form-data')
const targz = require('targz')
const fs = require('fs-extra')
const { promisify } = require('util')
const { exec } = require('child_process')
const yaml = require('js-yaml')
const filterAndDotifyKeys = require('./filterAndDotifyKeys')
const bucketCdn = require('./bucketCdn')
const decompress = promisify(targz.decompress)

async function run () {
  try {
    // Get inputs
    const app = core.getInput('app', { required: true })
    const configFilePath = core.getInput('config_file', { required: true })
    const apiKey = core.getInput('api_key', { required: true })
    const stage = core.getInput('stage', { required: true })
    // bucket_cdn parameters
    const websiteFilesDir = core.getInput('website_files_dir', {
      required: false
    })

    const globber = await glob.create(configFilePath)
    const [configFile] = await globber.glob()
    const configFileJSON = yaml.load(fs.readFileSync(configFile))
    const hostInfo = configFileJSON.hosts[app]
    if (!hostInfo) {
      throw new Error('App not defined in hosts')
    }

    if (hostInfo.type === 'bucket_cdn' && !websiteFilesDir) {
      throw new Error(
        `param "website_files_dir" required to deploy app "${app}"`
      )
    }

    const form = new FormData()
    form.append('configFile', fs.createReadStream(configFile))
    form.append('apiKey', apiKey)
    form.append('stage', stage)

    const outFile = 'output.tgz'
    const writer = fs.createWriteStream(outFile)
    await axios
      .post('https://api.stackforge.tech/v1/deploy', form, {
        responseType: 'stream',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${form._boundary}`
        }
      })
      .then(res => {
        res.data.pipe(writer)
        let error = null
        return new Promise((resolve, reject) => {
          writer.on('error', err => {
            error = err
            writer.close()
            reject(err)
          })
          writer.on('close', () => {
            if (!error) {
              resolve(true)
            }
          })
        })
      })

    const cwd = './out'
    await decompress({
      src: outFile,
      dest: cwd
    })

    await new Promise((resolve, reject) => {
      const defaultCb = cb => async (err, stdout, stderr) => {
        if (err || stderr) {
          console.error(stderr)
          await Promise.all([fs.remove(cwd), fs.remove(outFile)])
          return reject(err || Error(stderr))
        }
        console.log(stdout)
        cb()
      }

      exec(`terraform workspace new ${stage}`, { cwd }, () =>
        exec(`terraform workspace select ${stage}`, { cwd }, () =>
          exec(
            'terraform init',
            { cwd },
            defaultCb(() =>
              exec(
                'terraform output -json',
                { cwd },
                async (err, stdout, stderr) => {
                  if (err || stderr) {
                    console.error(stderr)
                    await Promise.all([fs.remove(cwd), fs.remove(outFile)])
                    return reject(err || Error(stderr))
                  }
                  const outputs = filterAndDotifyKeys(app, JSON.parse(stdout))

                  if (hostInfo.type === 'bucket_cdn') {
                    await bucketCdn(
                      { websiteFilesDir },
                      app,
                      configFileJSON,
                      outputs
                    )
                  }
                }
              )
            )
          )
        )
      )
    })
  } catch (error) {
    console.error(error)
    const showStackTrace = process.env.SHOW_STACK_TRACE

    if (showStackTrace === 'true') {
      throw error
    }
  }
}

module.exports = run

if (require.main === module) {
  run()
}
