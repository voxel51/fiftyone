"""
FiftyOne Server mutation endpoint unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pylint: disable=no-value-for-parameter
import unittest
from unittest.mock import MagicMock, AsyncMock
import json

import fiftyone as fo
import fiftyone.core.labels as fol
from bson import ObjectId, json_util
from starlette.exceptions import HTTPException
from starlette.responses import Response

import fiftyone.server.routes.sample as fors


class SampleRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        """Sets up a persistent dataset with a sample for each test."""
        self.mutator = fors.Sample(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )
        self.dataset = fo.Dataset()
        self.dataset.persistent = True
        self.dataset_id = self.dataset._doc.id

        sample = fo.Sample(filepath="/tmp/test_sample.jpg", tags=["initial"])

        self.initial_detection_id = ObjectId()
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.initial_detection_id,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                )
            ]
        )
        sample["primitive_field"] = "initial_value"

        self.dataset.add_sample(sample)
        self.sample = sample

    def tearDown(self):
        """Deletes the dataset after each test."""
        if self.dataset and fo.dataset_exists(self.dataset.name):
            fo.delete_dataset(self.dataset.name)

    def _create_mock_request(self, payload, content_type="application/json"):
        """Helper to create a mock request object."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }
        mock_request.headers = {"Content-Type": content_type}

        mock_request.body = AsyncMock(
            return_value=json_util.dumps(payload).encode("utf-8")
        )
        return mock_request

    async def test_update_detection(self):
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
                        "id": str(self.initial_detection_id),
                        "label": label,
                        "bounding_box": bounding_box,  # updated
                        "confidence": confidence,
                    }
                ],
            },
            "reviewer": "John Doe",
            "tags": None,
        }

        response = await self.mutator.patch(
            self._create_mock_request(patch_payload)
        )
        response_dict = json.loads(response.body)
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)
        # Assertions on the response
        self.assertIsInstance(response_dict, dict)
        sample = fo.Sample.from_dict(response_dict)
        self.assertEqual(
            sample.ground_truth.detections[0].id,
            str(self.initial_detection_id),
        )
        self.assertEqual(
            sample.ground_truth.detections[0].bounding_box, bounding_box
        )
        self.assertEqual(sample.ground_truth.detections[0].label, label)

        # Verify changes in the dataset by reloading the sample
        self.sample.reload()

        # Verify UPDATE
        updated_detection = self.sample.ground_truth.detections[0]
        self.assertEqual(updated_detection.id, str(self.initial_detection_id))
        self.assertEqual(updated_detection.bounding_box[0], 0.15)
        self.assertEqual(updated_detection.confidence, 0.99)

        # Verify CREATE (Primitive)
        self.assertEqual(self.sample.reviewer, "John Doe")

        # Verify DELETE
        self.assertEqual(self.sample.tags, [])

    async def test_add_detection(self):
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

        response = await self.mutator.patch(
            self._create_mock_request(patch_payload)
        )
        response_dict = json.loads(response.body)
        self.assertIsInstance(response_dict, dict)
        updated_detection = self.sample.ground_truth_2.detections[0]
        self.assertEqual(updated_detection.bounding_box, bounding_box)
        self.assertEqual(updated_detection.confidence, confidence)

    async def test_add_classification(self):
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

        response = await self.mutator.patch(
            self._create_mock_request(patch_payload)
        )
        response_dict = json.loads(response.body)
        self.assertIsInstance(response_dict, dict)
        updated_detection = self.sample.weather
        self.assertEqual(updated_detection.label, label)
        self.assertEqual(updated_detection.confidence, confidence)

    async def test_dataset_not_found(self):
        """Tests that a 404 HTTPException is raised for a non-existent dataset."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": "non-existent-dataset",
            "sample_id": str(self.sample.id),
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps({}).encode("utf-8")
        )
        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(mock_request)

        self.assertEqual(cm.exception.status_code, 404)
        self.assertEqual(
            cm.exception.detail, "Dataset 'non-existent-dataset' not found"
        )

    async def test_sample_not_found(self):
        """Tests that a 404 HTTPException is raised for a non-existent sample."""
        bad_id = str(ObjectId())
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": bad_id,
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps({}).encode("utf-8")
        )
        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(mock_request)

        self.assertEqual(cm.exception.status_code, 404)
        self.assertEqual(
            cm.exception.detail,
            f"Sample '{bad_id}' not found in dataset '{self.dataset_id}'",
        )

    async def test_unsupported_label_class(self):
        """Tests that an HTTPException is raised for an unknown _cls value."""
        patch_payload = {
            "bad_label": {
                "_cls": "NonExistentLabelType",
                "label": "invalid",
            }
        }
        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(self._create_mock_request(patch_payload))

        self.assertEqual(cm.exception.status_code, 400)
        self.assertEqual(
            cm.exception.detail["bad_label"],
            "No transform registered for class 'NonExistentLabelType'",
        )

        # Verify the sample was not modified
        self.sample.reload()
        self.assertFalse(self.sample.has_field("bad_label"))

    async def test_malformed_label_data(self):
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

        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(self._create_mock_request(patch_payload))

        self.assertEqual(cm.exception.status_code, 400)
        response_dict = cm.exception.detail

        self.assertIn(
            "Invalid data to create a `Detections` instance.",
            response_dict["ground_truth"],
        )

        # Verify the original field was not overwritten
        self.sample.reload()
        self.assertEqual(len(self.sample.ground_truth.detections), 1)
        self.assertEqual(
            self.sample.ground_truth.detections[0].id,
            str(self.initial_detection_id),
        )

    async def test_patch_replace_primitive_field(self):
        """Tests 'replace' on a primitive field with json-patch."""
        new_value = "updated_value"
        patch_payload = [
            {"op": "replace", "path": "/primitive_field", "value": new_value}
        ]

        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)
        self.assertEqual(response_dict["primitive_field"], new_value)

        self.sample.reload()
        self.assertEqual(self.sample.primitive_field, new_value)

    async def test_patch_replace_nested_label_attribute(self):
        """Tests 'replace' on a nested attribute of a label with json-patch."""
        new_label = "dog"
        patch_payload = [
            {
                "op": "replace",
                "path": "/ground_truth/detections/0/label",
                "value": new_label,
            }
        ]
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )
        await self.mutator.patch(mock_request)

        self.sample.reload()
        self.assertEqual(
            self.sample.ground_truth.detections[0].label, new_label
        )

    async def test_patch_add_detection_to_list(self):
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
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        await self.mutator.patch(mock_request)

        self.sample.reload()
        self.assertEqual(len(self.sample.ground_truth.detections), 2)
        self.assertIsInstance(
            self.sample.ground_truth.detections[1], fol.Detection
        )
        self.assertEqual(self.sample.ground_truth.detections[1].label, "dog")

    async def test_patch_remove_detection_from_list(self):
        """Tests 'remove' from a list of labels."""
        self.assertEqual(len(self.sample.ground_truth.detections), 1)

        patch_payload = [
            {"op": "remove", "path": "/ground_truth/detections/0"}
        ]
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        await self.mutator.patch(mock_request)

        self.sample.reload()
        self.assertEqual(len(self.sample.ground_truth.detections), 0)

    async def test_patch_multiple_operations(self):
        """Tests a patch request with multiple operations."""
        patch_payload = [
            {"op": "replace", "path": "/primitive_field", "value": "multi-op"},
            {"op": "remove", "path": "/ground_truth/detections/0"},
        ]
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        await self.mutator.patch(mock_request)

        self.sample.reload()
        self.assertEqual(self.sample.primitive_field, "multi-op")
        self.assertEqual(len(self.sample.ground_truth.detections), 0)

    async def test_patch_invalid_path(self):
        """Tests that a 400 is raised for an invalid path."""
        patch_payload = [
            {"op": "replace", "path": "/non_existent_field", "value": "test"}
        ]
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(mock_request)

        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn(str(patch_payload[0]), cm.exception.detail)

    async def test_patch_invalid_format(self):
        """Tests that a 400 is raised for a malformed patch operation."""
        patch_payload = [
            {"path": "/primitive_field", "value": "test"}
        ]  # missing 'op'
        mock_request = self._create_mock_request(
            patch_payload, content_type="application/json-patch+json"
        )

        with self.assertRaises(HTTPException) as cm:
            await self.mutator.patch(mock_request)

        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn(
            "{'path': '/primitive_field', 'value': 'test'}",
            cm.exception.detail,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
