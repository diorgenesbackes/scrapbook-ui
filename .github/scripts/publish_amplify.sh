#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/release_support.sh

: "${AMPLIFY_APP_ID:?}" "${AMPLIFY_BRANCH:?}" "${UI_ORIGIN:?}" "${VITE_API_BASE_URL:?}"
[[ "$AMPLIFY_APP_ID" =~ ^[a-z0-9]+$ && "$AMPLIFY_BRANCH" == hlg ]]
origin_pattern='^https://[a-z0-9][a-z0-9.-]+\.[a-z][a-z0-9-]+$'
[[ "$VITE_API_BASE_URL" =~ $origin_pattern && "$UI_ORIGIN" =~ $origin_pattern && "$UI_ORIGIN" != "$VITE_API_BASE_URL" ]]
ensure_current_revision
record archiveSha256 "$SITE_SHA256"
record apiOrigin "$VITE_API_BASE_URL"
record uiOrigin "$UI_ORIGIN"

deployment=$(aws amplify create-deployment --app-id "$AMPLIFY_APP_ID" --branch-name "$AMPLIFY_BRANCH" --output json)
job=$(jq -er '.jobId | select(test("^[0-9]+$"))' <<< "$deployment")
url=$(jq -er '.zipUploadUrl | select(startswith("https://"))' <<< "$deployment")
record amplifyJob "$job"
# The signed URL travels on stdin and is omitted from command arguments and logs.
printf 'url = "%s"\n' "$url" | curl --config - --proto '=https' --fail --silent --show-error \
    --retry 2 --max-time 180 --upload-file "$SITE_ARCHIVE" >/dev/null
ensure_current_revision
aws amplify start-deployment --app-id "$AMPLIFY_APP_ID" --branch-name "$AMPLIFY_BRANCH" --job-id "$job" >/dev/null
for (( attempt = 0; attempt < 90; attempt++ )); do
    status=$(aws amplify get-job --app-id "$AMPLIFY_APP_ID" --branch-name "$AMPLIFY_BRANCH" \
        --job-id "$job" --query 'job.summary.status' --output text)
    case "$status" in
        SUCCEED)
            curl --fail --silent --show-error --proto '=https' --retry 3 --max-time 20 "$UI_ORIGIN/release.json" |
                jq -e --arg sha "$GITHUB_SHA" --arg version "$RELEASE_VERSION" \
                    '.sha == $sha and .version == $version' >/dev/null
            exit 0
            ;;
        FAILED|CANCELLED) echo "A ativação retornou $status." >&2; exit 1 ;;
        PENDING|PROVISIONING|RUNNING|CANCELLING|CREATED) sleep 10 ;;
        *) echo "Estado de ativação inesperado." >&2; exit 1 ;;
    esac
done
echo "Tempo esgotado ao aguardar o Amplify." >&2
exit 1
