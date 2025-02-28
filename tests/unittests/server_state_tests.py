"""
FiftyOne Server state tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.core.state import StateDescription

from decorators import drop_datasets


class ServerStateTests(unittest.TestCase):
    @drop_datasets
    def test_state_config(self):
        state = StateDescription.from_dict(
            {"config": {"sidebar_mode": "disabled"}}
        )
        self.assertEqual(state.config.sidebar_mode, "disabled")
