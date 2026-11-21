#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/release_support.sh

: "${AMPLIFY_APP_ID:?}" "${AMPLIFY_BRANCH:?}" "${UI_ORIGIN:?}" "${VITE_API_BASE_URL:?}"
: "${EXPECTED_CURRENT_JOB:?}" "${RECOVERY_EVIDENCE:?}" "${SITE_ARCHIVE:?}"
[[ "$AMPLIFY_APP_ID" =~ ^[a-z0-9]+$ && "$AMPLIFY_BRANCH" == hlg && "$EXPECTED_CURRENT_JOB" =~ ^[0-9]+$ ]] || exit 2
SITE_SHA256=$(jq -er --arg ui "$UI_ORIGIN" --arg api "$VITE_API_BASE_URL" '
    select(.uiOrigin == $ui and .apiOrigin == $api) | .archiveSha256 | strings
' "$RECOVERY_EVIDENCE")
export SITE_SHA256 SITE_API_ORIGIN="$VITE_API_BASE_URL" SITE_SHA="$SOURCE_SHA" SITE_VERSION="$SOURCE_VERSION"
bash .github/scripts/verify_amplify_archive.sh
current_job=$(aws amplify list-jobs --app-id "$AMPLIFY_APP_ID" --branch-name "$AMPLIFY_BRANCH" \
    --no-paginate --query 'jobSummaries[0].jobId' --output text)
[[ "$current_job" == "$EXPECTED_CURRENT_JOB" ]] || {
    echo "O job mais recente do Amplify mudou desde o diagnóstico." >&2
    exit 1
}
record previousAmplifyJob "$current_job"
bash .github/scripts/publish_amplify.sh
