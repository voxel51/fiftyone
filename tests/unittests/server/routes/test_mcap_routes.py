"""
FiftyOne Server MCAP route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.server.routes.multimodal as form


@pytest.fixture(name="dataset")
def fixture_dataset():
    dataset = fo.Dataset()
    dataset.persistent = True
    dataset.add_sample_field("mcap_path", fo.StringField)
    dataset.add_sample(fo.Sample(filepath="/tmp/not-mcap.mcap", mcap_path=""))

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    return dataset._doc.id  # pylint: disable=protected-access


@pytest.fixture(name="sample")
def fixture_sample(dataset):
    return dataset.first()


@pytest.fixture(name="sample_id")
def fixture_sample_id(sample):
    return str(sample.id)


@pytest.fixture(name="workspace_endpoint")
def fixture_workspace_endpoint():
    return form.MultimodalWorkspace(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="ingest_endpoint")
def fixture_ingest_endpoint():
    return form.MultimodalIngest(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="stream_window_endpoint")
def fixture_stream_window_endpoint():
    return form.MultimodalStreamWindowBinary(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="timeline_index_endpoint")
def fixture_timeline_index_endpoint():
    return form.MultimodalTimelineIndex(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="bootstrap_window_endpoint")
def fixture_bootstrap_window_endpoint():
    return form.MultimodalBootstrapWindowBinary(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


def _make_request(dataset_id, sample_id, query_params=None, payload=None):
    request = MagicMock()
    request.path_params = {"dataset_id": dataset_id, "sample_id": sample_id}
    request.query_params = query_params or {}
    request.json = AsyncMock(return_value=payload or {})
    return request


class TestMcapWorkspaceRoute:
    @pytest.mark.asyncio
    async def test_workspace_happy_path(
        self, dataset_id, sample_id, workspace_endpoint
    ):
        response_body = {
            "catalog": {"sceneId": "scene-1", "streams": []},
            "renderingPlan": {"panels": []},
        }
        with patch.object(
            form.fosm,
            "inspect_sample_multimodal_workspace",
            return_value=response_body,
        ) as inspect_workspace:
            response = await workspace_endpoint.get(
                _make_request(
                    dataset_id,
                    sample_id,
                    query_params={"mediaField": "filepath"},
                )
            )

        inspect_workspace.assert_called_once()
        assert response.status_code == 200
        assert response.body.decode("utf-8").startswith("{")

    @pytest.mark.asyncio
    async def test_workspace_surfaces_route_errors(
        self, dataset_id, sample_id, workspace_endpoint
    ):
        with patch.object(
            form.fosm,
            "inspect_sample_multimodal_workspace",
            side_effect=form.fosm.MultimodalRouteError(404, "missing"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await workspace_endpoint.get(
                    _make_request(
                        dataset_id,
                        sample_id,
                        query_params={"mediaField": "filepath"},
                    )
                )

        assert exc_info.value.status_code == 404


class TestMcapIngestRoute:
    @pytest.mark.asyncio
    async def test_ingest_parses_request_body(
        self, dataset_id, sample_id, ingest_endpoint
    ):
        with patch.object(
            form.fosm,
            "ingest_sample_multimodal_workspace",
            return_value={
                "catalog": {"sceneId": "scene-1"},
                "renderingPlan": {"panels": []},
            },
        ) as ingest_workspace:
            response = await ingest_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={"mediaField": "filepath", "overwrite": True},
                )
            )

        assert response.status_code == 200
        assert ingest_workspace.call_args.kwargs["media_field"] == "filepath"
        assert ingest_workspace.call_args.kwargs["overwrite"] is True


class TestMcapStreamWindowRoute:
    @pytest.mark.asyncio
    async def test_stream_window_parses_new_contract(
        self, dataset_id, sample_id, stream_window_endpoint
    ):
        with patch.object(
            form.fosm,
            "read_sample_multimodal_stream_window_binary",
            return_value=b"window",
        ) as read_stream_window:
            response = await stream_window_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={
                        "mediaField": "filepath",
                        "streamIds": ["/camera/front"],
                        "startTimeNs": 10,
                        "endTimeNs": 20,
                        "maxMessagesPerStream": 3,
                    },
                )
            )

        assert response.status_code == 200
        assert response.body == b"window"
        assert read_stream_window.call_args.kwargs["stream_ids"] == [
            "/camera/front"
        ]
        assert (
            read_stream_window.call_args.kwargs["max_messages_per_stream"] == 3
        )

    @pytest.mark.asyncio
    async def test_stream_window_rejects_inverted_ranges(
        self, dataset_id, sample_id, stream_window_endpoint
    ):
        with pytest.raises(HTTPException) as exc_info:
            await stream_window_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={
                        "mediaField": "filepath",
                        "streamIds": ["/camera/front"],
                        "startTimeNs": 20,
                        "endTimeNs": 10,
                    },
                )
            )

        assert exc_info.value.status_code == 400


class TestMcapBootstrapWindowRoute:
    @pytest.mark.asyncio
    async def test_bootstrap_window_parses_boot_request(
        self, dataset_id, sample_id, bootstrap_window_endpoint
    ):
        with patch.object(
            form.fosm,
            "read_sample_multimodal_bootstrap_window_binary",
            return_value=b"bootstrap",
        ) as read_bootstrap_window:
            response = await bootstrap_window_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={
                        "mediaField": "filepath",
                        "anchorTimeNs": 0,
                        "renderStreamIds": ["/lidar/top"],
                        "transformStreamIds": ["/tf"],
                        "locationStreamIds": ["/odom"],
                        "transformWindowNs": 100,
                    },
                )
            )

        assert response.status_code == 200
        assert response.body == b"bootstrap"
        assert read_bootstrap_window.call_args.kwargs["anchor_time_ns"] == 0
        assert read_bootstrap_window.call_args.kwargs["render_stream_ids"] == [
            "/lidar/top"
        ]
        assert read_bootstrap_window.call_args.kwargs[
            "transform_stream_ids"
        ] == ["/tf"]
        assert read_bootstrap_window.call_args.kwargs[
            "location_stream_ids"
        ] == ["/odom"]
        assert (
            read_bootstrap_window.call_args.kwargs["transform_window_ns"]
            == 100
        )


class TestMcapTimelineIndexRoute:
    @pytest.mark.asyncio
    async def test_timeline_index_allows_omitted_stream_ids(
        self, dataset_id, sample_id, timeline_index_endpoint
    ):
        with patch.object(
            form.fosm,
            "read_sample_multimodal_timeline_index",
            return_value={"sceneId": "scene-1", "timestampsNs": []},
        ) as read_timeline_index:
            response = await timeline_index_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={"mediaField": "filepath"},
                )
            )

        assert response.status_code == 200
        assert read_timeline_index.call_args.kwargs["stream_ids"] is None

    @pytest.mark.asyncio
    async def test_timeline_index_forwards_sync_config(
        self, dataset_id, sample_id, timeline_index_endpoint
    ):
        with patch.object(
            form.fosm,
            "read_sample_multimodal_timeline_index",
            return_value={"sceneId": "scene-1", "timestampsNs": []},
        ) as read_timeline_index:
            response = await timeline_index_endpoint.post(
                _make_request(
                    dataset_id,
                    sample_id,
                    payload={
                        "mediaField": "filepath",
                        "streamIds": ["/camera/front"],
                        "timestampSource": "header.stamp",
                        "fallback": "log_time",
                    },
                )
            )

        assert response.status_code == 200
        assert read_timeline_index.call_args.kwargs["stream_ids"] == [
            "/camera/front"
        ]
        assert (
            read_timeline_index.call_args.kwargs["timestamp_source"]
            == "header.stamp"
        )
        assert read_timeline_index.call_args.kwargs["fallback"] == "log_time"
