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
import fiftyone.server.selection as foss
from fiftyone.server.selection import (
    create_snapshot,
    load_snapshot,
    resolve_scope,
    sample_position,
    selection_availability,
)


def _resolve_all(dataset, request):
    # Small fixtures request every rendered parent through the production route.
    view, _, _ = foss._scoped_view(dataset, request)
    return resolve_scope(dataset, {**request, "episodeIds": view.values("id")})


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

    def test_intersection_retains_both_origins_without_mutating_inputs(self):
        episode = str(ObjectId())
        saved = _segment(episode, "10", "20", "events")
        candidate = _segment(episode, "15", "25", "temporal-tags")
        result = fosel.intersect_members([candidate], [saved])
        self.assertEqual(result[0]["range"]["start"], "15")
        self.assertEqual(result[0]["range"]["end"], "20")
        self.assertEqual(
            [p["provider"] for p in result[0]["range"]["provenance"]],
            ["events", "temporal-tags"],
        )
        self.assertEqual(len(saved["range"]["provenance"]), 1)
        self.assertEqual(len(candidate["range"]["provenance"]), 1)
        again = fosel.intersect_members(result, [saved])
        self.assertEqual(again, result)


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
        result = _resolve_all(self.dataset, request)
        self.assertEqual(result["counts"]["episodes"], 45)
        self.assertEqual(result["counts"]["segments"], 90)
        self.assertEqual(
            result["groups"][0]["members"][0]["range"]["start"], "0"
        )
        request["boundary"]["provider"]["values"] = ["absent"]
        self.assertEqual(_resolve_all(self.dataset, request)["groups"], [])

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
        capture = _resolve_all(self.dataset, request)
        self.assertEqual(capture["counts"]["segments"], 1)
        fot.delete_temporal_tags(self.dataset, delete_all=True)
        self.assertEqual(
            _resolve_all(self.dataset, request)["counts"]["segments"], 0
        )
        self.assertEqual(
            capture["groups"][0]["members"][0]["range"]["start"], "1"
        )
        result = _resolve_all(
            self.dataset,
            {"view": self.dataset.match({"batch": 0}).limit(3)._serialize()},
        )
        self.assertEqual(result["counts"]["fullEpisodes"], 3)

    def test_intersection_filters_time_and_streams_before_grid_pagination(
        self,
    ):
        sample = self.dataset.first()
        fot.add_temporal_tags(
            self.dataset,
            fot.TemporalTag(
                sample.id, 5, 15, "review", index_type=1, anchor="filepath"
            ),
        )
        ranges = {
            "kind": "ranges",
            "members": [_segment(sample.id, "10", "20", "embeddings")],
        }
        tags = {"kind": "temporal-tags", "values": ["review"]}
        request = {
            "boundary": {
                "provider": {
                    "kind": "intersection",
                    "providers": [ranges, tags],
                }
            }
        }
        result = _resolve_all(self.dataset, request)
        self.assertEqual(result["counts"]["segments"], 1)
        saved = result["groups"][0]["members"][0]["range"]
        self.assertEqual((saved["start"], saved["end"]), ("10", "15"))
        self.assertEqual(
            {p["provider"] for p in saved["provenance"]},
            {"embeddings", "temporal-tags"},
        )
        # Nested intersections exercise independent aggregation scratch fields.
        request["boundary"]["provider"] = {
            "kind": "intersection",
            "providers": [request["boundary"]["provider"], ranges],
        }
        self.assertEqual(
            _resolve_all(self.dataset, request)["counts"]["segments"], 1
        )
        ranges["members"][0]["range"]["start"] = "16"
        self.assertEqual(
            _resolve_all(self.dataset, request)["counts"]["episodes"], 0
        )
        ranges["members"][0]["range"]["start"] = "10"
        ranges["members"][0]["range"]["streams"] = ["other"]
        self.assertEqual(
            _resolve_all(self.dataset, request)["counts"]["episodes"], 0
        )

    def test_transient_uploads_keep_short_expiry_until_an_action_retains_them(
        self,
    ):
        sample = self.dataset.first()
        snapshots = [
            create_snapshot(
                self.dataset,
                {
                    "members": [
                        _segment(sample.id, str(start), str(start + 5))
                    ],
                    "view": [],
                    "transient": True,
                },
            )
            for start in (10, 20)
        ]
        request = {
            "snapshotIds": [snapshot["snapshotId"] for snapshot in snapshots],
            "members": [],
            "view": [],
            "transient": True,
        }
        union = create_snapshot(self.dataset, request)
        for snapshot in snapshots + [union]:
            doc = foss.snapshot_info(self.dataset, snapshot["snapshotId"])
            lifetime = doc["expires_at"] - doc["created_at"]
            self.assertGreaterEqual(lifetime, foss.SNAPSHOT_TTL)
            self.assertLess(lifetime.total_seconds(), 3660)
            chunks = foss._collection("selection_snapshot_members").find(
                {"snapshot_id": doc["_id"]}
            )
            for chunk in chunks:
                self.assertEqual(chunk["expires_at"], doc["expires_at"])

        request["snapshotIds"] = [union["snapshotId"]]
        reused = create_snapshot(self.dataset, request)
        self.assertEqual(reused["snapshotId"], union["snapshotId"])
        request.pop("transient")
        retained = create_snapshot(self.dataset, request)
        doc = foss.snapshot_info(self.dataset, retained["snapshotId"])
        self.assertGreater((doc["expires_at"] - doc["created_at"]).days, 6)

    def test_snapshot_provider_resolves_frozen_ranges_and_intersections(self):
        sample = self.dataset.first()
        members = [_segment(sample.id, "10", "20", "embeddings")]
        snapshot = create_snapshot(
            self.dataset, {"members": members, "view": []}
        )
        provider = {"kind": "snapshot", "snapshotId": snapshot["snapshotId"]}
        request = {"boundary": {"provider": provider}}
        result = _resolve_all(self.dataset, request)
        self.assertEqual(result["counts"]["segments"], 1)
        self.assertEqual(result["groups"][0]["members"], members)
        fot.add_temporal_tags(
            self.dataset,
            fot.TemporalTag(
                sample.id, 5, 15, "review", index_type=1, anchor="filepath"
            ),
        )
        request["boundary"]["provider"] = {
            "kind": "intersection",
            "providers": [
                provider,
                {"kind": "temporal-tags", "values": ["review"]},
            ],
        }
        clipped = _resolve_all(self.dataset, request)["groups"][0]["members"][
            0
        ]
        self.assertEqual(
            (clipped["range"]["start"], clipped["range"]["end"]), ("10", "15")
        )
        self.assertEqual(
            {p["provider"] for p in clipped["range"]["provenance"]},
            {"embeddings", "temporal-tags"},
        )
        other = fo.Dataset()
        try:
            with self.assertRaises(ValueError):
                _resolve_all(other, request)
        finally:
            other.delete()
        full = create_snapshot(self.dataset, {})
        with self.assertRaises(ValueError):
            _resolve_all(
                self.dataset,
                {
                    "boundary": {
                        "provider": {
                            "kind": "snapshot",
                            "snapshotId": full["snapshotId"],
                        }
                    }
                },
            )


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
        result = _resolve_all(self.dataset, {})
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        self.assertEqual(result["counts"]["segments"], 0)
        self.assertEqual(
            sorted(group["filepath"] for group in result["groups"]),
            ["/tmp/image-%d.jpg" % i for i in range(3)],
        )
        self.assertEqual(result["unavailableGroups"], [])

    def test_details_carry_the_media_aspect_ratio_when_metadata_knows_it(self):
        first, second = self.dataset.values("id")[:2]
        sample = self.dataset[first]
        sample.metadata = fo.ImageMetadata(width=640, height=480)
        sample.save()
        result = selection_availability(self.dataset, [first, second])
        self.assertAlmostEqual(result[first]["aspectRatio"], 640 / 480)
        self.assertNotIn("aspectRatio", result[second])
        self.assertEqual(
            result[second]["filepath"], self.dataset[second].filepath
        )

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
        result = _resolve_all(self.dataset, {"view": self.stages})
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

    def test_patch_previews_keep_distinct_crops_in_details_and_availability(
        self,
    ):
        sample = self.dataset.last()
        boxes = [[0.1, 0.2, 0.2, 0.4], [0.5, 0.1, 0.4, 0.2]]
        for label, box in zip(sample.ground_truth.detections, boxes):
            label.bounding_box = box
        sample.metadata = fo.ImageMetadata(width=800, height=400)
        sample.save()
        view = self.dataset.to_patches("ground_truth")
        ids = view.match({"filepath": sample.filepath}).values("id")
        request = {"view": view._serialize(), "episodeIds": ids}
        for details_only in (False, True):
            groups = resolve_scope(
                self.dataset, {**request, "detailsOnly": details_only}
            )["groups"]
            self.assertEqual(len(groups), 2)
            for group, box in zip(groups, boxes):
                self.assertEqual(group["filepath"], sample.filepath)
                self.assertEqual(group["aspectRatio"], 2)
                for actual, expected in zip(group["crop"], box):
                    self.assertAlmostEqual(actual, expected)
        metadata = selection_availability(self.dataset, ids, view._serialize())
        for sample_id, box in zip(ids, boxes):
            for actual, expected in zip(metadata[sample_id]["crop"], box):
                self.assertAlmostEqual(actual, expected)

    def test_evaluation_patch_preview_contains_both_matched_labels(self):
        sample = self.dataset.first()
        sample.ground_truth.detections[0].bounding_box = [0.1, 0.2, 0.4, 0.4]
        sample["predictions"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="thing",
                    bounding_box=[0.2, 0.2, 0.4, 0.4],
                    confidence=0.9,
                )
            ]
        )
        sample.save()
        self.dataset.evaluate_detections("predictions", eval_key="eval")
        view = self.dataset.to_evaluation_patches("eval")
        patch_id = view.match({"type": "tp"}).first().id
        crop = selection_availability(
            self.dataset, [patch_id], view._serialize()
        )[patch_id]["crop"]
        for actual, expected in zip(crop, [0.1, 0.2, 0.5, 0.4]):
            self.assertAlmostEqual(actual, expected)

    def test_polyline_patches_use_point_bounds(self):
        sample = self.dataset.first()
        sample["polygons"] = fo.Polylines(
            polylines=[
                fo.Polyline(
                    label="thing",
                    points=[[(0.2, 0.3), (0.7, 0.3), (0.6, 0.8)]],
                    closed=True,
                )
            ]
        )
        sample.save()
        view = self.dataset.to_patches("polygons")
        patch_id = view.first().id
        crop = selection_availability(
            self.dataset, [patch_id], view._serialize()
        )[patch_id]["crop"]
        for actual, expected in zip(crop, [0.2, 0.3, 0.5, 0.5]):
            self.assertAlmostEqual(actual, expected)

    def test_converted_views_refuse_subsets_and_sources(self):
        with self.assertRaises(ValueError):
            _resolve_all(
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
        self.assertEqual(result["counts"]["episodes"], 5)
        self.assertEqual(result["counts"]["groups"], 2)
        self.assertEqual(result["counts"]["fullEpisodes"], 5)
        representative = self.dataset.group_by("scene").first().id
        details = resolve_scope(
            self.dataset,
            {**request, "episodeIds": [representative], "capture": True},
        )
        (group,) = details["groups"]
        self.assertEqual(group["episodeId"], representative)
        captured, _ = load_snapshot(self.dataset, group["group"]["snapshotId"])
        self.assertEqual(group["group"]["size"], len(captured))
        self.assertIn(group["group"]["size"], (2, 3))
        self.assertTrue(all(m["kind"] == "episode" for m in captured))
        snapshot = create_snapshot(self.dataset, request)
        members, _ = load_snapshot(self.dataset, snapshot["snapshotId"])
        self.assertEqual(len(members), 5)
        plain = resolve_scope(self.dataset, {"view": self.stages})
        self.assertEqual(plain["counts"]["fullEpisodes"], 2)


class SamplePositionTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/position-%d.jpg" % i, score=i % 3)
                for i in range(7)
            ]
        )
        self.ids = self.dataset.values("id")

    def tearDown(self):
        self.dataset.delete()

    def _position(self, sample_id, **request):
        return sample_position(
            self.dataset, {"sampleId": sample_id, **request}
        )["index"]

    def test_sorted_positions_include_values_of_other_bson_types(self):
        # Query comparisons bracket BSON types; aggregation comparisons must
        # count the same cross-type ordering as the grid's sort.
        self.dataset._sample_collection.update_one(
            {"_id": ObjectId(self.ids[2])}, {"$set": {"score": "high"}}
        )
        for reverse in (False, True):
            expected = self.dataset.sort_by("score", reverse=reverse).values(
                "id"
            )
            for index, sample_id in enumerate(expected):
                self.assertEqual(
                    self._position(sample_id, sortBy="score", desc=reverse),
                    index,
                )

    def test_unsorted_views_follow_insertion_order(self):
        self.assertEqual(self._position(self.ids[4]), 4)
        self.assertEqual(self._position(self.ids[0]), 0)

    def test_sorted_views_count_what_the_sort_places_first(self):
        by_score = self.dataset.sort_by("score", reverse=True)
        expected = by_score.values("id")
        for index, sample_id in enumerate(expected):
            self.assertEqual(
                self._position(sample_id, sortBy="score", desc=True), index
            )
        stages = self.dataset.sort_by(fo.ViewField("score") * -1)._serialize()
        ordered = self.dataset.sort_by(fo.ViewField("score") * -1).values("id")
        self.assertEqual(self._position(ordered[3], view=stages), 3)

    def test_filtered_views_walk_the_grid_order(self):
        stages = self.dataset.match(fo.ViewField("score") > 0)._serialize()
        shown = self.dataset.match(fo.ViewField("score") > 0).values("id")
        self.assertEqual(self._position(shown[2], view=stages), 2)
        self.assertIsNone(self._position(self.ids[0], view=stages))

    def test_converted_views_locate_their_own_elements(self):
        self.dataset.set_values(
            "ground_truth",
            [
                fo.Detections(
                    detections=[
                        fo.Detection(label="a", bounding_box=[0, 0, 0.5, 0.5])
                    ]
                )
                for _ in self.ids
            ],
        )
        stages = self.dataset.to_patches("ground_truth")._serialize()
        patches = self.dataset.to_patches("ground_truth").values("id")
        self.assertEqual(self._position(patches[5], view=stages), 5)

    def test_rejects_malformed_ids_and_misses_cleanly(self):
        with self.assertRaises(ValueError):
            self._position("nope")
        self.assertIsNone(self._position(str(ObjectId())))

    def test_patch_positions_follow_grid_order_across_pages(self):
        # Imported labels need not have ids ordered like their source samples.
        labels = [
            fo.Detection(label="a", bounding_box=[0, 0, 0.5, 0.5])
            for _ in range(70)
        ][::-1]
        self.dataset.set_values(
            "ground_truth",
            [
                fo.Detections(detections=labels[i * 10 : (i + 1) * 10])
                for i in range(len(self.ids))
            ],
        )
        patches = self.dataset.to_patches("ground_truth")
        ids = patches.values("id")
        self.assertNotEqual(ids, sorted(ids))
        for index in (0, 1, 19, 20, 35, 60, 69):
            with self.subTest(index=index):
                self.assertEqual(
                    self._position(ids[index], view=patches._serialize()),
                    index,
                )
