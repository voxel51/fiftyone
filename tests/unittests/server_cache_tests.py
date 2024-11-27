import unittest
from datetime import datetime, timedelta

from fiftyone.server.cache import extract_ttu_from_url


class TestExtractTtuFromUrl(unittest.TestCase):
    def setUp(self):
        self.default_sec = 3600
        self.now = datetime(2024, 10, 25, 12, 0, 0)
        self.date_fmt = "%Y%m%dT%H%M%SZ"

    def test_aws_gcp_url_expires(self):
        url = "https://example.com/resource?X-Amz-Expires=1800&X-Amz-Date=20241025T113000Z"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(expiration, datetime(2024, 10, 25, 12, 0, 0))

    def test_azure_url_se_v1(self):
        url = "https://example.com/resource?se=20241025T121500Z"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(expiration, datetime(2024, 10, 25, 12, 15, 0))

    def test_azure_url_se_v2(self):
        url = "https://example.blob.core.windows.net/path/to/sample/001.jpg?se=2024-11-22T22%3A14%3A41Z"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(expiration, datetime(2024, 11, 22, 22, 14, 41))

    def test_url_missing_expires(self):
        date_str = "20241025T121500Z"
        url = "https://example.com/resource?X-Amz-Date=" + date_str
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(
            expiration,
            (
                datetime.strptime(date_str, self.date_fmt)
                + timedelta(seconds=self.default_sec)
            ),
        )

    def test_invalid_expires_format(self):
        url = "https://example.com/resource?X-Amz-Expires=abc"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(
            expiration,
            (self.now + timedelta(seconds=self.default_sec)),
        )

    def test_missing_params(self):
        url = "https://example.com/resource"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(
            expiration,
            (self.now + timedelta(seconds=self.default_sec)),
        )

    def test_invalid_date_format(self):
        url = "https://example.com/resource?X-Amz-Date=invalid_date"
        expiration = extract_ttu_from_url(url, self.now, self.default_sec)
        self.assertEqual(
            expiration,
            (self.now + timedelta(seconds=self.default_sec)),
        )
