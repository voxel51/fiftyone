"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import Mock, call, patch

import pytest

from fiftyone.multimodal import ingest


@pytest.fixture(name="adapter")
def mock_adapter():
    return Mock()


@pytest.fixture(name="storage")
def mock_storage():
    with patch("fiftyone.multimodal.ingest.storage") as mock:
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
