#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/release_support.sh

verify_reservation
: "${VITE_API_BASE_URL:?}" "${GITHUB_OUTPUT:?}"
origin_pattern='^https://[a-z0-9][a-z0-9.-]+\.[a-z][a-z0-9-]+$'
[[ "$VITE_API_BASE_URL" =~ $origin_pattern ]]
[[ "${VITE_ENABLE_LOCAL_DIAGNOSTICS:-false}" == false ]]
npm ci
npm run build
python3 .github/scripts/package_amplify.py dist "$VITE_API_BASE_URL" "$GITHUB_SHA" "$RELEASE_VERSION"
(cd dist && zip -q -r ../site.zip .)
digest=$(shasum -a 256 site.zip | cut -d ' ' -f 1)
printf 'sha256=%s\napi_origin=%s\n' "$digest" "$VITE_API_BASE_URL" >> "$GITHUB_OUTPUT"
