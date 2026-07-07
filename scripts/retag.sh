#!/bin/bash

tag=$1

if [ -z "$tag" ]; then
    echo "Usage: $0 <tag>"
    exit 1
fi

git tag -d "$tag"
git push origin --delete "$tag"
git tag "$tag"
git push origin "$tag"
