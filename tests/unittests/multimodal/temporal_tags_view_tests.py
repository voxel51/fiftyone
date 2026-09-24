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
from fiftyone.server.view import count_temporal_tags, get_extended_view

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


class GroupedTemporalTagGridFilterTests(unittest.TestCase):
    """On a grouped dataset the filter applies to the active slice's samples,
    like every other sidebar filter; a tag on a sibling slice does not count.
    """

    @drop_tags
    @drop_datasets
    def test_match_selects_the_active_slices_tagged_samples(self):
        dataset, groups, _ = _make_tagged_group_dataset()
        expected = {"image": [], "video": [groups[0]]}

        for slice_name, group_ids in expected.items():
            with self.subTest(slice=slice_name):
                dataset.group_slice = slice_name
                view = get_extended_view(
                    dataset.view(),
                    filters={_TEMPORAL_TAGS: {"values": ["review"]}},
                )

                self.assertEqual(view.values("group.id"), group_ids)

    @drop_tags
    @drop_datasets
    def test_exclude_removes_the_active_slices_tagged_samples(self):
        dataset, groups, _ = _make_tagged_group_dataset()
        expected = {"image": groups, "video": [groups[1]]}

        for slice_name, group_ids in expected.items():
            with self.subTest(slice=slice_name):
                dataset.group_slice = slice_name
                view = get_extended_view(
                    dataset.view(),
                    filters={
                        _TEMPORAL_TAGS: {
                            "values": ["review"],
                            "exclude": True,
                        }
                    },
                )

                self.assertEqual(view.values("group.id"), group_ids)

    @drop_tags
    @drop_datasets
    def test_match_on_a_flattened_collection_selects_the_tagged_sample(self):
        # `load_view` flattens a grouped collection with
        # `select_group_slices(_force_mixed=True)` for the modal before
        # applying its filters.
        dataset, _, tagged_id = _make_tagged_group_dataset()
        flat = dataset.select_group_slices(_force_mixed=True)

        view = get_extended_view(
            flat, filters={_TEMPORAL_TAGS: {"values": ["review"]}}
        )

        self.assertEqual(view.values("id"), [tagged_id])

    @drop_tags
    @drop_datasets
    def test_match_temporal_tags_stage_matches_the_active_slice(self):
        dataset, groups, _ = _make_tagged_group_dataset()
        expected = {
            "image": ([], groups),
            "video": ([groups[0]], [groups[1]]),
        }

        for slice_name, (matched, excluded) in expected.items():
            with self.subTest(slice=slice_name):
                dataset.group_slice = slice_name

                self.assertEqual(
                    dataset.match_temporal_tags(tags=["review"]).values(
                        "group.id"
                    ),
                    matched,
                )
                self.assertEqual(
                    dataset.match_temporal_tags(
                        tags=["review"], bool=False
                    ).values("group.id"),
                    excluded,
                )


class TemporalTagCountTests(unittest.TestCase):
    @drop_tags
    @drop_datasets
    def test_counts_only_the_views_samples(self):
        dataset, ids = _make_tagged_dataset()

        self.assertEqual(
            count_temporal_tags(dataset.exclude(ids[0])),
            {"keep": 1, "review": 1},
        )

    @drop_tags
    @drop_datasets
    def test_counts_only_the_active_slice(self):
        dataset, _, _ = _make_tagged_group_dataset()
        expected = {"image": {}, "video": {"review": 1}}

        for slice_name, counts in expected.items():
            with self.subTest(slice=slice_name):
                dataset.group_slice = slice_name

                self.assertEqual(count_temporal_tags(dataset.view()), counts)

    @drop_tags
    @drop_datasets
    def test_counts_every_interval(self):
        dataset, ids = _make_tagged_dataset()
        fota.add_temporal_tags(
            dataset,
            [
                fota.TemporalTag(
                    ids[0], 5, 6, "review", kind=fota.TagKind.TEMPORAL
                )
            ],
        )

        self.assertEqual(
            count_temporal_tags(dataset.select(ids[0])), {"review": 2}
        )


def _make_tagged_group_dataset():
    """Two groups of an image and a video slice; only the first group's video
    sample carries the "review" tag, and its id is returned."""
    dataset = fo.Dataset()
    dataset.add_group_field("group", default="image")

    samples, groups = [], []
    for idx in range(2):
        group = fo.Group()
        groups.append(group.id)
        samples.append(
            fo.Sample(
                filepath="/tmp/temporal-tag-group-%d.jpg" % idx,
                group=group.element("image"),
            )
        )
        samples.append(
            fo.Sample(
                filepath="/tmp/temporal-tag-group-%d.mp4" % idx,
                group=group.element("video"),
            )
        )

    dataset.add_samples(samples)

    # The tag goes on the video slice of the first group, which is not the
    # default slice the grid opens on.
    fota.add_temporal_tags(
        dataset,
        [
            fota.TemporalTag(
                str(samples[1].id), 0, 1, "review", kind=fota.TagKind.TEMPORAL
            )
        ],
    )

    return dataset, groups, str(samples[1].id)


def _make_tagged_dataset():
    dataset = fo.Dataset()
    samples = [
        fo.Sample(filepath="/tmp/temporal-tag-grid-%d.jpg" % idx)
        for idx in range(3)
    ]
    dataset.add_samples(samples)
    ids = [str(sample.id) for sample in samples]

    temporal = fota.TagKind.TEMPORAL
    fota.add_temporal_tags(
        dataset,
        [
            fota.TemporalTag(ids[0], 0, 1, "review", kind=temporal),
            fota.TemporalTag(ids[1], 0, 1, "keep", kind=temporal),
            fota.TemporalTag(ids[2], 2, 3, "review", kind=temporal),
        ],
    )

    return dataset, ids


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
