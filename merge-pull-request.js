const { EOL } = require('os');

const { $, exit } = require('./helpers');
const { ensureHub } = require('./environment');
const { ensureSynchronized, getDefaultBranch } = require('./repo');

function isMergeVersionScript() {
  return process.env.npm_lifecycle_event === 'mergeversion';
}

function mergePullRequest(prId, remote = "origin") {
  if (typeof prId !== 'string' || prId.length === 0) {
    exit(`you must specify a pull request number`);
  }

  ensureHub();

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

  const defaultBranch = getDefaultBranch();
  if (details.headBranch.startsWith('release') && baseBranch !== defaultBranch && !isMergeVersionScript()) {
    exit('use `npm run mergeversion` to merge release branches');
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

module.exports = mergePullRequest;
