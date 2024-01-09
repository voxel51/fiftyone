import json
import unittest
from unittest.mock import mock_open, patch

from fiftyone.core.threed import GLTFMesh, Pointcloud, Scene


class TestScene(unittest.TestCase):
    def setUp(self):
        self.scene = Scene()
        self.scene.add(GLTFMesh(gltf_url="/path/to/gltf.gltf"))
        self.scene.add(Pointcloud(pcd_url="/path/to/pcd.pcd"))

    def test_export_invalid_extension(self):
        with self.assertRaises(ValueError):
            self.scene.export("/path/to/scene.invalid")

    def test_from_fo3d(self):
        mock_file = mock_open(read_data=json.dumps(self.scene._to_dict()))

        with patch("builtins.open", mock_file):
            scene_from_file = Scene.from_fo3d("/path/to/scene.fo3d")

        mock_file.assert_called_once_with("/path/to/scene.fo3d", "r")

        self.assertEqual(scene_from_file._to_dict(), self.scene._to_dict())
