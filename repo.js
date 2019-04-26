const { exit, $, graphql } = require('./helpers');
const { getEnvironment, ensureHub } = require('./environment');

function ensureMilestone(milestone) {
  const query = 'milestones(first: 100, orderBy: { field: CREATED_AT, direction: DESC }, states: [OPEN]) { nodes { title } }';
  const results = graphql(query).milestones.nodes.map(node => node.title);
  if (results.indexOf(milestone) === -1) {
    exit(`milestone ${milestone} does not exist`);
  }
}

function getDefaultBranch() {
  return graphql("defaultBranchRef { name }").defaultBranchRef.name;
}

function determineProductionBranch() {
  const defaultBranch = getDefaultBranch();
const branches = graphql(`
branchProtectionRules(first: 3) {
  nodes {
    matchingRefs(first: 2) {
      nodes {
        name
      }
    }
  }
}`).branchProtectionRules.nodes.flatMap(node => node.matchingRefs.nodes);


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
      return exit('could not determine production branch because neither protected branch matches the default branch');
  }
}

let info;
function getRepoInfo() {
  if (typeof info === 'object') {
    return info;
  }

  ensureHub();

  const { packageVersion, versionPrefix, commitMessage } = getEnvironment();
  const releaseBranch = `release/${packageVersion}`;
  const prTitle = commitMessage.replace(/%s/g, packageVersion);

  const defaultBranch = getDefaultBranch();
  const productionBranch = determineProductionBranch();

  const milestone = `${versionPrefix}${packageVersion}`;
  ensureMilestone(milestone);

  info = { milestone, releaseBranch, prTitle, defaultBranch, productionBranch };
  return info;
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

module.exports = { getRepoInfo, ensureSynchronized, getDefaultBranch };
