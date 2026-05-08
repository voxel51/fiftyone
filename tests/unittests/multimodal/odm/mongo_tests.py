"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import MagicMock, Mock, call, patch

import pytest

from fiftyone.multimodal.odm.mongo import MongoAdapter


@pytest.fixture(name="inventories")
def fixture_inventories():
    return [Mock(scene_id="scene1"), Mock(scene_id="scene2")]


@pytest.fixture(name="metadata_builder")
def fixture_metadata_builder():
    with patch(
        "fiftyone.multimodal.odm.mongo.MultimodalMetadata.build_for_scene_inventory"
    ) as mock:
        yield mock


class TestMongoAdapter:
    class TestWriteSceneInventories:
        def test_add_samples(self, inventories, metadata_builder):
            dataset = Mock(match=Mock(return_value=[]))
            samples = [MagicMock(id=None), MagicMock(id=None)]

            ###
            MongoAdapter.write_scene_inventories(
                dataset,
                zip(samples, inventories),
            )
            ###

            metadata_builder.assert_has_calls(
                [call(inventory) for inventory in inventories]
            )
            dataset.set_values.assert_not_called()
            dataset.add_samples.assert_called_once_with(samples)

        def test_update_samples(self, inventories, metadata_builder):
            dataset = Mock(match=Mock(return_value=[]))
            metadatas = [Mock(), Mock()]
            metadata_builder.side_effect = metadatas
            samples = [MagicMock(id="sample1"), MagicMock(id="sample2")]

            ###
            MongoAdapter.write_scene_inventories(
                dataset,
                zip(samples, inventories),
            )
            ###

            dataset.set_values.assert_called_once_with(
                "metadata",
                {"sample1": metadatas[0], "sample2": metadatas[1]},
                key_field="id",
            )
            dataset.add_samples.assert_not_called()
