#!/usr/bin/env bash
set -euo pipefail

: "${SITE_ARCHIVE:?}" "${SITE_SHA256:?}" "${SITE_API_ORIGIN:?}" "${SITE_UI_ORIGIN:?}" "${VITE_API_BASE_URL:?}" "${UI_ORIGIN:?}"
digest=$(shasum -a 256 "$SITE_ARCHIVE" | cut -d ' ' -f 1)
if [[ ! "$SITE_SHA256" =~ ^[0-9a-f]{64}$ || "$digest" != "$SITE_SHA256" || "$SITE_API_ORIGIN" != "$VITE_API_BASE_URL" || "$SITE_UI_ORIGIN" != "$UI_ORIGIN" ]]; then
    echo "O ZIP do build diverge do hash ou da origem esperados." >&2
    exit 1
fi
if [[ "${SITE_SUBMISSION_UPLOAD_ORIGIN:-}" != "${VITE_SUBMISSION_UPLOAD_ORIGIN:-}" ]]; then
    echo "O ZIP do build diverge da origem esperada para o armazenamento de envio." >&2
    exit 1
fi
unzip -p "$SITE_ARCHIVE" release.json |
    jq -e --arg sha "${SITE_SHA:-${GITHUB_SHA:?}}" --arg version "${SITE_VERSION:-${RELEASE_VERSION:?}}" '
        . == {sha: $sha, version: $version}
    ' >/dev/null
