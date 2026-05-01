"""
FiftyOne Server media route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest.mock import patch

import pytest
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient

import fiftyone.server.routes.media as form


@pytest.fixture(name="media_file")
def fixture_media_file(tmp_path):
    path = tmp_path / "example.pcd"
    path.write_bytes(b"0123456789abcdef")
    return path


@pytest.fixture(name="client")
def fixture_client():
    app = Starlette(routes=[Route("/media", form.Media)])
    return TestClient(app)


def _media_url(path):
    return f"/media?filepath={path}"


def _assert_range_headers(response):
    assert response.headers["accept-ranges"] == "bytes"
    assert (
        response.headers["access-control-expose-headers"]
        == "Accept-Ranges, Content-Range, Content-Length"
    )


def test_get_returns_file(client, media_file):
    response = client.get(_media_url(media_file))

    assert response.status_code == 200
    assert response.content == b"0123456789abcdef"
    assert response.headers["content-length"] == "16"
    _assert_range_headers(response)


def test_get_stats_once(client, media_file):
    with patch("fiftyone.server.routes.media.os.stat", wraps=os.stat) as stat:
        response = client.get(_media_url(media_file))

    assert response.status_code == 200
    assert stat.call_count == 1


def test_head_returns_headers_without_body(client, media_file):
    response = client.head(_media_url(media_file))

    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["content-length"] == "16"
    _assert_range_headers(response)


@pytest.mark.parametrize(
    "range_header,expected_content,expected_content_range",
    [
        ("bytes=2-5", b"2345", "bytes 2-5/16"),
        ("bytes=4-", b"456789abcdef", "bytes 4-15/16"),
        ("bytes=-4", b"cdef", "bytes 12-15/16"),
    ],
)
def test_range_requests(
    client, media_file, range_header, expected_content, expected_content_range
):
    response = client.get(
        _media_url(media_file),
        headers={"Range": range_header},
    )

    assert response.status_code == 206
    assert response.content == expected_content
    assert response.headers["content-range"] == expected_content_range
    _assert_range_headers(response)


@pytest.mark.parametrize(
    "range_header,status_code",
    [
        ("bytes=99-120", 416),
        ("items=2-5", 400),
    ],
)
def test_invalid_range_requests(client, media_file, range_header, status_code):
    response = client.get(
        _media_url(media_file),
        headers={"Range": range_header},
    )

    assert response.status_code == status_code


def test_missing_file_returns_404(client, tmp_path):
    response = client.get(_media_url(tmp_path / "missing.pcd"))

    assert response.status_code == 404
    assert response.text == "Not found"
    _assert_range_headers(response)


def test_directory_returns_404(client, tmp_path):
    response = client.get(_media_url(tmp_path))

    assert response.status_code == 404
    assert response.text == "Not found"
    _assert_range_headers(response)


def test_options_returns_allow_and_range_headers(client):
    response = client.options("/media")

    assert response.status_code == 200
    assert response.headers["allow"] == "OPTIONS, GET, HEAD"
    _assert_range_headers(response)
