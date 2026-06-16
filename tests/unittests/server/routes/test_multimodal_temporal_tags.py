"""
Multimodal temporal tag route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId
import pytest
from starlette.datastructures import QueryParams
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.multimodal.server.routes as fomr
import fiftyone.multimodal.tags as fomt


@pytest.fixture(autouse=True)
def clean_temporal_tags():
    """Ensures each test starts with an empty temporal tag collection."""
    foo.get_db_conn().drop_collection(fomt.TAGS_COLLECTION_NAME)

    yield

    foo.get_db_conn().drop_collection(fomt.TAGS_COLLECTION_NAME)


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a dataset with a few multimodal samples."""
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(filepath="/tmp/temporal-tags-1.mp4"),
            fo.Sample(filepath="/tmp/temporal-tags-2.mp4"),
            fo.Sample(filepath="/tmp/temporal-tags-3.mp4"),
        ]
    )

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    """Returns the dataset ID as it appears in route paths."""
    # pylint: disable-next=protected-access
    return str(dataset._doc.id)


@pytest.fixture(name="sample_ids")
def fixture_sample_ids(dataset):
    """Returns sample IDs in deterministic insertion order."""
    return [str(sample.id) for sample in dataset.iter_samples()]


@pytest.fixture(name="sample_temporal_tags_endpoint")
def fixture_sample_temporal_tags_endpoint():
    """Returns the sample temporal tags endpoint instance."""
    return fomr.SampleTemporalTagsEndpoint(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="sample_temporal_tag_endpoint")
def fixture_sample_temporal_tag_endpoint():
    """Returns the sample temporal tag item endpoint instance."""
    return fomr.SampleTemporalTagEndpoint(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="temporal_tags_endpoint")
def fixture_temporal_tags_endpoint():
    """Returns the dataset temporal tags endpoint instance."""
    return fomr.TemporalTagsEndpoint(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="temporal_tag_counts_endpoint")
def fixture_temporal_tag_counts_endpoint():
    """Returns the temporal tag counts endpoint instance."""
    return fomr.TemporalTagCountsEndpoint(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


def _make_request(
    dataset_id,
    sample_id=None,
    tag_id=None,
    query_params=None,
    body=None,
):
    request = MagicMock()
    request.path_params = {"dataset_id": dataset_id}
    if sample_id is not None:
        request.path_params["sample_id"] = sample_id
    if tag_id is not None:
        request.path_params["tag_id"] = tag_id

    request.query_params = QueryParams(query_params or {})
    payload = {} if body is None else body
    request.body = AsyncMock(return_value=json.dumps(payload).encode())
    return request


def _json_body(response):
    return json.loads(response.body.decode("utf-8"))


def _modified_timestamps(dataset, sample_id):
    dataset.reload()
    dataset_doc = foo.get_db_conn().datasets.find_one({"_id": dataset._doc.id})
    sample_doc = dataset._sample_collection.find_one(
        {"_id": ObjectId(sample_id)}
    )

    return dataset_doc["last_modified_at"], sample_doc["last_modified_at"]


def _dataset_last_modified_at(dataset):
    dataset.reload()
    dataset_doc = foo.get_db_conn().datasets.find_one({"_id": dataset._doc.id})

    return dataset_doc["last_modified_at"]


class TestMultimodalTemporalTagsRoute:
    """Tests for the multimodal temporal tag collection route."""

    @pytest.mark.asyncio
    async def test_sample_scoped_create_list_and_delete_temporal_tags(
        self,
        sample_temporal_tags_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        before_post = _modified_timestamps(dataset, sample_ids[0])
        await asyncio.sleep(0.05)

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            body={
                "start": 0,
                "end": 10,
                "tag": "review",
                "anchor": "camera_front",
                "created_by": "alice",
            },
        )

        response = await sample_temporal_tags_endpoint.post(request)
        created = _json_body(response)["temporal_tags"]
        after_post = _modified_timestamps(dataset, sample_ids[0])

        assert len(created) == 1
        assert created[0]["id"]
        assert created[0]["sample_id"] == sample_ids[0]
        assert created[0]["tag"] == "review"
        assert created[0]["anchor"] == "camera_front"
        assert created[0]["created_by"] == "alice"
        assert created[0]["last_modified_by"] == "alice"
        assert isinstance(created[0]["created_at"], str)
        assert isinstance(created[0]["last_modified_at"], str)
        assert after_post[0] > before_post[0]
        assert after_post[1] > before_post[1]

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            query_params={
                "anchor": "camera_front",
            },
        )
        await asyncio.sleep(0.05)
        response = await sample_temporal_tags_endpoint.get(request)
        listed = _json_body(response)["temporal_tags"]
        after_get = _modified_timestamps(dataset, sample_ids[0])

        assert listed == created
        assert after_get == after_post

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            body={"ids": [created[0]["id"]]},
        )
        await asyncio.sleep(0.05)
        response = await sample_temporal_tags_endpoint.delete(request)
        after_delete = _modified_timestamps(dataset, sample_ids[0])

        assert _json_body(response) == {"deleted": 1}
        assert after_delete[0] > after_get[0]
        assert after_delete[1] > after_get[1]

        request = _make_request(dataset_id, sample_id=sample_ids[0])
        response = await sample_temporal_tags_endpoint.get(request)

        assert _json_body(response)["temporal_tags"] == []

    @pytest.mark.asyncio
    async def test_lists_sample_temporal_tags_with_optional_range(
        self,
        sample_temporal_tags_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        fomt.add_temporal_tags(
            dataset,
            [
                fomt.TemporalTag(
                    sample_ids[0], 0, 10, "clip", kind=fomt.TagKind.TEMPORAL
                ),
                fomt.TemporalTag(
                    sample_ids[0],
                    30,
                    40,
                    "outside",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[1],
                    5,
                    15,
                    "other-sample",
                    kind=fomt.TagKind.TEMPORAL,
                ),
            ],
        )

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            query_params={"start": "5", "end": "15"},
        )
        response = await sample_temporal_tags_endpoint.get(request)
        temporal_tags = _json_body(response)["temporal_tags"]

        assert len(temporal_tags) == 1
        assert temporal_tags[0]["sample_id"] == sample_ids[0]
        assert temporal_tags[0]["tag"] == "clip"

    @pytest.mark.asyncio
    async def test_updates_sample_temporal_tag(
        self,
        sample_temporal_tag_endpoint,
        sample_temporal_tags_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        created = fomt.add_temporal_tags(
            dataset,
            fomt.TemporalTag(
                sample_ids[0],
                0,
                10,
                "review",
                created_by="alice",
                kind=fomt.TagKind.TEMPORAL,
            ),
        )[0]
        before_patch = _modified_timestamps(dataset, sample_ids[0])

        await asyncio.sleep(0.05)
        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            tag_id=created.id,
            body={
                "id": created.id,
                "start": 5,
                "end": 15,
                "tag": "accepted",
                "last_modified_by": "bob",
            },
        )
        response = await sample_temporal_tag_endpoint.patch(request)
        updated = _json_body(response)["temporal_tag"]
        after_patch = _modified_timestamps(dataset, sample_ids[0])

        assert updated["id"] == created.id
        assert updated["sample_id"] == sample_ids[0]
        assert updated["start"] == 5
        assert updated["end"] == 15
        assert updated["tag"] == "accepted"
        assert updated["created_by"] == "alice"
        assert updated["last_modified_by"] == "bob"
        assert updated["created_at"] == created.created_at.isoformat()
        assert (
            updated["last_modified_at"] > created.last_modified_at.isoformat()
        )
        assert after_patch[0] > before_patch[0]
        assert after_patch[1] > before_patch[1]

        request = _make_request(dataset_id, sample_id=sample_ids[0])
        response = await sample_temporal_tags_endpoint.get(request)

        assert _json_body(response)["temporal_tags"] == [updated]

    @pytest.mark.asyncio
    async def test_lists_scene_temporal_tags_with_optional_range(
        self,
        temporal_tags_endpoint,
        temporal_tag_counts_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        fomt.add_temporal_tags(
            dataset,
            [
                fomt.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "clip",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "clip",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[2],
                    30,
                    40,
                    "outside",
                    kind=fomt.TagKind.TEMPORAL,
                ),
            ],
        )

        before_get = _dataset_last_modified_at(dataset)
        await asyncio.sleep(0.05)
        request = _make_request(
            dataset_id,
            query_params={"start": "5", "end": "15"},
        )
        response = await temporal_tags_endpoint.get(request)
        temporal_tags = _json_body(response)["temporal_tags"]
        after_get = _dataset_last_modified_at(dataset)

        assert [tag["sample_id"] for tag in temporal_tags] == sample_ids[:2]
        assert [tag["tag"] for tag in temporal_tags] == ["clip", "clip"]
        assert after_get == before_get

        await asyncio.sleep(0.05)
        request = _make_request(
            dataset_id,
            query_params={"start": "5", "end": "15"},
        )
        response = await temporal_tag_counts_endpoint.get(request)
        after_counts = _dataset_last_modified_at(dataset)

        assert _json_body(response)["counts"] == {"clip": 2}
        assert after_counts == after_get

    @pytest.mark.asyncio
    async def test_lists_tag_hits_across_samples_and_counts_all_tags(
        self,
        temporal_tags_endpoint,
        temporal_tag_counts_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        fomt.add_temporal_tags(
            dataset,
            [
                fomt.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "candidate",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "candidate",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[2],
                    20,
                    30,
                    "review",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[2],
                    30,
                    40,
                    "other",
                    kind=fomt.TagKind.TEMPORAL,
                ),
            ],
        )

        request = _make_request(
            dataset_id,
            query_params={"tags": "candidate,review"},
        )
        response = await temporal_tags_endpoint.get(request)
        temporal_tags = _json_body(response)["temporal_tags"]

        assert [
            (tag["sample_id"], tag["start"], tag["end"], tag["tag"])
            for tag in temporal_tags
        ] == [
            (sample_ids[0], 0, 10, "candidate"),
            (sample_ids[1], 10, 20, "candidate"),
            (sample_ids[2], 20, 30, "review"),
        ]

        request = _make_request(dataset_id)
        response = await temporal_tag_counts_endpoint.get(request)

        assert _json_body(response)["counts"] == {
            "candidate": 2,
            "other": 1,
            "review": 1,
        }

    @pytest.mark.asyncio
    async def test_bulk_create_and_delete_by_filter(
        self, sample_temporal_tags_endpoint, dataset_id, sample_ids
    ):
        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            body={
                "temporal_tags": [
                    {
                        "start": 0,
                        "end": 10,
                        "tag": "candidate",
                        "anchor": "camera_front",
                    },
                    {
                        "start": 0,
                        "end": 10,
                        "tag": "candidate",
                        "anchor": "camera_rear",
                    },
                ]
            },
        )

        response = await sample_temporal_tags_endpoint.post(request)

        assert len(_json_body(response)["temporal_tags"]) == 2

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            body={
                "filter": {
                    "anchors": "camera_front",
                }
            },
        )
        response = await sample_temporal_tags_endpoint.delete(request)

        assert _json_body(response) == {"deleted": 1}

        request = _make_request(dataset_id, sample_id=sample_ids[0])
        response = await sample_temporal_tags_endpoint.get(request)
        remaining = _json_body(response)["temporal_tags"]

        assert len(remaining) == 1
        assert remaining[0]["sample_id"] == sample_ids[0]
        assert remaining[0]["anchor"] == "camera_rear"

    @pytest.mark.asyncio
    async def test_delete_all_is_sample_scoped(
        self,
        sample_temporal_tags_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        fomt.add_temporal_tags(
            dataset,
            [
                fomt.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "first",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[0],
                    10,
                    20,
                    "second",
                    kind=fomt.TagKind.TEMPORAL,
                ),
                fomt.TemporalTag(
                    sample_ids[1],
                    0,
                    10,
                    "other",
                    kind=fomt.TagKind.TEMPORAL,
                ),
            ],
        )

        request = _make_request(
            dataset_id,
            sample_id=sample_ids[0],
            body={"delete_all": True},
        )
        response = await sample_temporal_tags_endpoint.delete(request)

        assert _json_body(response) == {"deleted": 2}
        assert fomt.count_temporal_tags(dataset) == {"other": 1}
        assert [tag.sample_id for tag in fomt.list_temporal_tags(dataset)] == [
            sample_ids[1]
        ]

    @pytest.mark.asyncio
    async def test_validation_errors_return_400(
        self,
        sample_temporal_tags_endpoint,
        sample_temporal_tag_endpoint,
        temporal_tags_endpoint,
        temporal_tag_counts_endpoint,
        dataset,
        dataset_id,
        sample_ids,
    ):
        temporal_tag = fomt.add_temporal_tags(
            dataset,
            fomt.TemporalTag(
                sample_ids[0],
                0,
                10,
                "review",
                kind=fomt.TagKind.TEMPORAL,
            ),
        )[0]
        cases = [
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    body={"temporal_tags": []},
                ),
            ),
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=str(ObjectId()),
                    body={
                        "start": 0,
                        "end": 10,
                        "tag": "missing-sample",
                    },
                ),
            ),
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    body={
                        "start": 10,
                        "end": 10,
                        "tag": "bad-range",
                    },
                ),
            ),
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    body={
                        "index_type": 0,
                        "start": 0,
                        "end": 10,
                        "tag": "bad-index-type",
                    },
                ),
            ),
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    body={
                        "sample_id": sample_ids[1],
                        "start": 0,
                        "end": 10,
                        "tag": "wrong-sample",
                    },
                ),
            ),
            (
                sample_temporal_tags_endpoint.post,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    body={
                        "created_at": "2026-01-01T00:00:00",
                        "start": 0,
                        "end": 10,
                        "tag": "response-only-created-at",
                    },
                ),
            ),
            (
                sample_temporal_tags_endpoint.delete,
                _make_request(dataset_id, sample_id=sample_ids[0]),
            ),
            (
                sample_temporal_tag_endpoint.patch,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    tag_id=temporal_tag.id,
                ),
            ),
            (
                sample_temporal_tag_endpoint.patch,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    tag_id=temporal_tag.id,
                    body={
                        "id": str(ObjectId()),
                        "start": 1,
                    },
                ),
            ),
            (
                sample_temporal_tag_endpoint.patch,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    tag_id=temporal_tag.id,
                    body={
                        "sample_id": sample_ids[1],
                        "start": 1,
                    },
                ),
            ),
            (
                sample_temporal_tag_endpoint.patch,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    tag_id=temporal_tag.id,
                    body={
                        "created_by": "alice",
                        "start": 1,
                    },
                ),
            ),
            (
                sample_temporal_tag_endpoint.patch,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    tag_id=temporal_tag.id,
                    body={
                        "anchor": "camera_front",
                        "start": 1,
                    },
                ),
            ),
            (
                temporal_tags_endpoint.get,
                _make_request(dataset_id, query_params={"start": "soon"}),
            ),
            (
                sample_temporal_tags_endpoint.get,
                _make_request(
                    dataset_id,
                    sample_id=sample_ids[0],
                    query_params={"sample_id": sample_ids[1]},
                ),
            ),
            (
                temporal_tag_counts_endpoint.get,
                _make_request(
                    dataset_id, query_params={"sample_id": sample_ids[0]}
                ),
            ),
        ]

        for endpoint, request in cases:
            with pytest.raises(HTTPException) as exc_info:
                await endpoint(request)

            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_temporal_tag_update_not_found_returns_404(
        self, sample_temporal_tag_endpoint, dataset, dataset_id, sample_ids
    ):
        temporal_tag = fomt.add_temporal_tags(
            dataset,
            fomt.TemporalTag(
                sample_ids[0],
                0,
                10,
                "review",
                kind=fomt.TagKind.TEMPORAL,
            ),
        )[0]

        cases = [
            _make_request(
                dataset_id,
                sample_id=sample_ids[0],
                tag_id=str(ObjectId()),
                body={"start": 1},
            ),
            _make_request(
                dataset_id,
                sample_id=sample_ids[1],
                tag_id=temporal_tag.id,
                body={"start": 1},
            ),
        ]

        for request in cases:
            with pytest.raises(HTTPException) as exc_info:
                await sample_temporal_tag_endpoint.patch(request)

            assert exc_info.value.status_code == 404

        persisted = fomt.list_temporal_tags(dataset)
        assert [(tag.start, tag.end, tag.tag) for tag in persisted] == [
            (0, 10, "review")
        ]

    @pytest.mark.asyncio
    async def test_dataset_not_found_returns_404(self, temporal_tags_endpoint):
        request = _make_request("missing-dataset")

        with pytest.raises(HTTPException) as exc_info:
            await temporal_tags_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert "Dataset 'missing-dataset' not found" in exc_info.value.detail

    def test_multimodal_routes_register_temporal_tag_endpoints(self):
        routes = dict(fomr.MultimodalRoutes)
        tag_routes = [
            (path, endpoint)
            for path, endpoint in fomr.MultimodalRoutes
            if "/tags" in path
        ]

        assert tag_routes == [
            (
                "/dataset/{dataset_id}/sample/{sample_id}/tags/{tag_id}",
                fomr.SampleTemporalTagEndpoint,
            ),
            (
                "/dataset/{dataset_id}/sample/{sample_id}/tags",
                fomr.SampleTemporalTagsEndpoint,
            ),
            (
                "/dataset/{dataset_id}/tags/counts",
                fomr.TemporalTagCountsEndpoint,
            ),
            (
                "/dataset/{dataset_id}/tags",
                fomr.TemporalTagsEndpoint,
            ),
        ]
        assert (
            routes["/dataset/{dataset_id}/tags"] is fomr.TemporalTagsEndpoint
        )
        assert (
            routes["/dataset/{dataset_id}/tags/counts"]
            is fomr.TemporalTagCountsEndpoint
        )
        assert not hasattr(fomr.TemporalTagsEndpoint, "post")
        assert not hasattr(fomr.TemporalTagsEndpoint, "delete")
        assert not hasattr(fomr.TemporalTagCountsEndpoint, "post")
