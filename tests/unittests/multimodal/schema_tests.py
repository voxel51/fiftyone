"""
Multimodal schema unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from fiftyone.multimodal.schemas import v1 as foms


# Smoke test that generated Python bindings are importable and usable.
class MultimodalSchemaTests(unittest.TestCase):
    def test_generated_contracts_import_and_round_trip(self):
        scene = foms.SceneInventory(
            scene_id="scene-1",
            source_format="mcap",
            inventory_version="v1",
            produced_at="2026-01-01T00:00:00Z",
            produced_by="smoke-test",
        )

        round_trip = foms.SceneInventory()
        round_trip.ParseFromString(scene.SerializeToString())

        self.assertEqual(round_trip.scene_id, "scene-1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
