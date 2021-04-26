const core = require('@actions/core')
const glob = require('@actions/glob')
const FormData = require('form-data')
const fs = require('fs-extra')
const yaml = require('js-yaml')
const filterAndDotifyKeys = require('./filterAndDotifyKeys')
const bucketCdn = require('./bucketCdn')

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

    const outputs = filterAndDotifyKeys(app, process.env.STACKFORGE_OUTPUT)

    if (hostInfo.type === 'bucket_cdn') {
      await bucketCdn(
        { websiteFilesDir },
        app,
        configFileJSON,
        outputs
      )
    }
  } catch (error) {
    console.error(error)
    core.setFailed(error.message)
  }
}

module.exports = run

if (require.main === module) {
  run()
}
