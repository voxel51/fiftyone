"""
FiftyOne group test utils

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo


def make_disjoint_groups_dataset():
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="first")

    first_group = fo.Group()
    first = fo.Sample(filepath="first.png", group=first_group.element("first"))

    second_group = fo.Group()
    second = fo.Sample(
        filepath="second.png", group=second_group.element("second")
    )

    dataset.add_samples([first, second])

    return dataset, first, second
