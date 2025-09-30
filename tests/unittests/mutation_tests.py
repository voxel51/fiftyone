"""
FiftyOne Server mutation endpoint unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pylint: disable=no-value-for-parameter
import unittest
import os
import json
from unittest.mock import MagicMock, AsyncMock

import fiftyone as fo
import fiftyone.core.labels as fol
from bson import ObjectId, json_util
from starlette.responses import Response

from fiftyone.server.routes.mutation import SampleMutation


class SampleMutationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.test_image_path = "/tmp/test_mutation_sample.jpg"
        self.mutator = SampleMutation(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )
        self.dataset = fo.Dataset()
        self.dataset.persistent = True
        sample = fo.Sample(filepath=self.test_image_path)

        self.id_to_delete_from_detections = ObjectId()
        self.id_to_keep_in_detections = ObjectId()
        self.id_to_delete_from_classifications = ObjectId()
        self.id_to_keep_in_classifications = ObjectId()

        sample["test_detections"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.id_to_delete_from_detections,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                ),
                fol.Detection(
                    id=self.id_to_keep_in_detections,
                    label="dog",
                    bounding_box=[0.4, 0.4, 0.2, 0.2],
                ),
            ]
        )

        sample["test_classifications"] = fol.Classifications(
            classifications=[
                fol.Classification(
                    id=self.id_to_delete_from_classifications, label="sunny"
                ),
                fol.Classification(
                    id=self.id_to_keep_in_classifications, label="outdoor"
                ),
            ]
        )

        sample["test_delete_classification"] = fol.Classification(
            label="to-be-cleared"
        )
        sample["test_delete_field"] = "some-value"

        self.dataset.add_sample(sample)
        self.sample = sample

    def tearDown(self):
        if self.dataset and fo.dataset_exists(self.dataset.name):
            fo.delete_dataset(self.dataset.name)
        if os.path.exists(self.test_image_path):
            os.remove(self.test_image_path)

    async def test_delete_operations_success(self):
        """Tests the successful deletion of various label and field types."""
        patch_payload = [
            {
                "op": "delete",
                "path": "test_detections.detections",
                "type": "detections",
                "value": {"id": str(self.id_to_delete_from_detections)},
            },
            {
                "op": "delete",
                "path": "test_classifications.classifications",
                "type": "classifications",
                "value": {"id": str(self.id_to_delete_from_classifications)},
            },
            {
                "op": "delete",
                "path": "test_delete_classification.label",
                "type": "classification",
                "value": {},
            },
            {
                "op": "delete",
                "path": "test_delete_field",
                "type": "field",
                "value": {},
            },
        ]

        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset.name,
            "sample_id": str(self.sample.id),
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )

        response = await self.mutator.patch(mock_request)
        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 200)
        response_body = json.loads(response.body)
        self.assertEqual(0, len(response_body["errors"]))
        self.assertEqual("ok", response_body["status"])

        # Verify changes in the dataset
        self.sample.reload()

        # Verify Detections list
        detections_list = self.sample.test_detections.detections
        self.assertEqual(len(detections_list), 1)
        self.assertEqual(
            detections_list[0].id, str(self.id_to_keep_in_detections)
        )

        # Verify Classifications list
        classifications_list = self.sample.test_classifications.classifications
        self.assertEqual(len(classifications_list), 1)
        self.assertEqual(
            classifications_list[0].id, str(self.id_to_keep_in_classifications)
        )

        # Verify single Classification field clearing
        self.assertIsNone(self.sample.test_delete_classification.label)

        # Verify generic field clearing
        self.assertIsNone(self.sample.test_delete_field)

    async def test_dataset_not_found(self):
        """Tests that a 404 Response is returned for a non-existent dataset."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": "non-existent-dataset",
            "sample_id": str(self.sample.id),
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps([]).encode("utf-8")
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
            "dataset_id": self.dataset.name,
            "sample_id": bad_id,
        }
        mock_request.body = AsyncMock(
            return_value=json_util.dumps([]).encode("utf-8")
        )

        response = await self.mutator.patch(mock_request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 404)
        self.assertIn(f"Sample '{bad_id}' not found", response.body.decode())

    async def test_invalid_body_not_list(self):
        """Tests that a 400 Response is returned if the request body is not a list."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset.name,
            "sample_id": str(self.sample.id),
        }
        payload = {"not": "a list"}
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(payload).encode("utf-8")
        )

        response = await self.mutator.patch(mock_request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "Request body must be a JSON array of patch operations",
            response.body.decode(),
        )

    async def test_invalid_patch_format(self):
        """Tests that a 400 Response is returned for a malformed patch object."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset.name,
            "sample_id": str(self.sample.id),
        }
        # Missing 'op' field
        patch_payload = [
            {
                "path": "test_detections",
                "type": "detections",
                "value": {"id": str(self.id_to_delete_from_detections)},
            }
        ]
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )

        response = await self.mutator.patch(mock_request)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid patch format", response.body.decode())

    async def test_delete_label_from_list_without_id(self):
        """Tests that an error is returned when deleting a label without an ID."""
        mock_request = MagicMock()
        mock_request.path_params = {
            "dataset_id": self.dataset.name,
            "sample_id": str(self.sample.id),
        }
        patch_payload = [
            {
                "op": "delete",
                "path": "test_detections",
                "type": "detections",
                "value": {},  # Missing 'id'
            }
        ]
        mock_request.body = AsyncMock(
            return_value=json_util.dumps(patch_payload).encode("utf-8")
        )

        response = await self.mutator.patch(mock_request)
        response_body = json.loads(response.body)
        self.assertIsInstance(response, Response)
        self.assertEqual(len(response_body["errors"]), 1)
        self.assertIn(
            "Deleting a detections requires an ID", response_body["errors"][0]
        )

        self.sample.reload()
        self.assertEqual(len(self.sample.test_detections.detections), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
