"""
Frame-first pipeline tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import fiftyone as fo
from fiftyone import ViewField as F, VALUE
import fiftyone.core.frame_pipelines as fofp
import fiftyone.core.stages as fos

from decorators import drop_datasets

_LABEL = "frames.detections.detections.label"
_CONFIDENCE = "frames.detections.detections.confidence"


def _make_videos(dataset):
    video1 = fo.Sample(filepath="video1.mp4", weather="sunny", tags=["a"])
    for frame_number in range(1, 41):
        if frame_number in (5, 6):
            continue

        detections = [
            fo.Detection(
                label="person" if frame_number > 30 else "car",
                confidence=frame_number / 40,
                tags=["keep"] if frame_number % 3 == 0 else [],
            )
        ]
        if frame_number % 4 == 0:
            detections.append(fo.Detection(label="sign", confidence=0.1))

        video1[frame_number]["detections"] = fo.Detections(
            detections=detections
        )
        video1[frame_number]["flag"] = frame_number % 2 == 0

    video2 = fo.Sample(filepath="video2.mp4", weather="rainy")
    for frame_number in range(1, 11):
        video2[frame_number]["detections"] = fo.Detections(
            detections=[fo.Detection(label="car", confidence=0.9)]
        )
        video2[frame_number]["other"] = fo.Classification(label="x")

    # No frame documents
    video3 = fo.Sample(filepath="video3.mp4", weather="sunny")

    dataset.add_samples([video1, video2, video3])

    return video1, video2, video3


def _results(view):
    return {
        "samples": list(view._aggregate(attach_frames=True)),
        "frames": list(view._aggregate(frames_only=True)),
        "count": view.count(),
        "ids": view.values("id"),
    }


class FramePipelinesTests(unittest.TestCase):
    def _assert_matches_old_path(self, view):
        self.assertIsNotNone(fofp.make_pipeline(view), view)

        actual = _results(view)
        with fofp._disabled():
            self.assertIsNone(fofp.make_pipeline(view))
            expected = _results(view)

        self.assertEqual(actual, expected, view)

        return actual

    @drop_datasets
    def test_reduce_counts_need_nonnegative_terms(self):
        dataset = fo.Dataset()
        video = fo.Sample(filepath="video.mp4")
        video[1]["score"] = 1
        video[2]["score"] = -1
        dataset.add_sample(video)

        # booleans cast to 0 or 1 are planned and agree with the old path
        exists = dataset.match(
            F("frames").reduce(
                VALUE + F("score").exists().to_int(), init_val=0
            )
            > 0
        )
        self.assertEqual(self._assert_matches_old_path(exists)["count"], 1)

        # signed terms cancel out, so the rewrite does not apply
        signed = dataset.match(
            F("frames").reduce(VALUE + F("score").to_int(), init_val=0) > 0
        )
        self.assertIsNone(fofp.make_pipeline(signed))
        self.assertEqual(signed.count(), 0)

    @drop_datasets
    def test_frame_matches(self):
        dataset = fo.Dataset()
        _make_videos(dataset)

        views = [
            dataset.match({"$and": [{_LABEL: {"$in": ["person"]}}]}),
            dataset.match({_LABEL: {"$nin": ["person"]}}),
            dataset.match({_LABEL: "sign"}),
            dataset.match({_LABEL: {"$ne": "car"}}),
            dataset.match({_CONFIDENCE: {"$gte": 0.2, "$lte": 0.3}}),
            dataset.match(
                {
                    "$or": [
                        {_CONFIDENCE: {"$lt": 0.05}},
                        {_CONFIDENCE: {"$gt": 1}},
                    ]
                }
            ),
            dataset.match({"frames.flag": {"$exists": False}}),
            dataset.match({"frames.flag": {"$eq": True}, "weather": "sunny"}),
            dataset.match(
                {"$or": [{"weather": "rainy"}, {_LABEL: {"$in": ["sign"]}}]}
            ),
            dataset.match(
                F("frames")
                .filter(F("detections.detections").length() > 1)
                .length()
                > 0
            ),
            dataset.match(F("frames").length() == 0),
            dataset.exists("frames.other"),
            dataset.exists("frames.other", False),
            dataset.match_tags("a").match({_LABEL: "car"}),
        ]

        for view in views:
            self._assert_matches_old_path(view)

    @drop_datasets
    def test_frame_stages(self):
        dataset = fo.Dataset()
        video1, _, _ = _make_videos(dataset)
        frame_ids = [video1.frames[fn].id for fn in (1, 2, 33)]

        views = [
            dataset.filter_labels("frames.detections", F("label") == "person"),
            dataset.filter_labels(
                "frames.detections",
                F("confidence") > 0.5,
                only_matches=False,
            ),
            dataset.filter_labels("frames.other", F("label") == "x"),
            dataset.filter_field("frames.flag", F() == True),
            dataset.match_frames(F("frame_number") > 10).filter_labels(
                "frames.detections", F("label") == "car"
            ),
            dataset.filter_labels(
                "frames.detections", F("label") == "sign", only_matches=False
            ).match({_LABEL: "sign"}),
            dataset.select_frames(frame_ids),
            dataset.exclude_frames(frame_ids, omit_empty=False),
            dataset.select_labels(tags="keep", fields="frames.detections"),
            dataset.exclude_labels(tags="keep"),
            dataset.filter_labels(
                "frames.detections", F("label") == "car"
            ).select_fields(["frames.detections", "weather"]),
            dataset.filter_labels(
                "frames.detections", F("label") == "car"
            ).select_fields("weather"),
            dataset.exclude_fields("frames.other").match({_LABEL: "car"}),
            dataset.set_field(
                "frames.detections.detections.label", F("label").upper()
            ).match({_LABEL: "PERSON"}),
            dataset.sort_by("filepath", reverse=True)
            .limit(2)
            .filter_labels("frames.detections", F("label") == "car"),
            dataset.map_labels("frames.detections", {"car": "vehicle"}).match(
                {_LABEL: "vehicle"}
            ),
            dataset.map_values(_LABEL, {"sign": "car"}).filter_labels(
                "frames.detections", F("label") == "car"
            ),
            dataset.limit_labels("frames.detections", 1).match(
                {_LABEL: "sign"}
            ),
        ]

        for view in views:
            self._assert_matches_old_path(view)

    @drop_datasets
    def test_clips(self):
        dataset = fo.Dataset()
        _make_videos(dataset)

        clips = dataset.to_clips(F("detections.detections").length() > 1)
        views = [
            clips.filter_labels("frames.detections", F("label") == "person"),
            clips.match({_LABEL: "car"}),
            clips.match_frames(F("frame_number") > 20),
        ]

        for view in views:
            actual = self._assert_matches_old_path(view)
            self.assertTrue(actual["count"])

    @drop_datasets
    def test_group_video_slice(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="video")

        group = fo.Group()
        video = fo.Sample(filepath="video.mp4", group=group.element("video"))
        for frame_number in range(1, 11):
            video[frame_number]["detections"] = fo.Detections(
                detections=[
                    fo.Detection(label="car" if frame_number > 5 else "sign")
                ]
            )

        image = fo.Sample(filepath="image.png", group=group.element("image"))
        dataset.add_samples([video, image])

        view = dataset.filter_labels(
            "frames.detections", F("label") == "car"
        ).match({_LABEL: "car"})
        actual = self._assert_matches_old_path(view)
        self.assertEqual(actual["count"], 1)

        flattened = dataset.select_group_slices(_allow_mixed=True)
        self.assertIsNone(
            fofp.make_pipeline(
                flattened.filter_labels(
                    "frames.detections", F("label") == "car"
                )
            )
        )

    @drop_datasets
    def test_falls_back(self):
        dataset = fo.Dataset()
        _make_videos(dataset)

        views = [
            dataset.match(F("frames").length() > 5),
            dataset.match({"frames.0.flag": True}),
            dataset.match({_LABEL: None}),
            dataset.match({_CONFIDENCE: {"$not": {"$gt": 0.5}}}),
            dataset.sort_by(F("frames").length()),
            dataset.filter_labels(
                "frames.detections",
                F("label") == F("$weather"),
            ),
            dataset.filter_labels(
                "frames.detections",
                F("label") == "car",
                trajectories=True,
            ),
            dataset.set_field("frames", F("frames")[:2]),
            dataset.mongo([{"$match": {_LABEL: "car"}}]),
            dataset.group_by("weather").match({_LABEL: "car"}),
            dataset.match({"weather": "sunny"}),
        ]

        for view in views:
            self.assertIsNone(fofp.make_pipeline(view), view)

    @drop_datasets
    def test_existence_is_bounded(self):
        dataset = fo.Dataset()
        _make_videos(dataset)

        view = dataset.match({_LABEL: {"$in": ["person"]}}).filter_labels(
            "frames.detections", F("label") == "person"
        )
        pipeline = view._pipeline()

        frame_lookups = [
            stage["$lookup"]
            for stage in pipeline
            if "$lookup" in stage
            and stage["$lookup"]["from"] == dataset._frame_collection_name
        ]
        self.assertEqual(len(frame_lookups), 2)
        for lookup in frame_lookups:
            self.assertEqual(lookup["localField"], "_id")
            self.assertEqual(lookup["foreignField"], "_sample_id")
            self.assertIn({"$limit": 1}, lookup["pipeline"])

        self.assertFalse(fofp._contains(pipeline, "$frames"))

    @drop_datasets
    def test_sample_stages_compile_once(self):
        dataset = fo.Dataset()
        video1, _, _ = _make_videos(dataset)
        view = dataset.select([video1.id, dataset.last().id])
        aggregations = [fo.CountValues(_LABEL), fo.CountValues("frames.flag")]

        with mock.patch.object(
            fos.Select, "to_mongo", autospec=True, wraps=fos.Select.to_mongo
        ) as to_mongo:
            view._pipeline()
            self.assertEqual(to_mongo.call_count, 1)

            # both aggregations run frame-first on one shared plan
            to_mongo.reset_mock()
            actual = view.aggregate(aggregations)
            self.assertEqual(to_mongo.call_count, 1)

        with fofp._disabled():
            expected = view.aggregate(aggregations)

        self.assertEqual(actual, expected)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
