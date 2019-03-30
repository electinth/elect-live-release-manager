const App = require("@octokit/app")
const Octokit = require("@octokit/rest")

/**
 * @param context {WebtaskContext}
 */
module.exports = async function(context, cb) {
  try {
    const app = new App({
      id: 27548,
      privateKey: new Buffer(
        context.secrets.GH_APP_PRIVATE_KEY,
        "base64"
      ).toString()
    })
    const octokit = new Octokit({
      async auth() {
        const installationAccessToken = await app.getInstallationAccessToken({
          installationId: 775621
        })
        return `token ${installationAccessToken}`
      }
    })
    const project = { owner: "codeforthailand", repo: "election-live" }
    const packageFileResult = await octokit.repos.getContents({
      ...project,
      path: "package.json"
    })
    const content = Buffer.from(
      packageFileResult.data.content,
      "base64"
    ).toString()
    const packageJson = JSON.parse(content)
    const nextVersion = require("semver").clean(context.body.text)
    if (!require("semver").gt(nextVersion, packageJson.version)) {
      return cb(
        null,
        `Cannot update! New version ${nextVersion} must be greater than current ${
          packageJson.version
        }`
      )
    }
    let replaced = false
    let oldVersion
    const nextContent = content.replace(/"version": "([^"]+)"/, (a, b) => {
      replaced = true
      oldVersion = b
      return `"version": ${JSON.stringify(nextVersion)}`
    })
    if (!replaced) {
      return cb(null, "Error: Cannot replace.")
    }
    const updateResult = await octokit.repos.updateFile({
      ...project,
      path: "package.json",
      message: `Release v${nextVersion}`,
      content: Buffer.from(nextContent, "utf8").toString("base64"),
      sha: packageFileResult.data.sha
    })
    const compareUrl = `https://github.com/codeforthailand/election-live/compare/v${oldVersion}...${nextVersion}`
    const releaseResult = await octokit.repos.createRelease({
      ...project,
      tag_name: `v${nextVersion}`,
      target_commitish: updateResult.data.commit.sha,
      name: `v${nextVersion}`,
      body: `\n\nChanges: ${compareUrl}`
    })
    await require("axios").post(context.secrets.SLACK_REPORT_URL, {
      text: [
        `Release of new version v${nextVersion} triggered by <@${
          context.body.user_id
        }>`,
        "",
        `**Compare changes:** ${compareUrl}`,
        `**Please add changelog here:** ${releaseResult.data.html_url}`
      ].join("\n")
    })
    cb(null, `Done: ${updateResult.data.commit.html_url}`)
  } catch (e) {
    cb(null, "Error: " + e.stack)
  }
}
