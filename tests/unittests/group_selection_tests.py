"""Frozen selection semantics for static and dynamic groups.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import patch

from bson import BSON

import fiftyone as fo
import fiftyone.core.subsets as fosub
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.selection as foss
import fiftyone.server.view as fosv


class DynamicGroupScopeTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/group-%d.jpg" % i, scene=i // 3, score=i % 3
                )
                for i in range(9)
            ]
        )

    def tearDown(self):
        self.dataset.delete()

    def request(self, view, **kwargs):
        return {
            "view": view._serialize(),
            "expand": "dynamic-groups",
            **kwargs,
        }

    def members(self, snapshot):
        return foss.load_snapshot(self.dataset, snapshot["snapshotId"])[0]

    def capture(self, view):
        return foss.resolve_scope(
            self.dataset,
            self.request(
                view,
                episodeIds=view.values("id"),
                detailsOnly=True,
                capture=True,
            ),
        )["groups"]

    def test_group_windows_and_filters_agree_with_clicks(self):
        for view in (
            self.dataset.group_by("scene").skip(1).limit(1),
            self.dataset.match(fo.ViewField("score") > 0)
            .group_by("scene")
            .limit(2),
            self.dataset.group_by("scene").match(fo.ViewField("scene") == 2),
        ):
            expected = set(view.flatten().values("id"))
            scope = foss.resolve_scope(self.dataset, self.request(view))
            self.assertEqual(scope["counts"]["groups"], view.count())
            self.assertEqual(scope["counts"]["fullEpisodes"], len(expected))
            snapshot = foss.create_snapshot(self.dataset, self.request(view))
            self.assertEqual(
                {m["episodeId"] for m in self.members(snapshot)}, expected
            )
            clicked = set()
            for card in self.capture(view):
                self.assertEqual(card["members"], [])
                clicked.update(
                    m["episodeId"] for m in self.members(card["group"])
                )
            self.assertEqual(clicked, expected)

    def test_flattened_groups_select_individual_samples(self):
        for view in (
            self.dataset.group_by("scene", flat=True),
            self.dataset.group_by("scene").flatten(),
        ):
            request = self.request(view.limit(2))
            result = foss.resolve_scope(self.dataset, request)
            self.assertNotIn("groups", result["counts"])
            self.assertEqual(result["counts"]["fullEpisodes"], 2)
            self.assertEqual(
                len(self.members(foss.create_snapshot(self.dataset, request))),
                2,
            )

    def test_grouping_stays_inside_subset_membership(self):
        ids = self.dataset.values("id")
        subset = fosub.create_subset(self.dataset, "partial groups")
        fosub.prepare_add(
            self.dataset,
            subset["id"],
            "group-scope",
            [
                {"episodeId": sid, "kind": "episode"}
                for sid in (ids[0], ids[1], ids[4])
            ],
        )
        fosub.apply_add(self.dataset, "group-scope")
        request = self.request(
            self.dataset.group_by("scene"), boundary={"subsetId": subset["id"]}
        )
        scoped, _, _ = foss._scoped_view(self.dataset, request)
        request.update(episodeIds=scoped.values("id"), capture=True)
        result = foss.resolve_scope(self.dataset, request)
        self.assertEqual(result["counts"]["groups"], 2)
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        captured = set()
        for card in result["groups"]:
            captured.update(
                m["episodeId"] for m in self.members(card["group"])
            )
        self.assertEqual(captured, {ids[0], ids[1], ids[4]})

    def test_subset_modal_and_flatten_keep_the_boundary(self):
        ids = self.dataset.values("id")[:2]
        subset = fosub.create_subset(self.dataset, "modal")
        fosub.prepare_add(
            self.dataset,
            subset["id"],
            "modal",
            [{"episodeId": sid, "kind": "episode"} for sid in ids],
        )
        fosub.apply_add(self.dataset, "modal")
        stages = self.dataset.group_by("scene")._serialize()
        modal = fosv.get_view(
            self.dataset,
            stages=stages,
            dynamic_group=0,
            selection_scope={"subsetId": subset["id"]},
        )
        self.assertEqual(set(modal.values("id")), set(ids))
        flat = fosv.get_view(
            self.dataset,
            stages=self.dataset.group_by("scene").flatten()._serialize(),
            selection_scope={"subsetId": subset["id"]},
        )
        self.assertEqual(set(flat.values("id")), set(ids))

    def test_union_deduplicates_and_keeps_original_members(self):
        view = self.dataset.group_by("scene").limit(1)
        card = self.capture(view)[0]
        original = self.members(card["group"])
        self.dataset.add_sample(
            fo.Sample(filepath="/tmp/new.jpg", scene=0, score=0)
        )
        combined = foss.create_snapshot(
            self.dataset,
            {
                "view": [],
                "snapshotIds": [card["group"]["snapshotId"]] * 2,
                "members": original[:1],
                "groupCount": 1,
            },
        )
        self.assertEqual(combined["counts"]["fullEpisodes"], 3)
        self.assertEqual(combined["counts"]["groups"], 1)
        self.assertEqual(
            self.members(combined),
            sorted(original, key=lambda m: m["episodeId"]),
        )

    def test_modal_member_capture_and_live_checksum_agree(self):
        ids = self.dataset.values("id")
        request = self.request(
            self.dataset.group_by("scene").limit(1),
            episodeIds=[ids[1], ids[2], ids[4]],
            detailsOnly=True,
        )
        captured = foss.resolve_scope(
            self.dataset, {**request, "capture": True}
        )["groups"]
        live = foss.resolve_scope(self.dataset, request)["groups"]
        self.assertEqual(
            {card["episodeId"] for card in captured}, {ids[1], ids[2]}
        )
        self.assertEqual(
            captured[0]["group"]["snapshotId"],
            captured[1]["group"]["snapshotId"],
        )
        self.assertEqual(
            captured[0]["group"]["key"], captured[1]["group"]["key"]
        )
        self.assertEqual(
            captured[0]["group"]["fingerprint"],
            live[0]["group"]["fingerprint"],
        )
        self.assertEqual(len(self.members(captured[0]["group"])), 3)
        sample = self.dataset[ids[0]]
        sample.scene = 5
        sample.save()
        changed = foss.resolve_scope(
            self.dataset,
            {**request, "view": self.dataset.group_by("scene")._serialize()},
        )["groups"]
        self.assertNotEqual(
            captured[0]["group"]["fingerprint"],
            changed[0]["group"]["fingerprint"],
        )

    def test_union_display_counts_do_not_persist_large_unions(self):
        cards = self.capture(self.dataset.group_by("scene"))
        snapshots = foss._collection("selection_snapshots")
        chunks = foss._collection("selection_snapshot_members")
        query = {"_dataset_id": self.dataset._doc.id}
        before = snapshots.count_documents(query), chunks.count_documents(
            query
        )
        request = {
            "snapshotIds": [card["group"]["snapshotId"] for card in cards],
            "members": self.members(cards[0]["group"])[:1],
            "groupCount": 3,
            "view": [],
        }
        counts = foss.resolve_scope(self.dataset, request)["counts"]
        self.assertEqual(counts["fullEpisodes"], 9)
        self.assertEqual(counts["groups"], 3)
        self.assertEqual(
            (snapshots.count_documents(query), chunks.count_documents(query)),
            before,
        )
        self.assertEqual(
            foss.create_snapshot(self.dataset, request)["counts"], counts
        )

    def test_reordering_a_group_preserves_its_membership_fingerprint(self):
        forward = self.capture(
            self.dataset.group_by("scene", order_by="score")
        )
        backward = self.capture(
            self.dataset.group_by("scene", order_by="score", reverse=True)
        )
        self.assertEqual(
            {c["group"]["label"]: c["group"]["fingerprint"] for c in forward},
            {c["group"]["label"]: c["group"]["fingerprint"] for c in backward},
        )

    def test_snapshot_tags_and_removal_stream_and_retry(self):
        snapshot = foss.create_snapshot(
            self.dataset, self.request(self.dataset.group_by("scene"))
        )
        subset = fosub.create_subset(self.dataset, "remove captured groups")
        foss.prepare_subset_add(
            self.dataset,
            {
                "subsetId": subset["id"],
                "operationId": "captured-remove",
                "snapshotId": snapshot["snapshotId"],
            },
        )
        fosub.apply_add(self.dataset, "captured-remove")
        data = {"snapshotId": snapshot["snapshotId"]}
        with patch.object(foss, "SNAPSHOT_CHUNK", 2), patch.object(
            foss, "load_snapshot", side_effect=AssertionError("unbounded read")
        ):
            tagged = foss.tag_captured_members(
                self.dataset,
                {**data, "change": {"tag": "frozen", "add": True}},
            )
            self.assertEqual(tagged["targets"], 9)
            self.assertEqual(tagged["applied"], {"frozen": 9})
            preview = foss.tag_captured_members(self.dataset, data)
            self.assertEqual(preview, tagged)
            removed = foss.remove_captured_members(
                self.dataset, subset["id"], data
            )
            self.assertEqual(removed["removed"], 9)
            retried = foss.remove_captured_members(
                self.dataset, subset["id"], data
            )
            self.assertEqual(retried["removed"], 0)
        self.assertEqual(fosub.member_count(self.dataset, subset["id"]), 0)

    def test_tagging_validates_later_batches_before_any_write(self):
        snapshot = foss.create_snapshot(self.dataset, {"view": []})
        self.dataset.delete_samples(self.dataset.last().id)
        with patch.object(foss, "SNAPSHOT_CHUNK", 2):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                foss.tag_captured_members(
                    self.dataset,
                    {
                        "snapshotId": snapshot["snapshotId"],
                        "change": {"tag": "must-not-write", "add": True},
                    },
                )
        self.assertEqual(self.dataset.count_sample_tags(), {})

    def test_large_group_response_is_bounded(self):
        self.dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/large-%d.jpg" % i, scene=5, score=0)
                for i in range(1200)
            ]
        )
        view = self.dataset.group_by("scene").match(fo.ViewField("scene") == 5)
        (card,) = self.capture(view)
        self.assertEqual(card["group"]["size"], 1200)
        self.assertLess(len(BSON.encode(card)), 1500)
        self.assertEqual(len(self.members(card["group"])), 1200)


class StaticGroupScopeTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_group_field("group", default="left")
        self.group = fo.Group()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/%s.jpg" % name,
                    group=self.group.element(name),
                )
                for name in ("left", "right")
            ]
        )
        self.left = self.dataset.first().id

    def tearDown(self):
        self.dataset.delete()

    def test_all_slices_freeze_before_tagging_and_saving(self):
        snapshot = foss.create_snapshot(
            self.dataset,
            {
                "members": [{"episodeId": self.left, "kind": "episode"}],
                "view": [],
                "groups": "all",
            },
        )
        self.assertEqual(snapshot["counts"]["fullEpisodes"], 2)
        self.dataset.add_sample(
            fo.Sample(
                filepath="/tmp/later.jpg", group=self.group.element("later")
            )
        )
        members, _ = foss.load_snapshot(self.dataset, snapshot["snapshotId"])
        foss.tag_selection(
            self.dataset, members, {"tag": "captured", "add": True}
        )
        self.assertEqual(
            self.dataset.select_group_slices(
                _allow_mixed=True
            ).count_sample_tags(),
            {"captured": 2},
        )
        subset = fosub.create_subset(self.dataset, "both slices")
        foss.prepare_subset_add(
            self.dataset,
            {
                "subsetId": subset["id"],
                "operationId": "all-slices",
                "snapshotId": snapshot["snapshotId"],
            },
        )
        fosub.apply_add(self.dataset, "all-slices")
        self.assertEqual(fosub.member_count(self.dataset, subset["id"]), 2)
        for name in ("left", "right", "later"):
            view, _, _ = foss._scoped_view(
                self.dataset,
                {"slice": name, "boundary": {"subsetId": subset["id"]}},
            )
            self.assertEqual(view.count(), int(name != "later"))

    def test_slice_stages_cannot_expand_subset_membership(self):
        subset = fosub.create_subset(self.dataset, "left only")
        fosub.prepare_add(
            self.dataset,
            subset["id"],
            "left-only",
            [{"episodeId": self.left, "kind": "episode"}],
        )
        fosub.apply_add(self.dataset, "left-only")
        for stages in (
            self.dataset.select_group_slices()._serialize(),
            self.dataset.select_group_slices("right")._serialize(),
        ):
            view = fosv.get_view(
                self.dataset,
                stages=stages,
                selection_scope={"subsetId": subset["id"]},
            )
            self.assertLessEqual(set(view.values("id")), {self.left})
        view = fosv.get_view(
            self.dataset,
            extended_stages={
                "fiftyone.core.stages.SelectGroupSlices": {"slices": "right"}
            },
            selection_scope={"subsetId": subset["id"]},
        )
        self.assertEqual(view.count(), 0)
        modal = fosv.get_view(
            self.dataset,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=self.group.id)
            ),
            selection_scope={"subsetId": subset["id"]},
        )
        self.assertEqual(set(modal.values("id")), {self.left})

    def test_preferred_slice_is_metadata_not_membership(self):
        subset = fosub.create_subset(
            self.dataset, "view preference", preferred_group_slice="right"
        )
        self.assertEqual(subset["preferredGroupSlice"], "right")
        self.assertEqual(fosub.member_count(self.dataset, subset["id"]), 0)
        for invalid in ("absent", [], {}, 42):
            with self.subTest(preferred_slice=invalid):
                with self.assertRaisesRegex(ValueError, "preferred slice"):
                    fosub.create_subset(
                        self.dataset, "missing", preferred_group_slice=invalid
                    )

    def test_all_slices_rejects_segments(self):
        with self.assertRaisesRegex(ValueError, "whole samples"):
            foss.create_snapshot(
                self.dataset,
                {
                    "members": [
                        {
                            "episodeId": self.left,
                            "kind": "segment",
                            "range": {
                                "start": "0",
                                "end": "10",
                                "timebase": "sequence",
                                "streams": ["filepath"],
                                "provenance": [],
                            },
                        }
                    ],
                    "groups": "all",
                },
            )


class GroupedPatchTagsTests(unittest.TestCase):
    def test_capture_tags_every_patch_across_batches(self):
        dataset = fo.Dataset()
        try:
            dataset.add_sample(
                fo.Sample(
                    filepath="/tmp/group-patches.jpg",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(
                                label="bird", bounding_box=[0, 0, 0.5, 0.5]
                            )
                            for _ in range(5)
                        ]
                    ),
                )
            )
            patches = dataset.to_patches("predictions")
            view = patches.group_by("predictions.label").limit(1)
            snapshot = foss.create_snapshot(
                dataset,
                {
                    "view": view._serialize(),
                    "expand": "dynamic-groups",
                },
            )
            patches.set_values("predictions.label", ["changed"] + ["bird"] * 4)
            with patch.object(foss, "SNAPSHOT_CHUNK", 2):
                result = foss.tag_captured_members(
                    dataset,
                    {
                        "snapshotId": snapshot["snapshotId"],
                        "target": "labels",
                        "change": {"tag": "grouped", "add": True},
                    },
                )
            self.assertEqual(result["targets"], 5)
            self.assertEqual(result["applied"], {"grouped": 5})
            self.assertEqual(dataset.count_label_tags(), {"grouped": 5})
        finally:
            dataset.delete()


class ConvertedGroupScopeTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="/tmp/group-video.mp4",
            metadata=fo.VideoMetadata(
                frame_width=32,
                frame_height=24,
                frame_rate=10,
                total_frame_count=4,
            ),
            ranges=[[1, 2], [1, 2], [3, 4]],
        )
        for number in range(1, 5):
            sample.frames[number] = fo.Frame()
        self.dataset.add_sample(sample)

    def tearDown(self):
        self.dataset.delete()

    def test_grouped_provider_captures_exact_segments(self):
        sample = self.dataset.first()
        sample["events"] = fo.TemporalDetections(
            detections=[
                fo.TemporalDetection(label="a", support=[1, 2]),
                fo.TemporalDetection(label="b", support=[3, 4]),
            ]
        )
        sample.save()
        view = self.dataset.group_by("filepath")
        request = {
            "view": view._serialize(),
            "expand": "dynamic-groups",
            "episodeIds": [sample.id],
            "detailsOnly": True,
            "boundary": {"provider": {"kind": "events", "field": "events"}},
        }
        captured = foss.resolve_scope(
            self.dataset, {**request, "capture": True}
        )["groups"][0]
        live = foss.resolve_scope(self.dataset, request)["groups"][0]
        self.assertEqual(captured["group"]["counts"]["segments"], 2)
        self.assertEqual(
            captured["group"]["fingerprint"], live["group"]["fingerprint"]
        )
        members, _ = foss.load_snapshot(
            self.dataset, captured["group"]["snapshotId"]
        )
        self.assertEqual({m["range"]["start"] for m in members}, {"0", "2"})

    def test_grouped_frames_and_clips_keep_source_identity(self):
        for base, expected, reference_type in (
            (self.dataset.to_frames(sample_frames="dynamic"), 4, "frame"),
            (
                self.dataset.to_clips([[[1, 2], [1, 2], [3, 4]]]),
                2,
                "clip-range",
            ),
        ):
            view = base.group_by("sample_id")
            request = {
                "view": view._serialize(),
                "expand": "dynamic-groups",
                "episodeIds": view.values("id"),
                "detailsOnly": True,
                "capture": True,
            }
            (card,) = foss.resolve_scope(self.dataset, request)["groups"]
            captured, _ = foss.load_snapshot(
                self.dataset, card["group"]["snapshotId"]
            )
            self.assertEqual(len(captured), expected)
            self.assertTrue(
                all(
                    member["reference"]["type"] == reference_type
                    for member in captured
                )
            )
            counted = foss.resolve_scope(
                self.dataset,
                {**request, "detailsOnly": False, "capture": False},
            )
            self.assertEqual(counted["counts"]["fullEpisodes"], expected)
            self.assertEqual(
                counted["groups"][0]["group"]["fingerprint"],
                card["group"]["fingerprint"],
            )
            snapshot = foss.create_snapshot(self.dataset, request)
            self.assertEqual(snapshot["counts"]["fullEpisodes"], expected)
