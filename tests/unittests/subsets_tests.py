"""
Frozen subset membership, retry, and browsing boundary tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from concurrent.futures import ThreadPoolExecutor
import copy
from datetime import datetime, timedelta, timezone
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from bson import ObjectId
from pymongo.collection import Collection
from pymongo.errors import AutoReconnect, BulkWriteError
from uuid import uuid4

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.subsets as fosub
import fiftyone.core.tags as fot
import fiftyone.server.selection as foss
from fiftyone.server.selection import (
    create_snapshot,
    prepare_subset_add,
    resolve_scope,
)
from contextvars import ContextVar

import fiftyone.core.selection_context as fosc

_actor = ContextVar("selection_test_actor", default=None)
from fiftyone.server.view import get_view


def _resolve_all(dataset, request):
    # Small fixtures request every rendered parent through the production route.
    view, _, _ = foss._scoped_view(dataset, request)
    return resolve_scope(dataset, {**request, "episodeIds": view.values("id")})


class SubsetTests(unittest.TestCase):
    def setUp(self):
        actor_provider = patch.object(fosc, "get_actor", _actor.get)
        actor_provider.start()
        self.addCleanup(actor_provider.stop)
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/subset-%d.mp4" % i, rank=i)
                for i in range(45)
            ]
        )
        self.ids = self.dataset.values("id")
        self.subset = fosub.create_subset(self.dataset, "Review")["id"]

    def tearDown(self):
        for name in (
            "subsets",
            "subset_members",
            "subset_operations",
            "subset_candidates",
        ):
            foo.get_db_conn()[name].delete_many(
                {"_dataset_id": self.dataset._doc.id}
            )
        self.dataset.delete()

    def add(self, members):
        operation = str(uuid4())
        preview = fosub.prepare_add(
            self.dataset, self.subset, operation, members
        )
        return preview, fosub.apply_add(self.dataset, operation)

    def test_additive_coexistence_exact_dedup_and_provenance(self):
        a = _segment(self.ids[0], 10, 20)
        self.add([a])
        b = _segment(self.ids[0], 10, 20, "tags")
        preview, result = self.add(
            [b, _segment(self.ids[0], 15, 25), _episode(self.ids[0])]
        )
        self.assertEqual(preview["added"], 2)
        self.assertEqual(result["duplicates"], 1)
        self.assertEqual(result["provenanceUpdated"], 1)
        members = fosub.subset_members(self.dataset, self.subset)
        self.assertEqual(len(members), 3)
        saved = next(
            m
            for m in members
            if m["kind"] == "segment" and m["range"]["start"] == "10"
        )
        self.assertEqual(len(saved["range"]["provenance"]), 2)
        self.assertEqual(fosub.member_count(self.dataset, self.subset), 3)

    def test_event_provenance_and_bounds_survive_source_changes(self):
        sample = self.dataset.first()
        event = fo.TemporalDetection(label="braking", support=[31, 60])
        sample["events"] = fo.TemporalDetections(detections=[event])
        sample.save()
        captured = foss.candidate_members(
            self.dataset.select(sample.id),
            {"kind": "events", "field": "events"},
        )
        self.add(captured)
        sample["events"] = None
        sample.save()
        self.assertEqual(
            fosub.subset_members(self.dataset, self.subset), captured
        )
        source = captured[0]["range"]["provenance"][0]
        self.assertEqual(source["label"], "braking")
        self.assertEqual(source["itemId"], event.id)
        self.assertEqual(source["nativeStart"], "31")

    def assert_member_count(self, total):
        members = fosub.subset_members(self.dataset, self.subset)
        summary = fosub.subset_summary(self.dataset, self.subset, counts=False)
        self.assertEqual(len(members), total)
        self.assertEqual(summary["memberCount"], total)
        self.assertEqual(
            summary["memberCounts"],
            {
                "fullEpisodes": sum(m["kind"] == "episode" for m in members),
                "segments": sum(m["kind"] == "segment" for m in members),
            },
        )

    def test_saved_count_includes_each_range_and_unavailable_reference(self):
        self.assert_member_count(0)
        members = [
            _episode(self.ids[0]),
            _segment(self.ids[0], 1, 5),
            _segment(self.ids[0], 2, 6),
            _episode(self.ids[1]),
        ]
        self.add(members + members)
        self.dataset.delete_samples(self.ids[:1])
        self.assert_member_count(4)
        self.assertEqual(
            fosub.subset_counts(self.dataset, self.subset)["unavailable"], 3
        )
        self.assertEqual(
            fosub.view_counts(
                self.dataset.select(self.ids[1:2]), self.subset, "episodes"
            )["fullEpisodes"],
            1,
        )
        fosub.remove_members(self.dataset, self.subset, members[:1])
        self.assert_member_count(3)
        fosub.remove_members(self.dataset, self.subset, members[:1])
        self.assert_member_count(3)
        fosub.remove_members(self.dataset, self.subset, members[1:])
        self.assert_member_count(0)

    def test_saved_count_and_metadata_read_only_one_subset_document(self):
        self.add([_episode(i) for i in self.ids])
        find_one = Collection.find_one
        reads = []

        def read(collection, *args, **kwargs):
            self.assertEqual(collection.name, "subsets")
            reads.append(collection.name)
            return find_one(collection, *args, **kwargs)

        with patch.object(Collection, "find_one", read), patch.object(
            Collection, "aggregate", side_effect=AssertionError("recount")
        ):
            self.assertEqual(fosub.member_count(self.dataset, self.subset), 45)
            self.assertEqual(len(reads), 1)
            reads.clear()
            summary = fosub.subset_summary(
                self.dataset, self.subset, counts=False
            )
            self.assertEqual(summary["memberCount"], 45)
            self.assertIsNone(summary["counts"])
            self.assertEqual(len(reads), 1)
            page = fosub.browse_subsets(self.dataset, counts=False)
            self.assertEqual(page["subsets"][0]["memberCount"], 45)

    def test_partial_member_write_keeps_a_recoverable_counted_batch(self):
        operation = str(uuid4())
        fosub.prepare_add(
            self.dataset,
            self.subset,
            operation,
            [_episode(i) for i in self.ids[:3]],
        )
        original = fosub._write_batch

        def partial(collection, writes):
            original(collection, writes[:1])
            raise BulkWriteError({"writeErrors": [{"code": 8}]})

        with patch.object(fosub, "_write_batch", partial):
            with self.assertRaises(BulkWriteError):
                fosub.apply_add(self.dataset, operation)
        # The journal and count committed together, although its member index
        # is incomplete. Reading the saved total does not scan or repair it.
        with patch.object(
            fosub, "_flush_membership", side_effect=AssertionError("repair")
        ):
            self.assertEqual(fosub.member_count(self.dataset, self.subset), 3)
        result = fosub.apply_add(self.dataset, operation)
        self.assertEqual(result["added"], 3)
        self.assertEqual(fosub.apply_add(self.dataset, operation), result)
        self.assert_member_count(3)

    def test_lost_commit_response_does_not_increment_twice(self):
        operation = str(uuid4())
        fosub.prepare_add(
            self.dataset,
            self.subset,
            operation,
            [_episode(i) for i in self.ids[:3]],
        )
        original = Collection.update_one

        def lose_response(collection, query, update, *args, **kwargs):
            result = original(collection, query, update, *args, **kwargs)
            if "member_pending" in update.get("$set", {}):
                raise AutoReconnect("commit response lost")
            return result

        with patch.object(Collection, "update_one", lose_response):
            with self.assertRaises(AutoReconnect):
                fosub.apply_add(self.dataset, operation)
        self.assertEqual(fosub.member_count(self.dataset, self.subset), 3)
        # Membership reads also repair the journal without an add retry.
        self.assert_member_count(3)
        fosub.apply_add(self.dataset, operation)
        self.assert_member_count(3)

    def test_partial_removal_and_retry_count_each_identity_once(self):
        members = [_episode(i) for i in self.ids[:3]]
        self.add(members)
        original = fosub._write_batch

        def partial(collection, writes):
            original(collection, writes[:1])
            raise AutoReconnect("partial removal")

        with patch.object(fosub, "_write_batch", partial):
            with self.assertRaises(AutoReconnect):
                fosub.remove_members(
                    self.dataset, self.subset, members[:2], counts=False
                )
        self.assertEqual(fosub.member_count(self.dataset, self.subset), 1)
        self.assert_member_count(1)
        retry = fosub.remove_members(self.dataset, self.subset, members[:2])
        self.assertEqual(retry["removed"], 0)
        self.assert_member_count(1)
        self.add(members[:2])
        self.assert_member_count(3)

    def test_delayed_helpers_cannot_undo_newer_membership(self):
        journals = []
        original = fosub._flush_membership

        def remember(db, doc):
            if doc.get("member_pending"):
                journals.append(copy.deepcopy(doc))
            return original(db, doc)

        member = _episode(self.ids[0])
        with patch.object(fosub, "_flush_membership", remember):
            self.add([member])
            fosub.remove_members(self.dataset, self.subset, [member])
        db = foo.get_db_conn()
        original(db, journals[0])  # A stalled add resumes after removal
        self.assert_member_count(0)
        self.add([member])
        original(db, journals[1])  # A stalled removal resumes after re-add
        original(db, journals[0])
        self.assert_member_count(1)

    def test_concurrent_overlapping_adds_and_removals(self):
        operations = []
        for offset in range(4):
            operation = str(uuid4())
            fosub.prepare_add(
                self.dataset,
                self.subset,
                operation,
                [_episode(i) for i in self.ids[offset : offset + 20]],
            )
            operations.append(operation)
        barrier = Barrier(4)

        def apply(operation):
            barrier.wait(timeout=10)
            return fosub.apply_add(self.dataset, operation)

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(apply, operations))
        self.assert_member_count(23)

        operation = str(uuid4())
        fosub.prepare_add(
            self.dataset,
            self.subset,
            operation,
            [_episode(i) for i in self.ids[:30]],
        )
        barrier = Barrier(4)

        def change(index):
            barrier.wait(timeout=10)
            if index == 0:
                return fosub.apply_add(self.dataset, operation)
            return fosub.remove_members(
                self.dataset,
                self.subset,
                [_episode(i) for i in self.ids[: 10 + index]],
                counts=False,
            )

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(change, range(4)))
        # The overlap may end in either order; its stored count must agree
        # with the final membership and the disjoint tail must remain.
        members = fosub.subset_members(self.dataset, self.subset)
        self.assert_member_count(len(members))
        self.assertGreaterEqual(len(members), 17)
        self.assertLessEqual(len(members), 30)

    def test_partial_retry_uses_frozen_members_and_receipts(self):
        operation = str(uuid4())
        members = [_episode(i) for i in self.ids[:3]]
        fosub.prepare_add(self.dataset, self.subset, operation, members)
        original = fosub._insert_batch
        calls = 0

        def fail_after_first(collection, doc):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("connection lost")
            original(collection, doc)

        with patch.object(
            fosub, "_insert_batch", fail_after_first
        ), patch.object(fosub, "_BATCH_SIZE", 1):
            with self.assertRaises(RuntimeError):
                fosub.apply_add(self.dataset, operation)
        self.assert_member_count(1)
        self.dataset.add_sample(
            fo.Sample(filepath="/tmp/arrived-after-capture.mp4")
        )
        result = fosub.apply_add(self.dataset, operation)
        self.assertEqual(result["added"], 3)
        self.assertEqual(fosub.apply_add(self.dataset, operation), result)
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 3
        )
        with self.assertRaises(ValueError):
            fosub.prepare_add(
                self.dataset, self.subset, operation, members[:1]
            )

    def test_boundary_applies_before_limit_and_grid_pagination(self):
        self.add([_episode(i) for i in self.ids[35:]])
        boundary = {"subsetId": self.subset, "subsetScope": "episodes"}
        stages = (
            self.dataset.sort_by("rank", reverse=True).limit(3)._serialize()
        )
        result = _resolve_all(
            self.dataset, {"view": stages, "boundary": boundary}
        )
        self.assertEqual(
            [g["episodeId"] for g in result["groups"]],
            list(reversed(self.ids[-3:])),
        )
        view = get_view(
            self.dataset,
            stages=stages,
            filters={"_selection_scope": boundary},
            pagination_data=True,
        )
        self.assertEqual(view.values("id"), list(reversed(self.ids[-3:])))

    def test_remove_exact_members_preserves_samples_and_other_subsets(self):
        members = [
            _episode(self.ids[0]),
            _segment(self.ids[0], 10, 20),
            _segment(self.ids[0], 15, 25),
            _episode(self.ids[1]),
        ]
        self.add(members)
        other = fosub.create_subset(self.dataset, "Keep")["id"]
        operation = str(uuid4())
        fosub.prepare_add(self.dataset, other, operation, members)
        fosub.apply_add(self.dataset, operation)

        # Provenance differences do not change a segment's identity.
        removed = [
            _episode(self.ids[0]),
            _segment(self.ids[0], 10, 20, "tags"),
        ]
        result = fosub.remove_members(self.dataset, self.subset, removed)
        self.assertEqual(result["removed"], 2)
        self.assertEqual(result["counts"]["fullEpisodes"], 1)
        self.assertEqual(result["counts"]["segments"], 1)
        self.assertEqual(len(self.dataset), 45)
        self.assertEqual(len(fosub.subset_members(self.dataset, other)), 4)
        self.assertEqual(
            fosub.remove_members(self.dataset, self.subset, removed)[
                "removed"
            ],
            0,
        )
        remaining = fosub.subset_members(self.dataset, self.subset)
        self.assertEqual(len(remaining), 2)
        self.assertIn(_segment(self.ids[0], 15, 25), remaining)

        candidates = _resolve_all(
            self.dataset,
            {"boundary": {"subsetId": self.subset, "subsetScope": "episodes"}},
        )
        self.assertEqual(
            [g["episodeId"] for g in candidates["groups"]], [self.ids[1]]
        )
        fosub.remove_members(self.dataset, self.subset, remaining)
        self.assertEqual(fosub.subset_members(self.dataset, self.subset), [])
        self.assertEqual(
            fosub.subset_summary(self.dataset, self.subset)["name"], "Review"
        )

    def test_remove_validates_all_members_and_dataset_before_writing(self):
        self.add([_episode(self.ids[0])])
        with self.assertRaises(ValueError):
            fosub.remove_members(
                self.dataset,
                self.subset,
                [_episode(self.ids[0]), {"kind": "invalid"}],
            )
        other = fo.Dataset()
        try:
            with self.assertRaises(ValueError):
                fosub.remove_members(
                    other, self.subset, [_episode(self.ids[0])]
                )
        finally:
            other.delete()
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 1
        )

    def test_reopen_retains_ranges_and_intersects_streams(self):
        self.add([_segment(self.ids[0], 10, 20)])
        boundary = {"subsetId": self.subset, "subsetScope": "segments"}
        request = {"boundary": boundary}
        result = _resolve_all(self.dataset, request)
        self.assertEqual(result["counts"]["fullEpisodes"], 0)
        self.assertEqual(result["counts"]["segments"], 1)
        boundary["provider"] = {
            "kind": "ranges",
            "label": "Current",
            "members": [_segment(self.ids[0], 0, 15)],
        }
        result = _resolve_all(self.dataset, request)
        self.assertEqual(
            result["groups"][0]["members"][0]["range"]["start"], "10"
        )
        self.assertEqual(
            result["groups"][0]["members"][0]["range"]["end"], "15"
        )
        self.assertEqual(
            fosub.subset_members(self.dataset, self.subset)[0]["range"]["end"],
            "20",
        )

    def test_missing_parent_retained_and_live_metadata(self):
        self.add([_episode(self.ids[0]), _episode(self.ids[1])])
        sample = self.dataset[self.ids[0]]
        sample.filepath = "/tmp/updated.mp4"
        sample.save()
        self.dataset.delete_samples(self.ids[1])
        result = _resolve_all(
            self.dataset, {"boundary": {"subsetId": self.subset}}
        )
        self.assertEqual(result["counts"]["unavailable"], 1)
        self.assertEqual(result["groups"][0]["filepath"], "/tmp/updated.mp4")
        self.assertTrue(result["unavailableGroups"][0]["unavailable"])
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 2
        )

    def test_provider_grid_uses_range_joins_without_enumerating_parent_ids(
        self,
    ):
        sample = self.dataset[self.ids[0]]
        sample["events"] = fo.TemporalDetections(
            detections=[
                fo.TemporalDetection(label="turn", support=[11, 20]),
            ]
        )
        sample.save()
        self.add(
            [_segment(self.ids[0], 12, 15), _segment(self.ids[1], 30, 40)]
        )
        boundary = {"subsetId": self.subset, "subsetScope": "segments"}
        providers = [
            {"kind": "events", "field": "events", "values": ["turn"]},
            {
                "kind": "ranges",
                "members": [
                    _segment(self.ids[0], 10, 20),
                    _segment(self.ids[1], 10, 20),
                ],
            },
            {"kind": "temporal-tags", "values": ["turn"]},
        ]
        fot.add_temporal_tags(
            self.dataset,
            [
                fot.TemporalTag(sample_id, 10, 20, "turn", index_type=1)
                for sample_id in self.ids[:2]
            ],
        )
        for provider in providers:
            scope = {**boundary, "provider": provider}
            with patch.object(
                fosub,
                "subset_members",
                side_effect=AssertionError("all members"),
            ):
                grid = get_view(
                    self.dataset, filters={"_selection_scope": scope}
                )
                self.assertEqual(grid.values("id"), [self.ids[0]])
                counts = resolve_scope(self.dataset, {"boundary": scope})[
                    "counts"
                ]
                self.assertEqual(counts["segments"], 1)
                snapshot = create_snapshot(self.dataset, {"boundary": scope})
                self.assertEqual(snapshot["counts"]["segments"], 1)

    def test_clicked_parent_does_not_recount_or_change_window_semantics(self):
        self.add([_episode(i) for i in self.ids])
        boundary = {"subsetId": self.subset, "subsetScope": "episodes"}
        request = {
            "boundary": boundary,
            "detailsOnly": True,
            "episodeIds": [self.ids[-1]],
        }
        with patch.object(
            fosub, "subset_counts", side_effect=AssertionError("recount")
        ), patch.object(
            fosub, "missing_counts", side_effect=AssertionError("recount")
        ):
            result = resolve_scope(self.dataset, request)
        self.assertEqual(
            [g["episodeId"] for g in result["groups"]], self.ids[-1:]
        )
        self.assertNotIn("counts", result)
        window = self.dataset.limit(2)._serialize()
        self.assertEqual(
            resolve_scope(self.dataset, {**request, "view": window})["groups"],
            [],
        )

    def test_provider_position_matches_the_filtered_grid(self):
        self.add([_episode(i) for i in self.ids])
        boundary = {
            "subsetId": self.subset,
            "subsetScope": "episodes",
            "provider": {
                "kind": "ranges",
                "members": [_segment(i, 1, 2) for i in self.ids[-2:]],
            },
        }
        position = foss.sample_position(
            self.dataset, {"boundary": boundary, "sampleId": self.ids[-1]}
        )
        self.assertEqual(position["index"], 1)

    def test_subset_filter_attaches_frames_only_when_a_later_stage_needs_them(
        self,
    ):
        sample = self.dataset[self.ids[0]]
        sample.frames[1] = fo.Frame(
            ground_truth=fo.Classification(label="keep")
        )
        sample.save()
        self.add([_episode(i) for i in self.ids[:2]])
        boundary = {"subsetId": self.subset, "subsetScope": "episodes"}
        view = get_view(self.dataset, selection_scope=boundary)
        self.assertFalse(
            any(
                stage.get("$lookup", {}).get("from")
                == self.dataset._frame_collection_name
                for stage in view._pipeline()
            )
        )
        filtered = get_view(
            self.dataset,
            selection_scope=boundary,
            stages=self.dataset.filter_labels(
                "frames.ground_truth", fo.ViewField("label") == "keep"
            )._serialize(),
        )
        self.assertEqual(filtered.values("id"), self.ids[:1])
        self.assertEqual(
            filtered.values("frames.ground_truth.label"), [["keep"]]
        )

    def test_reclaim_expired_apply_and_reject_mismatched_retry_scope(self):
        operation = str(uuid4())
        members = [_episode(i) for i in self.ids[:3]]
        fosub.prepare_add(self.dataset, self.subset, operation, members)
        with self.assertRaisesRegex(ValueError, "different scope"):
            fosub.is_add_prepared(
                self.dataset, self.subset, operation, members[:1]
            )
        key = fosub._digest([str(self.dataset._doc.id), operation])
        collection = foo.get_db_conn().subset_operations
        collection.update_one(
            {"_id": key},
            {
                "$set": {
                    "state": "applying",
                    "owner": "stale",
                    "lease_expires_at": datetime.now(timezone.utc)
                    + timedelta(minutes=5),
                }
            },
        )
        with self.assertRaisesRegex(ValueError, "already being applied"):
            fosub.apply_add(self.dataset, operation)
        collection.update_one(
            {"_id": key},
            {
                "$set": {
                    "lease_expires_at": datetime.now(timezone.utc)
                    - timedelta(seconds=1)
                }
            },
        )
        self.assertEqual(fosub.apply_add(self.dataset, operation)["added"], 3)

    def test_removing_one_member_does_not_scan_the_remaining_subset(self):
        members = [_episode(i) for i in self.ids]
        self.add(members)
        with patch.object(
            fosub, "subset_counts", side_effect=AssertionError("recount")
        ):
            result = fosub.remove_members(
                self.dataset, self.subset, members[:1], counts=False
            )
        self.assertEqual(result["removed"], 1)
        self.assertIsNone(result["counts"])

    def test_unsupported_stage_and_foreign_dataset_fail_closed(self):
        self.add([_episode(self.ids[0])])
        boundary = {"subsetId": self.subset}
        with self.assertRaisesRegex(ValueError, "Mongo"):
            _resolve_all(
                self.dataset,
                {
                    "boundary": boundary,
                    "view": self.dataset.mongo([])._serialize(),
                },
            )
        other = fo.Dataset()
        try:
            with self.assertRaises(ValueError):
                fosub.subset_members(other, self.subset)
        finally:
            other.delete()

    def test_browse_subsets_searches_names_and_descriptions_and_pages(self):
        for index in range(6):
            fosub.create_subset(
                self.dataset,
                "Batch %d" % index,
                "Night drives" if index % 2 else None,
            )
        page = fosub.browse_subsets(self.dataset, skip=0, limit=5)
        self.assertEqual(len(page["subsets"]), 5)
        self.assertEqual(page["total"], 7)
        self.assertEqual(page["count"], 7)
        self.assertEqual(page["subsets"][0]["name"], "Review")
        rest = fosub.browse_subsets(self.dataset, skip=5, limit=5)
        self.assertEqual(
            [s["name"] for s in rest["subsets"]], ["Batch 4", "Batch 5"]
        )
        found = fosub.browse_subsets(self.dataset, search="night", limit=5)
        self.assertEqual(found["total"], 3)
        self.assertEqual(found["count"], 7)
        self.assertTrue(
            all("Night" in s["description"] for s in found["subsets"])
        )
        self.assertEqual(
            fosub.browse_subsets(self.dataset, search="rev")["total"], 1
        )
        self.assertEqual(
            fosub.browse_subsets(self.dataset, search="(")["total"], 0
        )
        self.assertEqual(
            fosub.subset_summary(self.dataset, self.subset)["name"], "Review"
        )

    def test_subsets_carry_an_optional_description(self):
        created = fosub.create_subset(
            self.dataset, "Night", "  Frames captured after dusk  "
        )
        self.assertEqual(created["description"], "Frames captured after dusk")
        names = {s["name"]: s for s in fosub.list_subsets(self.dataset)}
        self.assertEqual(
            names["Night"]["description"], "Frames captured after dusk"
        )
        self.assertIsNone(names["Review"]["description"])
        self.assertIsNone(
            fosub.create_subset(self.dataset, "Blank", "  ")["description"]
        )
        with self.assertRaises(ValueError):
            fosub.create_subset(self.dataset, "Long", "x" * 1001)

    def test_delete_subset_removes_only_its_records(self):
        other = fosub.create_subset(self.dataset, "Keep")["id"]
        members = [{"episodeId": i, "kind": "episode"} for i in self.ids[:3]]
        operation = str(uuid4())
        fosub.prepare_add(self.dataset, self.subset, operation, members)
        fosub.apply_add(self.dataset, operation)
        kept = str(uuid4())
        fosub.prepare_add(self.dataset, other, kept, members[:1])
        fosub.apply_add(self.dataset, kept)
        self.assertEqual(
            fosub.delete_subset(self.dataset, self.subset)["id"], self.subset
        )
        self.assertEqual(
            [s["name"] for s in fosub.list_subsets(self.dataset)], ["Keep"]
        )
        db = foo.get_db_conn()
        self.assertEqual(
            db["subset_members"].count_documents({"subset_id": self.subset}), 0
        )
        self.assertEqual(
            db["subset_operations"].count_documents(
                {"subset_id": self.subset}
            ),
            0,
        )
        self.assertEqual(len(fosub.subset_members(self.dataset, other)), 1)
        with self.assertRaises(ValueError):
            fosub.delete_subset(self.dataset, self.subset)
        with self.assertRaises(ValueError):
            fosub.delete_subset(fo.Dataset(), other)

    def test_dataset_deletion_cleans_only_its_subset_records(self):
        self.add([_episode(self.ids[0])])
        other = fo.Dataset()
        other_id = other._doc.id
        fosub.create_subset(other, "Other")
        other.delete()
        self.assertEqual(
            foo.get_db_conn().subsets.count_documents(
                {"_dataset_id": other_id}
            ),
            0,
        )
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 1
        )

    def test_all_unloaded_candidates_are_saved(self):
        members = [
            m
            for g in _resolve_all(self.dataset, {})["groups"]
            for m in g["members"]
        ]
        preview, result = self.add(members)
        self.assertEqual(preview["counts"]["fullEpisodes"], 45)
        self.assertEqual(result["added"], 45)
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 45
        )

    def test_writes_check_registered_access_policy(self):
        mutators = [
            (fosub.create_subset, ("Denied",)),
            (fosub.prepare_add, (self.subset, "denied", [])),
            (fosub.apply_add, ("denied",)),
            (fosub.remove_members, (self.subset, [])),
            (fosub.delete_subset, (self.subset,)),
        ]
        for method, args in mutators:
            with patch.object(
                fosc, "check_access", side_effect=PermissionError("Denied")
            ) as access, self.assertRaises(PermissionError):
                method(self.dataset, *args)
            access.assert_called_once_with(self.dataset, "edit")

    def test_records_actor_and_releases_completed_candidates(self):
        token = _actor.set("subset-test-user")
        try:
            created = fosub.create_subset(self.dataset, "Audited")
            operation = str(uuid4())
            fosub.prepare_add(
                self.dataset, created["id"], operation, [_episode(self.ids[0])]
            )
            result = fosub.apply_add(self.dataset, operation)
            metadata = fosub.get_subset(self.dataset, created["id"])
            self.assertEqual(metadata["created_by"], "subset-test-user")
            self.assertEqual(metadata["last_modified_by"], "subset-test-user")
            self.assertEqual(
                foo.get_db_conn().subset_candidates.count_documents(
                    {"subset_id": created["id"]}
                ),
                0,
            )
            self.assertEqual(fosub.apply_add(self.dataset, operation), result)
            self.assertEqual(
                fosub.prepare_add(
                    self.dataset,
                    created["id"],
                    operation,
                    [_episode(self.ids[0])],
                ),
                result,
            )
        finally:
            _actor.reset(token)

    def test_expired_and_incomplete_operations_cannot_apply(self):
        operation = str(uuid4())
        fosub.prepare_add(
            self.dataset, self.subset, operation, [_episode(self.ids[0])]
        )
        key = fosub._digest([str(self.dataset._doc.id), operation])
        foo.get_db_conn().subset_operations.update_one(
            {"_id": key},
            {
                "$set": {
                    "expires_at": datetime.now(timezone.utc)
                    - timedelta(seconds=1)
                }
            },
        )
        with self.assertRaisesRegex(ValueError, "expired"):
            fosub.apply_add(self.dataset, operation)
        other = str(uuid4())
        fosub.prepare_add(
            self.dataset, self.subset, other, [_episode(self.ids[0])]
        )
        foo.get_db_conn().subset_candidates.delete_many(
            {"operation_id": fosub._digest([str(self.dataset._doc.id), other])}
        )
        with self.assertRaisesRegex(ValueError, "incomplete"):
            fosub.apply_add(self.dataset, other)
        self.assertEqual(fosub.subset_members(self.dataset, self.subset), [])

    def test_foreign_ids_rejected_but_saved_missing_members_can_be_carried(
        self,
    ):
        with self.assertRaisesRegex(ValueError, "source samples"):
            self.add([_episode(str(ObjectId()))])
        saved = _segment(self.ids[0], 10, 20)
        self.add([saved])
        self.dataset.delete_samples(self.ids[0])
        self.add([saved])
        with self.assertRaisesRegex(ValueError, "source samples"):
            self.add([_episode(self.ids[0])])
        with self.assertRaisesRegex(ValueError, "source samples"):
            self.add([_segment(self.ids[0], 10, 21)])

    def test_patch_views_cannot_add_to_sample_subsets(self):
        request = {
            "subsetId": self.subset,
            "operationId": str(uuid4()),
            "view": [fo.ToPatches("detections")._serialize()],
            "members": [_episode(self.ids[0])],
        }
        with self.assertRaisesRegex(ValueError, "matching entity view"):
            prepare_subset_add(self.dataset, request)
        snapshot = create_snapshot(self.dataset, {})
        foo.get_db_conn().selection_snapshots.update_one(
            {"_id": ObjectId(snapshot["snapshotId"])},
            {"$set": {"view": request["view"]}},
        )
        with self.assertRaisesRegex(ValueError, "matching entity view"):
            prepare_subset_add(
                self.dataset,
                {
                    "subsetId": self.subset,
                    "operationId": str(uuid4()),
                    **snapshot,
                },
            )

    def test_large_scope_uses_joins_bulk_writes_and_streamed_snapshots(self):
        calls = []
        original = Collection.bulk_write

        def record(collection, requests, *args, **kwargs):
            calls.append((collection.name, len(requests)))
            return original(collection, requests, *args, **kwargs)

        # Small batch limits exercise boundaries without a huge fixture.
        with patch.object(fosub, "_BATCH_SIZE", 10), patch.object(
            Collection, "bulk_write", record
        ):
            self.add([_episode(i) for i in self.ids])
        self.assertTrue(all(size <= 10 for _, size in calls))
        self.assertLess(len(calls), len(self.ids))
        boundary = {"subsetId": self.subset, "subsetScope": "episodes"}
        with patch.object(
            fosub,
            "subset_members",
            side_effect=AssertionError("enumerated subset"),
        ):
            counts = fosub.subset_summary(
                self.dataset, self.subset, counts=True
            )["counts"]
            self.assertEqual(
                counts,
                {
                    "episodes": 45,
                    "fullEpisodes": 45,
                    "segments": 0,
                    "segmentEpisodes": 0,
                    "unavailable": 0,
                },
            )
            request = {"boundary": boundary, "episodeIds": self.ids[:2]}
            result = resolve_scope(self.dataset, request)
            self.assertEqual(len(result["groups"]), 2)
            self.assertEqual(result["counts"]["episodes"], 45)
            view = get_view(
                self.dataset, filters={"_selection_scope": boundary}
            )
            self.assertEqual(view.limit(2).values("id"), self.ids[:2])
            snapshot = create_snapshot(self.dataset, request)
            operation = str(uuid4())
            preview = prepare_subset_add(
                self.dataset,
                {
                    "subsetId": self.subset,
                    "operationId": operation,
                    **snapshot,
                },
            )
            self.assertEqual(preview["duplicates"], 45)
            self.assertEqual(
                fosub.apply_add(self.dataset, operation)["duplicates"], 45
            )

    def test_missing_references_are_paged_without_changing_scope_counts(self):
        self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/missing-%s.mp4" % i) for i in range(80)]
        )
        ids = self.dataset.values("id")
        self.add([_episode(i) for i in ids])
        self.dataset.delete_samples(ids)
        request = {"boundary": {"subsetId": self.subset}}
        first = resolve_scope(self.dataset, request)
        second = resolve_scope(
            self.dataset, {**request, "unavailableSkip": 100}
        )
        self.assertEqual(first["counts"]["unavailable"], 125)
        self.assertEqual(first["unavailableTotal"], 125)
        self.assertEqual(len(first["unavailableGroups"]), 100)
        self.assertEqual(len(second["unavailableGroups"]), 25)
        self.assertEqual(first["counts"], second["counts"])

    def test_concurrent_removal_does_not_crash_receipt_counting(self):
        operation = str(uuid4())
        fosub.prepare_add(
            self.dataset, self.subset, operation, [_episode(self.ids[0])]
        )
        original = fosub._insert_batch

        def remove_after_insert(collection, docs):
            original(collection, docs)
            collection.delete_many(
                {"_id": {"$in": [doc["_id"] for doc in docs]}}
            )

        with patch.object(fosub, "_insert_batch", remove_after_insert):
            result = fosub.apply_add(self.dataset, operation)
        self.assertEqual(result["added"], 0)
        self.assertEqual(fosub.subset_members(self.dataset, self.subset), [])


class AsyncSubsetReadsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        actor_provider = patch.object(fosc, "get_actor", _actor.get)
        actor_provider.start()
        self.addCleanup(actor_provider.stop)
        self.dataset = fo.Dataset()
        self.dataset.add_sample(fo.Sample(filepath="/tmp/async-subset.mp4"))
        self.subset = fosub.create_subset(self.dataset, "Review")["id"]
        self.db = foo.get_async_db_conn()

    def tearDown(self):
        self.db.client.close()
        self.dataset.delete()

    async def test_summary_reads_one_document_without_sync_io_or_repair(self):
        operation = str(uuid4())
        episode = self.dataset.first().id
        fosub.prepare_add(
            self.dataset,
            self.subset,
            operation,
            [_episode(episode), _segment(episode, 1, 2)],
        )
        with patch.object(
            fosub, "_write_batch", side_effect=AutoReconnect("interrupted")
        ):
            with self.assertRaises(AutoReconnect):
                fosub.apply_add(self.dataset, operation)
        collection = self.db["subsets"]
        with patch.object(
            foo, "get_async_db_conn", return_value={"subsets": collection}
        ), patch.object(
            foo, "get_db_conn", side_effect=AssertionError("sync I/O")
        ), patch.object(
            collection, "find_one", wraps=collection.find_one
        ) as read:
            summary = await fosub.async_subset_summary(
                self.dataset, self.subset
            )
        read.assert_called_once()
        self.assertEqual(summary["memberCount"], 2)
        self.assertEqual(
            summary["memberCounts"], {"fullEpisodes": 1, "segments": 1}
        )
        self.assertEqual(summary["kinds"], ["episode", "segment"])
        self.assertIsNone(summary["counts"])
        self.assertIn(
            "member_pending", fosub.get_subset(self.dataset, self.subset)
        )

    async def test_async_pagination_matches_sync_search_and_view_filters(self):
        for name in ("Day", "Night", "Night review"):
            fosub.create_subset(self.dataset, name)
        queries = [
            {"limit": 2},
            {"skip": 2, "limit": 2},
            {"search": "review"},
            {"search": "(", "view": []},
        ]
        expected = [fosub.browse_subsets(self.dataset, **q) for q in queries]
        with patch.object(
            foo, "get_async_db_conn", return_value=self.db
        ), patch.object(
            foo, "get_db_conn", side_effect=AssertionError("sync I/O")
        ):
            for query, page in zip(queries, expected):
                self.assertEqual(
                    await fosub.async_browse_subsets(self.dataset, **query),
                    page,
                )
            other = SimpleNamespace(_doc=SimpleNamespace(id=ObjectId()))
            with self.assertRaisesRegex(ValueError, "not available"):
                await fosub.async_subset_summary(other, self.subset)
            with self.assertRaisesRegex(ValueError, "not available"):
                await fosub.async_subset_summary(self.dataset, str(ObjectId()))


def _episode(episode):
    return {"episodeId": episode, "kind": "episode"}


def _segment(episode, start, end, provider="events"):
    return {
        "episodeId": episode,
        "kind": "segment",
        "range": {
            "start": str(start),
            "end": str(end),
            "timebase": "sequence",
            "streams": ["filepath"],
            "provenance": [{"provider": provider, "source": "test"}],
        },
    }


class PatchSubsetTests(unittest.TestCase):
    def setUp(self):
        actor_provider = patch.object(fosc, "get_actor", _actor.get)
        actor_provider.start()
        self.addCleanup(actor_provider.stop)
        self.dataset = fo.Dataset()
        self.dataset.add_sample(
            fo.Sample(
                filepath="/tmp/patch-subset.jpg",
                ground_truth=fo.Detections(
                    detections=[
                        fo.Detection(
                            label=str(i), bounding_box=[0.1 * i, 0, 0.1, 0.2]
                        )
                        for i in range(4)
                    ]
                ),
                predictions=fo.Detections(
                    detections=[fo.Detection(label="other")]
                ),
            )
        )
        self.patches = self.dataset.to_patches("ground_truth")
        self.stages = self.patches._serialize()
        self.ids = self.patches.values("id")
        self.subset = fosub.create_subset(
            self.dataset, "Two birds", view=self.stages
        )["id"]
        self.boundary = {"subsetId": self.subset, "subsetScope": "episodes"}

    def tearDown(self):
        self.dataset.delete()

    def add(self, members=None, snapshot_id=None, stages=None):
        operation = str(uuid4())
        preview = prepare_subset_add(
            self.dataset,
            {
                "subsetId": self.subset,
                "operationId": operation,
                "members": members,
                "snapshotId": snapshot_id,
                "view": self.stages if stages is None else stages,
            },
        )
        result = fosub.apply_add(self.dataset, operation)
        return preview, result

    def test_exact_patches_reopen_after_conversion_is_recreated(self):
        chosen = self.ids[1:3]
        preview, result = self.add([_episode(i) for i in chosen])
        self.assertEqual(preview["counts"]["unavailable"], 0)
        self.assertEqual(result["counts"]["fullEpisodes"], 2)
        self.assertEqual(result["counts"]["unavailable"], 0)
        recreated = self.dataset.to_patches("ground_truth")
        self.assertNotEqual(
            recreated._dataset.name, self.patches._dataset.name
        )
        request = {"view": recreated._serialize(), "boundary": self.boundary}
        resolved = _resolve_all(self.dataset, request)
        self.assertEqual([g["episodeId"] for g in resolved["groups"]], chosen)
        self.assertEqual(resolved["counts"]["fullEpisodes"], 2)
        self.assertTrue(all("crop" in g for g in resolved["groups"]))
        limited = get_view(
            self.dataset,
            stages=recreated.limit(1)._serialize(),
            selection_scope=self.boundary,
        )
        self.assertEqual(limited.values("id"), chosen[:1])
        self.assertEqual(limited.count(), 1)
        self.assertEqual(self.dataset.count(), 1)
        self.assertEqual(self.dataset.count("ground_truth.detections"), 4)
        page = fosub.browse_subsets(self.dataset, view=recreated._serialize())
        self.assertEqual([s["id"] for s in page["subsets"]], [self.subset])
        self.assertEqual(fosub.browse_subsets(self.dataset)["total"], 1)
        self.assertEqual(
            fosub.browse_subsets(self.dataset, view=[])["total"], 0
        )
        removed = fosub.remove_members(
            self.dataset, self.subset, [_episode(chosen[0])]
        )
        self.assertEqual(removed["counts"]["fullEpisodes"], 1)
        self.assertEqual(recreated.count(), 4)

    def test_browse_lists_all_dataset_subsets_unless_view_is_explicit(self):
        samples = fosub.create_subset(self.dataset, "Sample review")["id"]
        predictions = self.dataset.to_patches("predictions")._serialize()
        predicted = fosub.create_subset(
            self.dataset, "Prediction review", view=predictions
        )["id"]
        other = fo.Dataset()
        try:
            fosub.create_subset(other, "Other dataset")
            page = fosub.browse_subsets(self.dataset, limit=2)
            self.assertEqual(page["total"], 3)
            self.assertEqual(page["count"], 3)
            self.assertEqual(
                [s["id"] for s in page["subsets"]], [self.subset, samples]
            )
            rest = fosub.browse_subsets(self.dataset, skip=2, limit=2)
            self.assertEqual([s["id"] for s in rest["subsets"]], [predicted])
            found = fosub.browse_subsets(self.dataset, search="review")
            self.assertEqual(found["total"], 2)
            self.assertEqual(found["count"], 3)
            self.assertEqual(
                {s["id"] for s in fosub.list_subsets(self.dataset)},
                {self.subset, samples, predicted},
            )
            for view, expected in (
                ([], samples),
                (self.stages, self.subset),
                (predictions, predicted),
            ):
                compatible = fosub.browse_subsets(self.dataset, view=view)
                self.assertEqual(compatible["total"], 1)
                self.assertEqual(compatible["count"], 1)
                self.assertEqual(compatible["subsets"][0]["id"], expected)
        finally:
            other.delete()

    def test_snapshots_save_only_matching_patches(self):
        snapshot = create_snapshot(
            self.dataset, {"view": self.patches.skip(2)._serialize()}
        )
        self.add(snapshot_id=snapshot["snapshotId"])
        self.assertEqual(
            [
                m["episodeId"]
                for m in fosub.subset_members(self.dataset, self.subset)
            ],
            self.ids[2:],
        )
        scoped = create_snapshot(
            self.dataset, {"view": self.stages, "boundary": self.boundary}
        )
        self.assertEqual(scoped["counts"]["fullEpisodes"], 2)

    def test_evaluation_patches_reopen_with_exact_membership(self):
        sample = self.dataset.first()
        sample.predictions.detections[0].label = "0"
        sample.predictions.detections[0].bounding_box = [0, 0, 0.1, 0.2]
        sample.predictions.detections[0].confidence = 0.9
        sample.save()
        self.dataset.evaluate_detections("predictions", eval_key="eval")
        patches = self.dataset.to_evaluation_patches("eval")
        chosen = patches.match({"type": "tp"}).first().id
        self.subset = fosub.create_subset(
            self.dataset, "Matched birds", view=patches._serialize()
        )["id"]
        self.add([_episode(chosen)], stages=patches._serialize())
        recreated = self.dataset.to_evaluation_patches("eval")
        view = get_view(
            self.dataset,
            stages=recreated._serialize(),
            selection_scope={"subsetId": self.subset},
        )
        self.assertEqual(view.values("id"), [chosen])
        self.assertEqual(view.count("ground_truth.detections"), 1)
        self.assertEqual(view.count("predictions.detections"), 1)
        self.assertEqual(
            fosub.subset_counts(self.dataset, self.subset)["fullEpisodes"], 1
        )

    def test_missing_patches_keep_saved_references_after_regeneration(self):
        chosen = self.ids[1:3]
        self.add([_episode(i) for i in chosen])
        self.dataset.delete_labels(ids=chosen[:1], fields="ground_truth")
        self.patches._dataset.delete()
        recreated = self.dataset.to_patches("ground_truth")
        result = _resolve_all(
            self.dataset,
            {"view": recreated._serialize(), "boundary": self.boundary},
        )
        self.assertEqual(
            [g["episodeId"] for g in result["groups"]], chosen[1:]
        )
        self.assertEqual(result["unavailableTotal"], 1)
        self.assertEqual(
            result["unavailableGroups"][0]["episodeId"], chosen[0]
        )
        self.assertEqual(
            fosub.subset_counts(self.dataset, self.subset)["unavailable"], 1
        )
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 2
        )
        self.assertEqual(fosub.member_count(self.dataset, self.subset), 2)

    def test_source_samples_and_different_patch_fields_cannot_mix(self):
        with self.assertRaises(ValueError):
            self.add([_episode(self.dataset.first().id)], stages=[])
        other = self.dataset.to_patches("predictions")
        with self.assertRaises(ValueError):
            self.add([_episode(other.first().id)], stages=other._serialize())
        with self.assertRaises(ValueError):
            self.add([_episode(self.dataset.first().id)])
        self.add([_episode(self.ids[0])])
        samples = fosub.create_subset(self.dataset, "Samples")["id"]
        with self.assertRaises(ValueError):
            fosub.prepare_add(
                self.dataset, samples, str(uuid4()), [_episode(self.ids[0])]
            )
        with self.assertRaises(ValueError):
            get_view(self.dataset, stages=[], selection_scope=self.boundary)
