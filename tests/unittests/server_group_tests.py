"""
FiftyOne Server group tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId

import fiftyone as fo
from fiftyone import ViewExpression as F
from fiftyone.server.aggregations import GroupElementFilter
import fiftyone.server.view as fosv

from decorators import drop_datasets


class ServerGroupTests(unittest.TestCase):
    @drop_datasets
    def test_manual_group_slice(self):
        dataset: fo.Dataset = fo.Dataset()
        group = fo.Group()
        image = fo.Sample(
            filepath="image.png",
            group=group.element("image"),
            label=fo.Classification(label="label"),
        )
        dataset.add_sample(image)
        expr = F("label") == "label"
        filtered = dataset.filter_labels("label", F("label") == "label")

        view, _ = fosv.handle_group_filter(
            dataset,
            filtered,
            GroupElementFilter(slice="image", slices=["image"]),
        )
        self.assertEqual(
            view._all_stages,
            [
                fo.SelectGroupSlices(_force_mixed=True),
                fo.FilterLabels("label", expr),
                fo.Match({"group.name": {"$in": ["image"]}}),
            ],
        )

        view, _ = fosv.handle_group_filter(
            dataset,
            filtered,
            GroupElementFilter(
                id=image.group.id, slice="image", slices=["image"]
            ),
        )
        self.assertEqual(
            view._all_stages,
            [
                fo.SelectGroupSlices(_force_mixed=True),
                fo.Match({"group._id": {"$in": [ObjectId(image.group.id)]}}),
                fo.FilterLabels("label", expr),
                fo.Match({"group.name": {"$in": ["image"]}}),
            ],
        )

        # dynamic group
        filtered = dataset.group_by("label.label").filter_labels(
            "label", F("label") == "label"
        )
        view, _ = fosv.handle_group_filter(
            dataset,
            filtered,
            GroupElementFilter(slice="image", slices=["image"]),
        )
        self.assertEqual(
            view._all_stages,
            [
                fo.SelectGroupSlices(_force_mixed=True),
                fo.Match({"group.name": {"$in": ["image"]}}),
                fo.GroupBy("label.label"),
                fo.FilterLabels("label", expr),
            ],
        )
