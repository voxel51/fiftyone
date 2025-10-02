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

        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)
        # Assertions on the response
        self.assertIsInstance(response_dict, dict)
        self.assertIsNotNone(response_dict["sample"])
        sample = fo.Sample.from_dict(response_dict["sample"])
        self.assertEqual(
            sample.ground_truth.detections[0].id,
            str(self.initial_detection_id),
        )
        self.assertEqual(
            sample.ground_truth.detections[0].bounding_box, bounding_box
        )
        self.assertEqual(sample.ground_truth.detections[0].label, label)
        self.assertEqual(len(response_dict["errors"]), 0)

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

        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)
        self.assertIsInstance(response_dict, dict)
        self.assertIsNotNone(response_dict["sample"])
        self.assertEqual(len(response_dict["errors"]), 0)
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

        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)
        self.assertIsInstance(response_dict, dict)
        self.assertEqual(len(response_dict["errors"]), 0)
        updated_detection = self.sample.weather
        self.assertEqual(updated_detection.label, label)
        self.assertEqual(updated_detection.confidence, confidence)

    async def test_dataset_not_found(self):
        """Tests that a 404 Response is returned for a non-existent dataset."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": "non-existent-dataset",
            "sample_id": str(self.sample.id),
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps({}).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 404)
        self.assertIn(
            "Dataset 'non-existent-dataset' not found", response.body.decode()
        )

    async def test_sample_not_found(self):
        """Tests that a 404 Response is returned for a non-existent sample."""
        bad_id = str(ObjectId())
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": bad_id,
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps({}).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 404)
        self.assertIn(f"Sample '{bad_id}' not found", response.body.decode())

    async def test_unsupported_label_class(self):
        """Tests that an error is reported for an unknown _cls value."""
        patch_payload = {
            "bad_label": {
                "_cls": "NonExistentLabelType",
                "label": "invalid",
            }
        }
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)

        self.assertEqual(len(response_dict["errors"]), 1)
        self.assertIn(
            "Unsupported label class 'NonExistentLabelType'",
            response_dict["errors"][0],
        )

        # Verify the sample was not modified
        self.sample.reload()
        self.assertFalse(self.sample.has_field("bad_label"))

    async def test_malformed_label_data(self):
        """
        Tests that an error is reported when label data is malformed and
        cannot be deserialized by from_dict.
        """
        patch_payload = {
            # Detections object is missing the required 'detections' list
            "ground_truth": {
                "_cls": "Detections",
                "detections": {"some messed up map"},
            }
        }

        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset_id,
            "sample_id": str(self.sample.id),
        }

        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )
        response = await self.mutator.patch(mock_request)
        response_dict = json.loads(response.body)

        self.assertEqual(len(response_dict["errors"]), 1)
        self.assertIn(
            "Failed to parse field 'ground_truth'", response_dict["errors"][0]
        )

        # Verify the original field was not overwritten
        self.sample.reload()
        self.assertEqual(len(self.sample.ground_truth.detections), 1)
        self.assertEqual(
            self.sample.ground_truth.detections[0].id,
            str(self.initial_detection_id),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
