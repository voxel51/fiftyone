"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import Mock, call, patch

import pytest

import fiftyone as fo
from fiftyone.multimodal import ingest


@pytest.fixture(name="adapter")
def mock_adapter():
    return Mock()


@pytest.fixture(name="storage")
def mock_storage():
    with patch("fiftyone.multimodal.ingest.read.storage") as mock:
        yield mock


class TestGetSceneInventories:
    def test_empty_input(self, adapter):
        ###
        result = ingest._get_scene_inventories([], adapter=adapter)
        ###

        assert result == []
        adapter.get_scene_inventory.assert_not_called()

    def test_reads_file(self, adapter, storage):
        storage.exists.return_value = True
        storage.isdir.return_value = False
        adapter.can_read.return_value = True
        adapter.get_scene_inventory.return_value = "scene inventory"

        ###
        result = ingest._get_scene_inventories(
            ["/path/to/file"], adapter=adapter
        )
        ###

        assert result == ["scene inventory"]
        adapter.get_scene_inventory.assert_called_with("/path/to/file")

    def test_ignores_unreadable_file(self, adapter, storage):
        storage.exists.return_value = True
        storage.isdir.return_value = False
        adapter.can_read.return_value = False
        adapter.get_scene_inventory.return_value = "scene inventory"

        ###
        result = ingest._get_scene_inventories(
            ["/path/to/file"], adapter=adapter
        )
        ###

        assert result == []
        adapter.get_scene_inventory.assert_not_called()

    def test_crawls_directory(self, adapter, storage):
        storage.exists.return_value = False
        storage.isdir.return_value = True
        storage.list_files.return_value = [
            "/path/to/file",
            "/path/to/another_file",
        ]
        adapter.can_read.return_value = True
        adapter.get_scene_inventory.return_value = "scene inventory"

        ###
        result = ingest._get_scene_inventories(
            ["/path/to/directory"], adapter=adapter
        )
        ###

        assert result == ["scene inventory", "scene inventory"]
        storage.list_files.assert_called_with(
            "/path/to/directory", abs_paths=True, recursive=True
        )
        adapter.get_scene_inventory.assert_has_calls(
            [call("/path/to/file"), call("/path/to/another_file")]
        )

    def test_ignores_unreadable_files(self, adapter, storage):
        storage.exists.return_value = False
        storage.isdir.return_value = True
        storage.list_files.return_value = [
            "/path/to/readable_file",
            "/path/to/unreadable_file",
        ]
        adapter.can_read.side_effect = (
            lambda filepath: filepath == "/path/to/readable_file"
        )
        adapter.get_scene_inventory.return_value = "scene inventory"

        ###
        result = ingest._get_scene_inventories(
            ["/path/to/directory"], adapter=adapter
        )
        ###

        assert result == ["scene inventory"]
        adapter.get_scene_inventory.assert_called_with(
            "/path/to/readable_file"
        )

    def test_does_not_read_directory_as_file(self, adapter, storage):
        storage.exists.return_value = True
        adapter.can_read.return_value = True
        storage.isdir.return_value = True
        storage.list_files.return_value = [
            "/path/to/file",
            "/path/to/another_file",
        ]
        adapter.get_scene_inventory.return_value = "scene inventory"

        ###
        result = ingest._get_scene_inventories(
            ["/path/to/directory"], adapter=adapter
        )
        ###

        assert result == ["scene inventory", "scene inventory"]
        storage.list_files.assert_called_with(
            "/path/to/directory", abs_paths=True, recursive=True
        )
        adapter.get_scene_inventory.assert_has_calls(
            [call("/path/to/file"), call("/path/to/another_file")]
        )


class TestIngestFilepaths:
    def test_success(self):
        dataset = Mock()
        adapter = Mock()

        with patch(
            "fiftyone.multimodal.ingest._get_scene_inventories",
            return_value=[Mock(scene_id="scene 1"), Mock(scene_id="scene 2")],
        ) as mock_get_inventories, patch(
            "fiftyone.multimodal.db.mongo.MongoAdapter.write_scene_inventories"
        ) as mock_write:
            ingest.ingest_files(
                dataset,
                ["/some/path", "/another/path"],
                adapter=adapter,
                manifest=None,
            )

        mock_get_inventories.assert_called_with(
            ["/some/path", "/another/path"], adapter=adapter
        )
        mock_write.assert_called_once()
        dataset.save.assert_called_once()

        write_args, _ = mock_write.call_args
        assert write_args[0] is dataset

        sample_inventory_pairs = write_args[1]
        assert len(sample_inventory_pairs) == 2

        sample1 = sample_inventory_pairs[0][0]
        assert sample1.filepath.endswith("scene 1")
        assert sample1.media_type == fo.core.media.MULTIMODAL

        sample2 = sample_inventory_pairs[1][0]
        assert sample2.filepath.endswith("scene 2")
        assert sample2.media_type == fo.core.media.MULTIMODAL
