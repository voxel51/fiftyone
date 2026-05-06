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
        "fiftyone.multimodal.odm.mongo.MultimodalMetadata.build_for"
    ) as mock:
        yield mock


class ViewFieldMatcher:
    def __init__(self, expected):
        self._expected = expected

    def __eq__(self, other):
        try:
            return other.to_mongo() == self._expected.to_mongo()
        except Exception:
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
                ViewFieldMatcher(F("filepath").is_in({"scene1", "scene2"}))
            )
            dataset.add_samples.assert_called_once_with(
                [SampleMatcher("scene1"), SampleMatcher("scene2")]
            )

        def test_update_samples(self, inventories, metadata_builder):
            sample1 = MagicMock(
                __getitem__=lambda _, k: (
                    Mock(scene_id="scene1") if k == "metadata" else None
                )
            )
            sample2 = MagicMock(
                __getitem__=lambda _, k: (
                    Mock(scene_id="scene2") if k == "metadata" else None
                )
            )
            dataset = Mock(
                match=Mock(
                    return_value=[
                        sample1,
                        sample2,
                    ]
                )
            )
            metadata_builder.return_value = Mock()

            ###
            MongoAdapter.write_scene_inventories(dataset, inventories)
            ###

            dataset.match.assert_called_once_with(
                ViewFieldMatcher(F("filepath").is_in({"scene1", "scene2"}))
            )
            sample1.__setitem__.assert_called_once_with(
                "metadata", metadata_builder.return_value
            )
            sample2.__setitem__.assert_called_once_with(
                "metadata", metadata_builder.return_value
            )
            sample1.save.assert_called_once()
            sample2.save.assert_called_once()
            dataset.add_samples.assert_not_called()

        def test_metadata_missing(self, inventories, metadata_builder):
            sample1 = MagicMock(__getitem__=lambda _, _k: None)
            sample2 = MagicMock(__getitem__=lambda _, _k: None)
            dataset = Mock(
                match=Mock(
                    return_value=[
                        sample1,
                        sample2,
                    ]
                )
            )
            metadata_builder.return_value = Mock()

            ###
            MongoAdapter.write_scene_inventories(dataset, inventories)
            ###

            dataset.match.assert_called_once_with(
                ViewFieldMatcher(F("filepath").is_in({"scene1", "scene2"}))
            )
            dataset.add_samples.assert_called_once_with(
                [SampleMatcher("scene1"), SampleMatcher("scene2")]
            )
