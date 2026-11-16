"""Offline checks for discovery boundaries, reporting, and secret handling."""

import io
import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

import discover_uat as discovery


class DiscoveryTests(unittest.TestCase):
    def test_success_uses_only_read_only_scoped_endpoints(self):
        models = MagicMock()
        models.__enter__.return_value = models
        models.status = 200
        models.read.return_value = b'{"data": [{"id": "candidate"}]}'
        info = MagicMock()
        info.__enter__.return_value = info
        info.status = 200
        info.read.return_value = b'{"info": {"token": "never-retain", "spend": 0.5, "metadata": {"policy_id": "p1", "private": "never-retain"}}}'
        opener = MagicMock()
        opener.open.side_effect = [models, info]
        with patch.object(discovery, "build_opener", return_value=opener):
            report = discovery.discover("dummy-credential")
        calls = opener.open.call_args_list
        self.assertEqual([c.args[0].full_url for c in calls], [discovery.ORIGIN + "/v1/models", discovery.ORIGIN + "/key/info"])
        for call in calls:
            request = call.args[0]
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.get_header("Authorization"), "Bearer dummy-credential")
            self.assertEqual(request.get_header("User-agent"), discovery.USER_AGENT)
            self.assertEqual(call.kwargs["timeout"], 15)
        self.assertEqual(report[0]["models"], ["candidate"])
        self.assertEqual(report[1]["key"]["policy_id"], "p1")
        self.assertNotIn("never-retain", json.dumps(report))

    def test_cross_origin_redirect_is_refused(self):
        handler = discovery.NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, "Found", {}, "https://other.example"))

    def test_error_body_cannot_echo_the_supplied_key(self):
        secret = "sk-test-not-a-real-key"
        body = json.dumps({"error": {"type": "auth_error", "message": secret}}).encode()
        opener = MagicMock()
        opener.open.side_effect = [
            HTTPError(discovery.ORIGIN, 401, "Unauthorized", {}, io.BytesIO(body)),
            HTTPError(discovery.ORIGIN, 403, "Forbidden", {}, io.BytesIO(b"private non-json body")),
        ]
        with patch.object(discovery, "build_opener", return_value=opener):
            report = discovery.discover(secret)
        encoded = json.dumps(report)
        self.assertNotIn(secret, encoded)
        self.assertNotIn("private non-json body", encoded)
        self.assertEqual(report[0]["error"]["message"], "[REDACTED]")
        self.assertEqual(report[1]["status"], 403)

    def test_nested_values_are_redacted_before_persistence(self):
        result = discovery.redact({"models": ["sk-test-other-secret"], "metadata": {"value": "echo dummy-credential"}}, "dummy-credential")
        self.assertEqual(result["models"], ["[REDACTED]"])
        self.assertEqual(result["metadata"]["value"], "echo [REDACTED]")

    def test_network_failure_is_bounded_without_retry(self):
        opener = MagicMock()
        opener.open.side_effect = URLError("private network detail")
        with patch.object(discovery, "build_opener", return_value=opener):
            report = discovery.discover("dummy-credential")
        self.assertEqual(opener.open.call_count, 2)
        self.assertTrue(all(r["outcome"] == "network_error" for r in report))
        self.assertNotIn("private network detail", json.dumps(report))

    def test_invalid_or_oversized_payload_is_not_reported_as_success(self):
        invalid = MagicMock()
        invalid.__enter__.return_value = invalid
        invalid.status = 200
        invalid.read.return_value = b'{"data": ["wrong-shape"]}'
        large = MagicMock()
        large.__enter__.return_value = large
        large.status = 200
        large.read.return_value = b"x" * (discovery.MAX_BYTES + 1)
        opener = MagicMock()
        opener.open.side_effect = [invalid, large]
        with patch.object(discovery, "build_opener", return_value=opener):
            report = discovery.discover("dummy-credential")
        self.assertEqual(report[0]["outcome"], "unexpected_response")
        self.assertEqual(report[1]["outcome"], "response_too_large")


if __name__ == "__main__":
    unittest.main()
