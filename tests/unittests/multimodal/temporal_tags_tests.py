"""
Multimodal temporal tag unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
import unittest

from bson import ObjectId
from decorators import drop_collection, drop_datasets

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.multimodal as fomm
import fiftyone.multimodal.tags._temporal_tags as fota
from fiftyone.multimodal.schemas import v1 as foms
from fiftyone.multimodal.tags import (
    TAGS_COLLECTION_NAME,
    TagKind,
)

drop_tags = drop_collection(TAGS_COLLECTION_NAME)


class TemporalTagTests(unittest.TestCase):
    @drop_tags
    @drop_datasets
    def test_validation_and_defaults(self):
        dataset, sample_ids = _make_dataset()
        sample_id = sample_ids[0]

        self.assertEqual(fota.list_temporal_tags(dataset), [])
        self.assertEqual(fota.count_temporal_tags(dataset), {})
        self.assertEqual(fota.delete_temporal_tags(dataset, tags="missing"), 0)
        self.assertNotIn(
            TAGS_COLLECTION_NAME,
            foo.get_db_conn().list_collection_names(),
        )

        persisted = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "review",
                kind=TagKind.TEMPORAL,
            ),
        )

        self.assertEqual(len(persisted), 1)
        self.assertEqual(
            persisted[0].index_type,
            foms.TimeTrackType.TIME_TRACK_TYPE_DURATION_NS,
        )
        self.assertIsNone(persisted[0].anchor)
        self.assertIsNone(persisted[0].created_by)
        self.assertIsNone(persisted[0].last_modified_by)
        self.assertIsNotNone(persisted[0].created_at)
        self.assertIsNotNone(persisted[0].last_modified_at)
        self.assertEqual(
            persisted[0].created_at, persisted[0].last_modified_at
        )
        self.assertNotIn("anchor", persisted[0].to_dict())
        self.assertIn("created_at", persisted[0].to_dict())
        self.assertIn("last_modified_at", persisted[0].to_dict())
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
            fomm.TemporalTag(
                str(ObjectId()),
                0,
                1,
                "missing",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                1,
                1,
                "same",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                2,
                1,
                "backwards",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0.5,
                1,
                "fractional",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "empty-anchor",
                anchor="",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "blank-anchor",
                anchor="   ",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "bad-anchor",
                anchor=3,
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "bool-anchor",
                anchor=False,
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "empty-created-by",
                created_by="",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "blank-last-modified-by",
                last_modified_by="   ",
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "bad-created-by",
                created_by=3,
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "bool-last-modified-by",
                last_modified_by=False,
                kind=TagKind.TEMPORAL,
            ),
            fomm.TemporalTag(
                sample_id,
                0,
                1,
                "unsupported",
                index_type=foms.TimeTrackType.TIME_TRACK_TYPE_UNSPECIFIED,
                kind=TagKind.TEMPORAL,
            ),
        ]

        for tag in invalid_tags:
            with self.assertRaises(ValueError):
                fota.add_temporal_tags(dataset, tag)

        self.assertEqual(temporal_tags.clear(), 1)
        self.assertFalse(temporal_tags)
        self.assertEqual(fota.list_temporal_tags(dataset), [])
        with self.assertRaises(ValueError):
            temporal_tags.first()

    @drop_tags
    @drop_datasets
    def test_provenance_upserts(self):
        dataset, sample_ids = _make_dataset()
        sample_id = sample_ids[0]

        inserted = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_id,
                0,
                10,
                "review",
                created_by="alice",
                kind=TagKind.TEMPORAL,
            ),
        )[0]

        self.assertEqual(inserted.created_by, "alice")
        self.assertEqual(inserted.last_modified_by, "alice")
        self.assertEqual(inserted.created_at, inserted.last_modified_at)
        self.assertEqual(
            inserted.to_dict()["created_at"], inserted.created_at.isoformat()
        )
        self.assertEqual(
            inserted.to_dict()["last_modified_at"],
            inserted.last_modified_at.isoformat(),
        )

        time.sleep(0.02)
        repeated = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_id,
                0,
                10,
                "review",
                created_by="bob",
                kind=TagKind.TEMPORAL,
            ),
        )[0]

        self.assertEqual(repeated.id, inserted.id)
        self.assertEqual(repeated.created_by, "alice")
        self.assertEqual(repeated.last_modified_by, "alice")
        self.assertEqual(repeated.created_at, inserted.created_at)
        self.assertGreater(
            repeated.last_modified_at, inserted.last_modified_at
        )

        time.sleep(0.02)
        modified = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_id,
                0,
                10,
                "review",
                last_modified_by="carol",
                kind=TagKind.TEMPORAL,
            ),
        )[0]

        self.assertEqual(modified.id, inserted.id)
        self.assertEqual(modified.created_by, "alice")
        self.assertEqual(modified.last_modified_by, "carol")
        self.assertEqual(modified.created_at, inserted.created_at)
        self.assertGreater(
            modified.last_modified_at, repeated.last_modified_at
        )

        manual = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_id,
                20,
                30,
                "manual",
                created_at="2026-01-01T00:00:00Z",
                last_modified_at="2026-01-02T00:00:00+00:00",
                kind=TagKind.TEMPORAL,
            ),
        )[0]

        self.assertEqual(manual.created_at.isoformat(), "2026-01-01T00:00:00")
        self.assertEqual(
            manual.last_modified_at.isoformat(), "2026-01-02T00:00:00"
        )

    @drop_tags
    @drop_datasets
    def test_parent_timestamps_on_crud(self):
        dataset, sample_ids = _make_dataset(2)
        first_id, second_id = sample_ids

        before_dataset, before_first = _modified_timestamps(dataset, first_id)
        _, before_second = _modified_timestamps(dataset, second_id)

        time.sleep(0.05)
        inserted = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                first_id,
                0,
                10,
                "review",
                kind=TagKind.TEMPORAL,
            ),
        )[0]
        after_add_dataset, after_add_first = _modified_timestamps(
            dataset, first_id
        )
        _, after_add_second = _modified_timestamps(dataset, second_id)

        self.assertGreater(after_add_dataset, before_dataset)
        self.assertGreater(after_add_first, before_first)
        self.assertEqual(after_add_second, before_second)

        time.sleep(0.05)
        repeated = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                first_id,
                0,
                10,
                "review",
                kind=TagKind.TEMPORAL,
            ),
        )[0]
        after_repeat_dataset, after_repeat_first = _modified_timestamps(
            dataset, first_id
        )

        self.assertEqual(repeated.id, inserted.id)
        self.assertEqual(repeated.created_at, inserted.created_at)
        self.assertGreater(
            repeated.last_modified_at, inserted.last_modified_at
        )
        self.assertGreater(after_repeat_dataset, after_add_dataset)
        self.assertGreater(after_repeat_first, after_add_first)

        before_noop_dataset, before_noop_first = _modified_timestamps(
            dataset, first_id
        )
        time.sleep(0.05)
        self.assertEqual(fota.delete_temporal_tags(dataset, tags="missing"), 0)
        after_noop_dataset, after_noop_first = _modified_timestamps(
            dataset, first_id
        )

        self.assertEqual(after_noop_dataset, before_noop_dataset)
        self.assertEqual(after_noop_first, before_noop_first)

        time.sleep(0.05)
        self.assertEqual(
            fota.delete_temporal_tags(dataset, ids=inserted.id), 1
        )
        after_delete_dataset, after_delete_first = _modified_timestamps(
            dataset, first_id
        )

        self.assertGreater(after_delete_dataset, after_noop_dataset)
        self.assertGreater(after_delete_first, after_noop_first)

        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    first_id,
                    20,
                    30,
                    "clear",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    second_id,
                    20,
                    30,
                    "clear",
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )
        before_clear_dataset, before_clear_first = _modified_timestamps(
            dataset, first_id
        )
        _, before_clear_second = _modified_timestamps(dataset, second_id)

        time.sleep(0.05)
        self.assertEqual(fomm.TemporalTags(dataset).clear(), 2)
        after_clear_dataset, after_clear_first = _modified_timestamps(
            dataset, first_id
        )
        _, after_clear_second = _modified_timestamps(dataset, second_id)

        self.assertGreater(after_clear_dataset, before_clear_dataset)
        self.assertGreater(after_clear_first, before_clear_first)
        self.assertGreater(after_clear_second, before_clear_second)

    @drop_tags
    @drop_datasets
    def test_updates_preserve_identity_and_touch_parents(self):
        dataset, sample_ids = _make_dataset(2)
        first_id, second_id = sample_ids

        inserted = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                first_id,
                0,
                10,
                "review",
                created_by="alice",
                kind=TagKind.TEMPORAL,
            ),
        )[0]
        fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                second_id,
                0,
                10,
                "other",
                kind=TagKind.TEMPORAL,
            ),
        )
        before_dataset, before_first = _modified_timestamps(dataset, first_id)
        _, before_second = _modified_timestamps(dataset, second_id)

        time.sleep(0.05)
        updated = fota.update_temporal_tag(
            dataset,
            inserted.id,
            start=2,
            end=12,
            tag="accepted",
            last_modified_by="bob",
        )
        after_update_dataset, after_update_first = _modified_timestamps(
            dataset, first_id
        )
        _, after_update_second = _modified_timestamps(dataset, second_id)

        self.assertEqual(updated.id, inserted.id)
        self.assertEqual(updated.sample_id, first_id)
        self.assertEqual(updated.start, 2)
        self.assertEqual(updated.end, 12)
        self.assertEqual(updated.tag, "accepted")
        self.assertEqual(updated.created_by, "alice")
        self.assertEqual(updated.created_at, inserted.created_at)
        self.assertEqual(updated.last_modified_by, "bob")
        self.assertGreater(updated.last_modified_at, inserted.last_modified_at)
        self.assertEqual(
            fota.count_temporal_tags(dataset), {"accepted": 1, "other": 1}
        )
        self.assertEqual(len(fota.list_temporal_tags(dataset)), 2)
        self.assertGreater(after_update_dataset, before_dataset)
        self.assertGreater(after_update_first, before_first)
        self.assertEqual(after_update_second, before_second)

        time.sleep(0.05)
        resized = fomm.TemporalTags(dataset).update(updated.id, end=14)

        self.assertEqual(resized.id, inserted.id)
        self.assertEqual(resized.start, 2)
        self.assertEqual(resized.end, 14)
        self.assertEqual(resized.created_at, inserted.created_at)
        self.assertEqual(resized.last_modified_by, "bob")
        self.assertGreater(resized.last_modified_at, updated.last_modified_at)

    @drop_tags
    @drop_datasets
    def test_update_validation_and_scoping(self):
        dataset, sample_ids = _make_dataset(2)
        first_id, second_id = sample_ids

        first = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                first_id,
                0,
                10,
                "review",
                kind=TagKind.TEMPORAL,
            ),
        )[0]
        second = fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                first_id,
                20,
                30,
                "other",
                kind=TagKind.TEMPORAL,
            ),
        )[0]

        invalid_updates = [
            {},
            {"start": 10},
            {"end": 0},
            {"tag": ""},
            {"last_modified_by": "   "},
        ]
        for update in invalid_updates:
            with self.assertRaises(ValueError):
                fota.update_temporal_tag(dataset, first.id, **update)

        with self.assertRaises(ValueError):
            fota.update_temporal_tag(dataset, str(ObjectId()), start=1)

        with self.assertRaises(ValueError):
            fota.update_temporal_tag(
                dataset, second.id, start=0, end=10, tag="review"
            )

        view = dataset.select([second_id])
        with self.assertRaises(ValueError):
            fota.update_temporal_tag(view, first.id, start=1)

        persisted = fota.list_temporal_tags(dataset)
        self.assertEqual(
            [(tag.start, tag.end, tag.tag) for tag in persisted],
            [(0, 10, "review"), (20, 30, "other")],
        )

    @drop_tags
    @drop_datasets
    def test_storage_filtering_counts_and_deletion(self):
        dataset, sample_ids = _make_dataset(2)
        first = fomm.TemporalTag(
            sample_ids[0],
            0,
            10,
            "review",
            kind=TagKind.TEMPORAL,
        )

        inserted = fota.add_temporal_tags(dataset, first)
        repeated = fota.add_temporal_tags(dataset, first)

        self.assertEqual(inserted[0].id, repeated[0].id)
        self.assertEqual(len(fota.list_temporal_tags(dataset)), 1)

        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    5,
                    15,
                    "review",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "keep",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    0,
                    1,
                    "review",
                    index_type=foms.TimeTrackType.TIME_TRACK_TYPE_SEQUENCE,
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )

        self.assertEqual(len(fota.list_temporal_tags(dataset)), 4)
        self.assertEqual(
            fota.count_temporal_tags(dataset), {"keep": 1, "review": 3}
        )

        sample_tags = fota.list_temporal_tags(
            dataset, fomm.TemporalTagFilter(sample_ids=sample_ids[0])
        )
        self.assertEqual(len(sample_tags), 3)
        self.assertTrue(
            all(tag.sample_id == sample_ids[0] for tag in sample_tags)
        )

        overlap_at_boundary = fota.list_temporal_tags(
            dataset,
            fomm.TemporalTagFilter(
                index_type=foms.TimeTrackType.TIME_TRACK_TYPE_DURATION_NS,
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
                fota.list_temporal_tags(
                    dataset, fomm.TemporalTagFilter(tags="review")
                )
            ),
            3,
        )

        with self.assertRaises(ValueError):
            fota.delete_temporal_tags(dataset)

        self.assertEqual(
            fota.delete_temporal_tags(dataset, ids=inserted[0].id), 1
        )
        self.assertEqual(
            fota.delete_temporal_tags(
                dataset,
                filter=fomm.TemporalTagFilter(sample_ids=sample_ids[1]),
            ),
            1,
        )
        self.assertEqual(fota.delete_temporal_tags(dataset, tags="keep"), 1)
        self.assertEqual(len(fota.list_temporal_tags(dataset)), 1)
        self.assertEqual(
            fota.delete_temporal_tags(dataset, delete_all=True), 1
        )

    @drop_tags
    @drop_datasets
    def test_anchor_identity_filtering_counts_and_deletion(self):
        dataset, sample_ids = _make_dataset()
        sample_id = sample_ids[0]

        unanchored = fomm.TemporalTag(
            sample_id,
            0,
            10,
            "review",
            kind=TagKind.TEMPORAL,
        )
        camera = fomm.TemporalTag(
            sample_id,
            0,
            10,
            "review",
            anchor="camera_front",
            kind=TagKind.TEMPORAL,
        )
        lidar = fomm.TemporalTag(
            sample_id,
            0,
            10,
            "review",
            anchor="lidar_top",
            kind=TagKind.TEMPORAL,
        )

        inserted = fota.add_temporal_tags(dataset, [unanchored, camera, lidar])
        repeated = fota.add_temporal_tags(dataset, camera)

        self.assertEqual(len(inserted), 3)
        self.assertEqual(inserted[1].id, repeated[0].id)
        self.assertEqual(
            [tag.anchor for tag in inserted],
            [None, "camera_front", "lidar_top"],
        )
        self.assertEqual(inserted[1].to_dict()["anchor"], "camera_front")
        self.assertEqual(fota.count_temporal_tags(dataset), {"review": 3})
        self.assertEqual(
            fota.count_temporal_tags(
                dataset, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            {"review": 1},
        )

        anchored_tags = fota.list_temporal_tags(
            dataset,
            fomm.TemporalTagFilter(anchors=["camera_front", "lidar_top"]),
        )
        self.assertEqual(
            {tag.anchor for tag in anchored_tags},
            {"camera_front", "lidar_top"},
        )

        self.assertEqual(
            fota.delete_temporal_tags(
                dataset,
                filter=fomm.TemporalTagFilter(anchors="camera_front"),
            ),
            1,
        )
        self.assertEqual(fota.count_temporal_tags(dataset), {"review": 2})
        self.assertEqual(
            fota.list_temporal_tags(
                dataset, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            [],
        )

    @drop_tags
    @drop_datasets
    def test_creates_query_indexes(self):
        dataset, sample_ids = _make_dataset()
        fota.add_temporal_tags(
            dataset,
            fomm.TemporalTag(
                sample_ids[0],
                0,
                10,
                "review",
                anchor="camera_front",
                kind=TagKind.TEMPORAL,
            ),
        )

        collection = foo.get_db_conn()[TAGS_COLLECTION_NAME]
        indexes = collection.index_information()

        self.assertEqual(
            indexes["temporal_tag_sample_range"]["key"][:5],
            [
                ("_dataset_id", 1),
                ("_sample_id", 1),
                ("kind", 1),
                ("start", 1),
                ("end", 1),
            ],
        )
        self.assertEqual(
            indexes["temporal_tag_tag_lookup"]["key"][:4],
            [
                ("_dataset_id", 1),
                ("kind", 1),
                ("tag", 1),
                ("_sample_id", 1),
            ],
        )

    @drop_tags
    @drop_datasets
    def test_view_scoped_operations(self):
        dataset, sample_ids = _make_dataset(3)
        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "shared",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    0,
                    10,
                    "shared",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[2],
                    0,
                    10,
                    "other",
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )

        view = dataset.select([sample_ids[0], sample_ids[2]])

        self.assertEqual(
            fota.count_temporal_tags(dataset), {"other": 1, "shared": 2}
        )
        self.assertEqual(
            fota.count_temporal_tags(view), {"other": 1, "shared": 1}
        )

        view_tags = fota.list_temporal_tags(view)
        self.assertEqual(
            {tag.sample_id for tag in view_tags},
            {sample_ids[0], sample_ids[2]},
        )

        self.assertEqual(
            fota.list_temporal_tags(
                view, fomm.TemporalTagFilter(sample_ids=sample_ids[1])
            ),
            [],
        )

        fota.add_temporal_tags(
            view,
            fomm.TemporalTag(
                sample_ids[2],
                10,
                20,
                "view",
                kind=TagKind.TEMPORAL,
            ),
        )
        with self.assertRaises(ValueError):
            fota.add_temporal_tags(
                view,
                fomm.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "missing",
                    kind=TagKind.TEMPORAL,
                ),
            )

        (
            before_view_delete_dataset,
            before_view_delete_first,
        ) = _modified_timestamps(dataset, sample_ids[0])
        _, before_view_delete_second = _modified_timestamps(
            dataset, sample_ids[1]
        )
        _, before_view_delete_third = _modified_timestamps(
            dataset, sample_ids[2]
        )

        time.sleep(0.05)
        self.assertEqual(
            fota.delete_temporal_tags(view, tags="shared"),
            1,
        )
        (
            after_view_delete_dataset,
            after_view_delete_first,
        ) = _modified_timestamps(dataset, sample_ids[0])
        _, after_view_delete_second = _modified_timestamps(
            dataset, sample_ids[1]
        )
        _, after_view_delete_third = _modified_timestamps(
            dataset, sample_ids[2]
        )

        self.assertGreater(
            after_view_delete_dataset, before_view_delete_dataset
        )
        self.assertGreater(after_view_delete_first, before_view_delete_first)
        self.assertEqual(after_view_delete_second, before_view_delete_second)
        self.assertEqual(after_view_delete_third, before_view_delete_third)
        self.assertEqual(
            fota.count_temporal_tags(dataset),
            {"other": 1, "shared": 1, "view": 1},
        )

        with self.assertRaises(ValueError):
            fota.delete_temporal_tags(view)

        self.assertEqual(fomm.TemporalTags(view).clear(), 2)
        self.assertEqual(fota.count_temporal_tags(dataset), {"shared": 1})

    @drop_tags
    @drop_datasets
    def test_sample_collection_temporal_tag_convenience(self):
        dataset, sample_ids = _make_dataset(3)

        persisted = dataset.temporal_tags.add(
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "shared",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "shared",
                    kind=TagKind.TEMPORAL,
                ),
            ]
        )

        self.assertEqual(dataset.temporal_tags.count(), {"shared": 2})
        self.assertEqual(
            [tag.id for tag in dataset.temporal_tags.values()],
            [tag.id for tag in persisted],
        )

        updated = dataset.temporal_tags.update(
            persisted[0].id,
            end=12,
            tag="review",
            last_modified_by="alice",
        )
        self.assertEqual(updated.end, 12)
        self.assertEqual(updated.tag, "review")
        self.assertEqual(updated.last_modified_by, "alice")
        self.assertEqual(
            dataset.temporal_tags.count(), {"review": 1, "shared": 1}
        )

        view = dataset.select([sample_ids[0], sample_ids[2]])
        self.assertEqual(view.temporal_tags.count(), {"review": 1})

        with self.assertRaises(ValueError):
            view.temporal_tags.add(
                fomm.TemporalTag(
                    sample_ids[1],
                    20,
                    30,
                    "outside",
                    kind=TagKind.TEMPORAL,
                )
            )

        self.assertEqual(view.temporal_tags.delete(tags="review"), 1)
        self.assertEqual(dataset.temporal_tags.count(), {"shared": 1})

    @drop_tags
    @drop_datasets
    def test_match_temporal_tags(self):
        dataset, sample_ids = _make_dataset(4)
        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "review",
                    anchor="camera_front",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    5,
                    15,
                    "review",
                    anchor="lidar_top",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[2],
                    20,
                    30,
                    "other",
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )

        self.assertEqual(
            set(dataset.match_temporal_tags(tags="review").values("id")),
            set(sample_ids[:2]),
        )
        self.assertEqual(
            dataset.match_temporal_tags(
                tags="review", start=10, end=11
            ).values("id"),
            [sample_ids[1]],
        )
        self.assertEqual(
            dataset.match_temporal_tags(anchors="camera_front").values("id"),
            [sample_ids[0]],
        )
        self.assertEqual(
            set(
                dataset.match_temporal_tags(tags="review", bool=False).values(
                    "id"
                )
            ),
            {sample_ids[2], sample_ids[3]},
        )

        view = dataset.select([sample_ids[0], sample_ids[2], sample_ids[3]])
        self.assertEqual(
            view.match_temporal_tags(tags="review").values("id"),
            [sample_ids[0]],
        )
        self.assertEqual(
            view.match_temporal_tags(tags="missing").values("id"),
            [],
        )
        self.assertEqual(
            set(
                view.match_temporal_tags(tags="missing", bool=False).values(
                    "id"
                )
            ),
            {sample_ids[0], sample_ids[2], sample_ids[3]},
        )

    @drop_tags
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

        fota.add_temporal_tags(
            patches,
            fomm.TemporalTag(
                patch_id,
                0,
                1,
                "patch",
                kind=TagKind.TEMPORAL,
            ),
        )

        self.assertEqual(fota.count_temporal_tags(patches), {"patch": 1})
        self.assertEqual(fota.count_temporal_tags(dataset), {})

    @drop_tags
    @drop_datasets
    def test_sample_delete_and_clear_lifecycle(self):
        dataset, sample_ids = _make_dataset(3)
        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "first",
                    anchor="camera_front",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "second",
                    anchor="lidar_top",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[2],
                    20,
                    30,
                    "third",
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )

        dataset.delete_samples(sample_ids[1])

        self.assertEqual(
            fota.count_temporal_tags(dataset), {"first": 1, "third": 1}
        )
        self.assertEqual(
            _temporal_tag_count_for_sample(dataset._doc.id, sample_ids[1]), 0
        )

        dataset.clear()

        self.assertEqual(_temporal_tag_count(dataset._doc.id), 0)

    @drop_tags
    @drop_datasets
    def test_dataset_delete_and_clone_lifecycle(self):
        dataset, sample_ids = _make_dataset(2)
        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "first",
                    anchor="camera_front",
                    created_by="alice",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "second",
                    last_modified_by="bob",
                    kind=TagKind.TEMPORAL,
                ),
            ],
        )

        full_clone = dataset.clone()
        source_tags = fota.list_temporal_tags(dataset)
        full_clone_tags = fota.list_temporal_tags(full_clone)
        self.assertEqual(len(full_clone_tags), 2)
        self.assertEqual(
            _temporal_tag_provenance(source_tags),
            _temporal_tag_provenance(full_clone_tags),
        )
        self.assertEqual(
            fota.count_temporal_tags(
                full_clone, fomm.TemporalTagFilter(anchors="camera_front")
            ),
            {"first": 1},
        )

        view_clone = dataset.select([sample_ids[0]]).clone()
        view_clone_tags = fota.list_temporal_tags(view_clone)
        self.assertEqual(len(view_clone_tags), 1)
        self.assertEqual(view_clone_tags[0].sample_id, sample_ids[0])
        self.assertEqual(view_clone_tags[0].anchor, "camera_front")

        dataset_id = dataset._doc.id
        self.assertEqual(_temporal_tag_count(dataset_id), 2)

        dataset.delete()

        self.assertEqual(_temporal_tag_count(dataset_id), 0)

    @drop_tags
    @drop_datasets
    def test_low_level_dataset_delete_lifecycle(self):
        dataset, sample_ids = _make_dataset(2)
        fota.add_temporal_tags(
            dataset,
            [
                fomm.TemporalTag(
                    sample_ids[0],
                    0,
                    10,
                    "first",
                    anchor="camera_front",
                    kind=TagKind.TEMPORAL,
                ),
                fomm.TemporalTag(
                    sample_ids[1],
                    10,
                    20,
                    "second",
                    kind=TagKind.TEMPORAL,
                ),
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

    @drop_tags
    @drop_datasets
    def test_drop_orphan_tags(self):
        orphan_dataset, orphan_sample_ids = _make_dataset(1)
        active_dataset, active_sample_ids = _make_dataset(1)
        orphan_sample_collection_name = orphan_dataset._sample_collection_name
        self.addCleanup(foo.drop_collection, orphan_sample_collection_name)
        self.addCleanup(
            foo.drop_collection, "frames." + orphan_sample_collection_name
        )

        fota.add_temporal_tags(
            orphan_dataset,
            fomm.TemporalTag(
                orphan_sample_ids[0],
                0,
                10,
                "orphan",
                anchor="camera_front",
                kind=TagKind.TEMPORAL,
            ),
        )
        fota.add_temporal_tags(
            active_dataset,
            fomm.TemporalTag(
                active_sample_ids[0],
                0,
                10,
                "active",
                anchor="lidar_top",
                kind=TagKind.TEMPORAL,
            ),
        )

        orphan_dataset_id = orphan_dataset._doc.id
        active_dataset_id = active_dataset._doc.id
        foo.get_db_conn().datasets.delete_one({"_id": orphan_dataset_id})

        foo.drop_orphan_tags(dry_run=True)

        self.assertEqual(_temporal_tag_count(orphan_dataset_id), 1)
        self.assertEqual(_temporal_tag_count(active_dataset_id), 1)

        foo.drop_orphan_tags()

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
    return foo.get_db_conn()[TAGS_COLLECTION_NAME].count_documents(
        {"_dataset_id": dataset_id, "kind": TagKind.TEMPORAL.value}
    )


def _temporal_tag_count_for_sample(dataset_id, sample_id):
    return foo.get_db_conn()[TAGS_COLLECTION_NAME].count_documents(
        {
            "_dataset_id": dataset_id,
            "_sample_id": ObjectId(sample_id),
            "kind": TagKind.TEMPORAL.value,
        }
    )


def _modified_timestamps(dataset, sample_id):
    dataset.reload()
    dataset_doc = foo.get_db_conn().datasets.find_one({"_id": dataset._doc.id})
    sample_doc = dataset._sample_collection.find_one(
        {"_id": ObjectId(sample_id)}
    )

    return dataset_doc["last_modified_at"], sample_doc["last_modified_at"]


def _temporal_tag_provenance(tags):
    return [
        (
            tag.created_by,
            tag.last_modified_by,
            tag.created_at,
            tag.last_modified_at,
        )
        for tag in tags
    ]
