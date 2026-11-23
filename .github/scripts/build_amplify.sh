#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/release_support.sh

verify_reservation
: "${VITE_API_BASE_URL:?}" "${UI_ORIGIN:?}" "${GITHUB_OUTPUT:?}"
origin_pattern='^https://([a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*$'
if [[ ! "$VITE_API_BASE_URL" =~ $origin_pattern || ! "$UI_ORIGIN" =~ $origin_pattern || "$UI_ORIGIN" == "$VITE_API_BASE_URL" ]]; then
    echo 'Configure origens HTTPS distintas para a interface e a API.' >&2
    exit 1
fi
[[ "${VITE_ENABLE_LOCAL_DIAGNOSTICS:-false}" == false ]]
export VITE_PUBLIC_SITE_ORIGIN="$UI_ORIGIN"
npm ci
npm run build
python3 .github/scripts/package_amplify.py dist "$VITE_API_BASE_URL" "$GITHUB_SHA" "$RELEASE_VERSION"
(cd dist && zip -q -r ../site.zip .)
digest=$(shasum -a 256 site.zip | cut -d ' ' -f 1)
printf 'sha256=%s\napi_origin=%s\nui_origin=%s\n' "$digest" "$VITE_API_BASE_URL" "$VITE_PUBLIC_SITE_ORIGIN" >> "$GITHUB_OUTPUT"
