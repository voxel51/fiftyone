"""
Label schemas on group datasets: one schema covers every slice.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.label_schema_docs as docs

from decorators import drop_datasets


def _group_dataset():
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="left")
    group = fo.Group()
    video = fo.Sample(filepath="/tmp/v.mp4", group=group.element("video"))
    video.frames[1] = fo.Frame(
        fgt=fo.Detections(detections=[fo.Detection(label="car")])
    )
    dataset.add_samples(
        [
            fo.Sample(
                filepath="/tmp/l.png",
                group=group.element("left"),
                left_gt=fo.Detections(detections=[fo.Detection(label="a")]),
            ),
            fo.Sample(filepath="/tmp/r.png", group=group.element("right")),
            video,
        ]
    )
    return dataset


class GroupDatasetSchemaTests(unittest.TestCase):
    @drop_datasets
    def test_universe_covers_every_slice_but_never_the_group_field(self):
        dataset = _group_dataset()
        for group_slice in ("left", "video"):
            dataset.group_slice = group_slice
            universe = docs.schema_universe(dataset)
            with self.subTest(group_slice=group_slice):
                self.assertIn("left_gt", universe)
                self.assertIn("frames.fgt", universe)
                self.assertNotIn("group", universe)
                self.assertNotIn("frames.id", universe)

    @drop_datasets
    def test_protected_paths_include_the_group_field(self):
        dataset = _group_dataset()
        self.assertIn("group", docs.protected_paths(dataset))
        self.assertIn("media_reference", docs.protected_paths(dataset))
        self.assertNotIn("group", docs.protected_paths(fo.Dataset()))

    @drop_datasets
    def test_a_hidden_default_hides_every_slice_but_not_the_group(self):
        dataset = _group_dataset()
        doc = {
            "id": "d",
            "name": "n",
            "label_schema": {},
            "visibility": {
                "default": "hidden",
                "fields": {"group": {"tier": "hidden"}},
            },
        }
        out = docs.resolve(
            doc,
            docs.schema_universe(dataset),
            protected=docs.protected_paths(dataset),
        )
        self.assertEqual(
            sorted(out["excluded_paths"]), ["frames.fgt", "left_gt"]
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
