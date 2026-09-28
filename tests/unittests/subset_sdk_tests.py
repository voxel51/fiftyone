"""
Python SDK access to the App's saved subsets.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from bson import ObjectId
from pymongo.collection import Collection
from pymongo.errors import AutoReconnect

import fiftyone as fo
import fiftyone.core.subsets as fosub
import fiftyone.core.selection_context as selection_context
from fiftyone.server.view import get_view


class SubsetSDKTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.samples = [
            fo.Sample(filepath="/tmp/subset-sdk-%s.jpg" % i, rank=i)
            for i in range(3)
        ]
        self.dataset.add_samples(self.samples)
        self.ids = [sample.id for sample in self.samples]

    def tearDown(self):
        self.dataset.delete()

    def test_denied_projection_repair_requires_a_confirmed_server_repair(self):
        doc = {
            "_id": ObjectId(),
            "_dataset_id": self.dataset._doc.id,
            "member_pending": {"version": 1, "members": [{"_id": "member"}]},
        }
        db = MagicMock()
        db.subset_members.bulk_write.side_effect = PermissionError("Read only")
        for refreshed in (None, doc):
            with self.subTest(refreshed=refreshed):
                db.subsets.find_one.return_value = refreshed
                with self.assertRaises(PermissionError):
                    fosub._flush_membership(db, doc)
        db.subsets.find_one.return_value = {"_id": doc["_id"]}
        fosub._flush_membership(db, doc)
        db.subsets.update_one.assert_not_called()

    def test_converted_subset_reads_without_cache_write_permission(self):
        dataset = fo.Dataset()
        original_insert = Collection.insert_one
        original_update = Collection.update_one

        def insert(collection, *args, **kwargs):
            if collection.name == "subset_materializations":
                raise PermissionError("Read-only client")
            return original_insert(collection, *args, **kwargs)

        def update(collection, *args, **kwargs):
            if collection.name == "subsets":
                raise PermissionError("Read-only client")
            return original_update(collection, *args, **kwargs)

        try:
            dataset.add_sample(
                fo.Sample(
                    filepath="/tmp/subset-read-only.mp4",
                    metadata=fo.VideoMetadata(
                        frame_width=32,
                        frame_height=24,
                        frame_rate=10,
                        total_frame_count=10,
                        duration=1,
                    ),
                )
            )
            frames = dataset.to_frames(sample_frames="dynamic")
            subset = dataset.create_subset("Frames", frames.skip(2).limit(3))
            with patch.object(Collection, "insert_one", insert), patch.object(
                Collection, "update_one", update
            ):
                view = dataset.load_subset(subset["id"])
                self.assertEqual(view.values("frame_number"), [3, 4, 5])
            self.assertNotIn(
                "materialization", fosub.get_subset(dataset, subset["id"])
            )
            view._dataset.delete()
            frames._dataset.delete()
        finally:
            dataset.delete()

    def test_creator_attribution_round_trips_and_stays_immutable(self):
        with patch.object(
            selection_context, "get_actor", return_value="creator"
        ):
            subset = self.dataset.create_subset("Attributed", self.ids)
        self.assertEqual(subset["created_by"], "creator")
        self.assertEqual(
            datetime.fromisoformat(subset["created_at"]).utcoffset(),
            timedelta(0),
        )
        self.assertEqual(self.dataset.get_subset_info(subset["id"]), subset)
        with patch.object(
            selection_context, "get_actor", return_value="editor"
        ):
            self.dataset.update_subset_info(subset["id"], {"name": "Renamed"})
        for field in ("created_by", "created_at"):
            self.assertEqual(
                self.dataset.get_subset_info(subset["id"])[field],
                subset[field],
            )
            with self.assertRaises(ValueError):
                self.dataset.update_subset_info(subset["id"], {field: None})

    def test_listing_returns_ids_or_info_with_exact_duplicate_name_matches(
        self,
    ):
        dataset = self.dataset
        self.assertEqual(dataset.list_subsets(), [])
        self.assertEqual(dataset.list_subsets(info=True), [])
        subsets = [
            dataset.create_subset(name)
            for name in (
                "Review",
                "Review",
                "review",
                "Review more",
                "Review.*",
            )
        ]
        ids = [subset["id"] for subset in subsets]
        other = fo.Dataset()
        try:
            other.create_subset("Review")
            self.assertEqual(dataset.list_subsets(), ids)
            self.assertEqual(dataset.list_subsets(info=True), subsets)
            self.assertEqual(dataset.list_subsets(name="Review"), ids[:2])
            self.assertEqual(
                dataset.list_subsets(info=True, name="Review"), subsets[:2]
            )
            self.assertEqual(dataset.list_subsets(name="Review.*"), ids[-1:])
            self.assertEqual(dataset.list_subsets(name=" Review "), [])
            self.assertEqual(dataset.list_subsets(name=""), [])
            for name in (123, [], {"$ne": None}):
                with self.subTest(name=name):
                    with self.assertRaisesRegex(ValueError, "name filter"):
                        dataset.list_subsets(name=name)
        finally:
            other.delete()

    def test_existence_checks_are_scoped_to_ids_and_include_empty_subsets(
        self,
    ):
        dataset = self.dataset
        other = fo.Dataset()
        try:
            foreign = other.create_subset("Review")["id"]
            self.assertFalse(dataset.has_subsets)
            self.assertFalse(dataset.has_subset(foreign))
            subset_id = dataset.create_subset("Review")["id"]
            self.assertTrue(dataset.has_subsets)
            self.assertTrue(dataset.has_subset(subset_id))
            self.assertTrue(dataset.has_subset(ObjectId(subset_id)))
            self.assertFalse(other.has_subset(subset_id))
            for identifier in (None, "", [], "Review", str(ObjectId())):
                with self.subTest(identifier=identifier):
                    self.assertFalse(dataset.has_subset(identifier))
            dataset.delete_subset(subset_id)
            self.assertFalse(dataset.has_subsets)
            self.assertFalse(dataset.has_subset(subset_id))
        finally:
            other.delete()

    def test_existence_checks_read_only_one_projected_document_each(self):
        subset_id = self.dataset.create_subset("Review", self.ids)["id"]
        reads = []
        find_one = Collection.find_one

        def record(collection, query, projection, *args, **kwargs):
            reads.append((collection.name, query, projection))
            return find_one(collection, query, projection, *args, **kwargs)

        with patch.object(Collection, "find_one", record), patch.object(
            fosub, "list_subsets", side_effect=AssertionError("listed subsets")
        ), patch.object(
            fosub, "get_subset", side_effect=AssertionError("loaded metadata")
        ):
            self.assertTrue(self.dataset.has_subsets)
            self.assertTrue(self.dataset.has_subset(subset_id))
        self.assertEqual(len(reads), 2)
        for collection, query, projection in reads:
            self.assertEqual(collection, "subsets")
            self.assertEqual(query["_dataset_id"], self.dataset._doc.id)
            self.assertEqual(projection, {"_id": 1})

    def test_view_capture_stays_frozen_while_sample_data_stays_live(self):
        dataset = self.dataset
        subset = dataset.create_subset(
            "Review",
            dataset.match(fo.ViewField("rank") < 2),
            description="Agent-selected samples",
            provenance={"agent": "curator", "parameters": {"threshold": 2}},
            lineage={"dataset_id": str(dataset._doc.id)},
        )
        subset_id = subset["id"]
        self.assertEqual(subset["memberCount"], 2)
        self.assertEqual(dataset.list_subsets(), [subset_id])
        self.assertEqual(dataset.list_subsets(info=True), [subset])
        self.assertEqual(dataset.get_subset_info(subset_id), subset)
        self.samples[0].rank = 10
        self.samples[0].save()
        dataset.add_sample(fo.Sample(filepath="/tmp/new.jpg", rank=-1))
        self.assertEqual(
            dataset.load_subset(subset_id).sort_by("rank").values("rank"),
            [1, 10],
        )
        self.assertEqual(
            get_view(dataset, selection_scope={"subsetId": subset_id}).values(
                "id"
            ),
            self.ids[:2],
        )
        clone = dataset.clone()
        try:
            self.assertEqual(clone.list_subsets(), [])
        finally:
            clone.delete()

    def test_info_updates_preserve_identity_attribution_members_and_retries(
        self,
    ):
        dataset = self.dataset
        subset = dataset.create_subset(
            "Review",
            self.ids[:1],
            description="Original description",
            provenance={"agent": "curator", "run_id": "42"},
            lineage={"inputs": ["source-run"]},
        )
        subset_id = subset["id"]
        duplicate = dataset.create_subset("Reviewed")["id"]
        receipt = dataset.add_subset_members(
            subset_id, self.ids[1:2], operation_id="add-before-rename"
        )
        members = dataset.get_subset_members(subset_id)
        self.assertIsNone(
            dataset.update_subset_info(subset_id, {"name": " Reviewed "})
        )
        info = dataset.get_subset_info(subset_id)
        self.assertEqual(info["id"], subset_id)
        self.assertEqual(info["name"], "Reviewed")
        self.assertEqual(info["description"], "Original description")
        self.assertEqual(info["provenance"], subset["provenance"])
        self.assertEqual(info["lineage"], subset["lineage"])
        self.assertEqual(dataset.list_subsets(), [subset_id, duplicate])
        self.assertEqual(
            dataset.list_subsets(name="Reviewed"), [subset_id, duplicate]
        )
        dataset.update_subset_info(subset_id, {"description": " Ready "})
        self.assertEqual(
            dataset.get_subset_info(subset_id)["description"], "Ready"
        )
        for description in (None, "", "   "):
            dataset.update_subset_info(subset_id, {"description": description})
            self.assertIsNone(
                dataset.get_subset_info(subset_id)["description"]
            )
        self.assertEqual(dataset.get_subset_members(subset_id), members)
        self.assertEqual(
            dataset.load_subset(subset_id).values("id"), self.ids[:2]
        )
        self.assertEqual(
            dataset.add_subset_members(
                subset_id, self.ids[1:2], operation_id="add-before-rename"
            ),
            receipt,
        )
        before = fosub.get_subset(dataset, subset_id)
        dataset.update_subset_info(subset_id, {})
        dataset.update_subset_info(
            subset_id, {"name": " Reviewed ", "description": " "}
        )
        self.assertEqual(fosub.get_subset(dataset, subset_id), before)

    def test_info_update_validation_rejects_readonly_fields_without_partial_edits(
        self,
    ):
        dataset = self.dataset
        subset_id = dataset.create_subset("Review", self.ids)["id"]
        before = fosub.get_subset(dataset, subset_id)
        invalid = [
            None,
            [],
            "description",
            {"name": None},
            {"name": 1},
            {"name": ""},
            {"name": "   "},
            {"name": "x" * 201},
            {"description": 1},
            {"description": "x" * 1001},
            {"name": "Changed", "description": []},
        ]
        invalid.extend(
            {"name": "Changed", field: None}
            for field in (
                "id",
                "_id",
                "provenance",
                "lineage",
                "members",
                "memberCount",
                "member_version",
                "view",
                "created_by",
                "_dataset_id",
                "description.nested",
                "$set",
            )
        )
        for info in invalid:
            with self.subTest(info=info):
                with self.assertRaises(ValueError):
                    dataset.update_subset_info(subset_id, info)
                self.assertEqual(fosub.get_subset(dataset, subset_id), before)

    def test_info_updates_require_an_id_owned_by_the_current_dataset(self):
        dataset = self.dataset
        name = str(ObjectId())
        subset = dataset.create_subset(name)
        other = fo.Dataset()
        try:
            for owner, identifier in (
                (other, subset["id"]),
                (dataset, name),
                (dataset, str(ObjectId())),
            ):
                with self.subTest(identifier=identifier):
                    for info in ({}, {"name": "Changed"}):
                        with self.assertRaisesRegex(
                            ValueError, "not available"
                        ):
                            owner.update_subset_info(identifier, info)
            self.assertEqual(dataset.get_subset_info(subset["id"]), subset)
            self.assertFalse(dataset.has_subset(name))
        finally:
            other.delete()

    def test_empty_subset_and_sample_inputs_support_retryable_edits(self):
        dataset = self.dataset
        subset_id = dataset.create_subset("Review")["id"]
        self.assertEqual(dataset.load_subset(subset_id).count(), 0)
        result = dataset.add_subset_members(
            subset_id,
            (sample for sample in self.samples[:2]),
            operation_id="agent-run-42",
        )
        self.assertEqual(result["added"], 2)
        self.assertEqual(
            dataset.add_subset_members(
                subset_id, self.ids[:2], operation_id="agent-run-42"
            ),
            result,
        )
        with self.assertRaisesRegex(ValueError, "different scope"):
            dataset.add_subset_members(
                subset_id, self.ids[2:], operation_id="agent-run-42"
            )
        self.assertEqual(
            dataset.add_subset_members(subset_id, self.samples[2])["added"], 1
        )
        self.assertEqual(
            dataset.add_subset_members(subset_id, self.ids[2])["duplicates"], 1
        )
        members = dataset.get_subset_members(subset_id)
        removed = dataset.remove_subset_members(subset_id, members[:1])
        self.assertEqual(removed["removed"], 1)
        self.assertEqual(dataset.get_subset_info(subset_id)["memberCount"], 2)
        dataset.delete_subset(subset_id)
        self.assertEqual(dataset.list_subsets(), [])
        self.assertEqual(dataset.count(), 3)

    def test_dynamic_groups_capture_every_sample_in_selected_groups(self):
        self.samples[1].rank = 0
        self.samples[1].save()
        grouped = self.dataset.group_by("rank", order_by="id").limit(1)
        subset = self.dataset.create_subset("First group", grouped)
        self.assertEqual(subset["memberCount"], 2)
        self.assertEqual(
            self.dataset.load_subset(subset["id"]).values("id"), self.ids[:2]
        )

    def test_explicit_segments_keep_exact_bounds_and_provenance(self):
        dataset = self.dataset
        segment = {
            "episodeId": self.ids[0],
            "kind": "segment",
            "range": {
                "start": "9007199254740993",
                "end": "9007199254741003",
                "timebase": "nanoseconds",
                "streams": ["filepath"],
                "provenance": [{"provider": "agent", "source": "run-42"}],
            },
        }
        subset = dataset.create_subset("Ranges", members=[segment])
        subset_id = subset["id"]
        dataset.add_subset_members(subset_id, self.ids[1])
        self.assertEqual(
            dataset.get_subset_members(subset_id, scope="segments"), [segment]
        )
        self.assertEqual(
            dataset.load_subset(subset_id, scope="segments").values("id"),
            self.ids[:1],
        )
        self.assertEqual(
            dataset.load_subset(subset_id, scope="episodes").values("id"),
            self.ids[1:2],
        )
        dataset.delete_samples(self.ids[0])
        with self.assertRaisesRegex(ValueError, "mixed subset"):
            dataset.load_subset(subset_id)
        self.assertEqual(
            dataset.load_subset(subset_id, scope="episodes").values("id"),
            self.ids[1:2],
        )
        self.assertEqual(
            dataset.get_subset_info(subset_id, counts=True)["counts"][
                "unavailable"
            ],
            1,
        )
        self.assertEqual(dataset.get_subset_info(subset_id)["memberCount"], 2)
        copied = dataset.create_subset(
            "Derived",
            members=dataset.get_subset_members(subset_id),
            lineage={"subset_ids": [subset_id]},
        )
        self.assertEqual(copied["memberCount"], 2)

    def test_invalid_inputs_do_not_leave_partial_subsets(self):
        dataset = self.dataset
        other = fo.Dataset()
        try:
            other.add_sample(fo.Sample(filepath="/tmp/foreign.jpg"))
            for samples in (
                other,
                other.view(),
                [other.first().id],
                [str(ObjectId())],
            ):
                with self.subTest(samples=type(samples)):
                    with self.assertRaises(ValueError):
                        dataset.create_subset("Invalid", samples)
            with self.assertRaises(ValueError):
                dataset.create_subset("Invalid", self.ids, members=[])
            for kwargs in (
                {"view": dataset.view()},
                {"view": dataset.view(), "samples": self.ids},
                {"view": [], "members": []},
                {"view": other.view(), "members": []},
            ):
                with self.subTest(kwargs=tuple(kwargs)):
                    with self.assertRaises(ValueError):
                        dataset.create_subset("Invalid", **kwargs)
            with patch.object(
                fosub, "apply_add", side_effect=AutoReconnect("interrupted")
            ):
                with self.assertRaises(AutoReconnect):
                    dataset.create_subset("Interrupted", self.ids)
            self.assertEqual(dataset.list_subsets(), [])
            subset_id = dataset.create_subset("Empty", [])["id"]
            with self.assertRaises(ValueError):
                other.get_subset_info(subset_id)
            with self.assertRaises(ValueError):
                dataset.add_subset_members(subset_id)
            with self.assertRaises(ValueError):
                dataset.add_subset_members(subset_id, self.ids, members=[])
        finally:
            other.delete()

    def test_patch_subsets_reopen_and_reject_other_entity_domains(self):
        dataset = self.dataset
        sample = self.samples[0]
        sample["ground_truth"] = fo.Detections(
            detections=[fo.Detection(label="cat"), fo.Detection(label="dog")]
        )
        sample.save()
        patches = dataset.to_patches("ground_truth")
        subset = dataset.create_subset(
            "Cats", patches.match({"ground_truth.label": "cat"})
        )
        subset_id = subset["id"]
        self.assertEqual(
            dataset.load_subset(subset_id).values("id"), [patches.first().id]
        )
        derived = dataset.create_subset(
            "Derived cats",
            members=dataset.get_subset_members(subset_id),
            view=dataset.load_subset(subset_id),
            lineage={"subset_ids": [subset_id]},
        )
        self.assertEqual(
            dataset.load_subset(derived["id"]).values("id"),
            [patches.first().id],
        )
        self.assertEqual(
            dataset.add_subset_members(
                subset_id, patches.match({"ground_truth.label": "dog"})
            )["added"],
            1,
        )
        for samples in (
            dataset,
            self.ids,
            dataset.match({"rank": 0}).to_patches("ground_truth"),
        ):
            with self.assertRaisesRegex(ValueError, "matching entity view"):
                dataset.add_subset_members(subset_id, samples)
        source_subset = dataset.create_subset("Samples", self.ids)["id"]
        with self.assertRaisesRegex(ValueError, "matching entity view"):
            dataset.add_subset_members(source_subset, patches)
        with self.assertRaisesRegex(ValueError, "source dataset"):
            patches._dataset.create_subset("Wrong owner", patches)


class GroupedSubsetSDKTests(unittest.TestCase):
    def test_grouped_views_capture_all_selected_slices_but_ids_stay_exact(
        self,
    ):
        dataset = fo.Dataset()
        try:
            groups = [fo.Group(), fo.Group()]
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/tmp/%s-%s.%s" % (index, name, extension),
                        group=group.element(name),
                    )
                    for index, group in enumerate(groups)
                    for name, extension in (("left", "jpg"), ("right", "mp4"))
                ]
            )
            selected = dataset.select_groups([groups[0].id])
            subset = dataset.create_subset("Group", selected)
            self.assertEqual(subset["memberCount"], 2)
            self.assertEqual(
                set(dataset.load_subset(subset["id"]).values("id")),
                set(
                    selected.select_group_slices(_allow_mixed=True).values(
                        "id"
                    )
                ),
            )
            right = selected.select_group_slices("right").values("id")[0]
            one = dataset.create_subset("Right only", [right])
            self.assertEqual(
                dataset.load_subset(one["id"]).values("id"), [right]
            )
            self.assertEqual(dataset.load_subset(one["id"]).first().id, right)
        finally:
            dataset.delete()


class ConvertedSubsetSDKTests(unittest.TestCase):
    def test_frames_and_clips_survive_regeneration(self):
        dataset = fo.Dataset()
        try:
            sample = fo.Sample(
                filepath="/tmp/subset-sdk.mp4",
                metadata=fo.VideoMetadata(
                    frame_width=32,
                    frame_height=24,
                    frame_rate=10,
                    total_frame_count=10,
                    duration=1,
                ),
                ranges=[[1, 4], [3, 6]],
            )
            dataset.add_sample(sample)
            frames = dataset.to_frames(sample_frames="dynamic").limit(2)
            saved_frames = dataset.create_subset("Frames", frames)
            frames._dataset.delete()
            self.assertEqual(
                dataset.load_subset(saved_frames["id"]).values("frame_number"),
                [1, 2],
            )
            copied_frames = dataset.create_subset(
                "Copied frames",
                members=dataset.get_subset_members(saved_frames["id"]),
                view=dataset.load_subset(saved_frames["id"]),
            )
            dataset.delete_subset(saved_frames["id"])
            self.assertEqual(
                dataset.load_subset(copied_frames["id"]).values(
                    "frame_number"
                ),
                [1, 2],
            )
            clips = dataset.to_clips([sample.ranges]).limit(1)
            saved_clips = dataset.create_subset("Clips", clips)
            sample.ranges = [[7, 10]]
            sample.save()
            clips._dataset.delete()
            self.assertEqual(
                dataset.load_subset(saved_clips["id"]).values("support"),
                [[1, 4]],
            )
            copied_clips = dataset.create_subset(
                "Copied clips",
                members=[],
                view=dataset.load_subset(saved_clips["id"]),
            )
            dataset.add_subset_members(
                copied_clips["id"],
                members=dataset.get_subset_members(saved_clips["id"]),
            )
            dataset.delete_subset(saved_clips["id"])
            self.assertEqual(
                dataset.load_subset(copied_clips["id"]).values("support"),
                [[1, 4]],
            )
        finally:
            dataset.delete()
