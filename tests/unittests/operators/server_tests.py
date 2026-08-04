"""
FiftyOne operator server tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.operators.operator import OperatorConfig
from fiftyone.operators.types import OperatorScope
from fiftyone.operators.server import (
    create_dataset_required_error,
    resolve_dataset_ids,
)


class ResolveDatasetIdsTests(unittest.TestCase):
    def test_returns_a_dataset_id_for_dataset_scoped_requests(self):
        self.assertEqual(
            resolve_dataset_ids({"dataset_name": "dataset"}), ["dataset"]
        )

    def test_returns_none_for_dataset_less_requests(self):
        self.assertIsNone(resolve_dataset_ids({}))
        self.assertIsNone(resolve_dataset_ids({"dataset_name": None}))

    def test_dataset_required_error_is_actionable(self):
        response = create_dataset_required_error("plugin/operator")
        self.assertEqual(response.status_code, 400)
        self.assertIn(b"DATASET_REQUIRED", response.body)
        self.assertTrue(
            OperatorConfig(
                "operator", surfaces=[OperatorScope.DATASET_SAMPLES_GRID]
            ).requires_dataset
        )
