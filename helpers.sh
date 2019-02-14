#! /bin/sh

if [ -v $npm_package_version ]
then
  echo 'npm version: $npm_package_version must be set'
  exit 1
fi

if [ -v $npm_config_tag_version_prefix ]
then
  echo 'npm version: $npm_config_tag_version_prefix must be set'
  exit 1
fi

function __hub_npm_version_get_repository_query() {
    if [ -z "$1" ]
    then
        echo "npm version: get_repository_query: result key is required"
        return 1
    fi

    if [ -z "$2" ]
    then
        echo "npm version: get_repository_query: query is required"
        return 1
    fi

    local result_key=".data.repository.$1"
    local query="query { repository(owner:\"{owner}\", name:\"{repo}\") { $2 } }"
    local result=$(hub api graphql --flat -f query="$query")
    echo $result | grep -q "^$result_key"

    if [ $? -ne 0 ]
    then
        status=$?
        echo "npm version: get_repository_query: $result_key - could not find key in query result: $result"
        return $status
    fi

    echo $result | awk '{print $2}'
}

function __hub_npm_version_assert_synchronized() {
    local current=$(git rev-parse --abbrev-ref HEAD)
    local upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
    local range=$(git rev-parse -q $current $upstream)
    local start=$(echo $range | cut -d ' ' -f 1)
    local end=$(echo $range | cut -d ' ' -f 2)

    if [ $start != $end ]
    then
        echo "npm version: local head branch is not in sync with upstream"
        return 1
    fi
}

function __hub_npm_version_determine_production_branch() {
    protected_branch_count=$(__hub_npm_version_get_repository_query \
        ".protectedBranches.totalCount" \
        "protectedBranches { totalCount }")

    if [ $? -ne 0 ]
    then
        echo $protected_branch_count # error message
        return 1
    elif [ $protected_branch_count -ne "2" ]
    then
        echo "npm version: expected two protected branches but found $protected_branch_count"
        return 1
    fi

    # TODO: combine both protected branch queries into call
    first_protected_branch=$(__hub_npm_version_get_repository_query \
        ".protectedBranches.nodes[0].name" \
        "protectedBranches(first: 2) { nodes { name } }")

    if [ $? -ne 0 ]
    then
        echo $first_protected_branch # error message
        return 1
    fi

    second_protected_branch=$(__hub_npm_version_get_repository_query \
        ".protectedBranches.nodes[1].name" \
        "protectedBranches(first: 2) { nodes { name } }")

    if [ $? -ne 0 ]
    then
        echo $second_protected_branch # error message
        return 1
    fi

    default_branch=$(__hub_npm_version_get_repository_query "defaultBranchRef.name" "defaultBranchRef { name }")

    if [ $? -ne 0 ]
    then
        echo $default_branch # error message
        return 1
    fi

    # The default branch is the development branch (e.g. develop),
    # thus the other protected branch (e.g. master) is production
    if [ $first_protected_branch -eq $default_branch ]
    then
        production_branch=$second_protected_branch
    elif [ $second_protected_branch -eq $default_branch ]
        production_branch=$first_protected_branch
    else
        echo "preversion: could not determine production branch because neither protected branch matches the default branch"
        return 1
    fi

    echo $production_branch
}
