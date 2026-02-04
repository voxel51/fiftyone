"""
FiftyOne Server camera route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
from fiftyone.core.camera import (
    DEFAULT_TRANSFORM_TARGET_FRAME,
    PinholeCameraIntrinsics,
    StaticTransform,
)
import fiftyone.server.routes.camera as forc
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True

    sample = fo.Sample(filepath="/tmp/test_camera.jpg")
    dataset.add_sample(sample)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    """Returns the ID of the dataset."""
    # pylint: disable-next=protected-access
    return dataset._doc.id


@pytest.fixture(name="sample_id")
def fixture_sample_id(dataset):
    """Returns the ID of a sample in the dataset."""
    return str(dataset.first().id)


@pytest.fixture(name="intrinsics_endpoint")
def fixture_intrinsics_endpoint():
    """Returns the CameraIntrinsics endpoint instance."""
    return forc.CameraIntrinsics(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="transform_endpoint")
def fixture_transform_endpoint():
    """Returns the StaticTransforms endpoint instance."""
    return forc.StaticTransforms(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="batch_intrinsics_endpoint")
def fixture_batch_intrinsics_endpoint():
    """Returns the BatchCameraIntrinsics endpoint instance."""
    return forc.BatchCameraIntrinsics(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="batch_transform_endpoint")
def fixture_batch_transform_endpoint():
    """Returns the BatchStaticTransforms endpoint instance."""
    return forc.BatchStaticTransforms(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_request")
def fixture_mock_request(dataset_id, sample_id):
    """Helper to create a mock request object."""

    def _create_request(
        dataset_id_override=None,
        sample_id_override=None,
        query_params=None,
    ):
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": dataset_id_override or dataset_id,
            "sample_id": sample_id_override or sample_id,
        }
        mock_request.query_params = query_params or {}
        return mock_request

    return _create_request


@pytest.fixture(name="mock_batch_request")
def fixture_mock_batch_request(dataset_id):
    """Helper to create a mock request object for batch endpoints."""

    def _create_request(
        dataset_id_override=None,
        query_params=None,
    ):
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": dataset_id_override or dataset_id,
        }
        mock_request.query_params = query_params or {}
        return mock_request

    return _create_request


@pytest.fixture(name="multi_sample_dataset")
def fixture_multi_sample_dataset():
    """Creates a dataset with multiple samples for batch endpoint tests."""
    dataset = fo.Dataset()
    dataset.persistent = True

    samples = [
        fo.Sample(filepath=f"/tmp/test_camera_{i}.jpg") for i in range(3)
    ]
    dataset.add_samples(samples)

    # Add both intrinsics and transform to first sample
    sample = dataset.first()
    sample["camera_intrinsics"] = PinholeCameraIntrinsics(
        fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
    )
    sample["static_transforms"] = StaticTransform(
        translation=[1.0, 2.0, 3.0],
        quaternion=[0.0, 0.0, 0.0, 1.0],
        source_frame="camera",
        target_frame=DEFAULT_TRANSFORM_TARGET_FRAME,
    )
    sample.save()

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="multi_sample_ids")
def fixture_multi_sample_ids(multi_sample_dataset):
    """Returns sample IDs from multi-sample dataset."""
    return [str(s.id) for s in multi_sample_dataset]


@pytest.fixture(name="multi_dataset_id")
def fixture_multi_dataset_id(multi_sample_dataset):
    """Returns the ID of the multi-sample dataset."""
    # pylint: disable-next=protected-access
    return multi_sample_dataset._doc.id


class TestCameraIntrinsicsRoute:
    """Tests for CameraIntrinsics endpoint."""

    @pytest.mark.asyncio
    async def test_get_intrinsics_success(
        self, intrinsics_endpoint, mock_request, dataset
    ):
        """Tests successfully retrieving camera intrinsics."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        sample = dataset.first()
        sample["camera_intrinsics"] = intrinsics
        sample.save()

        request = mock_request()
        response = await intrinsics_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "intrinsics" in data
        assert data["intrinsics"] is not None
        assert data["intrinsics"]["fx"] == 1000.0
        assert data["intrinsics"]["fy"] == 1000.0

    @pytest.mark.asyncio
    async def test_get_intrinsics_returns_null(
        self, intrinsics_endpoint, mock_request, dataset
    ):
        """Tests that null is returned when no intrinsics exist."""
        request = mock_request()
        response = await intrinsics_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "intrinsics" in data
        assert data["intrinsics"] is None

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, intrinsics_endpoint, mock_request):
        """Tests that 404 is raised for non-existent dataset."""
        request = mock_request(dataset_id_override="non-existent-dataset")

        with pytest.raises(HTTPException) as exc_info:
            await intrinsics_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert (
            "Dataset 'non-existent-dataset' not found" in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_sample_not_found(
        self, intrinsics_endpoint, mock_request, dataset
    ):
        """Tests that 404 is raised for non-existent sample."""
        from bson import ObjectId

        bad_sample_id = str(ObjectId())
        request = mock_request(sample_id_override=bad_sample_id)

        with pytest.raises(HTTPException) as exc_info:
            await intrinsics_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert f"Sample '{bad_sample_id}' not found" in exc_info.value.detail


class TestStaticTransformsRoute:
    """Tests for StaticTransforms endpoint."""

    @pytest.mark.asyncio
    async def test_get_transform_success(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests successfully retrieving camera transform."""
        transform = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )
        sample = dataset.first()
        sample["static_transforms"] = transform
        sample.save()

        # Need to query with matching source/target frames
        request = mock_request(
            query_params={
                "source_frame": "camera",
                "target_frame": DEFAULT_TRANSFORM_TARGET_FRAME,
            }
        )
        response = await transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "transform" in data
        assert data["transform"] is not None

    @pytest.mark.asyncio
    async def test_get_transform_returns_null(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests that null is returned when no transform exist."""
        request = mock_request()
        response = await transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "transform" in data
        assert data["transform"] is None

    @pytest.mark.asyncio
    async def test_get_transform_with_query_params(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests transform retrieval with source_frame and target_frame."""
        request = mock_request(
            query_params={
                "source_frame": "camera",
                "target_frame": DEFAULT_TRANSFORM_TARGET_FRAME,
            }
        )
        response = await transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "transform" in data

    @pytest.mark.asyncio
    async def test_get_transform_with_chain_via(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests transform retrieval with chain_via parameter."""
        request = mock_request(
            query_params={
                "source_frame": "camera",
                "target_frame": "world",
                "chain_via": "lidar, vehicle",
            }
        )
        response = await transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "transform" in data

    @pytest.mark.asyncio
    async def test_get_transform_chain_via_parsing(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests that chain_via is correctly parsed from comma-separated string."""
        # This test verifies the parsing logic by checking behavior with
        # whitespace-padded values
        request = mock_request(
            query_params={
                "chain_via": "  frame1  ,  frame2  ,  ",  # Extra whitespace
            }
        )
        # Should not raise an error - parsing should handle whitespace
        response = await transform_endpoint.get(request)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, transform_endpoint, mock_request):
        """Tests that 404 is raised for non-existent dataset."""
        request = mock_request(dataset_id_override="non-existent-dataset")

        with pytest.raises(HTTPException) as exc_info:
            await transform_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert (
            "Dataset 'non-existent-dataset' not found" in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_sample_not_found(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests that 404 is raised for non-existent sample."""
        from bson import ObjectId

        bad_sample_id = str(ObjectId())
        request = mock_request(sample_id_override=bad_sample_id)

        with pytest.raises(HTTPException) as exc_info:
            await transform_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert f"Sample '{bad_sample_id}' not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_invalid_chain_via_raises_400(
        self, transform_endpoint, mock_request, dataset
    ):
        """Tests that ValueError from resolve_transformation raises 400."""
        request = mock_request(
            query_params={
                "source_frame": "camera",
                "target_frame": "world",
                "chain_via": "invalid_frame",
            }
        )

        # Mock resolve_transformation to raise ValueError
        with patch.object(
            fo.Dataset,
            "resolve_transformation",
            side_effect=ValueError("Frames don't chain properly"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await transform_endpoint.get(request)

            assert exc_info.value.status_code == 400
            assert "Frames don't chain properly" in exc_info.value.detail


class TestBatchCameraIntrinsicsRoute:
    """Tests for BatchCameraIntrinsics endpoint."""

    @pytest.mark.asyncio
    async def test_batch_intrinsics_success(
        self,
        batch_intrinsics_endpoint,
        mock_batch_request,
        multi_sample_dataset,
        multi_sample_ids,
        multi_dataset_id,
    ):
        """Tests successfully retrieving batch intrinsics."""
        request = mock_batch_request(
            dataset_id_override=multi_dataset_id,
            query_params={"sample_ids": ",".join(multi_sample_ids)},
        )
        response = await batch_intrinsics_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "results" in data
        assert len(data["results"]) == 3

        # First sample has intrinsics
        first_result = data["results"][multi_sample_ids[0]]
        assert "intrinsics" in first_result
        assert first_result["intrinsics"] is not None

        # Other samples have null intrinsics
        for sample_id in multi_sample_ids[1:]:
            assert data["results"][sample_id]["intrinsics"] is None

    @pytest.mark.asyncio
    async def test_batch_intrinsics_missing_param(
        self, batch_intrinsics_endpoint, mock_batch_request
    ):
        """Tests that 400 is raised when sample_ids is missing."""
        request = mock_batch_request(query_params={})

        with pytest.raises(HTTPException) as exc_info:
            await batch_intrinsics_endpoint.get(request)

        assert exc_info.value.status_code == 400
        assert (
            "Missing required query parameter 'sample_ids'"
            in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_batch_intrinsics_empty_param(
        self, batch_intrinsics_endpoint, mock_batch_request
    ):
        """Tests that 400 is raised when sample_ids is empty."""
        request = mock_batch_request(query_params={"sample_ids": "  ,  ,  "})

        with pytest.raises(HTTPException) as exc_info:
            await batch_intrinsics_endpoint.get(request)

        assert exc_info.value.status_code == 400
        assert "No valid sample IDs provided" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_batch_intrinsics_partial_missing_samples(
        self,
        batch_intrinsics_endpoint,
        mock_batch_request,
        multi_sample_dataset,
        multi_sample_ids,
        multi_dataset_id,
    ):
        """Tests that missing samples return error in results, not raise."""
        from bson import ObjectId

        bad_id = str(ObjectId())
        sample_ids = multi_sample_ids + [bad_id]

        request = mock_batch_request(
            dataset_id_override=multi_dataset_id,
            query_params={"sample_ids": ",".join(sample_ids)},
        )
        response = await batch_intrinsics_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "results" in data

        # Valid samples should have results
        assert "intrinsics" in data["results"][multi_sample_ids[0]]

        # Missing sample should have error
        assert "error" in data["results"][bad_id]
        assert (
            f"Sample '{bad_id}' not found" in data["results"][bad_id]["error"]
        )

    @pytest.mark.asyncio
    async def test_batch_intrinsics_dataset_not_found(
        self, batch_intrinsics_endpoint, mock_batch_request
    ):
        """Tests that 404 is raised for non-existent dataset."""
        request = mock_batch_request(
            dataset_id_override="non-existent-dataset",
            query_params={"sample_ids": "sample1,sample2"},
        )

        with pytest.raises(HTTPException) as exc_info:
            await batch_intrinsics_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert (
            "Dataset 'non-existent-dataset' not found" in exc_info.value.detail
        )


class TestBatchStaticTransformsRoute:
    """Tests for BatchStaticTransforms endpoint."""

    @pytest.mark.asyncio
    async def test_batch_transform_success(
        self,
        batch_transform_endpoint,
        mock_batch_request,
        multi_sample_dataset,
        multi_sample_ids,
        multi_dataset_id,
    ):
        """Tests successfully retrieving batch transform."""
        # Need to query with matching source/target frames
        request = mock_batch_request(
            dataset_id_override=multi_dataset_id,
            query_params={
                "sample_ids": ",".join(multi_sample_ids),
                "source_frame": "camera",
                "target_frame": "world",
            },
        )
        response = await batch_transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "results" in data
        assert len(data["results"]) == 3

        # First sample has transform
        first_result = data["results"][multi_sample_ids[0]]
        assert "transform" in first_result
        assert first_result["transform"] is not None

        # Other samples have null transform
        for sample_id in multi_sample_ids[1:]:
            assert data["results"][sample_id]["transform"] is None

    @pytest.mark.asyncio
    async def test_batch_transform_with_query_params(
        self,
        batch_transform_endpoint,
        mock_batch_request,
        multi_sample_dataset,
        multi_sample_ids,
        multi_dataset_id,
    ):
        """Tests batch transform with source_frame, target_frame, chain_via."""
        request = mock_batch_request(
            dataset_id_override=multi_dataset_id,
            query_params={
                "sample_ids": ",".join(multi_sample_ids),
                "source_frame": "camera",
                "target_frame": "world",
                "chain_via": "lidar,vehicle",
            },
        )
        response = await batch_transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "results" in data

    @pytest.mark.asyncio
    async def test_batch_transform_missing_param(
        self, batch_transform_endpoint, mock_batch_request
    ):
        """Tests that 400 is raised when sample_ids is missing."""
        request = mock_batch_request(query_params={})

        with pytest.raises(HTTPException) as exc_info:
            await batch_transform_endpoint.get(request)

        assert exc_info.value.status_code == 400
        assert (
            "Missing required query parameter 'sample_ids'"
            in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_batch_transform_empty_param(
        self, batch_transform_endpoint, mock_batch_request
    ):
        """Tests that 400 is raised when sample_ids is empty."""
        request = mock_batch_request(query_params={"sample_ids": ""})

        with pytest.raises(HTTPException) as exc_info:
            await batch_transform_endpoint.get(request)

        assert exc_info.value.status_code == 400
        assert (
            "Missing required query parameter 'sample_ids'"
            in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_batch_transform_partial_missing_samples(
        self,
        batch_transform_endpoint,
        mock_batch_request,
        multi_sample_dataset,
        multi_sample_ids,
        multi_dataset_id,
    ):
        """Tests that missing samples return error in results."""
        from bson import ObjectId

        bad_id = str(ObjectId())
        sample_ids = multi_sample_ids + [bad_id]

        request = mock_batch_request(
            dataset_id_override=multi_dataset_id,
            query_params={"sample_ids": ",".join(sample_ids)},
        )
        response = await batch_transform_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "results" in data

        # Valid samples should have results
        assert "transform" in data["results"][multi_sample_ids[0]]

        # Missing sample should have error
        assert "error" in data["results"][bad_id]
        assert (
            f"Sample '{bad_id}' not found" in data["results"][bad_id]["error"]
        )

    @pytest.mark.asyncio
    async def test_batch_transform_dataset_not_found(
        self, batch_transform_endpoint, mock_batch_request
    ):
        """Tests that 404 is raised for non-existent dataset."""
        request = mock_batch_request(
            dataset_id_override="non-existent-dataset",
            query_params={"sample_ids": "sample1,sample2"},
        )

        with pytest.raises(HTTPException) as exc_info:
            await batch_transform_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert (
            "Dataset 'non-existent-dataset' not found" in exc_info.value.detail
        )


class TestHelperFunctions:
    """Tests for helper functions in the camera routes module."""

    def test_parse_sample_ids_success(self):
        """Tests successful parsing of sample_ids."""
        mock_request = MagicMock()
        mock_request.query_params = {"sample_ids": "id1,id2,id3"}

        result = forc._parse_sample_ids(mock_request)

        assert result == ["id1", "id2", "id3"]

    def test_parse_sample_ids_with_whitespace(self):
        """Tests parsing sample_ids with whitespace."""
        mock_request = MagicMock()
        mock_request.query_params = {"sample_ids": "  id1  ,  id2  ,  id3  "}

        result = forc._parse_sample_ids(mock_request)

        assert result == ["id1", "id2", "id3"]

    def test_parse_sample_ids_missing_param(self):
        """Tests that HTTPException is raised when param is missing."""
        mock_request = MagicMock()
        mock_request.query_params = {}

        with pytest.raises(HTTPException) as exc_info:
            forc._parse_sample_ids(mock_request)

        assert exc_info.value.status_code == 400
        assert (
            "Missing required query parameter 'sample_ids'"
            in exc_info.value.detail
        )

    def test_parse_sample_ids_empty_string(self):
        """Tests that HTTPException is raised for empty string."""
        mock_request = MagicMock()
        mock_request.query_params = {"sample_ids": ""}

        with pytest.raises(HTTPException) as exc_info:
            forc._parse_sample_ids(mock_request)

        assert exc_info.value.status_code == 400
        assert (
            "Missing required query parameter 'sample_ids'"
            in exc_info.value.detail
        )

    def test_parse_sample_ids_only_whitespace(self):
        """Tests that HTTPException is raised for whitespace-only values."""
        mock_request = MagicMock()
        mock_request.query_params = {"sample_ids": "  ,  ,  "}

        with pytest.raises(HTTPException) as exc_info:
            forc._parse_sample_ids(mock_request)

        assert exc_info.value.status_code == 400
        assert "No valid sample IDs provided" in exc_info.value.detail

    def test_get_dataset_success(self, dataset, dataset_id):
        """Tests successful dataset retrieval."""
        result = get_dataset(dataset_id)
        assert result.name == dataset.name

    def test_get_dataset_not_found(self):
        """Tests that HTTPException is raised for non-existent dataset."""
        with pytest.raises(HTTPException) as exc_info:
            get_dataset("non-existent-id")

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail

    def test_get_sample_success(self, dataset, sample_id):
        """Tests successful sample retrieval."""
        sample = get_sample_from_dataset(dataset, sample_id)
        assert str(sample.id) == sample_id

    def test_get_sample_not_found(self, dataset):
        """Tests that HTTPException is raised for non-existent sample."""
        from bson import ObjectId

        bad_id = str(ObjectId())

        with pytest.raises(HTTPException) as exc_info:
            get_sample_from_dataset(dataset, bad_id)

        assert exc_info.value.status_code == 404
        assert f"Sample '{bad_id}' not found" in exc_info.value.detail
