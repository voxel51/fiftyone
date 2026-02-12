"""
FiftyOne metadata unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import io
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image

import fiftyone.core.metadata as fom
import fiftyone.core.threed as fo3d


def _make_test_image(width=100, height=80, mode="RGB"):
    """Create a test image and return its bytes."""
    img = Image.new(mode, (width, height), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_mock_response(data, content_length=None):
    """Create a mock requests.Response that streams data."""
    response = MagicMock()

    def iter_content(chunk_size=64):
        for i in range(0, len(data), chunk_size):
            yield data[i : i + chunk_size]

    response.iter_content = iter_content
    response.raise_for_status = MagicMock()
    response.headers = {}
    if content_length is not None:
        response.headers["Content-Length"] = str(content_length)

    # Support use as context manager
    response.__enter__ = MagicMock(return_value=response)
    response.__exit__ = MagicMock(return_value=False)

    return response


class ImageMetadataUrlTests(unittest.TestCase):
    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_with_content_length(self, mock_get):
        img_data = _make_test_image(width=100, height=80)
        mock_get.return_value = _make_mock_response(
            img_data, content_length=len(img_data)
        )

        metadata = fom.ImageMetadata.build_for("http://example.com/img.png")

        self.assertEqual(metadata.width, 100)
        self.assertEqual(metadata.height, 80)
        self.assertEqual(metadata.size_bytes, len(img_data))
        self.assertEqual(metadata.num_channels, 3)

    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_without_content_length(self, mock_get):
        """Chunked transfer encoding: no Content-Length header."""
        img_data = _make_test_image(width=64, height=48)
        mock_get.return_value = _make_mock_response(img_data)

        metadata = fom.ImageMetadata.build_for("http://example.com/img.png")

        self.assertEqual(metadata.width, 64)
        self.assertEqual(metadata.height, 48)
        self.assertEqual(metadata.size_bytes, len(img_data))
        self.assertEqual(metadata.num_channels, 3)

    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_grayscale(self, mock_get):
        img_data = _make_test_image(width=50, height=50, mode="L")
        mock_get.return_value = _make_mock_response(
            img_data, content_length=len(img_data)
        )

        metadata = fom.ImageMetadata.build_for("http://example.com/gray.png")

        self.assertEqual(metadata.width, 50)
        self.assertEqual(metadata.height, 50)
        self.assertEqual(metadata.num_channels, 1)

    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_rgba(self, mock_get):
        img_data = _make_test_image(width=32, height=16, mode="RGBA")
        mock_get.return_value = _make_mock_response(img_data)

        metadata = fom.ImageMetadata.build_for("http://example.com/rgba.png")

        self.assertEqual(metadata.width, 32)
        self.assertEqual(metadata.height, 16)
        self.assertEqual(metadata.num_channels, 4)
        self.assertEqual(metadata.size_bytes, len(img_data))


class MetadataUrlTests(unittest.TestCase):
    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_with_content_length(self, mock_get):
        data = b"some file content here"
        mock_get.return_value = _make_mock_response(
            data, content_length=len(data)
        )

        metadata = fom.Metadata.build_for("http://example.com/file.bin")

        self.assertEqual(metadata.size_bytes, len(data))

    @patch("fiftyone.core.metadata.requests.get")
    def test_build_for_url_without_content_length(self, mock_get):
        data = b"some file content here"
        mock_get.return_value = _make_mock_response(data)

        metadata = fom.Metadata.build_for("http://example.com/file.bin")
        self.assertEqual(metadata.size_bytes, len(data))


class ImageMetadataLocalTests(unittest.TestCase):
    def test_build_for_local(self):
        img_data = _make_test_image(width=200, height=150)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(img_data)
            f.flush()
            path = f.name

        try:
            metadata = fom.ImageMetadata.build_for(path)
            self.assertEqual(metadata.width, 200)
            self.assertEqual(metadata.height, 150)
            self.assertEqual(metadata.num_channels, 3)
            self.assertEqual(metadata.size_bytes, len(img_data))
        finally:
            os.unlink(path)


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
