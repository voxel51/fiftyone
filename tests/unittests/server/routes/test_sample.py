"""
FiftyOne Server mutation endpoint unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime

# pylint: disable=no-value-for-parameter
from unittest.mock import MagicMock, AsyncMock
import json

from bson import ObjectId, json_util
import pytest
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import Response

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.server.routes.sample as fors
from fiftyone import DynamicEmbeddedDocument


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
        sample["capture_time"] = datetime.datetime.now(datetime.timezone.utc)

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
            embedded_doc_type=DynamicEmbeddedDocument,
        )

        # embedded doc containing uninitialized fields will be auto-initialized
        sample["custom_doc"] = CustomEmbeddedDoc()

        # Save and reload to ensure valid state
        sample.save()
        sample.reload()

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
    async def test_update_detection(
        self, mutator, mock_request, sample, dataset
    ):
        """
        Tests updating an existing detection
        """
        # Add primitive to schema for testing ADD operation
        dataset.add_sample_field("reviewer", fo.StringField)
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

        # Verify ADD top level primitive value
        assert sample.reviewer == "John Doe"

        # Verify DELETE
        assert sample.tags == []

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

    @pytest.mark.asyncio
    async def test_patch_rplc_datetime_field(
        self, mutator, mock_request, sample
    ):
        """Tests 'replace' on a fo.DateTime field with json-patch."""
        # The ISO format string as it would come from the frontend (Z suffix)
        new_datetime_str = "2026-01-14T05:00:00.000Z"
        patch_payload = [
            {
                "op": "replace",
                "path": "/capture_time",
                "value": new_datetime_str,
            }
        ]

        mock_request.body.return_value = json_payload(patch_payload)
        mock_request.headers["Content-Type"] = "application/json-patch+json"

        #####
        response = await mutator.patch(mock_request)
        #####

        sample.reload()

        assert response.status_code == 200
        assert response.headers.get("ETag") == fors.generate_sample_etag(
            sample
        )

        # Verify the DateTime field was properly updated
        assert sample.capture_time.year == 2026
        assert sample.capture_time.month == 1
        assert sample.capture_time.day == 14
        assert sample.capture_time.hour == 5
        assert sample.capture_time.minute == 0
        assert sample.capture_time.second == 0


class TestHandleJsonPatch:
    """Tests for the handle_json_patch function"""

    def test_successful_patches(self):
        """Tests successful 'add', 'replace', 'replace nested', and 'remove' operations"""
        target = fo.Detections(
            detections=[
                fo.Detection(label="cat", confidence=0.9),
                fo.Detection(
                    label="bird",
                    confidence=0.8,
                    bounding_box=[0.5, 0.5, 0.1, 0.1],
                ),
            ]
        )
        patch_list = [
            {
                "op": "add",
                "path": "/detections/0/bounding_box",
                "value": [0.1, 0.2, 0.3, 0.4],
            },
            {"op": "replace", "path": "/detections/0/label", "value": "dog"},
            {
                "op": "replace",
                "path": "/detections/1/confidence",
                "value": 0.95,
            },
            {"op": "remove", "path": "/detections/0/confidence"},
        ]

        result = fors.handle_json_patch(target, patch_list)

        # Verify add operation
        assert result.detections[0].bounding_box == [0.1, 0.2, 0.3, 0.4]
        # Verify replace operation
        assert result.detections[0].label == "dog"
        # Verify replace nested operation
        assert result.detections[1].confidence == 0.95
        # Verify remove operation
        assert result.detections[0].confidence is None

    def test_invalid_patch_format(self):
        """Tests that invalid patch format raises HTTPException with proper detail"""
        target = fo.Detection(label="cat")
        # Missing 'op' field
        patch_list = [{"path": "/label", "value": "dog"}]

        with pytest.raises(HTTPException) as exc_info:
            fors.handle_json_patch(target, patch_list)

        assert exc_info.value.status_code == 400
        assert "Failed to parse patches due to" in exc_info.value.detail

    def test_patch_error_detail_is_list(self):
        """Tests that patch errors return detail as a parsable list"""
        target = fo.Detection(label="cat")
        patch_list = [
            {"op": "replace", "path": "/nonexistent_field", "value": "dog"}
        ]

        with pytest.raises(HTTPException) as exc_info:
            fors.handle_json_patch(target, patch_list)

        assert exc_info.value.status_code == 400

        # Errors should be passed as a serialized list
        assert isinstance(exc_info.value.detail, str)
        err_detail = json.loads(exc_info.value.detail)
        assert isinstance(err_detail, list)
        assert len(err_detail) == 1
        # The error message should contain the patch and field name
        err_msg = err_detail[0]
        assert "nonexistent_field" in err_msg
        patch_str = str(patch_list[0])
        assert patch_str in err_msg

    def test_partial_success_all_errors_reported(self):
        """Tests that when some patches succeed and some fail, all errors are reported"""
        target = fo.Detection(label="cat", confidence=0.9)
        patch_list = [
            {
                "op": "replace",
                "path": "/label",
                "value": "dog",
            },  # Should succeed
            {
                "op": "replace",
                "path": "/nonexistent",
                "value": "fail",
            },  # Should fail
            {
                "op": "add",
                "path": "/bounding_box",
                "value": [0.1, 0.2, 0.3, 0.4],
            },  # Should succeed
            {
                "op": "replace",
                "path": "/another_nonexistent",
                "value": "fail2",
            },  # Should fail
        ]

        with pytest.raises(HTTPException) as exc_info:
            fors.handle_json_patch(target, patch_list)

        assert exc_info.value.status_code == 400
        err_detail = json.loads(exc_info.value.detail)
        assert isinstance(err_detail, list)
        assert len(err_detail) == 2

        # Verify the successful operations were applied before the errors were raised
        assert target.label == "dog"
        assert target.bounding_box == [0.1, 0.2, 0.3, 0.4]


class TestSampleFieldRoute:
    """Tests for sample field routes including delete operations and
    generated dataset syncing (PatchesView and EvaluationPatchesView).
    """

    # IDs for basic tests
    DETECTION_ID_1 = ObjectId()
    DETECTION_ID_2 = ObjectId()

    # IDs for patches view tests
    PATCHES_DETECTION_ID = ObjectId()

    # IDs for evaluation patches view tests
    GT_DETECTION_ID = ObjectId()
    PRED_DETECTION_ID = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        """Creates a sample with two detections for basic tests."""
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

        # Reload to get the MongoDB-stored datetime (millisecond precision)
        # so the If-Match header matches what's retrieved from the database
        sample.reload()

        return sample

    @pytest.fixture(name="sample_with_patches")
    def fixture_sample_with_patches(self, dataset):
        """Creates a sample for patches view tests."""
        sample = fo.Sample(filepath="/tmp/test_patches.jpg")

        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.PATCHES_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                    confidence=0.9,
                ),
            ]
        )

        dataset.add_sample(sample)
        sample.reload()

        return sample

    @pytest.fixture(name="patches_view")
    def fixture_patches_view(self, dataset, sample_with_patches):
        """Creates a patches view from the dataset."""
        return dataset.to_patches("ground_truth")

    @pytest.fixture(name="sample_with_eval")
    def fixture_sample_with_eval(self, dataset):
        """Creates a sample with ground truth and predictions for evaluation."""
        sample = fo.Sample(filepath="/tmp/test_eval_patches.jpg")

        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.GT_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.3, 0.3],
                ),
            ]
        )

        sample["predictions"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.PRED_DETECTION_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.3, 0.3],
                    confidence=0.9,
                ),
            ]
        )

        dataset.add_sample(sample)
        sample.reload()

        return sample

    @pytest.fixture(name="eval_patches_view")
    def fixture_eval_patches_view(self, dataset, sample_with_eval):
        """Creates an evaluation patches view from the dataset."""
        dataset.evaluate_detections(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
        )
        return dataset.to_evaluation_patches("eval")

    @pytest.fixture(name="mutator")
    def fixture_mutator(self):
        """Returns the SampleField route mutator."""
        return fors.SampleField(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )

    def _make_request(
        self,
        dataset_id,
        sample_id,
        field_path,
        field_id,
        etag,
        body,
        generated_dataset=None,
        generated_sample_id=None,
    ):
        """Helper to construct a mock request for SampleField.patch()."""
        mock_request = MagicMock(spec=Request)
        mock_request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": sample_id,
            "field_path": field_path,
            "field_id": field_id,
        }
        mock_request.headers = {
            "Content-Type": "application/json",
            "If-Match": etag,
        }
        mock_request.body = AsyncMock(return_value=json_payload(body))

        if generated_dataset or generated_sample_id:
            mock_request.query_params = MagicMock()
            mock_request.query_params.get = lambda key, default=None: {
                "generated_dataset": generated_dataset,
                "generated_sample_id": generated_sample_id,
            }.get(key, default)
        else:
            mock_request.query_params = {}

        return mock_request

    @pytest.fixture(name="mock_request")
    def fixture_mock_request(self, dataset_id, sample, if_match):
        """Helper to create a mock request object."""
        mock_request = MagicMock(spec=Request)

        mock_request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": str(sample.id),
            "field_path": "ground_truth.detections",
            "field_id": str(self.DETECTION_ID_1),
        }
        mock_request.headers = {"Content-Type": "application/json"}
        mock_request.query_params = {}

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

        # check response body - route returns the full sample
        updated_detection = response_dict["ground_truth"]["detections"][0]
        assert updated_detection["label"] == new_label
        assert updated_detection["_id"]["$oid"] == str(self.DETECTION_ID_1)

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
        sample.reload()

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
        assert "non_existent_attr" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_delete_single_label(self, mutator, dataset_id, sample):
        """Tests SampleField.patch() to delete a detection via JSON Patch."""
        # Route under test: PATCH /datasets/{dataset_id}/samples/{sample_id}/fields/{field_path}/{field_id}
        # Operation: Remove a single detection from ground_truth.detections
        assert len(sample.ground_truth.detections) == 2

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample.id),
                field_path="ground_truth.detections",
                field_id=str(self.DETECTION_ID_1),
                etag=fors.generate_sample_etag(sample),
                body=[{"op": "remove", "path": "/"}],
            )
        )
        #####

        sample.reload()
        assert response.status_code == 200
        assert len(sample.ground_truth.detections) == 1
        assert sample.ground_truth.detections[0].id == str(self.DETECTION_ID_2)

    @pytest.mark.asyncio
    async def test_delete_all_labels_sequentially(
        self, mutator, dataset_id, sample
    ):
        """Tests SampleField.patch() to delete all detections one by one."""
        # Route under test: PATCH /datasets/{dataset_id}/samples/{sample_id}/fields/{field_path}/{field_id}
        # Operation: Remove detections sequentially until list is empty
        assert len(sample.ground_truth.detections) == 2

        # Delete first detection
        #####
        await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample.id),
                field_path="ground_truth.detections",
                field_id=str(self.DETECTION_ID_1),
                etag=fors.generate_sample_etag(sample),
                body=[{"op": "remove", "path": "/"}],
            )
        )
        #####
        sample.reload()
        assert len(sample.ground_truth.detections) == 1

        # Delete second detection
        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample.id),
                field_path="ground_truth.detections",
                field_id=str(self.DETECTION_ID_2),
                etag=fors.generate_sample_etag(sample),
                body=[{"op": "remove", "path": "/"}],
            )
        )
        #####
        sample.reload()

        assert response.status_code == 200
        assert len(sample.ground_truth.detections) == 0

    @pytest.mark.asyncio
    async def test_update_label_syncs_to_patches(
        self, mutator, dataset_id, sample_with_patches, patches_view
    ):
        """Tests that updating a label syncs directly to the generated dataset."""
        patches_dataset = patches_view._patches_dataset
        patches_sample_id = str(patches_view.first().id)
        new_label = "dog"

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample_with_patches.id),
                field_path="ground_truth.detections",
                field_id=str(self.PATCHES_DETECTION_ID),
                etag=fors.generate_sample_etag(sample_with_patches),
                body=[{"op": "replace", "path": "/label", "value": new_label}],
                generated_dataset=patches_dataset.name,
                generated_sample_id=patches_sample_id,
            )
        )
        #####

        assert response.status_code == 200

        # Verify source sample is updated
        sample_with_patches.reload()
        assert (
            sample_with_patches.ground_truth.detections[0].label == new_label
        )

        # Verify generated sample was updated directly
        updated_patches_sample = patches_dataset[patches_sample_id]
        assert updated_patches_sample.ground_truth.label == new_label

    @pytest.mark.asyncio
    async def test_delete_label_deletes_patches_sample(
        self, mutator, dataset_id, sample_with_patches, patches_view
    ):
        """Tests that deleting a label removes the generated sample directly."""
        patches_dataset = patches_view._patches_dataset
        patches_sample_id = str(patches_view.first().id)
        assert len(patches_dataset) == 1

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample_with_patches.id),
                field_path="ground_truth.detections",
                field_id=str(self.PATCHES_DETECTION_ID),
                etag=fors.generate_sample_etag(sample_with_patches),
                body=[{"op": "remove", "path": "/"}],
                generated_dataset=patches_dataset.name,
                generated_sample_id=patches_sample_id,
            )
        )
        #####

        assert response.status_code == 200

        # Verify source sample label is deleted
        sample_with_patches.reload()
        assert len(sample_with_patches.ground_truth.detections) == 0

        # Verify the specific generated sample was deleted from the dataset
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]

    @pytest.mark.asyncio
    async def test_update_gt_label_syncs_to_eval_patches(
        self,
        mutator,
        dataset_id,
        sample_with_eval,
        eval_patches_view,
    ):
        """Tests updating ground truth label syncs to evaluation patches."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample_id = str(
            eval_patches_view.match({"type": "tp"}).first().id
        )
        new_label = "dog"

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample_with_eval.id),
                field_path="ground_truth.detections",
                field_id=str(self.GT_DETECTION_ID),
                etag=fors.generate_sample_etag(sample_with_eval),
                body=[{"op": "replace", "path": "/label", "value": new_label}],
                generated_dataset=patches_dataset.name,
                generated_sample_id=patches_sample_id,
            )
        )
        #####

        assert response.status_code == 200

        # Verify source sample gt is updated
        sample_with_eval.reload()
        assert sample_with_eval.ground_truth.detections[0].label == new_label

        # Verify generated sample gt was updated directly
        updated_patches_sample = patches_dataset[patches_sample_id]
        assert (
            updated_patches_sample.ground_truth.detections[0].label
            == new_label
        )

        # Verify predictions field was not affected
        assert updated_patches_sample.predictions.detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_update_pred_label_syncs_to_eval_patches(
        self,
        mutator,
        dataset_id,
        sample_with_eval,
        eval_patches_view,
    ):
        """Tests updating prediction label syncs to evaluation patches."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample_id = str(
            eval_patches_view.match({"type": "tp"}).first().id
        )
        new_label = "dog"

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample_with_eval.id),
                field_path="predictions.detections",
                field_id=str(self.PRED_DETECTION_ID),
                etag=fors.generate_sample_etag(sample_with_eval),
                body=[{"op": "replace", "path": "/label", "value": new_label}],
                generated_dataset=patches_dataset.name,
                generated_sample_id=patches_sample_id,
            )
        )
        #####

        assert response.status_code == 200

        # Verify source sample predictions is updated
        sample_with_eval.reload()
        assert sample_with_eval.predictions.detections[0].label == new_label

        # Verify generated sample pred was updated directly
        updated_patches_sample = patches_dataset[patches_sample_id]
        assert (
            updated_patches_sample.predictions.detections[0].label == new_label
        )

        # Verify ground_truth field was not affected
        assert updated_patches_sample.ground_truth.detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_delete_gt_label_in_eval_patches(
        self,
        mutator,
        dataset_id,
        sample_with_eval,
        eval_patches_view,
    ):
        """Tests deleting ground truth label removes it from evaluation patches."""
        patches_dataset = eval_patches_view._patches_dataset
        patches_sample_id = str(
            eval_patches_view.match({"type": "tp"}).first().id
        )

        #####
        response = await mutator.patch(
            self._make_request(
                dataset_id=dataset_id,
                sample_id=str(sample_with_eval.id),
                field_path="ground_truth.detections",
                field_id=str(self.GT_DETECTION_ID),
                etag=fors.generate_sample_etag(sample_with_eval),
                body=[{"op": "remove", "path": "/"}],
                generated_dataset=patches_dataset.name,
                generated_sample_id=patches_sample_id,
            )
        )
        #####

        assert response.status_code == 200

        # Verify source sample gt is deleted
        sample_with_eval.reload()
        assert len(sample_with_eval.ground_truth.detections) == 0

        # Verify the generated sample was deleted
        with pytest.raises(KeyError):
            patches_dataset[patches_sample_id]


class TestDatetimesMatch:
    """Tests for the datetimes_match function"""

    def test_identical_naive_datetimes(self):
        """Tests that identical naive datetimes match."""
        dt1 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        dt2 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        assert fors.datetimes_match(dt1, dt2) is True

    def test_identical_aware_datetimes(self):
        """Tests that identical aware datetimes match."""
        dt1 = datetime.datetime(
            2026, 1, 16, 13, 30, 33, 657000, tzinfo=datetime.timezone.utc
        )
        dt2 = datetime.datetime(
            2026, 1, 16, 13, 30, 33, 657000, tzinfo=datetime.timezone.utc
        )
        assert fors.datetimes_match(dt1, dt2) is True

    def test_aware_vs_naive_same_time(self):
        """Tests that aware and naive datetimes with same time match.

        This is the exact failure case from the logs:
        2026-01-16 13:30:33.657000+00:00 != 2026-01-16 13:30:33.657000
        """
        dt_aware = datetime.datetime(
            2026, 1, 16, 13, 30, 33, 657000, tzinfo=datetime.timezone.utc
        )
        dt_naive = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        assert fors.datetimes_match(dt_aware, dt_naive) is True
        assert fors.datetimes_match(dt_naive, dt_aware) is True

    def test_different_datetimes_do_not_match(self):
        """Tests that different datetimes do not match."""
        dt1 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        dt2 = datetime.datetime(
            2026, 1, 16, 13, 30, 34, 657000
        )  # 1 second diff
        assert fors.datetimes_match(dt1, dt2) is False

    def test_microsecond_precision_within_tolerance(self):
        """Tests that microsecond differences within 1ms tolerance match."""
        dt1 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        dt2 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657500)  # 500 µs diff
        assert fors.datetimes_match(dt1, dt2) is True

    def test_microsecond_precision_outside_tolerance(self):
        """Tests that microsecond differences beyond 1ms tolerance don't match."""
        dt1 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        dt2 = datetime.datetime(2026, 1, 16, 13, 30, 33, 659000)  # 2 ms diff
        assert fors.datetimes_match(dt1, dt2) is False

    def test_custom_tolerance(self):
        """Tests that custom tolerance works correctly."""
        dt1 = datetime.datetime(2026, 1, 16, 13, 30, 33, 657000)
        dt2 = datetime.datetime(2026, 1, 16, 13, 30, 33, 662000)  # 5 ms diff

        assert fors.datetimes_match(dt1, dt2, tolerance_ms=1) is False
        assert fors.datetimes_match(dt1, dt2, tolerance_ms=5) is True
        assert fors.datetimes_match(dt1, dt2, tolerance_ms=10) is True

    def test_mixed_timezone_awareness_different_times(self):
        """Tests that mixed awareness with different times don't match."""
        dt_aware = datetime.datetime(
            2026, 1, 16, 13, 30, 33, 657000, tzinfo=datetime.timezone.utc
        )
        dt_naive = datetime.datetime(
            2026, 1, 16, 13, 30, 35, 657000
        )  # 2 sec diff
        assert fors.datetimes_match(dt_aware, dt_naive) is False


class TestRootDeleteError:
    """Tests for RootDeleteError handling in route"""

    def test_handle_json_patch_raises_root_delete_error(self):
        """Tests that handle_json_patch raises RootDeleteError for root delete."""
        from fiftyone.server.utils.json.jsonpatch import RootDeleteError

        target = fo.Detection(label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2])
        operations = [
            {"op": "remove", "path": "/"},
            {"op": "add", "path": "/label", "value": "dog"},
        ]

        with pytest.raises(RootDeleteError):
            fors.handle_json_patch(target, operations)

        assert target is not None  # Ensure target remains unchanged
        assert target.label == "cat"

    def test_handle_json_patch_applies_normal_operations(self):
        """Tests that handle_json_patch applies non-delete operations."""
        target = fo.Detection(label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2])
        operations = [{"op": "replace", "path": "/label", "value": "dog"}]

        result = fors.handle_json_patch(target, operations)

        assert result.label == "dog"
