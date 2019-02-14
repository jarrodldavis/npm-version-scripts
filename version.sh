#! /bin/sh

source ./helpers.sh

bump_plugin="@jarrodldavis/changelog-version-bump=version:'${npm_package_version}'"

git checkout -b release/${npm_package_version} && # create new release branch
  remark CHANGELOG.md -o --use $bump_plugin && # update changelog
  git add CHANGELOG.md # add changelog to staging (npm version will handle creating the commit)
