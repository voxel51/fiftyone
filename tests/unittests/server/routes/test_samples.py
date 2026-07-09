"""
FiftyOne Server samples route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.server.routes.samples as fors


@pytest.fixture(name="dataset")
def fixture_dataset():
    """A dataset with two orderable dynamic groups of three frames each."""
    dataset = fo.Dataset()
    dataset.persistent = True

    samples = []
    for scene in ("scene-a", "scene-b"):
        for frame_number in range(1, 4):
            samples.append(
                fo.Sample(
                    filepath=f"/tmp/{scene}-{frame_number}.png",
                    scene=scene,
                    frame_index=frame_number,
                )
            )
    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    # pylint: disable-next=protected-access
    return str(dataset._doc.id)


@pytest.fixture(name="samples_endpoint")
def fixture_samples_endpoint():
    return fors.Samples(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="make_request")
def fixture_make_request(dataset_id):
    """A mock POST request carrying the given JSON payload."""

    def _make(data, dataset_id_override=None):
        request = MagicMock()
        request.path_params = {"dataset_id": dataset_id_override or dataset_id}
        request.body = AsyncMock(return_value=json.dumps(data).encode())
        return request

    return _make


def _parse(response):
    assert response.status_code == 200
    return json.loads(response.body)["samples"]


class TestSamplesRoute:
    """Tests for the windowed samples reader."""

    @pytest.mark.asyncio
    async def test_windowed_read(
        self, samples_endpoint, make_request, dataset
    ):
        """``after``/``count`` window the view in order."""
        ids = dataset.values("id")

        request = make_request({"view": [], "after": 1, "count": 2})
        samples = _parse(await samples_endpoint.post(request))

        assert [s["id"] for s in samples] == ids[1:3]

    @pytest.mark.asyncio
    async def test_dynamic_group_stream(
        self, samples_endpoint, make_request, dataset
    ):
        """One dynamic group's frames, ordered, with the urls + field data the
        imavid frame stream renders from."""
        # pylint: disable-next=protected-access
        stages = dataset.group_by("scene", order_by="frame_index")._serialize()
        request = make_request(
            {"view": stages, "dynamicGroup": "scene-a", "count": 100}
        )
        samples = _parse(await samples_endpoint.post(request))

        assert len(samples) == 3
        fields = [json.loads(s["fields"]) for s in samples]
        assert [f["scene"] for f in fields] == ["scene-a"] * 3
        assert [f["frame_index"] for f in fields] == [1, 2, 3]
        assert all(
            any(url["field"] == "filepath" for url in s["urls"])
            for s in samples
        )

    @pytest.mark.asyncio
    async def test_fields_projection(self, samples_endpoint, make_request):
        """Only requested + identifier paths leave the database."""
        request = make_request({"view": [], "count": 1, "fields": ["scene"]})
        (sample,) = _parse(await samples_endpoint.post(request))
        fields = json.loads(sample["fields"])

        assert "scene" in fields
        assert "filepath" in fields
        assert "frame_index" not in fields

    @pytest.mark.asyncio
    async def test_exclude_projection(self, samples_endpoint, make_request):
        """Excluded paths are dropped; identifiers survive exclusion."""
        request = make_request(
            {
                "view": [],
                "count": 1,
                "exclude": ["frame_index", "filepath"],
            }
        )
        (sample,) = _parse(await samples_endpoint.post(request))
        fields = json.loads(sample["fields"])

        assert "frame_index" not in fields
        assert "filepath" in fields
        assert "scene" in fields

    @pytest.mark.asyncio
    async def test_skip_metadata_controls_aspect_ratio(
        self, samples_endpoint, make_request
    ):
        request = make_request({"view": [], "count": 1, "skipMetadata": True})
        (skipped,) = _parse(await samples_endpoint.post(request))
        assert "aspectRatio" not in skipped

        request = make_request({"view": [], "count": 1})
        (default,) = _parse(await samples_endpoint.post(request))
        assert "aspectRatio" in default

    @pytest.mark.asyncio
    async def test_invalid_window_is_400(self, samples_endpoint, make_request):
        request = make_request({"view": [], "after": "not-a-number"})
        response = await samples_endpoint.post(request)

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_unknown_dataset_is_404(
        self, samples_endpoint, make_request
    ):
        request = make_request(
            {"view": [], "count": 1}, dataset_id_override="0" * 24
        )
        with pytest.raises(HTTPException) as exc:
            await samples_endpoint.post(request)

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_missing_count_is_400(self, samples_endpoint, make_request):
        """A windowed read must state its size; nothing is invented for it."""
        request = make_request({"view": []})
        response = await samples_endpoint.post(request)

        assert response.status_code == 400
