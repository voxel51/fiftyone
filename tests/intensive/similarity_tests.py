"""
Visual similarity tests.

You must run these tests interactively as follows::

    pytest tests/intensive/similarity_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.brain as fob  # pylint: disable=import-error,no-name-in-module
import fiftyone.zoo as foz


def test_image_similarity():
    dataset = foz.load_zoo_dataset("quickstart").clone()

    fob.compute_similarity(dataset, brain_key="image_similarity")

    img_similarity = dataset.sort_by_similarity(dataset.first().id)
    print(img_similarity)

    session = fo.launch_app(view=img_similarity)
    session.wait()


def test_object_similarity():
    dataset = foz.load_zoo_dataset("quickstart").clone()

    fob.compute_similarity(
        dataset, patches_field="ground_truth", brain_key="gt_similarity"
    )

    patches = dataset.to_patches("ground_truth")
    obj_similarity = patches.sort_by_similarity(patches.first().id)
    print(obj_similarity)

    session = fo.launch_app(view=obj_similarity)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
