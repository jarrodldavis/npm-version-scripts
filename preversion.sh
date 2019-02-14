#! /bin/sh

source ./helpers.sh

default_branch=$(__hub_npm_version_get_repository_query "defaultBranchRef.name" "defaultBranchRef { name }")

if [ $? -ne 0 ]
then
    echo $default_branch # error message
    return 1
fi

hub checkout $default_branch && # checkout development branch
    hub sync && # bring in any changes from upstream
    __hub_preversion_assert_synchronized && # ensure local and remote head branch are in sync (`hub sync` only warns)
    npm test # run test suite
