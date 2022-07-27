"""
FiftyOne group-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo

from decorators import drop_datasets


class GroupTests(unittest.TestCase):
    @drop_datasets
    def test_groups(self):
        dataset = fo.Dataset()

        group = fo.Group()

        sample1 = fo.Sample(
            filepath="left-image.jpg",
            group_field=group.element("left"),
        )
        sample2 = fo.Sample(
            filepath="ego-video.mp4",
            group_field=group.element("ego"),
        )
        sample3 = fo.Sample(
            filepath="right-image.jpg",
            group_field=group.element("right"),
        )

        dataset.add_samples([sample1, sample2, sample3])

        self.assertEqual(dataset.media_type, "group")
        self.assertEqual(dataset.group_field, "group_field")

        # Default slice defaults to first observed slice
        self.assertEqual(dataset.default_group_slice, "left")

        dataset.default_group_slice = "ego"
        self.assertEqual(dataset.default_group_slice, "ego")

        # Datasets may only have one group field
        with self.assertRaises(ValueError):
            dataset.clone_sample_field("group_field", "group_field_copy")

        # Group fields are default fields
        view = dataset.select_fields()
        self.assertIn("group_field", view.get_field_schema())

        with self.assertRaises(ValueError):
            dataset.delete_sample_field("group_field")

        dataset.rename_sample_field("group_field", "still_group_field")
        self.assertEqual(dataset.group_field, "still_group_field")

        dataset.rename_sample_field("still_group_field", "group_field")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
