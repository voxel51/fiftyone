"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

from fiftyone import Sample, ViewField as F
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


class ViewFieldMatcher:
    def __init__(self, expected):
        self._expected = expected

    def __eq__(self, other):
        try:
            return other.to_mongo() == self._expected.to_mongo()
        except AttributeError:
            return False

    def __repr__(self):
        return f"ViewFieldMatcher(mongo={self._expected.to_mongo()})"


class SampleMatcher:
    def __init__(self, suffix):
        self._suffix = suffix

    def __eq__(self, other):
        return (
            isinstance(other, Sample)
            and "metadata" in other
            and other.filepath.endswith(self._suffix)
        )

    def __repr__(self):
        return "SampleMatcher()"


class TestMongoAdapter:
    class TestWriteSceneInventories:
        def test_add_samples(self, inventories, metadata_builder):
            dataset = Mock(match=Mock(return_value=[]))
            metadata_builder.return_value = Mock()

            ###
            MongoAdapter.write_scene_inventories(dataset, inventories)
            ###

            dataset.match.assert_called_once_with(
                ViewFieldMatcher(
                    F("metadata.scene_id").is_in({"scene1", "scene2"})
                )
            )
            dataset.add_samples.assert_called_once_with(
                [SampleMatcher("scene1"), SampleMatcher("scene2")]
            )

        def test_update_samples(self, inventories, metadata_builder):
            sample1 = MagicMock(
                id="sample1",
                __getitem__=lambda _, k: (
                    "scene1" if k == "metadata.scene_id" else None
                ),
            )
            sample2 = MagicMock(
                id="sample2",
                __getitem__=lambda _, k: (
                    "scene2" if k == "metadata.scene_id" else None
                ),
            )
            dataset = Mock(
                match=Mock(
                    return_value=[
                        sample1,
                        sample2,
                    ]
                )
            )

            metadata1 = Mock()
            metadata2 = Mock()
            metadata_builder.side_effect = [metadata1, metadata2]

            ###
            MongoAdapter.write_scene_inventories(dataset, inventories)
            ###

            dataset.match.assert_called_once_with(
                ViewFieldMatcher(
                    F("metadata.scene_id").is_in({"scene1", "scene2"})
                )
            )
            dataset.set_values.assert_called_once_with(
                "metadata",
                {"sample1": metadata1, "sample2": metadata2},
                key_field="id",
            )
            dataset.add_samples.assert_not_called()

        def test_duplicate_new_scene_ids(self, inventories, metadata_builder):
            dataset = Mock(match=Mock(return_value=[]))
            metadata_builder.return_value = Mock()

            ###
            MongoAdapter.write_scene_inventories(
                dataset, inventories + [Mock(scene_id="scene1")]
            )
            ###

            dataset.match.assert_called_once_with(
                ViewFieldMatcher(
                    F("metadata.scene_id").is_in({"scene1", "scene2"})
                )
            )
            dataset.add_samples.assert_called_once_with(
                [SampleMatcher("scene1"), SampleMatcher("scene2")]
            )

        def test_existing_duplicates(self, metadata_builder):
            sample1 = MagicMock(
                id="sample1",
                __getitem__=lambda _, k: (
                    "scene1" if k == "metadata.scene_id" else None
                ),
            )
            sample2 = MagicMock(
                id="sample2",
                __getitem__=lambda _, k: (
                    "scene1" if k == "metadata.scene_id" else None
                ),
            )
            dataset = Mock(
                match=Mock(
                    return_value=[
                        sample1,
                        sample2,
                    ]
                )
            )

            metadata1 = Mock()
            metadata_builder.side_effect = [metadata1, Mock()]

            ###
            MongoAdapter.write_scene_inventories(
                dataset, [Mock(scene_id="scene1")]
            )
            ###

            dataset.set_values.assert_called_once_with(
                "metadata",
                {"sample1": metadata1, "sample2": metadata1},
                key_field="id",
            )
            dataset.add_samples.assert_not_called()
