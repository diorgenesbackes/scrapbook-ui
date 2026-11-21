#!/usr/bin/env bash
set -euo pipefail

: "${SITE_ARCHIVE:?}" "${SITE_SHA256:?}" "${SITE_API_ORIGIN:?}" "${VITE_API_BASE_URL:?}"
digest=$(shasum -a 256 "$SITE_ARCHIVE" | cut -d ' ' -f 1)
if [[ ! "$SITE_SHA256" =~ ^[0-9a-f]{64}$ || "$digest" != "$SITE_SHA256" || "$SITE_API_ORIGIN" != "$VITE_API_BASE_URL" ]]; then
    echo "O ZIP do build diverge do hash ou da origem esperados." >&2
    exit 1
fi
unzip -p "$SITE_ARCHIVE" release.json |
    jq -e --arg sha "${GITHUB_SHA:?}" --arg version "${RELEASE_VERSION:?}" '
        . == {sha: $sha, version: $version}
    ' >/dev/null
