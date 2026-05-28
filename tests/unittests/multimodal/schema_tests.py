"""
Multimodal schema unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.multimodal.schemas import v1 as foms


# Smoke tests that generated Python bindings are importable and usable.
# Each test round-trips one representative message from one source proto file.
class MultimodalSchemaTests(unittest.TestCase):
    def test_common_proto_message_round_trip(self):
        # common.proto: TimeTrack
        track = foms.TimeTrack(
            time_track_id="sample.index",
            type=foms.TimeTrackType.TIME_TRACK_TYPE_SEQUENCE,
            role=foms.TimeTrackRole.TIME_TRACK_ROLE_SAMPLE_INDEX,
            display_name="Sample index",
            value_range=foms.TimeValueRange(start=0, end=1),
        )

        round_trip = foms.TimeTrack()
        round_trip.ParseFromString(track.SerializeToString())

        self.assertEqual(round_trip.time_track_id, "sample.index")

    def test_inventory_proto_message_round_trip(self):
        # inventory.proto: SceneInventory
        scene = foms.SceneInventory(
            inventory_id="inventory-1",
            scene_id="scene-1",
            source_format="mcap",
            inventory_version="v1",
        )

        round_trip = foms.SceneInventory()
        round_trip.ParseFromString(scene.SerializeToString())

        self.assertEqual(round_trip.inventory_id, "inventory-1")

    def test_playback_proto_message_round_trip(self):
        # playback.proto: PlaybackPlan
        plan = foms.PlaybackPlan(
            plan_id="plan-1",
            scene_id="scene-1",
            source_inventory_id="inventory-1",
        )

        round_trip = foms.PlaybackPlan()
        round_trip.ParseFromString(plan.SerializeToString())

        self.assertEqual(round_trip.source_inventory_id, "inventory-1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
