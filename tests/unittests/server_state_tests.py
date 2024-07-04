"""
FiftyOne server state tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from decorators import drop_datasets

from fiftyone.core.state import StateDescription


class ServerStateTests(unittest.TestCase):
    @drop_datasets
    def test_state_config(self):
        state = StateDescription.from_dict(
            {"config": {"sidebar_mode": "disabled"}}
        )
        self.assertEqual(state.config.sidebar_mode, "disabled")
