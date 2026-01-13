"""
FiftyOne Server mutation endpoint unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-value-for-parameter
from unittest.mock import MagicMock, AsyncMock
import json

from bson import ObjectId, json_util
import pytest
from starlette.exceptions import HTTPException
from starlette.responses import Response


import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.server.routes.sample as fors


def _create_dummy_instance(cls_type: type) -> dict:
    return json.loads(cls_type().to_json())


class CustomEmbeddedDoc(fo.EmbeddedDocument):
    classification = fo.EmbeddedDocumentField(document_type=fo.Classification)
    classifications = fo.EmbeddedDocumentField(
        document_type=fo.Classifications
    )
    detection = fo.EmbeddedDocumentField(document_type=fo.Detection)
    detections = fo.EmbeddedDocumentField(document_type=fo.Detections)
    polyline = fo.EmbeddedDocumentField(document_type=fo.Polyline)
    polylines = fo.EmbeddedDocumentField(document_type=fo.Polylines)


class CustomNestedDoc(fo.EmbeddedDocument):
    custom_documents = fo.EmbeddedDocumentListField(
        document_type=CustomEmbeddedDoc
    )


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True

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


_if_match_values = ["etag", "isodate", "timestamp"]


@pytest.fixture(name="if_match", params=_if_match_values)
def fixture_if_match(request, sample):
    """Provides parameterized If-Match header values."""
    if_match_type = request.param

    if if_match_type is None:
        return None

    if if_match_type == "etag":
        return fors.generate_sample_etag(sample)

    if if_match_type == "isodate":
        return sample.last_modified_at.isoformat()

    if if_match_type == "timestamp":
        return str(sample.last_modified_at.timestamp())

    raise ValueError(f"Unknown connection type: {if_match_type}")


def json_payload(payload: dict) -> bytes:
    """Converts a dictionary to a JSON payload."""
    return json_util.dumps(payload).encode("utf-8")


class TestSampleRoutes:
    """Tests for sample routes"""

    INITIAL_DETECTION_ID = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        """Creates a persistent dataset for testing."""
        sample = fo.Sample(filepath="/tmp/test_sample.jpg", tags=["initial"])

        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.INITIAL_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                )
            ]
        )
        sample["primitive_field"] = "initial_value"

        dataset.add_sample(sample)

        # uninitialized fields that the dataset is aware of
        dataset.add_sample_field(
            "empty_classification",
            fo.EmbeddedDocumentField,
            fol.Classification,
        )
        dataset.add_sample_field(
            "empty_classifications",
            fo.EmbeddedDocumentField,
            fol.Classifications,
        )
        dataset.add_sample_field(
            "empty_detection", fo.EmbeddedDocumentField, fol.Detection
        )
        dataset.add_sample_field(
            "empty_detections", fo.EmbeddedDocumentField, fol.Detections
        )
        dataset.add_sample_field(
            "empty_polyline", fo.EmbeddedDocumentField, fol.Polyline
        )
        dataset.add_sample_field(
            "empty_polylines", fo.EmbeddedDocumentField, fol.Polylines
        )

        dataset.add_sample_field(
            "empty_primitive",
            fo.StringField,
        )

        dataset.add_sample_field(
            "empty_custom_doc",
            fo.EmbeddedDocumentField,
            embedded_doc_type=CustomEmbeddedDoc,
        )

        # custom embedded documents
        dataset.add_sample_field(
            "nested_doc",
            fo.EmbeddedDocumentField,
            embedded_doc_type=CustomNestedDoc,
        )

        sample["nested_doc"] = CustomNestedDoc(
            custom_documents=[
                CustomEmbeddedDoc(
                    classification=fol.Classification(),
                    detections=fol.Detections(),
                    polylines=fol.Polylines(),
                ),
                # empty doc which will (expectedly) fail initialization
                CustomEmbeddedDoc(),
            ]
        )

        # embedded doc containing uninitialized fields will be auto-initialized
        sample["custom_doc"] = CustomEmbeddedDoc()

        return sample

    @pytest.fixture(name="mutator")
    def test_mutator(self):
        """Returns the Sample route mutator."""
        return fors.Sample(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

    @pytest.fixture(name="mock_request")
    def fixture_mock_request(self, dataset_id, sample, if_match):
        """Helper to create a mock request object."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": str(sample.id),
        }

        mock_request.headers = {"Content-Type": "application/json"}

        if if_match is not None:
            mock_request.headers["If-Match"] = if_match

        mock_request.body = AsyncMock(return_value=json_payload({}))

        return mock_request

    @pytest.mark.asyncio
    async def test_update_detection(self, mutator, mock_request, sample):
        """
        Tests updating an existing detection
        """
        label = "cat"
        confidence = 0.99
        bounding_box = [0.15, 0.15, 0.25, 0.25]
        patch_payload = {
            "ground_truth": {
                "_cls": "Detections",
                "detections": [
                    {
                        "_cls": "Detection",
                        "id": str(self.INITIAL_DETECTION_ID),
                        "label": label,
                        "bounding_box": bounding_box,  # updated
                        "confidence": confidence,
                    }
                ],
            },
            "reviewer": "John Doe",
            "tags": None,
        }

        mock_request.body.return_value = json_payload(patch_payload)

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()
        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        response_dict = json.loads(response.body)

        assert isinstance(response, Response)
        assert response.status_code == 200

        # Assertions on the response
        assert isinstance(response_dict, dict)
        updated_sample = fo.Sample.from_dict(response_dict)
        assert updated_sample.ground_truth.detections[0].id == str(
            self.INITIAL_DETECTION_ID
        )

        assert (
            updated_sample.ground_truth.detections[0].bounding_box
            == bounding_box
        )
        assert updated_sample.ground_truth.detections[0].label == label

        # Verify UPDATE
        updated_detection = sample.ground_truth.detections[0]
        assert updated_detection.id == str(self.INITIAL_DETECTION_ID)
        assert updated_detection.bounding_box[0] == 0.15
        assert updated_detection.confidence == 0.99

        # Verify CREATE (Primitive)
        assert sample.reviewer == "John Doe"

        # Verify DELETE
        assert sample.tags == []

    @pytest.mark.asyncio
    async def test_add_detection(self, mutator, mock_request, sample):
        """
        Tests adding a new detection
        """
        bounding_box = [0.15, 0.15, 0.25, 0.25]
        confidence = 0.99
        patch_payload = {
            "ground_truth_2": {
                "_cls": "Detections",
                "detections": [
                    {
                        "_cls": "Detection",
                        "label": "cat",
                        "bounding_box": bounding_box,
                        "confidence": confidence,
                    }
                ],
            },
        }
        mock_request.body.return_value = json_payload(patch_payload)

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()
        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        response_dict = json.loads(response.body)
        assert isinstance(response_dict, dict)

        updated_detection = sample.ground_truth_2.detections[0]
        assert updated_detection.bounding_box == bounding_box
        assert updated_detection.confidence == confidence

    @pytest.mark.asyncio
    async def test_add_classification(self, mutator, mock_request, sample):
        """
        Tests adding a new classification
        """
        label = "sunny"
        confidence = 0.99
        patch_payload = {
            "weather": {
                "_cls": "Classification",
                "label": label,
                "confidence": confidence,
            },
        }
        mock_request.body.return_value = json_payload(patch_payload)

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()
        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        response_dict = json.loads(response.body)
        assert isinstance(response_dict, dict)
        updated_detection = sample.weather
        assert updated_detection.label == label
        assert updated_detection.confidence == confidence

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, mutator, mock_request):
        """Tests that a 404 HTTPException is raised for a non-existent
        dataset."""

        mock_request.path_params["dataset_id"] = "non-existent-dataset"

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert (
            exc_info.value.detail == "Dataset 'non-existent-dataset' not found"
        )

    @pytest.mark.asyncio
    async def test_sample_not_found(self, mutator, mock_request, dataset):
        """Tests that a 404 HTTPException is raised for a non-existent
        sample."""
        bad_id = str(ObjectId())

        mock_request.path_params["sample_id"] = bad_id

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert (
            exc_info.value.detail
            == f"Sample '{bad_id}' not found in dataset '{dataset.name}'"
        )

    @pytest.mark.asyncio
    async def test_if_match_header_failure(
        self, mutator, mock_request, sample, if_match
    ):
        """Tests that a 412 HTTPException is raised for an invalid If-Match."""
        if if_match is None:
            pytest.skip("Fixture returned None, skipping this test.")

        sample["primitive_field"] = "new_value"
        sample.save()

        mock_request.body.return_value = json_payload(
            {"primitive_field": "newer_value"}
        )

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

            assert exc_info.value.status_code == 412

    @pytest.mark.asyncio
    async def test_unsupported_label_class(
        self, mutator, mock_request, sample
    ):
        """Tests that an HTTPException is raised for an unknown _cls value."""
        patch_payload = {
            "bad_label": {
                "_cls": "NonExistentLabelType",
                "label": "invalid",
            }
        }

        mock_request.body.return_value = json_payload(patch_payload)

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["bad_label"] == (
            "No deserializer registered for class 'NonExistentLabelType'"
        )

        # Verify the sample was not modified
        sample.reload()
        assert sample.has_field("bad_label") is False

    @pytest.mark.asyncio
    async def test_malformed_label_data(self, mutator, mock_request, sample):
        """
        Tests that an HTTPException is raised when label data is malformed and
        cannot be deserialized by from_dict.
        """
        patch_payload = {
            # Detections object is missing the required 'detections' list
            "ground_truth": {
                "_cls": "Detections",
                "detections": {"some messed up map"},
            }
        }

        mock_request.body.return_value = json_payload(patch_payload)

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 400
        response_dict = exc_info.value.detail

        assert (
            "Invalid data to create a `Detections` instance."
            in response_dict["ground_truth"]
        )

        # Verify the original field was not overwritten
        sample.reload()
        assert len(sample.ground_truth.detections) == 1
        assert sample.ground_truth.detections[0].id == str(
            self.INITIAL_DETECTION_ID
        )

    @pytest.mark.asyncio
    async def test_patch_init_fields(self, mutator, mock_request, sample):
        new_classification = _create_dummy_instance(fol.Classification)
        new_detection = _create_dummy_instance(fol.Detection)
        new_polyline = _create_dummy_instance(fol.Polyline)

        patch_payload = [
            {
                "op": "add",
                "path": "/empty_classification",
                "value": new_classification,
            },
            {
                "op": "add",
                "path": "/empty_classifications/classifications/0",
                "value": new_classification,
            },
            {
                "op": "add",
                "path": "/empty_detections/detections/0",
                "value": new_detection,
            },
            {
                "op": "add",
                "path": "/empty_detection",
                "value": new_detection,
            },
            {
                "op": "add",
                "path": "/empty_polylines/polylines/0",
                "value": new_polyline,
            },
            {
                "op": "add",
                "path": "/empty_polyline",
                "value": new_polyline,
            },
            {
                "op": "add",
                "path": "/empty_primitive",
                "value": "new primitive",
            },
            {
                "op": "add",
                "path": "/custom_doc/detections/detections/0",
                "value": new_detection,
            },
            {
                "op": "add",
                "path": "/empty_custom_doc/detections/detections/0",
                "value": new_detection,
            },
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )
        response_dict = json.loads(response.body)

        assert response_dict["empty_classification"] == new_classification
        assert (
            response_dict["empty_classifications"]["classifications"][0]
            == new_classification
        )
        assert response_dict["empty_detection"] == new_detection
        assert (
            response_dict["empty_detections"]["detections"][0] == new_detection
        )
        assert response_dict["empty_polyline"] == new_polyline
        assert response_dict["empty_polylines"]["polylines"][0] == new_polyline
        assert response_dict["empty_primitive"] == "new primitive"
        assert (
            response_dict["custom_doc"]["detections"]["detections"][0]
            == new_detection
        )
        assert (
            response_dict["empty_custom_doc"]["detections"]["detections"][0]
            == new_detection
        )

    @pytest.mark.asyncio
    async def test_patch_nested_fields(self, mutator, mock_request, sample):
        new_detection = _create_dummy_instance(fol.Detection)

        patch_payload = [
            {
                "op": "add",
                "path": "/nested_doc/custom_documents/0/detections/detections/0",
                "value": new_detection,
            },
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )
        response_dict = json.loads(response.body)

        assert (
            response_dict["nested_doc"]["custom_documents"][0]["detections"][
                "detections"
            ][0]
            == new_detection
        )

    @pytest.mark.asyncio
    async def test_patch_init_nested_fields_failure(
        self, mutator, mock_request
    ):
        new_detection = _create_dummy_instance(fol.Detection)

        patch_payload = [
            {
                "op": "add",
                "path": "/nested_doc/custom_documents/1/detections/detections/0",
                "value": new_detection,
            },
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        # auto-initialization not supported for lists of embedded documents
        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_patch_rplc_primitive(self, mutator, mock_request, sample):
        """Tests 'replace' on a primitive field with json-patch."""
        new_value = "updated_value"
        patch_payload = [
            {"op": "replace", "path": "/primitive_field", "value": new_value}
        ]

        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####
        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )
        response_dict = json.loads(response.body)
        assert response_dict["primitive_field"] == new_value

        assert sample.primitive_field == new_value

    @pytest.mark.asyncio
    async def test_patch_rplc_nest_label_attr(
        self, mutator, mock_request, sample
    ):
        """Tests 'replace' on a nested attribute of a label with json-patch."""
        new_label = "dog"
        patch_payload = [
            {
                "op": "replace",
                "path": "/ground_truth/detections/0/label",
                "value": new_label,
            }
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        assert sample.ground_truth.detections[0].label == new_label

    @pytest.mark.asyncio
    async def test_patch_add_detect_to_list(
        self, mutator, mock_request, sample
    ):
        """Tests 'add' to a list of labels, testing the transform function."""
        new_detection = {
            "_cls": "Detection",
            "label": "dog",
            "bounding_box": [0.5, 0.5, 0.2, 0.2],
        }
        patch_payload = [
            {
                "op": "add",
                "path": "/ground_truth/detections/-",  # Path to the list
                "value": new_detection,
            }
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        assert len(sample.ground_truth.detections) == 2
        assert isinstance(sample.ground_truth.detections[1], fol.Detection)
        assert sample.ground_truth.detections[1].label == "dog"

    @pytest.mark.asyncio
    async def test_patch_rmv_detect_list(self, mutator, mock_request, sample):
        """Tests 'remove' from a list of labels."""
        assert len(sample.ground_truth.detections) == 1

        patch_payload = [
            {"op": "remove", "path": "/ground_truth/detections/0"}
        ]

        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        assert len(sample.ground_truth.detections) == 0

    @pytest.mark.asyncio
    async def test_patch_multiple_operations(
        self, mutator, mock_request, sample
    ):
        """Tests a patch request with multiple operations."""
        patch_payload = [
            {"op": "replace", "path": "/primitive_field", "value": "multi-op"},
            {"op": "remove", "path": "/ground_truth/detections/0"},
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()

        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        assert sample.primitive_field == "multi-op"
        assert len(sample.ground_truth.detections) == 0

    @pytest.mark.asyncio
    async def test_patch_invalid_path(self, mutator, mock_request):
        """Tests that a 400 is raised for an invalid path."""
        patch_payload = [
            {"op": "replace", "path": "/non_existent_field", "value": "test"}
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        with pytest.raises(HTTPException) as exc_info:
            ######
            await mutator.patch(mock_request)
            ######

        assert exc_info.value.status_code == 400
        assert str(patch_payload[0]) in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_patch_invalid_format(self, mutator, mock_request):
        """Tests that a 400 is raised for a malformed patch operation."""
        patch_payload = [
            {"path": "/primitive_field", "value": "test"}
        ]  # missing 'op'

        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        with pytest.raises(HTTPException) as exc_info:
            ######
            await mutator.patch(mock_request)
            ######

        assert exc_info.value.status_code == 400
        assert "Failed to parse patches due to" in exc_info.value.detail


class TestSampleFieldRoute:
    """Tests for sample field routes"""

    DETECTION_ID_1 = ObjectId()
    DETECTION_ID_2 = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        """Creates a persistent dataset for testing."""
        sample = fo.Sample(filepath="/tmp/test_sample_field.jpg")

        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DETECTION_ID_1,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                    confidence=0.9,
                ),
                fol.Detection(
                    id=self.DETECTION_ID_2,
                    label="dog",
                    bounding_box=[0.4, 0.4, 0.3, 0.3],
                    confidence=0.8,
                ),
            ]
        )
        sample["scalar_field"] = "not a list"

        dataset.add_sample(sample)

        return sample

    @pytest.fixture(name="mutator")
    def test_mutator(self):
        """Returns the Sample fields route mutator."""
        return fors.SampleField(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )

    @pytest.fixture(name="mock_request")
    def fixture_mock_request(self, dataset_id, sample, if_match):
        """Helper to create a mock request object."""
        mock_request = MagicMock()
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": str(sample.id),
            "field_path": "ground_truth.detections",
            "field_id": str(self.DETECTION_ID_1),
        }
        mock_request.headers = {"Content-Type": "application/json"}

        if if_match is not None:
            mock_request.headers["If-Match"] = if_match

        mock_request.body = AsyncMock(return_value=json_payload({}))

        return mock_request

    @pytest.mark.asyncio
    async def test_update_label_in_list(self, mutator, mock_request, sample):
        """Tests updating a label within a list field."""
        new_label = "person"
        patch_payload = [
            {"op": "replace", "path": "/label", "value": new_label}
        ]

        mock_request.body.return_value = json_payload(patch_payload)

        #####
        response = await mutator.patch(mock_request)
        #####
        sample.reload()

        response_dict = json.loads(response.body)

        assert isinstance(response, Response)
        assert response.status_code == 200
        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        # check response body
        assert response_dict["label"] == new_label
        assert response_dict["_id"]["$oid"] == str(self.DETECTION_ID_1)

        # check database state
        detection1 = sample.ground_truth.detections[0]
        detection2 = sample.ground_truth.detections[1]

        assert detection1.id == str(self.DETECTION_ID_1)
        assert detection1.label == new_label
        # ensure other item is not modified
        assert detection2.id == str(self.DETECTION_ID_2)
        assert detection2.label == "dog"

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, mutator, mock_request):
        """Tests that a 404 is raised for a non-existent dataset."""

        mock_request.path_params["dataset_id"] = "non-existent-dataset"

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert (
            exc_info.value.detail == "Dataset 'non-existent-dataset' not found"
        )

    @pytest.mark.asyncio
    async def test_sample_not_found(self, mutator, mock_request, dataset):
        """Tests that a 404 is raised for a non-existent sample."""
        bad_id = str(ObjectId())
        mock_request.path_params["sample_id"] = bad_id

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert (
            exc_info.value.detail
            == f"Sample '{bad_id}' not found in dataset '{dataset.name}'"
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "if_match", [None] + _if_match_values, indirect=True
    )
    async def test_if_match_header_failure(
        self, mutator, mock_request, sample, if_match
    ):
        """Tests that a 4xx HTTPException is raised for an invalid If-Match."""
        if if_match is None:
            expected_status = 400
            expected_detail = "Invalid If-Match header"
        else:
            expected_status = 412
            expected_detail = "If-Match condition failed"

        # Update the sample to change its last_modified_at
        sample["primitive_field"] = "new_value"
        sample.save()

        patch_payload = [{"op": "replace", "path": "/label", "value": "fish"}]

        mock_request.body.return_value = json_payload(patch_payload)

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == expected_status
        assert exc_info.value.detail == expected_detail

    @pytest.mark.asyncio
    async def test_field_path_not_found(self, mutator, mock_request, sample):
        """Tests that a 404 is raised for a non-existent field path."""
        bad_path = "non_existent.path"
        mock_request.path_params["field_path"] = bad_path

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert (
            exc_info.value.detail
            == f"Field '{bad_path}' not found in sample '{sample.id}'"
        )

    @pytest.mark.asyncio
    async def test_field_is_not_a_list(self, mutator, mock_request):
        """Tests that a 400 is raised if the field path does not point to a
        list."""
        field_path = "scalar_field"

        mock_request.path_params["field_path"] = field_path

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == f"Field '{field_path}' is not a list"

    @pytest.mark.asyncio
    async def test_field_id_not_found_in_list(self, mutator, mock_request):
        """Tests that a 404 is raised if the field ID is not in the list."""
        bad_id = str(ObjectId())
        mock_request.path_params["field_id"] = bad_id

        with pytest.raises(HTTPException) as exc_info:
            #####
            await mutator.patch(mock_request)
            #####

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == (
            f"Field with id '{bad_id}' not found in field "
            f"'{mock_request.path_params['field_path']}'"
        )

    @pytest.mark.asyncio
    async def test_invalid_patch_operation(self, mutator, mock_request):
        """Tests that a 400 is raised for an invalid patch operation."""
        patch_payload = [
            {"op": "replace", "path": "/non_existent_attr", "value": "test"}
        ]
        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        with pytest.raises(HTTPException) as exc_info:
            ###
            await mutator.patch(mock_request)
            ###

        assert exc_info.value.status_code == 400
        assert str(patch_payload[0]) in exc_info.value.detail
        assert (
            "non_existent_attr" in exc_info.value.detail[str(patch_payload[0])]
        )
