import argparse
import json
from pathlib import Path
import re


def package(directory, api_origin, sha, version):
    if not re.fullmatch(r"https://[a-z0-9][a-z0-9.-]+\.[a-z][a-z0-9-]+", api_origin):
        raise ValueError("Configure a origem HTTPS da API.")
    if not (directory / "index.html").is_file():
        raise ValueError("Execute o build antes de preparar o artefato.")
    csp = (
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
        f"connect-src 'self' {api_origin}; object-src 'none'; base-uri 'self'; "
        "frame-ancestors 'none'; form-action 'self'"
    )
    headers = {
        "Content-Security-Policy": csp,
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
    args = parser.parse_args()
    try:
        package(args.directory, args.api_origin, args.sha, args.version)
    except (ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
