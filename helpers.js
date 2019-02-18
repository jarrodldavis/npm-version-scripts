const childProcess = require('child_process');
const path = require('path');

function $(command) {
  return childProcess.execSync(command, { encoding: 'utf-8' }).toString().trim();
}

function getScriptName() {
  const [/*node*/, file] = process.argv;
  let name = path.basename(file, path.extname(file));
  if (name.startsWith('git-')) {
    name = name.substring(4);
  }
  return name;
}

function exit(message) {
  console.error(`${getScriptName()}: ${message}`);
  process.exit(1);
}

function graphql(query) {
  const fullQuery = `query { repository(owner:\\"{owner}\\", name:\\"{repo}\\") { ${query} } }`;
  const command = `hub api graphql -f query="${fullQuery}"`;

  let result;
  try {
    result = JSON.parse($(command));
  } catch(error) {
    exit(`failed to execute query: ${error}`)
  }

  if (typeof result !== 'object') {
    exit(`unexpected result ${result} from query`);
  } else if (result.hasOwnProperty('errors')) {
    exit(`query returned errors: ${JSON.stringify(result.errors)}`);
  } else if (typeof result.data !== 'object' || typeof result.data.repository !== 'object') {
    exit(`could not find repository data from query result`);
  } else {
    return result.data.repository;
  }
}

module.exports = { $, exit, graphql };
