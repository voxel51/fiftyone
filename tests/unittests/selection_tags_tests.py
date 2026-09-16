"""
Frozen selection tagging tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.tags as fot
from fiftyone.server.selection import resolve_scope, tag_selection


def _segment(
    sample_id, start="9007199254740993", end="9007199254741003", streams=None
):
    return {
        "episodeId": sample_id,
        "kind": "segment",
        "range": {
            "start": start,
            "end": end,
            "timebase": "timestamp-ns",
            "streams": streams or ["camera-a", "camera-b"],
        },
    }


class SelectionTagTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.ids = self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/tag-%d.mp4" % i) for i in range(45)]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_mixed_scope_is_exact_and_retryable(self):
        members = [
            {"episodeId": self.ids[0], "kind": "episode"},
            _segment(self.ids[1]),
        ]
        change = {"tag": "review", "add": True}
        tag_selection(self.dataset, members, change)
        tag_selection(self.dataset, members, change)
        self.assertEqual(self.dataset.count_sample_tags(), {"review": 1})
        tags = list(fot.list_temporal_tags(self.dataset))
        self.assertEqual(len(tags), 2)
        self.assertEqual(
            {tag.anchor for tag in tags}, {"camera-a", "camera-b"}
        )
        self.assertEqual({tag.start for tag in tags}, {9007199254740993})
        preview = tag_selection(self.dataset, members)
        self.assertEqual(preview["tags"], ["review"])
        self.assertEqual(preview["counts"]["segments"], 1)
        self.assertEqual(preview["counts"]["fullEpisodes"], 1)

    def test_remove_preserves_overlaps_and_other_streams(self):
        member = _segment(self.ids[0])
        overlapping = _segment(self.ids[0], end="9007199254741010")
        for scope in ([member], [overlapping]):
            tag_selection(self.dataset, scope, {"tag": "review", "add": True})
        one_stream = _segment(self.ids[0], streams=["camera-a"])
        for _ in range(2):
            tag_selection(
                self.dataset, [one_stream], {"tag": "review", "add": False}
            )
        tags = list(fot.list_temporal_tags(self.dataset))
        self.assertEqual(len(tags), 3)
        self.assertEqual(sum(tag.end == 9007199254741010 for tag in tags), 2)
        exact = [tag for tag in tags if tag.end == 9007199254741003]
        self.assertEqual(exact[0].anchor, "camera-b")

    def test_unanchored_tag_removed_only_for_its_complete_stream_scope(self):
        fot.add_temporal_tags(
            self.dataset,
            fot.TemporalTag(
                sample_id=self.ids[0],
                start=0,
                end=10,
                index_type=1,
                tag="review",
            ),
        )
        member = _segment(self.ids[0], "0", "10", ["other-camera"])
        member["range"]["timebase"] = "sequence"
        tag_selection(self.dataset, [member], {"tag": "review", "add": False})
        self.assertEqual(len(list(fot.list_temporal_tags(self.dataset))), 1)
        member["range"]["streams"] = ["filepath"]
        tag_selection(self.dataset, [member], {"tag": "review", "add": False})
        self.assertEqual(list(fot.list_temporal_tags(self.dataset)), [])

    def test_validation_happens_before_any_write(self):
        valid = {"episodeId": self.ids[0], "kind": "episode"}
        invalid_scopes = [
            [valid, {"episodeId": str(ObjectId()), "kind": "episode"}],
            [
                valid,
                {
                    **_segment(self.ids[1]),
                    "range": {
                        **_segment(self.ids[1])["range"],
                        "timebase": "unknown",
                    },
                },
            ],
            [valid, _segment(self.ids[1], end=str(2**63))],
            [],
        ]
        for members in invalid_scopes:
            with self.assertRaises(ValueError):
                tag_selection(
                    self.dataset, members, {"tag": "review", "add": True}
                )
        self.assertEqual(self.dataset.count_sample_tags(), {})
        self.assertEqual(list(fot.list_temporal_tags(self.dataset)), [])

    def test_label_scope_includes_sample_and_frame_labels_only(self):
        sample = self.dataset[self.ids[0]]
        sample["prediction"] = fo.Classification(label="cat")
        sample.frames[1]["detections"] = fo.Detections(
            detections=[fo.Detection(label="cat")]
        )
        sample.save()
        other = self.dataset[self.ids[1]]
        other["prediction"] = fo.Classification(label="dog")
        other.save()
        members = [{"episodeId": self.ids[0], "kind": "episode"}]
        preview = tag_selection(self.dataset, members, target="labels")
        self.assertEqual(preview["labels"], 2)
        for _ in range(2):
            tag_selection(
                self.dataset, members, {"tag": "review", "add": True}, "labels"
            )
        self.assertEqual(self.dataset.count_label_tags(), {"review": 2})
        self.assertEqual(self.dataset.count_sample_tags(), {})
        self.assertEqual(list(fot.list_temporal_tags(self.dataset)), [])
        with self.assertRaises(ValueError):
            tag_selection(
                self.dataset,
                [_segment(self.ids[0])],
                {"tag": "review", "add": True},
                "labels",
            )
        with self.assertRaises(ValueError):
            tag_selection(
                self.dataset,
                [{"episodeId": self.ids[2], "kind": "episode"}],
                {"tag": "review", "add": True},
                "labels",
            )
        tag_selection(
            self.dataset, members, {"tag": "review", "add": False}, "labels"
        )
        self.assertEqual(self.dataset.count_label_tags(), {})

    def test_all_results_includes_unloaded_episodes(self):
        members = [
            {"episodeId": sample_id, "kind": "episode"}
            for sample_id in self.ids
        ]
        tag_selection(self.dataset, members, {"tag": "review", "add": True})
        self.assertEqual(self.dataset.count_sample_tags(), {"review": 45})
        tag_selection(self.dataset, members, {"tag": "review", "add": False})
        self.assertEqual(self.dataset.count_sample_tags(), {})


if __name__ == "__main__":
    unittest.main()


class ImageTagTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.ids = self.dataset.add_samples(
            [fo.Sample(filepath="/tmp/image-%d.jpg" % i) for i in range(2)]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_image_samples_receive_sample_tags(self):
        members = [{"episodeId": self.ids[0], "kind": "episode"}]
        result = tag_selection(
            self.dataset, members, {"tag": "review", "add": True}
        )
        self.assertEqual(result["counts"]["fullEpisodes"], 1)
        self.assertIn("review", result["tags"])
        self.assertEqual(self.dataset[self.ids[0]].tags, ["review"])
        self.assertEqual(self.dataset[self.ids[1]].tags, [])
        tag_selection(self.dataset, members, {"tag": "review", "add": False})
        self.assertEqual(self.dataset[self.ids[0]].tags, [])


class ConvertedViewTagTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_sample(
            fo.Sample(
                filepath="/tmp/patches.jpg",
                ground_truth=fo.Detections(
                    detections=[
                        fo.Detection(label="a", bounding_box=[0, 0, 0.5, 0.5]),
                        fo.Detection(
                            label="b", bounding_box=[0.5, 0.5, 0.5, 0.5]
                        ),
                    ]
                ),
            )
        )
        self.stages = [fo.ToPatches("ground_truth")._serialize()]

    def tearDown(self):
        self.dataset.delete()

    def test_patch_label_tags_reach_the_source_labels(self):
        patch_ids = self.dataset.to_patches("ground_truth").values("id")
        members = [{"episodeId": patch_ids[0], "kind": "episode"}]
        result = tag_selection(
            self.dataset,
            members,
            {"tag": "review", "add": True},
            "labels",
            stages=self.stages,
        )
        self.assertEqual(result["labels"], 1)
        self.assertIn("review", result["tags"])
        tags = [d.tags for d in self.dataset.first().ground_truth.detections]
        self.assertEqual(sorted(len(t) for t in tags), [0, 1])
        with self.assertRaises(ValueError):
            tag_selection(
                self.dataset,
                [
                    {
                        "episodeId": patch_ids[0],
                        "kind": "segment",
                        "range": {
                            "start": "0",
                            "end": "1",
                            "timebase": "sequence",
                            "streams": ["filepath"],
                        },
                    }
                ],
                None,
                "members",
                stages=self.stages,
            )


class GroupedDatasetTagTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_group_field("group", default="left")
        for i in range(2):
            group = fo.Group()
            self.dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/tmp/left-%d.jpg" % i,
                        group=group.element("left"),
                    ),
                    fo.Sample(
                        filepath="/tmp/right-%d.jpg" % i,
                        group=group.element("right"),
                    ),
                ]
            )

    def tearDown(self):
        self.dataset.delete()

    def test_active_slice_is_the_unit_and_tags_can_reach_every_slice(self):
        scope = resolve_scope(self.dataset, {"slice": "right"})
        self.assertEqual(scope["counts"]["fullEpisodes"], 2)
        right_ids = self.dataset.select_group_slices("right").values("id")
        described = resolve_scope(
            self.dataset, {"slice": "right", "episodeIds": right_ids[:1]}
        )
        self.assertEqual(
            [g["filepath"] for g in described["groups"]], ["/tmp/right-0.jpg"]
        )
        members = [{"episodeId": right_ids[0], "kind": "episode"}]
        tag_selection(self.dataset, members, {"tag": "slice", "add": True})
        flat = self.dataset.select_group_slices(_allow_mixed=True)
        self.assertEqual(flat.count_sample_tags(), {"slice": 1})
        tag_selection(
            self.dataset,
            members,
            {"tag": "whole", "add": True},
            group_scope="all",
        )
        self.assertEqual(flat.count_sample_tags()["whole"], 2)
        self.assertEqual(flat.match_tags("whole").count(), 2)


class AppliedTagTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/applied-%d.jpg" % i,
                    tags=["reviewed"] if i < 2 else [],
                )
                for i in range(3)
            ]
        )

    def tearDown(self):
        self.dataset.delete()

    def test_reports_how_many_targets_carry_each_tag(self):
        members = [
            {"episodeId": sid, "kind": "episode"}
            for sid in self.dataset.values("id")
        ]
        result = tag_selection(self.dataset, members)
        self.assertEqual(result["targets"], 3)
        self.assertEqual(result["applied"], {"reviewed": 2})
        result = tag_selection(
            self.dataset, members, {"tag": "reviewed", "add": True}
        )
        self.assertEqual(result["applied"], {"reviewed": 3})
        result = tag_selection(
            self.dataset, members, {"tag": "reviewed", "add": False}
        )
        self.assertEqual(result["applied"], {})
        self.assertEqual(result["tags"], [])
