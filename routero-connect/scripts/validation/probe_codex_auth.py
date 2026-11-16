"""Exercise installed Codex against loopback with a dummy token and zero inference.

The server always rejects POST /responses. A captured dummy Authorization header
proves only local command-backed authentication, never gateway compatibility.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


DUMMY_TOKEN = "routero-validation-dummy-token"
ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", default=shutil.which("codex") or "codex")
    parser.add_argument("--label", choices=("standalone", "ide-bundled"), required=True)
    args = parser.parse_args()
    run = ROOT / "tmp" / "validation" / ("auth-probe-" + args.label)
    run.mkdir(parents=True, exist_ok=True)
    home = run / "home"
    home.mkdir(exist_ok=True)
    workspace = run / "workspace"
    workspace.mkdir(exist_ok=True)
    process_temp = run / "process-temp"
    process_temp.mkdir(exist_ok=True)
    captures = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            # A Codex-shaped empty catalog keeps this an auth-only probe.
            body = b'{"models": []}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length)) if length <= 2_000_000 else {}
            captures.append({
                "path": self.path,
                "dummy_auth_matched": self.headers.get("Authorization") == "Bearer " + DUMMY_TOKEN,
                "stream": payload.get("stream"),
                "tool_types": sorted({str(t.get("type")) for t in payload.get("tools", [])}),
            })
            body = json.dumps({"error": {"message": "Intentional local auth probe rejection; no inference.", "type": "validation_probe", "code": "418"}}).encode()
            self.send_response(418)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    helper = run / "dummy_credential.py"
    helper.write_text('print("routero-validation-dummy-token")\n', encoding="utf-8")
    # JSON-quoted paths are valid TOML basic strings; no shell command construction.
    config = f'''model_provider = "routero_validation_local"
model = "gpt-5"
approval_policy = "never"
sandbox_mode = "read-only"

[history]
persistence = "none"

[model_providers.routero_validation_local]
name = "Routero loopback validation (no inference)"
base_url = "http://127.0.0.1:{server.server_port}"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
stream_idle_timeout_ms = 5000

[model_providers.routero_validation_local.auth]
command = {json.dumps(sys.executable)}
args = [{json.dumps(str(helper))}]
timeout_ms = 5000
'''
    (home / "config.toml").write_text(config, encoding="utf-8")
    # Construct a minimal child environment rather than inheriting gateway keys,
    # active-agent auth, unrelated MCP config, or proxy settings.
    child_env = {
        key: value for key, value in os.environ.items()
        if key.upper() in {"SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"}
    }
    child_env.update({"CODEX_HOME": str(home), "TEMP": str(process_temp), "TMP": str(process_temp)})
    command = [args.executable, "exec", "--strict-config", "--ephemeral", "--skip-git-repo-check", "--color", "never", "-C", str(workspace), "Reply READY. Do not execute tools."]
    try:
        completed = subprocess.run(command, env=child_env, cwd=workspace, input="", capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=35)
        output = completed.stdout + completed.stderr
        result = {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "label": args.label,
            "executable_sha256": hashlib.sha256(Path(args.executable).read_bytes()).hexdigest(),
            "exit_code": completed.returncode,
            "requests": captures,
            "local_command_auth_passed": bool(captures) and all(c["dummy_auth_matched"] for c in captures),
            "inference_requests": 0,
            "cost_usd": 0,
        }
    except subprocess.TimeoutExpired:
        output = "Local probe timed out; no inference server was configured."
        result = {"label": args.label, "outcome": "timeout", "requests": captures, "inference_requests": 0, "cost_usd": 0}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    (run / "client-output.txt").write_text(output, encoding="utf-8")
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(output[-3500:])
    return 0 if result.get("local_command_auth_passed") and len(captures) == 1 and captures[0]["path"] == "/responses" else 1


if __name__ == "__main__":
    raise SystemExit(main())
