"""
FiftyOne Server groups route unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import MagicMock, AsyncMock

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.server.routes.groups as forg


@pytest.fixture(name="grouped_dataset")
def fixture_grouped_dataset():
    """Creates a persistent grouped dataset for testing."""
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="center")
    dataset.persistent = True

    group = fo.Group()
    samples = [
        fo.Sample(
            filepath=f"/tmp/test_{slice_name}.jpg",
            group=group.element(slice_name),
            metadata=fo.ImageMetadata(width=100, height=200),
            tags=[slice_name],
        )
        for slice_name in ["left", "center", "right"]
    ]
    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(grouped_dataset):
    """Returns the ID of the grouped dataset."""
    # pylint: disable-next=protected-access
    return grouped_dataset._doc.id


@pytest.fixture(name="group_id")
def fixture_group_id(grouped_dataset):
    """Returns the ID of a group in the dataset."""
    sample = grouped_dataset.first()
    return sample.group.id


@pytest.fixture(name="groups_endpoint")
def fixture_groups_endpoint():
    """Returns the Groups endpoint instance."""
    return forg.Groups(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_request")
def fixture_mock_request(dataset_id, group_id):
    """Helper to create a mock request object."""

    def _create_request(
        slice_name=None, fields=None, resolve_urls=False, media_type=None
    ):
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": dataset_id,
            "group_id": group_id,
        }
        if slice_name:
            mock_request.path_params["slice"] = slice_name

        mock_request.query_params = {}
        if fields:
            mock_request.query_params["fields"] = fields
        if resolve_urls:
            mock_request.query_params["resolve_urls"] = "true"
        if media_type:
            mock_request.query_params["media_type"] = media_type

        return mock_request

    return _create_request


class TestGroupsRoute:
    """Tests for groups routes"""

    @pytest.mark.asyncio
    async def test_get_group_all_fields(
        self, groups_endpoint, mock_request, grouped_dataset
    ):
        """Tests retrieving a group with all fields."""
        request = mock_request()
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert isinstance(data["group"], dict)
        assert len(data["group"]) == 3
        assert "left" in data["group"]
        assert "center" in data["group"]
        assert "right" in data["group"]

        # Check that each slice has required fields
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data
            assert "_id" not in sample_data
            assert "filepath" in sample_data
            assert "metadata" in sample_data
            assert "tags" in sample_data
            assert "created_at" in sample_data
            assert "last_modified_at" in sample_data

    @pytest.mark.asyncio
    async def test_get_group_with_field_filtering(
        self, groups_endpoint, mock_request
    ):
        """Tests retrieving a group with field filtering."""
        request = mock_request(fields="filepath,tags")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data

        # Check that only requested fields are present
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data  # id should always be present
            assert "filepath" in sample_data
            assert "tags" in sample_data
            # Should not have other fields (except id)
            assert "metadata" not in sample_data
            assert "created_at" not in sample_data
            assert "last_modified_at" not in sample_data

    @pytest.mark.asyncio
    async def test_get_group_with_nested_field_filtering(
        self, groups_endpoint, mock_request
    ):
        """Tests retrieving a group with nested field filtering."""
        request = mock_request(fields="metadata.width,metadata.height")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data

        # Check that nested fields are filtered correctly
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data  # id should always be present
            assert "metadata" in sample_data
            metadata = sample_data["metadata"]
            assert "width" in metadata
            assert "height" in metadata
            # Should not have other metadata fields if they exist
            if isinstance(metadata, dict):
                assert metadata["width"] == 100
                assert metadata["height"] == 200

    @pytest.mark.asyncio
    async def test_get_group_with_resolve_urls(
        self, groups_endpoint, mock_request, grouped_dataset
    ):
        """Tests retrieving a group with URL resolution."""
        request = mock_request(resolve_urls=True)
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert "urls" in data
        assert isinstance(data["urls"], dict)

        # Check that filepaths are extracted
        for slice_name in ["left", "center", "right"]:
            # URLs should be prefixed with slice name when multiple slices exist
            url_key = f"{slice_name}.filepath"
            assert url_key in data["urls"]
            expected_filepath = data["group"][slice_name]["filepath"]
            assert data["urls"][url_key] == expected_filepath

    @pytest.mark.asyncio
    async def test_get_group_slice(self, groups_endpoint, mock_request):
        """Tests retrieving a specific slice from a group."""
        request = mock_request(slice_name="center")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert len(data["group"]) == 1
        assert "center" in data["group"]
        assert "left" not in data["group"]
        assert "right" not in data["group"]

    @pytest.mark.asyncio
    async def test_get_group_slice_with_field_filtering(
        self, groups_endpoint, mock_request
    ):
        """Tests retrieving a specific slice with field filtering."""
        request = mock_request(slice_name="center", fields="filepath")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert "center" in data["group"]
        sample_data = data["group"]["center"]
        assert "id" in sample_data  # id should always be present
        assert "filepath" in sample_data
        assert "metadata" not in sample_data

    @pytest.mark.asyncio
    async def test_get_group_slice_with_resolve_urls(
        self, groups_endpoint, mock_request, grouped_dataset
    ):
        """Tests retrieving a specific slice with URL resolution."""
        request = mock_request(slice_name="center", resolve_urls=True)
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert "urls" in data
        # When only one slice, URL key should not be prefixed
        assert "filepath" in data["urls"]
        expected_filepath = data["group"]["center"]["filepath"]
        assert data["urls"]["filepath"] == expected_filepath

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, groups_endpoint, mock_request):
        """Tests that a 404 HTTPException is raised for a non-existent dataset."""
        request = mock_request()
        request.path_params["dataset_id"] = "non-existent-dataset"

        with pytest.raises(HTTPException) as exc_info:
            await groups_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert (
            "Dataset 'non-existent-dataset' not found" in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_group_not_found(self, groups_endpoint, mock_request):
        """Tests that a 404 HTTPException is raised for a non-existent group."""
        from bson import ObjectId

        request = mock_request()
        request.path_params["group_id"] = str(ObjectId())

        with pytest.raises(HTTPException) as exc_info:
            await groups_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert "not found in dataset" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_slice_not_found(self, groups_endpoint, mock_request):
        """Tests that a 404 HTTPException is raised for a non-existent slice."""
        request = mock_request(slice_name="nonexistent")

        with pytest.raises(HTTPException) as exc_info:
            await groups_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert "Slice 'nonexistent' not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_non_grouped_dataset(self, groups_endpoint, mock_request):
        """Tests that a 400 HTTPException is raised for a non-grouped dataset."""
        # Create a non-grouped dataset
        dataset = fo.Dataset()
        dataset.persistent = True
        sample = fo.Sample(filepath="/tmp/test.jpg")
        dataset.add_sample(sample)

        try:
            # pylint: disable-next=protected-access
            dataset_id = dataset._doc.id
            request = mock_request()
            request.path_params["dataset_id"] = dataset_id
            # Use a fake group ID
            from bson import ObjectId

            request.path_params["group_id"] = str(ObjectId())

            with pytest.raises(HTTPException) as exc_info:
                await groups_endpoint.get(request)

            assert exc_info.value.status_code == 400
            assert "is not a grouped dataset" in exc_info.value.detail
        finally:
            if fo.dataset_exists(dataset.name):
                fo.delete_dataset(dataset.name)

    @pytest.mark.asyncio
    async def test_empty_fields_param(self, groups_endpoint, mock_request):
        """Tests that empty fields parameter returns all fields."""
        request = mock_request(fields="")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        # Should return all fields (empty fields param is ignored)
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data  # id should always be present
            assert "_id" not in sample_data  # _id should be converted
            assert "filepath" in sample_data
            assert "metadata" in sample_data

    @pytest.mark.asyncio
    async def test_resolve_urls_false(self, groups_endpoint, mock_request):
        """Tests that resolve_urls=false does not include URLs."""
        request = mock_request(resolve_urls=False)
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert "urls" not in data

    @pytest.mark.asyncio
    async def test_complex_field_filtering(
        self, groups_endpoint, mock_request
    ):
        """Tests filtering with multiple fields including nested ones."""
        request = mock_request(fields="filepath,metadata.width,tags")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data

        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data  # id should always be present
            assert "filepath" in sample_data
            assert "tags" in sample_data
            assert "metadata" in sample_data
            assert "width" in sample_data["metadata"]
            # Should not have other metadata fields
            assert "height" not in sample_data["metadata"]

    @pytest.mark.asyncio
    async def test_missing_field_returns_null(
        self, groups_endpoint, mock_request
    ):
        """Tests that missing fields return null (optimistic approach)."""
        request = mock_request(fields="filepath,nonexistent_field")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data

        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data  # id should always be present
            assert "filepath" in sample_data
            assert "nonexistent_field" in sample_data
            assert sample_data["nonexistent_field"] is None

    @pytest.mark.asyncio
    async def test_media_type_filter_single(
        self, groups_endpoint, mock_request
    ):
        """Tests filtering by a single media type."""
        request = mock_request(media_type="image")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        # All slices should be images in our test dataset
        assert len(data["group"]) == 3
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data
            assert sample_data["_media_type"] == "image"

    @pytest.mark.asyncio
    async def test_media_type_filter_multiple(
        self, groups_endpoint, mock_request
    ):
        """Tests filtering by multiple media types."""
        request = mock_request(media_type="image,video")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        # All slices should be images in our test dataset
        assert len(data["group"]) == 3
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data
            assert sample_data["_media_type"] in ("image", "video")

    @pytest.mark.asyncio
    async def test_media_type_filter_no_match(
        self, groups_endpoint, mock_request
    ):
        """Tests that filtering by non-matching media type returns 404."""
        request = mock_request(media_type="video")
        # Our test dataset only has images, so this should return 404

        with pytest.raises(HTTPException) as exc_info:
            await groups_endpoint.get(request)

        assert exc_info.value.status_code == 404
        assert "No slices found with media_type" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_media_type_with_field_filtering(
        self, groups_endpoint, mock_request
    ):
        """Tests combining media_type filter with field filtering."""
        request = mock_request(media_type="image", fields="filepath")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        for slice_name, sample_data in data["group"].items():
            assert "id" in sample_data
            assert "filepath" in sample_data
            assert "metadata" not in sample_data

    @pytest.mark.asyncio
    async def test_media_type_with_slice(self, groups_endpoint, mock_request):
        """Tests combining media_type filter with slice path parameter."""
        request = mock_request(slice_name="center", media_type="image")
        response = await groups_endpoint.get(request)

        assert response.status_code == 200
        data = json.loads(response.body)
        assert "group" in data
        assert len(data["group"]) == 1
        assert "center" in data["group"]
        assert data["group"]["center"]["_media_type"] == "image"
