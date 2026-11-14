#!/usr/bin/env bash
# Commits the changed tracked files of the working tree onto a branch on GitHub, signed by GitHub.
# A commit made with git and GITHUB_TOKEN is unsigned; one made through the GraphQL API
# (createCommitOnBranch) is signed, so it passes "Require signed commits" on main.
# Usage: commit-signed.sh <branch> <message>, from the repository root. The branch must exist on
# GitHub and point to HEAD. Afterwards HEAD is the new commit, printed as the only output.
# Needs GH_TOKEN with contents: write.
set -euo pipefail
branch="$1"
message="$2"

additions=$(git diff --name-only -z | while IFS= read -r -d '' path; do
  jq -n --arg path "$path" --arg contents "$(base64 -w0 "$path")" '{path: $path, contents: $contents}'
done | jq -s .)
if [ "$additions" = "[]" ]; then
  echo "::error::Nothing to commit on $branch" >&2
  exit 1
fi

# shellcheck disable=SC2016 # $input is a GraphQL variable, not a shell one
query='mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }'
oid=$(jq -n --arg query "$query" --arg repo "$GITHUB_REPOSITORY" --arg branch "$branch" \
    --arg message "$message" --arg head "$(git rev-parse HEAD)" --argjson additions "$additions" \
    '{query: $query, variables: {input: {
      branch: {repositoryNameWithOwner: $repo, branchName: $branch},
      message: {headline: $message},
      expectedHeadOid: $head,
      fileChanges: {additions: $additions}}}}' |
  gh api graphql --input - --jq .data.createCommitOnBranch.commit.oid)

git fetch -q origin "refs/heads/$branch"
if [ "$(git rev-parse FETCH_HEAD)" != "$oid" ]; then
  echo "::error::$branch is not at $oid" >&2
  exit 1
fi
git reset -q --hard "$oid"
echo "$oid"
