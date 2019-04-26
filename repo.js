const { exit, $, graphql, toArray } = require('./helpers');
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
function getRepoInfo(releaseVersion = null) {
  if (typeof info === 'object') {
    return info;
  }

  ensureHub();

  const { packageVersion, versionPrefix, commitMessage } = getEnvironment();
  if (releaseVersion === null) {
    releaseVersion = packageVersion;
  }

  const releaseBranch = `release/${releaseVersion}`;
  const prTitle = commitMessage.replace(/%s/g, releaseVersion);

  const defaultBranch = getDefaultBranch();
  const productionBranch = determineProductionBranch();

  const milestone = `${versionPrefix}${releaseVersion}`;
  ensureMilestone(milestone);

  const remote = "origin"; // TODO

  info = { remote, milestone, releaseBranch, prTitle, defaultBranch, productionBranch };
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

function getUnmergedBranches(defaultBranch, pattern) {
  return toArray($(`git branch --list '${pattern}' --format '%(refname:short)' --all --no-merged ${defaultBranch}`));
}

function ensureNoOtherBumps(remote, defaultBranch, productionBranch) {
  const unmergedTags = toArray($(`git tag --list --no-merged ${defaultBranch}`));
  if (unmergedTags.length > 0) {
    exit(`another version bump is in progress - found unmerged tags: ${unmergedTags.join(", ")}`);
  }

  let unmergedReleases = [
    ...getUnmergedBranches(defaultBranch, "release/*"),
    ...getUnmergedBranches(defaultBranch, `${remote}/release/*`)
  ];

  if (unmergedReleases.length > 0) {
    exit(`another version bump is in progress - found unmerged release branches: ${unmergedReleases.join(", ")}`);
  }

  let unmergedProductionBranches = [
    ...getUnmergedBranches(defaultBranch, productionBranch),
    ...getUnmergedBranches(defaultBranch, `${remote}/${productionBranch}`)
  ];

  if (unmergedProductionBranches.length > 0) {
    exit(`another version bump is in progress - found unmerged production branches: ${unmergedProductionBranches.join(", ")}`);
  }
}

function ensureUnreleased(releaseVersion, defaultBranch) {
  const mergedTags = toArray($(`git tag --list '${releaseVersion}' --merged ${defaultBranch}`));
  if (mergedTags.length > 0) {
    exit(`version already released - found merged tags: ${mergedTags.join(", ")}`);
  }
}

module.exports = { getRepoInfo, ensureSynchronized, ensureNoOtherBumps, ensureUnreleased, getDefaultBranch };
