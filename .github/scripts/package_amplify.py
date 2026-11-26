import argparse
import json
from pathlib import Path
import re


https_origin = r"https://(?:[a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*"


def package(directory, api_origin, sha, version, submission_upload_origin=""):
    if not re.fullmatch(r"https://[a-z0-9][a-z0-9.-]+\.[a-z][a-z0-9-]+", api_origin):
        raise ValueError("Configure a origem HTTPS da API.")
    if submission_upload_origin and not re.fullmatch(https_origin, submission_upload_origin):
        raise ValueError("Configure a origem HTTPS do armazenamento de envio.")
    if not (directory / "index.html").is_file():
        raise ValueError("Execute o build antes de preparar o artefato.")
    connect_origins = " ".join(origin for origin in ("'self'", api_origin, submission_upload_origin) if origin)
    csp = (
        "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "
        f"connect-src {connect_origins}; object-src 'none'; base-uri 'self'; "
        "frame-ancestors 'none'; form-action 'self'"
    )
    headers = {
        "Content-Security-Policy": csp,
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    }
    guest_headers = headers | {"X-Robots-Tag": "noindex, nofollow"}
    lines = ["customHeaders:"]
    for pattern, values in (("**", headers), ("/e", guest_headers), ("/e/*", guest_headers),
                            ("/convites/aceitar", guest_headers),
                            ("/release.json", headers | {"Cache-Control": "no-store"})):
        lines.extend((f"  - pattern: '{pattern}'", "    headers:"))
        for key, value in values.items():
            lines.extend((f"      - key: {key}", f"        value: {json.dumps(value)}"))
    (directory / "customHttp.yml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (directory / "release.json").write_text(json.dumps({"sha": sha, "version": version}) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("api_origin")
    parser.add_argument("sha")
    parser.add_argument("version")
    parser.add_argument("--submission-upload-origin", default="")
    args = parser.parse_args()
    try:
        package(args.directory, args.api_origin, args.sha, args.version, args.submission_upload_origin)
    except (ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
