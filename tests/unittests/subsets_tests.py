"""
Frozen subset membership, retry, and browsing boundary tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import patch
from uuid import uuid4

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.subsets as fosub
from fiftyone.server.selection import resolve_candidates
from fiftyone.server.view import get_view


class SubsetTests(unittest.TestCase):
    def setUp(self):
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

    def test_partial_retry_uses_frozen_members_and_receipts(self):
        operation = str(uuid4())
        members = [_episode(i) for i in self.ids[:3]]
        fosub.prepare_add(self.dataset, self.subset, operation, members)
        original = fosub._insert_once
        calls = 0

        def fail_after_first(collection, doc):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("connection lost")
            original(collection, doc)

        with patch.object(fosub, "_insert_once", fail_after_first):
            with self.assertRaises(RuntimeError):
                fosub.apply_add(self.dataset, operation)
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
        result = resolve_candidates(
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

    def test_reopen_retains_ranges_and_intersects_streams(self):
        self.add([_segment(self.ids[0], 10, 20)])
        boundary = {"subsetId": self.subset, "subsetScope": "segments"}
        request = {"boundary": boundary}
        result = resolve_candidates(self.dataset, request)
        self.assertEqual(result["counts"]["fullEpisodes"], 0)
        self.assertEqual(result["counts"]["segments"], 1)
        boundary["provider"] = {
            "kind": "ranges",
            "label": "Current",
            "members": [_segment(self.ids[0], 0, 15)],
        }
        result = resolve_candidates(self.dataset, request)
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
        result = resolve_candidates(
            self.dataset, {"boundary": {"subsetId": self.subset}}
        )
        self.assertEqual(result["counts"]["unavailable"], 1)
        self.assertEqual(result["groups"][0]["filepath"], "/tmp/updated.mp4")
        self.assertTrue(result["unavailableGroups"][0]["unavailable"])
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 2
        )

    def test_unsupported_stage_and_foreign_dataset_fail_closed(self):
        self.add([_episode(self.ids[0])])
        boundary = {"subsetId": self.subset}
        with self.assertRaisesRegex(ValueError, "Mongo"):
            resolve_candidates(
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
            for g in resolve_candidates(self.dataset, {})["groups"]
            for m in g["members"]
        ]
        preview, result = self.add(members)
        self.assertEqual(preview["counts"]["fullEpisodes"], 45)
        self.assertEqual(result["added"], 45)
        self.assertEqual(
            len(fosub.subset_members(self.dataset, self.subset)), 45
        )


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
