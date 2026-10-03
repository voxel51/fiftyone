"""
FiftyOne Server request hooks unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import json
from types import SimpleNamespace

# pylint: disable=no-value-for-parameter
from unittest.mock import AsyncMock, MagicMock, patch

from bson import json_util
import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.server.decorators as fosd
import fiftyone.server.hooks as fosh
import fiftyone.server.routes.sample as fors
import fiftyone.server.view as fosv


class _RecordingHooks(fosh.RequestHooks):
    """Records every call; optionally rejects writes or hides a field."""

    def __init__(self, reject_writes=False, hidden_field=None):
        self.calls = []
        self.reject_writes = reject_writes
        self.hidden_field = hidden_field

    async def on_request(self, request, params=None):
        if isinstance(params, dict):
            params = dict(params)

        self.calls.append(("on_request", params))

    def transform_view(self, view):
        self.calls.append(("transform_view", view.name))
        if self.hidden_field is None:
            return view

        return view.exclude_fields(self.hidden_field)

    @contextlib.contextmanager
    def sample_write(self, sample, paths):
        self.calls.append(("sample_write", list(paths)))
        if self.reject_writes:
            raise HTTPException(status_code=403, detail="rejected")

        yield
        self.calls.append(("sample_write_done", list(paths)))

    def transform_sample_dict(self, sample, d):
        self.calls.append(("transform_sample_dict", sample.id))
        if self.hidden_field is not None:
            d.pop(self.hidden_field, None)

        return d


@pytest.fixture(name="hooks")
def fixture_hooks():
    hooks = _RecordingHooks()
    fosh.register(hooks)
    try:
        yield hooks
    finally:
        fosh.register(None)


@pytest.fixture(name="dataset")
def fixture_dataset():
    dataset = fo.Dataset()
    dataset.add_sample(
        fo.Sample(filepath="/tmp/hooks.jpg", visible="v", secret="s")
    )
    try:
        yield dataset
    finally:
        dataset.delete()


class TestRegistry:
    def test_defaults_are_no_ops(self):
        hooks = fosh.RequestHooks()
        view = MagicMock()
        assert hooks.transform_view(view) is view
        assert hooks.transform_lightning_input("input") == "input"
        assert hooks.transform_sample_dict(None, {"a": 1}) == {"a": 1}
        with hooks.sample_write(None, ["/a"]):
            pass

    def test_register_and_restore(self):
        hooks = _RecordingHooks()
        fosh.register(hooks)
        try:
            assert fosh.get() is hooks
        finally:
            fosh.register(None)

        assert type(fosh.get()) is fosh.RequestHooks

    def test_optional_module_is_imported_once(self):
        with patch.object(fosh, "_hooks", None), patch.object(
            fosh.importlib, "import_module"
        ) as import_module:
            fosh.get()
            fosh.get()

        import_module.assert_called_once_with(fosh._OPTIONAL_HOOKS_MODULE)

    def test_missing_optional_module_is_ignored(self):
        missing = ModuleNotFoundError(name=fosh._OPTIONAL_HOOKS_MODULE)
        with patch.object(fosh, "_hooks", None), patch.object(
            fosh.importlib, "import_module", side_effect=missing
        ):
            assert type(fosh.get()) is fosh.RequestHooks

    def test_broken_optional_module_raises(self):
        broken = ModuleNotFoundError(name="some_dependency")
        with patch.object(fosh, "_hooks", None), patch.object(
            fosh.importlib, "import_module", side_effect=broken
        ):
            with pytest.raises(ModuleNotFoundError):
                fosh.get()

    def test_write_paths(self):
        assert fosh.write_paths(
            [
                {"op": "replace", "path": "/a/b"},
                {"op": "move", "from": "/c", "path": "/d"},
                {"op": "copy", "from": "/e", "path": "/f"},
                {"op": "remove", "path": "/g"},
                "not an op",
            ]
        ) == ["/a/b", "/d", "/c", "/f", "/e", "/g"]
        assert not fosh.write_paths(None)

    @pytest.mark.asyncio
    async def test_on_graphql_request(self, hooks):
        info = SimpleNamespace(context=SimpleNamespace(request="req"))
        await fosh.on_graphql_request(info, "ds")
        await fosh.on_graphql_request(None, "ds")
        assert hooks.calls == [
            ("on_request", {"dataset": "ds"}),
            ("on_request", {"dataset": "ds"}),
        ]


class TestRouteDecorator:
    @pytest.mark.asyncio
    async def test_body_and_query_params_reach_on_request(self, hooks):
        class Endpoint(object):
            @fosd.route
            async def post(self, request, data):
                return {"ok": True}

            @fosd.route
            async def get(self, request):
                return {"ok": True}

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"dataset": "ds"}')
        request.query_params = {"dataset": "ds2"}

        await Endpoint().post(request)
        await Endpoint().get(request)

        assert hooks.calls == [
            ("on_request", {"dataset": "ds"}),
            ("on_request", {"dataset": "ds2"}),
        ]

    @pytest.mark.asyncio
    async def test_on_request_can_reject(self):
        class Rejecting(fosh.RequestHooks):
            async def on_request(self, request, params=None):
                raise HTTPException(status_code=403, detail="no")

        class Endpoint(object):
            @fosd.route
            async def post(self, request, data):
                raise AssertionError("handler must not run")

        request = MagicMock()
        request.body = AsyncMock(return_value=b"{}")

        fosh.register(Rejecting())
        try:
            with pytest.raises(HTTPException) as raised:
                await Endpoint().post(request)
        finally:
            fosh.register(None)

        assert raised.value.status_code == 403


class TestGetView:
    def test_views_are_transformed(self, dataset):
        hooks = _RecordingHooks(hidden_field="secret")
        fosh.register(hooks)
        try:
            view = fosv.get_view(dataset)
            dataset.save_view("saved", dataset.limit(1))
            saved = fosv.get_view(dataset, view_name="saved")
        finally:
            fosh.register(None)

        assert "secret" not in view.get_field_schema()
        assert "secret" not in saved.get_field_schema()
        assert ("transform_view", "saved") in hooks.calls


def _patch_request(dataset, sample, payload, content_type):
    request = MagicMock()
    request.path_params = {
        "dataset_id": dataset._doc.id,
        "sample_id": str(sample.id),
    }
    request.headers = {
        "Content-Type": content_type,
        "If-Match": fors.generate_sample_etag(sample),
    }
    request.body = AsyncMock(
        return_value=json_util.dumps(payload).encode("utf-8")
    )
    return request


def _route():
    return fors.Sample(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


class TestSampleWrites:
    @pytest.mark.asyncio
    async def test_field_patch_is_screened_and_response_transformed(
        self, dataset
    ):
        sample = dataset.first()
        hooks = _RecordingHooks(hidden_field="secret")
        fosh.register(hooks)
        try:
            response = await _route().patch(
                _patch_request(
                    dataset, sample, {"visible": "w"}, "application/json"
                )
            )
        finally:
            fosh.register(None)

        assert response.status_code == 200
        body = json.loads(response.body)
        assert body["visible"] == "w"
        assert "secret" not in body
        assert ("sample_write", ["visible"]) in hooks.calls
        assert ("sample_write_done", ["visible"]) in hooks.calls

    @pytest.mark.asyncio
    async def test_json_patch_paths_include_move_sources(self, dataset):
        sample = dataset.first()
        hooks = _RecordingHooks()
        fosh.register(hooks)
        try:
            await _route().patch(
                _patch_request(
                    dataset,
                    sample,
                    [
                        {"op": "replace", "path": "/visible", "value": "w"},
                        {"op": "copy", "from": "/secret", "path": "/other"},
                    ],
                    "application/json-patch+json",
                )
            )
        finally:
            fosh.register(None)

        assert (
            "sample_write",
            ["/visible", "/other", "/secret"],
        ) in hooks.calls

    @pytest.mark.asyncio
    async def test_rejected_write_is_not_saved(self, dataset):
        sample = dataset.first()
        fosh.register(_RecordingHooks(reject_writes=True))
        try:
            with pytest.raises(HTTPException) as raised:
                await _route().patch(
                    _patch_request(
                        dataset, sample, {"secret": "x"}, "application/json"
                    )
                )
        finally:
            fosh.register(None)

        assert raised.value.status_code == 403
        sample.reload()
        assert sample.secret == "s"
