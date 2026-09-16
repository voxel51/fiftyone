"""
Episode selection identity and complete scope resolution tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.selection as fosel
import fiftyone.core.tags as fot
from fiftyone.server.selection import (
    resolve_candidates,
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

    def test_grouped_datasets_are_rejected(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="left")
        group = fo.Group()
        dataset.add_sample(
            fo.Sample(filepath="/tmp/left.jpg", group=group.element("left"))
        )
        try:
            with self.assertRaises(ValueError):
                resolve_candidates(dataset, {})
        finally:
            dataset.delete()


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
