"""
Grid filtering by temporal tags (server view integration).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from decorators import drop_collection, drop_datasets

import fiftyone as fo
import fiftyone.core.tags as fota
from fiftyone.server.view import get_extended_view

drop_tags = drop_collection(fota.TAGS_COLLECTION_NAME)

_TEMPORAL_TAGS = "_temporal_tags"


class TemporalTagGridFilterTests(unittest.TestCase):
    @drop_tags
    @drop_datasets
    def test_match_selects_tagged_samples(self):
        dataset, ids = _make_tagged_dataset()

        view = get_extended_view(
            dataset, filters={_TEMPORAL_TAGS: {"values": ["review"]}}
        )

        # Samples 0 and 2 carry the "review" tag; sample 1 does not.
        self.assertEqual(set(view.values("id")), {ids[0], ids[2]})

    @drop_tags
    @drop_datasets
    def test_match_is_any_of_the_values(self):
        dataset, ids = _make_tagged_dataset()

        view = get_extended_view(
            dataset,
            filters={_TEMPORAL_TAGS: {"values": ["review", "keep"]}},
        )

        # "review" -> {0, 2}, "keep" -> {1}; union is every sample.
        self.assertEqual(set(view.values("id")), set(ids))

    @drop_tags
    @drop_datasets
    def test_exclude_removes_tagged_samples(self):
        dataset, ids = _make_tagged_dataset()

        view = get_extended_view(
            dataset,
            filters={_TEMPORAL_TAGS: {"values": ["review"], "exclude": True}},
        )

        # Only the untagged-by-"review" sample survives.
        self.assertEqual(set(view.values("id")), {ids[1]})

    @drop_tags
    @drop_datasets
    def test_match_with_no_hits_is_empty(self):
        dataset, _ = _make_tagged_dataset()

        view = get_extended_view(
            dataset, filters={_TEMPORAL_TAGS: {"values": ["nonexistent"]}}
        )

        self.assertEqual(len(view), 0)

    @drop_tags
    @drop_datasets
    def test_empty_values_is_a_noop(self):
        dataset, ids = _make_tagged_dataset()

        # get_extended_view is always called with a view in production.
        view = get_extended_view(
            dataset.view(), filters={_TEMPORAL_TAGS: {"values": []}}
        )

        self.assertEqual(set(view.values("id")), set(ids))

    @drop_tags
    @drop_datasets
    def test_intersects_with_existing_view(self):
        dataset, ids = _make_tagged_dataset()

        # Pre-limit the collection to samples 0 and 1, then match "review"
        # ({0, 2}); the result must intersect to just {0}.
        view = get_extended_view(
            dataset.select([ids[0], ids[1]]),
            filters={_TEMPORAL_TAGS: {"values": ["review"]}},
        )

        self.assertEqual(set(view.values("id")), {ids[0]})


def _make_tagged_dataset():
    dataset = fo.Dataset()
    samples = [
        fo.Sample(filepath="/tmp/temporal-tag-grid-%d.jpg" % idx)
        for idx in range(3)
    ]
    dataset.add_samples(samples)
    ids = [str(sample.id) for sample in samples]

    fota.add_temporal_tags(
        dataset,
        [
            fota.TemporalTag(ids[0], 0, 1, "review"),
            fota.TemporalTag(ids[1], 0, 1, "keep"),
            fota.TemporalTag(ids[2], 2, 3, "review"),
        ],
    )

    return dataset, ids


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
