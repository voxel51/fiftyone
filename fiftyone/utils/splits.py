"""
Dataset split utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random

import numpy as np


def random_split(sample_collection, split_fracs, seed=None):
    """Generates a random partition of the samples in the collection according
    to the specified split fractions.

    The partition is denoted by tagging each sample with its assigned split.

    Example::

        import fiftyone as fo
        import fiftyone.utils.splits as fous
        import fiftyone.zoo as foz

        # A dataset with `ground_truth` detections and no tags
        dataset = (
            foz.load_zoo_dataset("quickstart")
            .select_fields("ground_truth")
            .set_field("tags", [])
        ).clone()

        fous.random_split(dataset, {"train": 0.7, "test": 0.2, "val": 0.1})

        print(dataset.count_sample_tags())
        # {'train': 140, 'test': 40, 'val': 20}

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        split_fracs: a dict mapping split tag strings to split fractions in
            ``[0, 1]``. The split fractions are normalized so that they sum to
            1, if necessary
        seed (None): an optional random seed
    """
    tags, fracs = zip(*split_fracs.items())

    fracs = np.cumsum(fracs)
    alpha = len(sample_collection) / fracs[-1]
    threshs = np.round(alpha * fracs).astype(int)

    ids = sample_collection.values("id")
    random.Random(seed).shuffle(ids)

    split_ids = np.split(ids, threshs)

    for sample_ids, tag in zip(split_ids, tags):
        sample_collection.select(sample_ids).tag_samples(tag)
