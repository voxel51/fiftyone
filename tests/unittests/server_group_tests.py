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

        # noop
        first = dataset.first().id
        view, _ = fosv.handle_group_filter(
            dataset,
            dataset.select(first),
            GroupElementFilter(),
        )
        self.assertEqual(view._all_stages, [fo.Select(first)])

    @drop_datasets
    def test_group_selection(self):
        dataset: fo.Dataset = fo.Dataset()
        group = fo.Group()
        one = fo.Sample(
            filepath="image.png",
            group=group.element("one"),
        )
        two = fo.Sample(
            filepath="image.png",
            group=group.element("two"),
        )

        dataset.add_samples([one, two])

        selection = dataset.select(one.id)

        with_slices, _ = fosv.handle_group_filter(
            dataset,
            selection,
            GroupElementFilter(id=group.id, slices=["one", "two"]),
        )
        self.assertEqual(len(with_slices), 2)

        without_slices, _ = fosv.handle_group_filter(
            dataset,
            selection,
            GroupElementFilter(id=group.id, slices=["one", "two"]),
        )
        self.assertEqual(len(without_slices), 2)
