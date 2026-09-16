"""
Episode selection identity and complete scope resolution tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.selection as fosel
import fiftyone.core.tags as fot
from datetime import datetime

import fiftyone.server.samples as foses
from fiftyone.server import selection as foss
from fiftyone.server.selection import (
    create_snapshot,
    load_snapshot,
    resolve_candidates,
    resolve_scope,
    selection_availability,
)


class SelectionIdentityTests(unittest.TestCase):
    def test_exact_identity_and_overlap(self):
        episode = str(ObjectId())
        a = _segment(episode, "9007199254740993", "9007199254741003")
        b = _segment(episode, "9007199254740993", "9007199254741003", "tags")
        c = _segment(episode, "9007199254741000", "9007199254741010")
        members = fosel.normalize_members([a, b, c])
        self.assertEqual(len(members), 2)
        self.assertEqual(len(members[0]["range"]["provenance"]), 2)
        self.assertEqual(members[0]["range"]["start"], "9007199254740993")

    def test_subset_boundary_never_promotes_segments(self):
        episode = str(ObjectId())
        allowed = [_segment(episode, "10", "20")]
        self.assertEqual(
            fosel.intersect_members(
                [{"episodeId": episode, "kind": "episode"}], allowed
            ),
            [],
        )
        clipped = fosel.intersect_members(
            [_segment(episode, "0", "15")], allowed
        )
        self.assertEqual(clipped[0]["range"]["start"], "10")
        self.assertEqual(clipped[0]["range"]["end"], "15")

    def test_full_and_segments_coexist_in_storage(self):
        episode = str(ObjectId())
        members = [
            {"episodeId": episode, "kind": "episode"},
            _segment(episode, "0", "10"),
        ]
        self.assertEqual(len(fosel.group_members(members)), 1)
        self.assertEqual(fosel.count_members(members)["fullEpisodes"], 1)
        self.assertEqual(fosel.count_members(members)["segments"], 1)


class SelectionResolutionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/selection-%d.mp4" % i,
                    batch=i % 2,
                    events=fo.TemporalDetections(
                        detections=[
                            fo.TemporalDetection(
                                label="walk", support=[1, 10]
                            ),
                            fo.TemporalDetection(
                                label="turn", support=[20, 30]
                            ),
                        ]
                    ),
                )
                for i in range(45)
            ]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_unloaded_events_and_empty_provider(self):
        request = {
            "boundary": {
                "provider": {"kind": "events", "field": "events", "values": []}
            }
        }
        result = resolve_candidates(self.dataset, request)
        self.assertEqual(result["counts"]["episodes"], 45)
        self.assertEqual(result["counts"]["segments"], 90)
        self.assertEqual(
            result["groups"][0]["members"][0]["range"]["start"], "0"
        )
        request["boundary"]["provider"]["values"] = ["absent"]
        self.assertEqual(
            resolve_candidates(self.dataset, request)["groups"], []
        )

    def test_filters_and_captured_tags_are_independent(self):
        sample = self.dataset.first()
        fot.add_temporal_tags(
            self.dataset,
            fot.TemporalTag(
                sample.id, 1, 5, "review", index_type=1, anchor="filepath"
            ),
        )
        request = {
            "boundary": {
                "provider": {"kind": "temporal-tags", "values": ["review"]}
            }
        }
        capture = resolve_candidates(self.dataset, request)
        self.assertEqual(capture["counts"]["segments"], 1)
        fot.delete_temporal_tags(self.dataset, delete_all=True)
        self.assertEqual(
            resolve_candidates(self.dataset, request)["counts"]["segments"], 0
        )
        self.assertEqual(
            capture["groups"][0]["members"][0]["range"]["start"], "1"
        )
        result = resolve_candidates(
            self.dataset,
            {"view": self.dataset.match({"batch": 0}).limit(3)._serialize()},
        )
        self.assertEqual(result["counts"]["fullEpisodes"], 3)


def _segment(episode, start, end, provider="events"):
    return {
        "episodeId": episode,
        "kind": "segment",
        "range": {
            "start": start,
            "end": end,
            "timebase": "sequence",
            "streams": ["filepath"],
            "provenance": [{"provider": provider, "source": "field"}],
        },
    }


class ImageSelectionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/image-%d.jpg" % i) for i in range(3)]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_images_resolve_as_whole_samples_with_filepaths(self):
        result = resolve_candidates(self.dataset, {})
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        self.assertEqual(result["counts"]["segments"], 0)
        self.assertEqual(
            sorted(group["filepath"] for group in result["groups"]),
            ["/tmp/image-%d.jpg" % i for i in range(3)],
        )
        self.assertEqual(result["unavailableGroups"], [])

    def test_grid_nodes_for_ids_carry_the_grid_sample_and_urls(self):
        ids = self.dataset.values("id")[:2]
        nodes = asyncio.run(foses.sample_nodes_for_ids(self.dataset, ids))
        self.assertEqual(sorted(nodes), sorted(ids))
        node = nodes[ids[0]]
        self.assertEqual(str(node.id), ids[0])
        self.assertEqual(
            node.sample["filepath"], self.dataset[ids[0]].filepath
        )
        self.assertEqual([url.field for url in node.urls], ["filepath"])
        self.assertEqual(
            asyncio.run(foses.sample_nodes_for_ids(self.dataset, [])), {}
        )


class ConvertedViewSelectionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/patches-%d.jpg" % i,
                    ground_truth=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="thing",
                                bounding_box=[0.1, 0.1, 0.2, 0.2],
                            )
                            for _ in range(i + 1)
                        ]
                    ),
                )
                for i in range(2)
            ]
        )
        self.stages = [fo.ToPatches("ground_truth")._serialize()]

    def tearDown(self):
        self.dataset.delete()

    def test_patches_select_their_own_ids_with_parent_media(self):
        result = resolve_candidates(self.dataset, {"view": self.stages})
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        self.assertEqual(
            sorted({group["filepath"] for group in result["groups"]}),
            ["/tmp/patches-0.jpg", "/tmp/patches-1.jpg"],
        )
        patch_ids = [group["episodeId"] for group in result["groups"]]
        self.assertNotIn(patch_ids[0], self.dataset.values("id"))
        availability = selection_availability(
            self.dataset, patch_ids[:1] + [str(ObjectId())], self.stages
        )
        self.assertFalse(availability[patch_ids[0]]["unavailable"])
        self.assertTrue(list(availability.values())[1]["unavailable"])

    def test_converted_views_refuse_subsets_and_sources(self):
        with self.assertRaises(ValueError):
            resolve_candidates(
                self.dataset,
                {
                    "view": self.stages,
                    "boundary": {
                        "provider": {"kind": "temporal-tags", "values": ["x"]}
                    },
                },
            )


class LazyScopeAndSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/lazy-%d.jpg" % i) for i in range(3)]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_browsing_returns_counts_and_only_requested_parents(self):
        result = resolve_scope(self.dataset, {})
        self.assertEqual(result["groups"], [])
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        wanted = self.dataset.values("id")[:1] + [str(ObjectId())]
        described = resolve_scope(self.dataset, {"episodeIds": wanted})
        self.assertEqual(
            [group["episodeId"] for group in described["groups"]], wanted[:1]
        )
        self.assertEqual(described["groups"][0]["filepath"], "/tmp/lazy-0.jpg")

    def test_snapshot_freezes_the_scope_until_it_expires(self):
        snapshot = create_snapshot(self.dataset, {})
        self.assertEqual(snapshot["counts"]["fullEpisodes"], 3)
        self.dataset.delete_samples(self.dataset.first().id)
        members, doc = load_snapshot(self.dataset, snapshot["snapshotId"])
        self.assertEqual(len(members), 3)
        self.assertEqual(doc["count"], 3)
        self.assertEqual(
            resolve_scope(self.dataset, {})["counts"]["episodes"], 2
        )
        other = fo.Dataset()
        try:
            with self.assertRaises(ValueError):
                load_snapshot(other, snapshot["snapshotId"])
        finally:
            other.delete()
        foss._collection("selection_snapshots").update_one(
            {"_id": ObjectId(snapshot["snapshotId"])},
            {"$set": {"expires_at": datetime(2000, 1, 1)}},
        )
        with self.assertRaises(ValueError):
            load_snapshot(self.dataset, snapshot["snapshotId"])
        with self.assertRaises(ValueError):
            load_snapshot(self.dataset, "not-an-id")


class DynamicGroupSelectionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/dg-%d.jpg" % i, scene=i % 2)
                for i in range(5)
            ]
        )
        self.stages = [fo.GroupBy("scene")._serialize()]

    def tearDown(self):
        self.dataset.delete()

    def test_whole_dynamic_groups_are_the_unit(self):
        request = {"view": self.stages, "expand": "dynamic-groups"}
        result = resolve_scope(self.dataset, request)
        self.assertEqual(result["counts"]["episodes"], 2)
        self.assertEqual(result["counts"]["fullEpisodes"], 5)
        representative = self.dataset.group_by("scene").first().id
        details = resolve_scope(
            self.dataset, {**request, "episodeIds": [representative]}
        )
        (group,) = details["groups"]
        self.assertEqual(group["episodeId"], representative)
        self.assertEqual(group["group"]["size"], len(group["members"]))
        self.assertIn(group["group"]["size"], (2, 3))
        self.assertTrue(all(m["kind"] == "episode" for m in group["members"]))
        snapshot = create_snapshot(self.dataset, request)
        members, _ = load_snapshot(self.dataset, snapshot["snapshotId"])
        self.assertEqual(len(members), 5)
        plain = resolve_scope(self.dataset, {"view": self.stages})
        self.assertEqual(plain["counts"]["fullEpisodes"], 2)
