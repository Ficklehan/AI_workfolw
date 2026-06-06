const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productName + '.app')
  console.log('[afterPack] stripping quarantine from:', appPath)
  try {
    execSync(`xattr -dr com.apple.quarantine "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterPack] quarantine removed from .app bundle')
  } catch (e) {
    console.warn('[afterPack] xattr warning (may be normal if file not quarantined):', e.message?.substring(0, 80))
  }
}
