"""
FiftyOne Server state tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
from fiftyone.core.state import StateDescription

from decorators import drop_datasets


class ServerStateTests(unittest.TestCase):
    @drop_datasets
    def test_state_config(self):
        state = StateDescription.from_dict(
            {"config": {"sidebar_mode": "disabled"}}
        )
        self.assertEqual(state.config.sidebar_mode, "disabled")

    def test_state_config_round_trip_does_not_warn(self):
        d = StateDescription(config=fo.app_config.copy()).serialize()

        with self.assertNoLogs("fiftyone.core.config", level="WARNING"):
            StateDescription.from_dict(d)

    def test_removed_app_config_option_warns(self):
        with self.assertLogs("fiftyone.core.config", level="WARNING") as cm:
            config = fo.AppConfig({"show_label": False})

        self.assertIn("show_label", cm.output[0])
        self.assertFalse(hasattr(config, "show_label"))
