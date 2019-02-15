const childProcess = require('child_process')

const packageVersion = process.env.npm_package_version;
const versionPrefix = process.env.npm_config_tag_version_prefix;

function exit(message) {
  console.error(`npm version: ${message}`);
  process.exit(1);
}

if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
  exit('$npm_package_version must be set');
}

if (typeof versionPrefix !== 'string' || versionPrefix.length === 0) {
  exit('$npm_config_tag_version_prefix must be set');
}

function $(command) {
  return childProcess.execSync(command, { encoding: 'utf-8' }).toString().trim();
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

function getDefaultBranch() {
  return graphql("defaultBranchRef { name }").defaultBranchRef.name;
}

function ensureSynchronized() {
  const current = $('hub rev-parse --abbrev-ref HEAD');
  const upstream = $('hub rev-parse --abbrev-ref --symbolic-full-name @{u}');
  const range = $(`hub rev-parse -q ${current} ${upstream}`);
  const [start, end] = range.split(/(\s+)/);
  if (start !== end) {
    exit('local branch is not in sync with upstream');
  }
}

function determineProductionBranch() {
  const branches = graphql('protectedBranches(first: 3) { nodes { name } }').protectedBranches.nodes;

  if (branches.length !== 2) {
    exit(`expected two protected branches but found ${branches.length}`);
  }

  const [{ name: firstBranch }, { name: secondBranch }] = branches;

  const defaultBranch = getDefaultBranch();

  switch (defaultBranch) {
    case firstBranch:
      return secondBranch;
    case secondBranch:
      return firstBranch;
    default:
      return exit('could not determine production branch because neither protected branch mataches the default branch');
  }
}

function preversion() {
  const defaultBranch = getDefaultBranch();

  // checkout development branch
  $(`hub checkout ${defaultBranch}`);
  // bring in any changes from upstream
  $(`hub sync`);
  // ensure local and remote head branch are in sync (`hub sync` only warns)
  ensureSynchronized();
  // run test suite
  $(`npm test`);
}

function version() {
  const bumpPlugin = `@jarrodldavis/changelog-version-bump=version:'${packageVersion}'`;

  // create new release branch
  $(`hub checkout -b release/${packageVersion}`);
  // update changelog with new version
  $(`remark CHANGELOG.md -o --use ${bumpPlugin}`);
  // add changelog to staging (npm will handle creating the commit)
  $('hub add CHANGELOG.md');
}

function postversion() {
  const productionBranch = determineProductionBranch();
  const milestone = `${versionPrefix}${packageVersion}`;

  // publish branch
  $(`hub push --follow-tags --set-upstream origin release/${packageVersion}`);
  // create pull request
  $(`hub pull-request --no-edit --b ${productionBranch} -m "${milestone}"`);
}

module.exports = { preversion, version, postversion };
