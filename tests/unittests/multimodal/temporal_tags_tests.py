"""
Multimodal temporal tag unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId
from decorators import drop_collection, drop_datasets

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.multimodal as fomm
from fiftyone.multimodal.tags import (
    TEMPORAL_TAGS_COLLECTION_NAME,
    TimeTrackType,
)

drop_temporal_tags = drop_collection(TEMPORAL_TAGS_COLLECTION_NAME)


class TemporalTagTests(unittest.TestCase):
    @drop_temporal_tags
    @drop_datasets
    def test_validation_and_defaults(self):
        dataset, sample_ids = _make_dataset()
        sample_id = sample_ids[0]

        self.assertEqual(fomm.list_temporal_tags(dataset), [])
        self.assertEqual(fomm.count_temporal_tags(dataset), {})
        self.assertEqual(fomm.delete_temporal_tags(dataset, tags="missing"), 0)
        self.assertNotIn(
            TEMPORAL_TAGS_COLLECTION_NAME,
            foo.get_db_conn().list_collection_names(),
        )

        persisted = fomm.add_temporal_tags(
            dataset, fomm.TemporalTag(sample_id, 0, 1, "review")
        )

        self.assertEqual(len(persisted), 1)
        self.assertEqual(
            persisted[0].index_type,
            TimeTrackType.TIME_TRACK_TYPE_DURATION_NS,
        )
        self.assertIsNone(persisted[0].anchor)
        self.assertNotIn("anchor", persisted[0].to_dict())
        self.assertEqual(persisted[0].copy(), persisted[0])

        temporal_tags = fomm.TemporalTags(dataset)
        self.assertTrue(temporal_tags)
        self.assertEqual(len(temporal_tags), 1)
        self.assertEqual(list(temporal_tags), [persisted[0].id])
        self.assertEqual(temporal_tags.first(), persisted[0])
        self.assertEqual(temporal_tags.head(), persisted)
        self.assertEqual(temporal_tags.tail(), persisted)
        self.assertEqual(list(temporal_tags.keys()), [persisted[0].id])
        self.assertEqual(
            list(temporal_tags.items()), [(persisted[0].id, persisted[0])]
        )
        self.assertEqual(list(temporal_tags.values()), persisted)
        self.assertEqual(temporal_tags.count(), {"review": 1})

        invalid_tags = [
            fomm.TemporalTag(str(ObjectId()), 0, 1, "missing"),
            fomm.TemporalTag(sample_id, 1, 1, "same"),
            fomm.TemporalTag(sample_id, 2, 1, "backwards"),
            fomm.TemporalTag(sample_id, 0.5, 1, "fractional"),
            fomm.TemporalTag(sample_id, 0, 1, ""),
            fomm.TemporalTag(sample_id, 0, 1, "empty-anchor", anchor=""),
            fomm.TemporalTag(sample_id, 0, 1, "blank-anchor", anchor="   "),
            fomm.TemporalTag(sample_id, 0, 1, "bad-anchor", anchor=3),
            fomm.TemporalTag(sample_id, 0, 1, "bool-anchor", anchor=False),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "unsupported",
                index_type=TimeTrackType.TIME_TRACK_TYPE_UNSPECIFIED,
            ),
        ]

        for tag in invalid_tags:
            with self.assertRaises(ValueError):
                fomm.add_temporal_tags(dataset, tag)

        self.assertEqual(temporal_tags.clear(), 1)
        self.assertFalse(temporal_tags)
        self.assertEqual(fomm.list_temporal_tags(dataset), [])
        with self.assertRaises(ValueError):
            temporal_tags.first()

    @drop_temporal_tags
    @drop_datasets
    def test_storage_filtering_counts_and_deletion(self):
        dataset, sample_ids = _make_dataset(2)
        first = fomm.TemporalTag(sample_ids[0], 0, 10, "review")

        inserted = fomm.add_temporal_tags(dataset, first)
        repeated = fomm.add_temporal_tags(dataset, first)

        self.assertEqual(inserted[0].id, repeated[0].id)
        self.assertEqual(len(fomm.list_temporal_tags(dataset)), 1)

        fomm.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(sample_ids[0], 5, 15, "review"),
                fomm.TemporalTag(sample_ids[0], 0, 10, "keep"),
                fomm.TemporalTag(
                    sample_ids[1],
                    0,
                    1,
                    "review",
                    index_type=TimeTrackType.TIME_TRACK_TYPE_SEQUENCE,
                ),
            ],
        )

        self.assertEqual(len(fomm.list_temporal_tags(dataset)), 4)
        self.assertEqual(
            fomm.count_temporal_tags(dataset), {"keep": 1, "review": 3}
        )

        sample_tags = fomm.list_temporal_tags(
            dataset, fomm.TemporalTagFilter(sample_ids=sample_ids[0])
        )
        self.assertEqual(len(sample_tags), 3)
        self.assertTrue(
            all(tag.sample_id == sample_ids[0] for tag in sample_tags)
        )

        overlap_at_boundary = fomm.list_temporal_tags(
            dataset,
            fomm.TemporalTagFilter(
                index_type=TimeTrackType.TIME_TRACK_TYPE_DURATION_NS,
                start=10,
                end=11,
            ),
        )
        self.assertEqual(
            [(tag.start, tag.end, tag.tag) for tag in overlap_at_boundary],
            [(5, 15, "review")],
        )

        self.assertEqual(
            len(
                fomm.list_temporal_tags(
                    dataset, fomm.TemporalTagFilter(tags="review")
                )
            ),
            3,
        )

        with self.assertRaises(ValueError):
            fomm.delete_temporal_tags(dataset)

        self.assertEqual(
            fomm.delete_temporal_tags(dataset, ids=inserted[0].id), 1
        )
        self.assertEqual(
            fomm.delete_temporal_tags(
                dataset,
                filter=fomm.TemporalTagFilter(sample_ids=sample_ids[1]),
            ),
            1,
        )
        self.assertEqual(fomm.delete_temporal_tags(dataset, tags="keep"), 1)
        self.assertEqual(len(fomm.list_temporal_tags(dataset)), 1)
        self.assertEqual(
            fomm.delete_temporal_tags(dataset, delete_all=True), 1
        )

    @drop_temporal_tags
    @drop_datasets
    def test_anchor_identity_filtering_counts_and_deletion(self):
        dataset, sample_ids = _make_dataset()
        sample_id = sample_ids[0]

        unanchored = fomm.TemporalTag(sample_id, 0, 10, "review")
        camera = fomm.TemporalTag(
            sample_id, 0, 10, "review", anchor="camera_front"
        )
        lidar = fomm.TemporalTag(
            sample_id, 0, 10, "review", anchor="lidar_top"
        )

        inserted = fomm.add_temporal_tags(dataset, [unanchored, camera, lidar])
        repeated = fomm.add_temporal_tags(dataset, camera)

        self.assertEqual(len(inserted), 3)
        self.assertEqual(inserted[1].id, repeated[0].id)
        self.assertEqual(
            [tag.anchor for tag in inserted],
            [None, "camera_front", "lidar_top"],
        )
        self.assertEqual(inserted[1].to_dict()["anchor"], "camera_front")
        self.assertEqual(fomm.count_temporal_tags(dataset), {"review": 3})
        self.assertEqual(
            fomm.count_temporal_tags(
                dataset, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            {"review": 1},
        )

        anchored_tags = fomm.list_temporal_tags(
            dataset,
            fomm.TemporalTagFilter(anchors=["camera_front", "lidar_top"]),
        )
        self.assertEqual(
            {tag.anchor for tag in anchored_tags},
            {"camera_front", "lidar_top"},
        )

        self.assertEqual(
            fomm.delete_temporal_tags(
                dataset,
                filter=fomm.TemporalTagFilter(anchors="camera_front"),
            ),
            1,
        )
        self.assertEqual(fomm.count_temporal_tags(dataset), {"review": 2})
        self.assertEqual(
            fomm.list_temporal_tags(
                dataset, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            [],
        )

    @drop_temporal_tags
    @drop_datasets
    def test_replaces_legacy_unique_index(self):
        collection = foo.get_db_conn()[TEMPORAL_TAGS_COLLECTION_NAME]
        collection.create_index(
            [
                ("_dataset_id", 1),
                ("_sample_id", 1),
                ("index_type", 1),
                ("start", 1),
                ("end", 1),
                ("tag", 1),
            ],
            unique=True,
            name="unique_temporal_tag",
        )

        dataset, sample_ids = _make_dataset()
        fomm.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_ids[0], 0, 10, "review", anchor="camera_front"
            ),
        )

        index_keys = collection.index_information()["unique_temporal_tag"][
            "key"
        ]
        self.assertIn(("anchor", 1), index_keys)

    @drop_temporal_tags
    @drop_datasets
    def test_view_scoped_operations(self):
        dataset, sample_ids = _make_dataset(3)
        fomm.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(sample_ids[0], 0, 10, "shared"),
                fomm.TemporalTag(sample_ids[1], 0, 10, "shared"),
                fomm.TemporalTag(sample_ids[2], 0, 10, "other"),
            ],
        )

        view = dataset.select([sample_ids[0], sample_ids[2]])

        self.assertEqual(
            fomm.count_temporal_tags(dataset), {"other": 1, "shared": 2}
        )
        self.assertEqual(
            fomm.count_temporal_tags(view), {"other": 1, "shared": 1}
        )

        view_tags = fomm.list_temporal_tags(view)
        self.assertEqual(
            {tag.sample_id for tag in view_tags},
            {sample_ids[0], sample_ids[2]},
        )

        self.assertEqual(
            fomm.list_temporal_tags(
                view, fomm.TemporalTagFilter(sample_ids=sample_ids[1])
            ),
            [],
        )

        fomm.add_temporal_tags(
            view, fomm.TemporalTag(sample_ids[2], 10, 20, "view")
        )
        with self.assertRaises(ValueError):
            fomm.add_temporal_tags(
                view, fomm.TemporalTag(sample_ids[1], 10, 20, "missing")
            )

        self.assertEqual(
            fomm.delete_temporal_tags(view, tags="shared"),
            1,
        )
        self.assertEqual(
            fomm.count_temporal_tags(dataset),
            {"other": 1, "shared": 1, "view": 1},
        )

        with self.assertRaises(ValueError):
            fomm.delete_temporal_tags(view)

        self.assertEqual(fomm.TemporalTags(view).clear(), 2)
        self.assertEqual(fomm.count_temporal_tags(dataset), {"shared": 1})

    @drop_temporal_tags
    @drop_datasets
    def test_generated_view_operations_use_backing_dataset(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="/tmp/multimodal-temporal-tag-patches.jpg",
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="object", bounding_box=[0, 0, 1, 1])
                ]
            ),
        )
        dataset.add_sample(sample)

        patches = dataset.to_patches("detections")
        patch_id = patches.values("id")[0]

        fomm.add_temporal_tags(
            patches, fomm.TemporalTag(patch_id, 0, 1, "patch")
        )

        self.assertEqual(fomm.count_temporal_tags(patches), {"patch": 1})
        self.assertEqual(fomm.count_temporal_tags(dataset), {})

    @drop_temporal_tags
    @drop_datasets
    def test_sample_delete_and_clear_lifecycle(self):
        dataset, sample_ids = _make_dataset(3)
        fomm.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0], 0, 10, "first", anchor="camera_front"
                ),
                fomm.TemporalTag(
                    sample_ids[1], 10, 20, "second", anchor="lidar_top"
                ),
                fomm.TemporalTag(sample_ids[2], 20, 30, "third"),
            ],
        )

        dataset.delete_samples(sample_ids[1])

        self.assertEqual(
            fomm.count_temporal_tags(dataset), {"first": 1, "third": 1}
        )
        self.assertEqual(
            _temporal_tag_count_for_sample(dataset._doc.id, sample_ids[1]), 0
        )

        dataset.clear()

        self.assertEqual(_temporal_tag_count(dataset._doc.id), 0)

    @drop_temporal_tags
    @drop_datasets
    def test_dataset_delete_and_clone_lifecycle(self):
        dataset, sample_ids = _make_dataset(2)
        fomm.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0], 0, 10, "first", anchor="camera_front"
                ),
                fomm.TemporalTag(sample_ids[1], 10, 20, "second"),
            ],
        )

        full_clone = dataset.clone()
        self.assertEqual(len(fomm.list_temporal_tags(full_clone)), 2)
        self.assertEqual(
            fomm.count_temporal_tags(
                full_clone, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            {"first": 1},
        )

        view_clone = dataset.select([sample_ids[0]]).clone()
        view_clone_tags = fomm.list_temporal_tags(view_clone)
        self.assertEqual(len(view_clone_tags), 1)
        self.assertEqual(view_clone_tags[0].sample_id, sample_ids[0])
        self.assertEqual(view_clone_tags[0].anchor, "camera_front")

        dataset_id = dataset._doc.id
        self.assertEqual(_temporal_tag_count(dataset_id), 2)

        dataset.delete()

        self.assertEqual(_temporal_tag_count(dataset_id), 0)

    @drop_temporal_tags
    @drop_datasets
    def test_low_level_dataset_delete_lifecycle(self):
        dataset, sample_ids = _make_dataset(2)
        fomm.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0], 0, 10, "first", anchor="camera_front"
                ),
                fomm.TemporalTag(sample_ids[1], 10, 20, "second"),
            ],
        )

        dataset_name = dataset.name
        dataset_id = dataset._doc.id

        foo.delete_dataset(dataset_name, dry_run=True)

        self.assertIn(dataset_name, fo.list_datasets())
        self.assertEqual(_temporal_tag_count(dataset_id), 2)

        foo.delete_dataset(dataset_name)

        self.assertNotIn(dataset_name, fo.list_datasets())
        self.assertEqual(_temporal_tag_count(dataset_id), 0)

    @drop_temporal_tags
    @drop_datasets
    def test_drop_orphan_temporal_tags(self):
        orphan_dataset, orphan_sample_ids = _make_dataset(1)
        active_dataset, active_sample_ids = _make_dataset(1)
        orphan_sample_collection_name = orphan_dataset._sample_collection_name
        self.addCleanup(foo.drop_collection, orphan_sample_collection_name)
        self.addCleanup(
            foo.drop_collection, "frames." + orphan_sample_collection_name
        )

        fomm.add_temporal_tags(
            orphan_dataset,
            fomm.TemporalTag(
                orphan_sample_ids[0], 0, 10, "orphan", anchor="camera_front"
            ),
        )
        fomm.add_temporal_tags(
            active_dataset,
            fomm.TemporalTag(
                active_sample_ids[0], 0, 10, "active", anchor="lidar_top"
            ),
        )

        orphan_dataset_id = orphan_dataset._doc.id
        active_dataset_id = active_dataset._doc.id
        foo.get_db_conn().datasets.delete_one({"_id": orphan_dataset_id})

        foo.drop_orphan_temporal_tags(dry_run=True)

        self.assertEqual(_temporal_tag_count(orphan_dataset_id), 1)
        self.assertEqual(_temporal_tag_count(active_dataset_id), 1)

        foo.drop_orphan_temporal_tags()

        self.assertEqual(_temporal_tag_count(orphan_dataset_id), 0)
        self.assertEqual(_temporal_tag_count(active_dataset_id), 1)


def _make_dataset(num_samples=1):
    dataset = fo.Dataset()
    samples = [
        fo.Sample(filepath="/tmp/multimodal-temporal-tag-%d.jpg" % idx)
        for idx in range(num_samples)
    ]
    dataset.add_samples(samples)

    return dataset, [str(sample.id) for sample in samples]


def _temporal_tag_count(dataset_id):
    return foo.get_db_conn()[TEMPORAL_TAGS_COLLECTION_NAME].count_documents(
        {"_dataset_id": dataset_id}
    )


def _temporal_tag_count_for_sample(dataset_id, sample_id):
    return foo.get_db_conn()[TEMPORAL_TAGS_COLLECTION_NAME].count_documents(
        {"_dataset_id": dataset_id, "_sample_id": ObjectId(sample_id)}
    )
