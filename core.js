const childProcess = require('child_process');
const { EOL } = require('os');

const packageVersion = process.env.npm_package_version;
const versionPrefix = process.env.npm_config_tag_version_prefix;
const commitMessage = process.env.npm_config_message;

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

if (typeof commitMessage !== 'string' || commitMessage.length === 0) {
  exit('$npm_config_message must be set');
}

try {
  $('which hub');
} catch(error) {
  exit('hub must be installed: https://hub.github.com');
}

const milestone = `${versionPrefix}${packageVersion}`;
const releaseBranch = `release/${packageVersion}`;
const prTitle = commitMessage.replace(/%s/g, packageVersion);

const defaultBranch = getDefaultBranch();
const productionBranch = determineProductionBranch();

ensureMilestone();

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

function ensureMilestone() {
  const query = 'milestones(first: 100, orderBy: { field: CREATED_AT, direction: DESC }, states: [OPEN]) { nodes { title } }';
  const results = graphql(query).milestones.nodes.map(node => node.title);
  if (results.indexOf(milestone) === -1) {
    exit(`milestone ${milestone} does not exist`);
  }
}

function getDefaultBranch() {
  return graphql("defaultBranchRef { name }").defaultBranchRef.name;
}

function ensureSynchronized() {
  const current = $('hub rev-parse --abbrev-ref HEAD');
  const upstream = $('hub rev-parse --abbrev-ref --symbolic-full-name @{u}');
  const range = $(`hub rev-parse -q ${current} ${upstream}`);
  const [start, end] = range.split(/\s+/m);
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

  switch (defaultBranch) {
    case firstBranch:
      return secondBranch;
    case secondBranch:
      return firstBranch;
    default:
      return exit('could not determine production branch because neither protected branch mataches the default branch');
  }
}

function mergePullRequest(prId, remote = "origin") {
  if (typeof prId !== 'string' || prId.length === 0) {
    exit(`you must specify a pull request number`);
  }

  const separator = '|';
  const rawResults = $(`hub pr list -f "%I${separator}%B${separator}%H${separator}%U${separator}%sH"`);
  
  const results = rawResults.split(EOL).map(line => {
    const [id, baseBranch, headBranch, url, sha] = line.split(separator);
    return { id, baseBranch, headBranch, url, sha };
  });
  
  const details = results.find(detail => detail.id === prId);
  
  if (details === undefined) {
    exit(`${prId} - not an open pull request number`)
  }

  try {
    console.log($(`hub ci-status -v ${details.sha}`));
  } catch(error) {
    exit(`CI status not successful:${EOL}${error.stderr.toString().trim()}`);
  }

  // switch to pull request target branch
  console.log($(`hub checkout ${details.baseBranch}`));
  // bring in any changes from upstream
  console.log($(`hub sync`));
  // ensure local and remote head branch are in sync (`hub sync` only warns)
  ensureSynchronized();
  // Merge similar to GitHub Merge Button
  console.log($(`hub merge ${details.url}`));
  // Push merge to target branch
  console.log($(`hub push`));
  // Delete remote head branch
  console.log($(`hub push ${remote} :${details.headBranch}`));
  // Bring in any more changes and remote local head branch
  console.log($(`hub sync`));
}

function findVersionPullRequest() {
  const rawResults = $(`hub pr list --head ${releaseBranch} --base ${productionBranch} -f "%I"`);
  const [id, ...others] = rawResults.split(EOL);

  if (typeof id !== 'string' || id.length === 0) {
    const arrow = "\u2190";
    exit(`no open pull request for ${productionBranch} ${arrow} ${releaseBranch}`);
  } else if (others.length > 0) {
    const arrow = "\u2190";
    exit(`multiple pull requests open for ${productionBranch} ${arrow} ${releaseBranch}`);
  }

  return id;
}

function preversion() {
  // checkout development branch
  console.log($(`hub checkout ${defaultBranch}`));
  // bring in any changes from upstream
  console.log($(`hub sync`));
  // ensure local and remote head branch are in sync (`hub sync` only warns)
  ensureSynchronized();
  // run test suite
  console.log($(`npm test`));
}

function version() {
  const bumpPlugin = `@jarrodldavis/changelog-version-bump=version:'${packageVersion}'`;

  // create new release branch
  console.log($(`hub checkout -b ${releaseBranch}`));
  // update changelog with new version
  console.log($(`remark CHANGELOG.md -o --use "${bumpPlugin}"`));
  // add changelog to staging (npm will handle creating the commit)
  console.log($('hub add CHANGELOG.md'));
}

function postversion() {
  // publish branch
  console.log($(`hub push --follow-tags --set-upstream origin ${releaseBranch}`));
  // create pull request
  console.log($(`hub pull-request --no-edit --message "${prTitle}" --base "${productionBranch}" --milestone "${milestone}"`));
}

function mergeversion() {
  // find current pull request for version release
  const prId = findVersionPullRequest();
  // merge version release into production branch
  mergePullRequest(prId);
  // update/create release branch to match production branch
  console.log($(`hub checkout -B ${releaseBranch} ${productionBranch}`));
  // re-publish version branch
  console.log($(`hub push --follow-tags --set-upstream origin ${releaseBranch}`));
  // create pull request to merge production commits into default branch
  console.log($(`hub pull-request --no-edit --message "${prTitle}" --base "${defaultBranch}" --milestone "${milestone}"`));
}

module.exports = { preversion, version, postversion, mergeversion };
