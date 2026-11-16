"""Read-only UAT discovery. Secrets are entered via a non-echoing terminal."""

import argparse
import getpass
import json
import re
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    """Never forward the Authorization header to another origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


ORIGIN = "https://api-uat.routero.ai"
MAX_BYTES = 2 * 1024 * 1024
USER_AGENT = "Routero-Connect-Validation/0.0.1"


def summarize(path, status, payload):
    result = {"path": path, "status": status}
    if status != 200:
        # Do not retain arbitrary server bodies, which may reflect credentials.
        result["outcome"] = "request_rejected"
    elif path == "/v1/models":
        rows = payload.get("data")
        if not isinstance(rows, list) or not all(isinstance(row, dict) and isinstance(row.get("id"), str) for row in rows):
            raise ValueError("Invalid model-list shape")
        result["models"] = [row["id"] for row in rows]
    elif path == "/key/info":
        info = payload.get("info", {})
        result["key"] = {
            field: info.get(field)
            for field in ("models", "allowed_routes", "spend", "max_budget", "blocked", "expires")
        }
        result["key"]["policy_id"] = (info.get("metadata") or {}).get("policy_id")
        budget = info.get("budget") or info.get("litellm_budget_table") or {}
        result["key"]["budget"] = {
            field: budget.get(field) for field in ("max_budget", "budget_duration")
        } if isinstance(budget, dict) else None
    return result


def discover(secret):
    opener = build_opener(NoRedirect)
    results = []
    for path in ("/v1/models", "/key/info"):
        request = Request(ORIGIN + path, headers={
            "Authorization": "Bearer " + secret,
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        })
        try:
            with opener.open(request, timeout=15) as response:
                raw = response.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES:
                    results.append({"path": path, "outcome": "response_too_large"})
                    continue
                results.append(summarize(path, response.status, json.loads(raw)))
        except HTTPError as error:
            result = summarize(path, error.code, {})
            result["content_type"] = error.headers.get("Content-Type", "")
            result["server"] = error.headers.get("Server", "")
            try:
                payload = json.loads(error.read(MAX_BYTES))
                detail = payload.get("error", payload.get("detail", {}))
                if isinstance(detail, dict):
                    result["error"] = {
                        field: re.sub(r"sk-[A-Za-z0-9_-]+", "[REDACTED]", str(detail[field]).replace(secret, "[REDACTED]"))[:300]
                        for field in ("type", "code", "message") if field in detail
                    }
                elif isinstance(detail, str):
                    result["error"] = re.sub(r"sk-[A-Za-z0-9_-]+", "[REDACTED]", detail.replace(secret, "[REDACTED]"))[:300]
            except (ValueError, TypeError, AttributeError):
                result["error_body"] = "non-json; omitted"
            results.append(result)
            error.close()
        except (URLError, TimeoutError, OSError):
            results.append({"path": path, "outcome": "network_error"})
        except (ValueError, TypeError, KeyError, AttributeError):
            results.append({"path": path, "outcome": "unexpected_response"})
    return results


def redact(value, secret):
    """Sanitize every string, including server-supplied model IDs and metadata."""
    if isinstance(value, str):
        return re.sub(r"sk-[A-Za-z0-9_-]+", "[REDACTED]", value.replace(secret, "[REDACTED]"))
    if isinstance(value, list):
        return [redact(item, secret) for item in value]
    if isinstance(value, dict):
        return {str(key): redact(item, secret) for key, item in value.items()}
    return value


def run_profile(profile):
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        secret = getpass.getpass(profile + " UAT key (hidden): ")
    if not secret or not secret.startswith("sk-"):
        raise SystemExit("A Routero Virtual Key is required; nothing was requested.")
    report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "origin": ORIGIN,
        "profile": profile,
        "user_agent": USER_AGENT,
        "inference_requests": 0,
        "results": discover(secret),
    }
    encoded = json.dumps(redact(report, secret), indent=2)
    # Defense in depth: never print or persist a credential echoed by the server.
    if secret in encoded:
        raise SystemExit("Report withheld because it contains sensitive content.")
    root = Path(__file__).resolve().parents[2]
    target = root / "tmp" / "validation" / "discovery"
    target.mkdir(parents=True, exist_ok=True)
    (target / (profile + ".json")).write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("admin-group", "demo", "both"), required=True)
    args = parser.parse_args()
    if not sys.stdin.isatty():
        parser.error("Use an interactive terminal for non-echoing secret entry.")
    profiles = ("admin-group", "demo") if args.profile == "both" else (args.profile,)
    for profile in profiles:
        run_profile(profile)


if __name__ == "__main__":
    main()
