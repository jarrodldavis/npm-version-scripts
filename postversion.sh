#! /bin/sh

source ./helpers.sh

production_branch=$(__hub_npm_version_determine_production_branch)

if [ $? -ne 0 ]
then
    echo $production_branch # error message
    return 1
fi

milestone="${npm_config_tag_version_prefix}${npm_package_version}"

hub push --follow-tags --set-upstream origin release/${npm_package_version} && # publish branch
    hub pull-request --no-edit --b $production_branch -m "$milestone" # create pull request
