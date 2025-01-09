"""
FiftyOne Server index related unit test

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
from dataclasses import asdict
import unittest

import fiftyone as fo
from fiftyone.server.indexes import from_dict, Index, IndexFields

from decorators import drop_datasets


class ServerIndexTests(unittest.TestCase):
    @drop_datasets
    def test_image(self):
        dataset = fo.Dataset()
        sample, frame = [
            Index(
                name="id",
                key=[IndexFields(field="_id", type="asc")],
            ),
            Index(
                name="filepath",
                key=[IndexFields(field="filepath", type="asc")],
            ),
            Index(
                name="created_at",
                key=[IndexFields(field="created_at", type="asc")],
            ),
            Index(
                name="last_modified_at",
                key=[IndexFields(field="last_modified_at", type="asc")],
            ),
        ], []
        sample_result, frame_result = from_dict(
            dataset.get_index_information()
        )
        self.assertEqual(_asdict(sample), _asdict(sample_result))
        self.assertEqual(_asdict(frame), _asdict(frame_result))

    @drop_datasets
    def test_group(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group")
        sample, frame = [
            Index(
                name="id",
                key=[IndexFields(field="_id", type="asc")],
            ),
            Index(
                name="filepath",
                key=[IndexFields(field="filepath", type="asc")],
            ),
            Index(
                name="created_at",
                key=[IndexFields(field="created_at", type="asc")],
            ),
            Index(
                name="last_modified_at",
                key=[IndexFields(field="last_modified_at", type="asc")],
            ),
            Index(
                name="group.id",
                key=[IndexFields(field="group._id", type="asc")],
            ),
            Index(
                name="group.name",
                key=[IndexFields(field="group.name", type="asc")],
            ),
        ], []
        sample_result, frame_result = from_dict(
            dataset.get_index_information()
        )
        self.assertEqual(_asdict(sample), _asdict(sample_result))
        self.assertEqual(_asdict(frame), _asdict(frame_result))

    @drop_datasets
    def test_video(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"
        sample, frame = [
            Index(
                name="id",
                key=[IndexFields(field="_id", type="asc")],
            ),
            Index(
                name="filepath",
                key=[IndexFields(field="filepath", type="asc")],
            ),
            Index(
                name="created_at",
                key=[IndexFields(field="created_at", type="asc")],
            ),
            Index(
                name="last_modified_at",
                key=[IndexFields(field="last_modified_at", type="asc")],
            ),
        ], [
            Index(
                name="id",
                key=[IndexFields(field="_id", type="asc")],
            ),
            Index(
                name="_sample_id_1_frame_number_1",
                key=[
                    IndexFields(field="_sample_id", type="asc"),
                    IndexFields(field="frame_number", type="asc"),
                ],
                unique=True,
            ),
            Index(
                name="created_at",
                key=[IndexFields(field="created_at", type="asc")],
            ),
            Index(
                name="last_modified_at",
                key=[IndexFields(field="last_modified_at", type="asc")],
            ),
        ]
        sample_result, frame_result = from_dict(
            dataset.get_index_information()
        )
        self.assertEqual(_asdict(sample), _asdict(sample_result))
        self.assertEqual(_asdict(frame), _asdict(frame_result))


def _asdict(indexes: t.List[Index]):
    return [asdict(i) for i in indexes]
