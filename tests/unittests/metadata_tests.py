"""
FiftyOne metadata unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import tempfile
import unittest

import fiftyone.core.metadata as fom
import fiftyone.core.threed as fo3d


class SceneMetadataTests(unittest.TestCase):
    def test_build_for(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            scene_path = os.path.join(temp_dir, "scene.fo3d")
            files = [("stl", 123), ("obj", 321), ("jpeg", 5151), ("mtl", 867)]
            for file, num_bytes in files:
                with open(
                    os.path.join(temp_dir, f"{file}.{file}"), "wb"
                ) as of:
                    of.write(b"A" * num_bytes)

            scene = fo3d.Scene()
            scene.background = fo3d.SceneBackground(image="jpeg.jpeg")
            scene.add(fo3d.ObjMesh("blah-obj", "obj.obj", "mtl.mtl"))
            scene.add(fo3d.StlMesh("blah-stl", "stl.stl"))

            # Add same file again. This should not be counted in `size_bytes`
            # or `asset_counts`
            scene.add(fo3d.ObjMesh("blah-obj2", "obj.obj"))

            scene.write(scene_path)

            metadata = fom.SceneMetadata.build_for(scene_path)

            self.assertEqual(metadata.mime_type, "application/octet-stream")

            expected_size = os.path.getsize(scene_path)
            expected_size += sum(t[1] for t in files)

            self.assertEqual(metadata.size_bytes, expected_size)
            self.assertDictEqual(
                metadata.asset_counts,
                {"obj": 1, "jpeg": 1, "stl": 1, "mtl": 1},
            )
