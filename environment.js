const { $, exit } = require('./helpers');

function getEnvironment() {
  const packageVersion = process.env.npm_package_version;
  const versionPrefix = process.env.npm_config_tag_version_prefix;
  const commitMessage = process.env.npm_config_message;

  if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
    exit('$npm_package_version must be set');
  }

  if (typeof versionPrefix !== 'string' || versionPrefix.length === 0) {
    exit('$npm_config_tag_version_prefix must be set');
  }

  if (typeof commitMessage !== 'string' || commitMessage.length === 0) {
    exit('$npm_config_message must be set');
  }

  return { packageVersion, versionPrefix, commitMessage };
}

function ensureHub() {
  try {
    $('which hub');
  } catch(error) {
    exit('hub must be installed: https://hub.github.com');
  }
}

module.exports = { getEnvironment, ensureHub };
