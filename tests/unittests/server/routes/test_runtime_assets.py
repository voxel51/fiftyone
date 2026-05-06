"""
FiftyOne Server runtime assets route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.exceptions import HTTPException

from fiftyone.server.routes.runtime_assets import (
    DEFAULT_MODEL_URLS,
    ModelWeights,
    _get_model_base_url,
    _validate_model_id,
)


class TestGetModelBaseUrl:
    """Tests for _get_model_base_url helper."""

    def test_returns_default_url(self):
        """Tests that the built-in default URL is returned when no env var is set."""
        url = _get_model_base_url("sam2")
        assert url == DEFAULT_MODEL_URLS["sam2"]

    def test_env_override(self, monkeypatch):
        """Tests that an environment variable overrides the default URL."""
        monkeypatch.setenv("FIFTYONE_MODEL_WEIGHTS_BASE_SAM2", "https://custom.example.com/sam2")
        url = _get_model_base_url("sam2")
        assert url == "https://custom.example.com/sam2"

    def test_env_override_strips_trailing_slash(self, monkeypatch):
        """Tests that a trailing slash on the env var value is stripped."""
        monkeypatch.setenv("FIFTYONE_MODEL_WEIGHTS_BASE_SAM2", "https://custom.example.com/sam2/")
        url = _get_model_base_url("sam2")
        assert url == "https://custom.example.com/sam2"

    def test_env_key_uppercases_family(self, monkeypatch):
        """Tests that the family name is upper-cased when building the env key."""
        monkeypatch.setenv("FIFTYONE_MODEL_WEIGHTS_BASE_MYMODEL", "https://example.com/mymodel")
        url = _get_model_base_url("mymodel")
        assert url == "https://example.com/mymodel"

    def test_unknown_family_raises_404(self):
        """Tests that a 404 is raised for an unconfigured family."""
        with pytest.raises(HTTPException) as exc_info:
            _get_model_base_url("nonexistent")
        assert exc_info.value.status_code == 404
        assert "nonexistent" in exc_info.value.detail


@pytest.fixture(name="endpoint")
def fixture_endpoint():
    """Returns a ModelWeights endpoint instance."""
    return ModelWeights(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


def _make_request(family: str, model_id: str) -> MagicMock:
    """Helper to create a mock request with the given path params."""
    request = MagicMock()
    request.path_params = {"family": family, "model_id": model_id}
    return request


class TestModelWeightsEndpoint:
    """Tests for the ModelWeights HTTP endpoint."""

    @pytest.mark.asyncio
    async def test_returns_url_for_known_family(self, endpoint):
        """Tests that the endpoint resolves a URL for a known model family."""
        request = _make_request("sam2", "encoder.onnx")
        response = await endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["url"] == f"{DEFAULT_MODEL_URLS['sam2']}/encoder.onnx"

    @pytest.mark.asyncio
    async def test_returns_url_with_nested_model_id(self, endpoint):
        """Tests that a model_id containing path separators is preserved."""
        request = _make_request("sam2", "subdir/model.onnx")
        response = await endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["url"] == f"{DEFAULT_MODEL_URLS['sam2']}/subdir/model.onnx"

    @pytest.mark.asyncio
    async def test_env_override_reflected_in_response(self, endpoint, monkeypatch):
        """Tests that an env var override is used in the response URL."""
        monkeypatch.setenv("FIFTYONE_MODEL_WEIGHTS_BASE_SAM2", "https://private.cdn.com/models")
        request = _make_request("sam2", "decoder.onnx")
        response = await endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["url"] == "https://private.cdn.com/models/decoder.onnx"

    @pytest.mark.asyncio
    async def test_unknown_family_returns_404(self, endpoint):
        """Tests that a 404 is raised for an unknown model family."""
        request = _make_request("unknown_family", "model.onnx")

        with pytest.raises(HTTPException) as exc_info:
            await endpoint.get(request)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "bad_model_id",
        [
            "../private/secret",
            "sub/../../escape",
            "/absolute/path",
            "..",
            "",
        ],
    )
    async def test_path_traversal_returns_400(self, endpoint, bad_model_id):
        """Tests that a 400 is raised for traversal / absolute / empty model_id."""
        request = _make_request("sam2", bad_model_id)

        with pytest.raises(HTTPException) as exc_info:
            await endpoint.get(request)

        assert exc_info.value.status_code == 400


class TestValidateModelId:
    """Tests for _validate_model_id helper."""

    @pytest.mark.parametrize(
        "model_id,expected",
        [
            ("encoder.onnx", "encoder.onnx"),
            ("subdir/model.onnx", "subdir/model.onnx"),
            ("a/b/c/file.bin", "a/b/c/file.bin"),
        ],
    )
    def test_valid_paths_normalized(self, model_id, expected):
        """Tests that valid relative paths are returned normalized."""
        assert _validate_model_id(model_id) == expected

    @pytest.mark.parametrize(
        "bad_model_id",
        [
            "../private",
            "a/../../b",
            "/absolute",
            "..",
            "",
        ],
    )
    def test_invalid_paths_raise_400(self, bad_model_id):
        """Tests that traversal, absolute, and empty inputs raise 400."""
        with pytest.raises(HTTPException) as exc_info:
            _validate_model_id(bad_model_id)
        assert exc_info.value.status_code == 400
