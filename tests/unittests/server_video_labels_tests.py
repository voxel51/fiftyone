"""
FiftyOne Server /video-labels route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId
import numpy as np

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.frame_pipelines as fofp
import fiftyone.core.odm as foo
import fiftyone.core.view as fov
from fiftyone.server.routes.video_labels import (
    aggregate_index,
    aggregate_window,
    build_instance_index,
    index_post_pipeline,
    resolve_label_list_field,
    resolve_singleton_address_id,
    run_length_encode,
    run_length_encode_values,
    window_view,
)

from decorators import drop_async_dataset


class RunLengthEncodeTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(run_length_encode([]), [])

    def test_single(self):
        self.assertEqual(run_length_encode([7]), [[7, 7]])

    def test_contiguous(self):
        self.assertEqual(run_length_encode([1, 2, 3, 4]), [[1, 4]])

    def test_gaps(self):
        self.assertEqual(
            run_length_encode([1, 2, 3, 5, 6, 9]), [[1, 3], [5, 6], [9, 9]]
        )

    def test_unsorted_and_duplicated(self):
        self.assertEqual(
            run_length_encode([6, 1, 2, 5, 2, 3]), [[1, 3], [5, 6]]
        )


class RunLengthEncodeValuesTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(run_length_encode_values([]), [])

    def test_uniform_is_single_run(self):
        self.assertEqual(
            run_length_encode_values([(1, "off"), (2, "off"), (3, "off")]),
            [[1, 3, "off"]],
        )

    def test_value_change_splits(self):
        self.assertEqual(
            run_length_encode_values(
                [(1, "off"), (2, "off"), (3, "left"), (4, "left")]
            ),
            [[1, 2, "off"], [3, 4, "left"]],
        )

    def test_presence_gap_splits_equal_values(self):
        self.assertEqual(
            run_length_encode_values([(1, "off"), (2, "off"), (4, "off")]),
            [[1, 2, "off"], [4, 4, "off"]],
        )

    def test_none_is_its_own_run(self):
        self.assertEqual(
            run_length_encode_values([(1, None), (2, "left"), (3, None)]),
            [[1, 1, None], [2, 2, "left"], [3, 3, None]],
        )

    def test_unsorted_and_duplicate_frame_last_wins(self):
        self.assertEqual(
            run_length_encode_values([(2, "left"), (1, "off"), (2, "right")]),
            [[1, 1, "off"], [2, 2, "right"]],
        )


class BuildInstanceIndexTests(unittest.TestCase):
    def test_dynamic_attribute_segments(self):
        groups = [
            {
                "_id": "abc",
                "frames": [1, 2, 3, 4],
                "keyframes": [],
                "classLabel": "car",
                "persistedIndex": 1,
                "instance": {"_cls": "Instance", "_id": "abc"},
                "attributeSamples": [
                    {"fn": 1, "turn_signal": "off"},
                    {"fn": 2, "turn_signal": "off"},
                    {"fn": 3, "turn_signal": "left"},
                    # frame 4 carries no turn_signal -> a null-valued run.
                    {"fn": 4},
                ],
            }
        ]

        [entry] = build_instance_index(groups, ["turn_signal"])

        self.assertEqual(
            entry["attributeSegments"]["turn_signal"],
            [[1, 2, "off"], [3, 3, "left"], [4, 4, None]],
        )

    def test_attribute_segments_omitted_without_dynamic_attributes(self):
        groups = [
            {
                "_id": "abc",
                "frames": [1, 2],
                "keyframes": [],
                "attributeSamples": [{"fn": 1, "turn_signal": "off"}],
            }
        ]

        [entry] = build_instance_index(groups)

        self.assertNotIn("attributeSegments", entry)

    def test_skips_empty_and_filters_none_keyframes(self):
        groups = [
            {
                "_id": "abc",
                "frames": [3, 1, 2],
                "keyframes": [None, 2, None],
                "classLabel": "person",
                "persistedIndex": 1,
                "instance": {"_cls": "Instance", "_id": "abc"},
            },
            # No frames -> dropped entirely.
            {"_id": "empty", "frames": [], "keyframes": []},
        ]

        instances = build_instance_index(groups)

        self.assertEqual(len(instances), 1)
        entry = instances[0]
        self.assertEqual(entry["instanceId"], "abc")
        self.assertEqual(entry["segments"], [[1, 3]])
        self.assertEqual(entry["keyframes"], [2])
        self.assertEqual(entry["classLabel"], "person")
        self.assertEqual(entry["persistedIndex"], 1)


class VideoLabelsAggregationTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_index_segments_keyframes_and_legacy(self, dataset):
        inst_a = fo.Instance()
        inst_b = fo.Instance()

        video = fo.Sample(filepath="video.mp4")
        # A present 1-3 then 5-6 (gap at 4); keyframe at 2.
        # B present 2-4. A legacy instance-less "car" sits on frame 1 only.
        video[1]["detections"] = fo.Detections(
            detections=[
                fo.Detection(label="person", index=1, instance=inst_a),
                fo.Detection(label="car"),
            ]
        )
        video[2]["detections"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="person", index=1, instance=inst_a, keyframe=True
                ),
                fo.Detection(label="person", index=2, instance=inst_b),
            ]
        )
        video[3]["detections"] = fo.Detections(
            detections=[
                fo.Detection(label="person", index=1, instance=inst_a),
                fo.Detection(label="person", index=2, instance=inst_b),
            ]
        )
        video[4]["detections"] = fo.Detections(
            detections=[fo.Detection(label="person", index=2, instance=inst_b)]
        )
        video[5]["detections"] = fo.Detections(
            detections=[fo.Detection(label="person", index=1, instance=inst_a)]
        )
        video[6]["detections"] = fo.Detections(
            detections=[fo.Detection(label="person", index=1, instance=inst_a)]
        )
        dataset.add_sample(video)

        id_a = str(video[1]["detections"].detections[0].instance._id)
        id_b = str(video[2]["detections"].detections[1].instance._id)
        id_legacy = str(video[1]["detections"].detections[1]._id)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        result = await aggregate_index(view, ["detections"])

        instances = result["detections"]["instances"]
        by_id = {entry["instanceId"]: entry for entry in instances}

        self.assertEqual(set(by_id), {id_a, id_b, id_legacy})

        self.assertEqual(by_id[id_a]["segments"], [[1, 3], [5, 6]])
        self.assertEqual(by_id[id_a]["keyframes"], [2])
        self.assertEqual(by_id[id_a]["classLabel"], "person")
        self.assertEqual(by_id[id_a]["persistedIndex"], 1)

        self.assertEqual(by_id[id_b]["segments"], [[2, 4]])
        self.assertEqual(by_id[id_b]["keyframes"], [])

        # An instance-less, index-less detection has no track identity, so it
        # fragments into a single-frame entry keyed by its own doc _id.
        self.assertEqual(by_id[id_legacy]["segments"], [[1, 1]])
        self.assertEqual(by_id[id_legacy]["classLabel"], "car")

    @drop_async_dataset
    async def test_index_only_tracks_coalesce_by_index(self, dataset):
        video = fo.Sample(filepath="video.mp4")
        # An instance-less "vehicle" carrying a stable index across frames 1-3
        # coalesces into ONE synthetic track-<index>; a bare detection (no
        # instance, no index) still fragments by its per-frame _id.
        video[1]["detections"] = fo.Detections(
            detections=[
                fo.Detection(label="vehicle", index=0),
                fo.Detection(label="sign"),
            ]
        )
        video[2]["detections"] = fo.Detections(
            detections=[fo.Detection(label="vehicle", index=0)]
        )
        video[3]["detections"] = fo.Detections(
            detections=[fo.Detection(label="vehicle", index=0)]
        )
        dataset.add_sample(video)

        id_bare = str(video[1]["detections"].detections[1]._id)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        result = await aggregate_index(view, ["detections"])

        by_id = {e["instanceId"]: e for e in result["detections"]["instances"]}

        # index 0 → one synthetic track spanning all three frames
        self.assertIn("track-0", by_id)
        self.assertEqual(by_id["track-0"]["segments"], [[1, 3]])
        self.assertEqual(by_id["track-0"]["classLabel"], "vehicle")
        self.assertEqual(by_id["track-0"]["persistedIndex"], 0)

        # the bare detection still fragments by its own _id
        self.assertIn(id_bare, by_id)
        self.assertEqual(by_id[id_bare]["segments"], [[1, 1]])

    @drop_async_dataset
    async def test_index_singleton_fields_are_one_track(self, dataset):
        mask = np.zeros((2, 2), dtype=np.uint8)
        video = fo.Sample(filepath="video.mp4")
        # present on 1-2 and 4, missing on 3
        for fn in (1, 2, 4):
            video[fn]["seg"] = fo.Segmentation(mask=mask)
            video[fn]["heat"] = fo.Heatmap(map=mask.astype(float))

        dataset.add_sample(video)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        result = await aggregate_index(view, ["seg", "heat"])

        for field in ("seg", "heat"):
            instances = result[field]["instances"]
            self.assertEqual(len(instances), 1)
            self.assertEqual(
                instances[0]["instanceId"], "field:frames.%s" % field
            )
            self.assertEqual(instances[0]["segments"], [[1, 2], [4, 4]])

    @drop_async_dataset
    async def test_index_single_label_fields_are_one_track(self, dataset):
        video = fo.Sample(filepath="video.mp4")
        # every frame's label is its own document with its own class, so only
        # the field can coalesce them
        for fn, label in ((1, "cat"), (2, "dog"), (4, "cat")):
            video[fn]["cls"] = fo.Classification(label=label)
            video[fn]["reg"] = fo.Regression(value=float(fn))

        dataset.add_sample(video)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        result = await aggregate_index(view, ["cls", "reg"])

        for field in ("cls", "reg"):
            instances = result[field]["instances"]
            self.assertEqual(len(instances), 1)
            self.assertEqual(
                instances[0]["instanceId"], "field:frames.%s" % field
            )
            self.assertEqual(instances[0]["segments"], [[1, 2], [4, 4]])

    @drop_async_dataset
    async def test_dynamic_group_single_label_field_is_one_track(
        self, dataset
    ):
        samples = [
            fo.Sample(
                filepath="%d.png" % order,
                scene="a",
                order=order,
                cls=fo.Classification(label="cat" if order % 2 else "dog"),
            )
            for order in range(3)
        ]
        dataset.add_samples(samples)
        view = dataset.group_by("scene", order_by="order").get_dynamic_group(
            "a"
        )

        result = await aggregate_index(view, ["cls"], dynamic_group=True)

        instances = result["cls"]["instances"]
        self.assertEqual(len(instances), 1)
        self.assertEqual(instances[0]["instanceId"], "field:cls")
        self.assertEqual(
            sorted(str(member) for member in instances[0]["members"]),
            sorted(sample.id for sample in samples),
        )

    @drop_async_dataset
    async def test_index_dynamic_attribute_segments(self, dataset):
        inst = fo.Instance()

        video = fo.Sample(filepath="video.mp4")
        # turn_signal: off (1-2) -> left (3-4); the attribute is absent on
        # frame 5, which must read back as a null-valued run.
        signals = {1: "off", 2: "off", 3: "left", 4: "left"}
        for frame_number in range(1, 6):
            detection = fo.Detection(label="car", index=1, instance=inst)
            if frame_number in signals:
                detection["turn_signal"] = signals[frame_number]

            video[frame_number]["detections"] = fo.Detections(
                detections=[detection]
            )
        dataset.add_sample(video)

        instance_id = str(video[1]["detections"].detections[0].instance._id)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        result = await aggregate_index(view, ["detections"], ["turn_signal"])

        [entry] = result["detections"]["instances"]
        self.assertEqual(entry["instanceId"], instance_id)
        self.assertEqual(
            entry["attributeSegments"]["turn_signal"],
            [[1, 2, "off"], [3, 4, "left"], [5, 5, None]],
        )

        # Without dynamicAttributes the column is absent (unchanged shape).
        plain = await aggregate_index(view, ["detections"])
        self.assertNotIn(
            "attributeSegments", plain["detections"]["instances"][0]
        )

    @drop_async_dataset
    async def test_window_projects_fields_and_range(self, dataset):
        video = fo.Sample(filepath="video.mp4")
        for frame_number in range(1, 6):
            video[frame_number]["detections"] = fo.Detections(
                detections=[fo.Detection(label="person")]
            )
            video[frame_number]["other"] = fo.Detections(
                detections=[fo.Detection(label="thing")]
            )
        dataset.add_sample(video)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        windowed = await aggregate_window(view, ["detections"], [2, 4])

        # Only the requested range, only the requested field.
        self.assertEqual(set(windowed), {"2", "3", "4"})
        self.assertIn("detections", windowed["2"])
        self.assertNotIn("other", windowed["2"])
        self.assertEqual(len(windowed["3"]["detections"]["detections"]), 1)

    @drop_async_dataset
    async def test_resolve_label_list_field(self, dataset):
        video = fo.Sample(filepath="video.mp4")
        video[1]["detections"] = fo.Detections(
            detections=[fo.Detection(label="person")]
        )
        dataset.add_sample(video)

        self.assertEqual(
            resolve_label_list_field(dataset, "detections"), "detections"
        )
        self.assertIsNone(resolve_label_list_field(dataset, "frame_number"))


# Frames 15-17 have no frame documents
_MISSING_FRAMES = {15, 16, 17}


def _add_window_videos(dataset, num_frames=60):
    video = fo.Sample(filepath="video.mp4", weather="sunny")
    for frame_number in range(1, num_frames + 1):
        if frame_number in _MISSING_FRAMES:
            continue

        video[frame_number]["detections"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="car" if frame_number <= 30 else "person",
                    confidence=frame_number / num_frames,
                    tags=["keep"] if frame_number % 3 == 0 else [],
                ),
                fo.Detection(label="sign", confidence=0.5),
            ]
        )
        video[frame_number]["other"] = fo.Classification(
            label=str(frame_number % 4)
        )

    other = fo.Sample(filepath="other.mp4", weather="rainy")
    other[1]["detections"] = fo.Detections(
        detections=[fo.Detection(label="car")]
    )
    dataset.add_samples([video, other])

    return video


def _old_window_view(view, sample_id, start_frame, end_frame):
    view = fov.make_optimized_select_view(view, sample_id, flatten=True)
    return view.set_field(
        "frames",
        F("frames").filter(
            (F("frame_number") >= start_frame)
            & (F("frame_number") <= end_frame)
        ),
    )


def _frame_lookups(view, support):
    pipeline = view._pipeline(frames_only=True, support=support)
    return [
        stage["$lookup"]
        for stage in pipeline
        if "$lookup" in stage
        and stage["$lookup"]["from"] == view._dataset._frame_collection_name
    ]


def _frame_docs_examined(view, support):
    """Frame documents the view's ``$lookup`` reads, or ``None`` on MongoDB 6,
    whose explain reports zero examined documents for a ``$lookup``
    sub-pipeline whatever it reads.
    """
    conn = foo.get_db_conn()
    if int(conn.client.server_info()["version"].split(".")[0]) < 7:
        return None

    pipeline = view._pipeline(frames_only=True, support=support)
    result = conn.command(
        {
            "explain": {
                "aggregate": view._dataset._sample_collection_name,
                "pipeline": pipeline,
                "cursor": {},
            },
            "verbosity": "executionStats",
        }
    )
    return sum(
        stage.get("totalDocsExamined", 0)
        for stage in result["stages"]
        if "$lookup" in stage
    )


class VideoLabelsWindowViewTests(unittest.IsolatedAsyncioTestCase):
    def _assert_docs_examined(self, view, support, expected):
        examined = _frame_docs_examined(view, support)
        if examined is not None:
            self.assertEqual(examined, expected)

    async def _assert_window_matches_old_path(
        self, view, sample_id, start_frame, end_frame, windowed=True
    ):
        fields = ["detections", "other"]

        new_view, support = window_view(
            view, sample_id, start_frame, end_frame
        )
        if windowed:
            self.assertEqual(support, [start_frame, end_frame])
        else:
            self.assertIsNone(support)

        old_view = _old_window_view(view, sample_id, start_frame, end_frame)

        actual = await aggregate_window(new_view, fields, support)
        with fofp._disabled():
            expected = await aggregate_window(old_view, fields, None)
        self.assertEqual(actual, expected)

        return actual

    @drop_async_dataset
    async def test_window_stages_match_old_path(self, dataset):
        video = _add_window_videos(dataset)
        frames = video.frames
        frame_ids = [frames[fn].id for fn in (11, 12, 40)]

        views = [
            dataset.filter_labels(
                "frames.detections", F("label") == "car", only_matches=False
            ),
            dataset.filter_labels(
                "frames.other", F("label") == "1", only_matches=False
            ),
            dataset.match_frames(F("frame_number") % 2 == 0),
            dataset.select_frames(frame_ids),
            dataset.exclude_frames(frame_ids),
            dataset.select_fields("frames.detections"),
            dataset.exclude_fields("frames.other"),
            dataset.set_field(
                "frames.detections.detections.label", F("label").upper()
            ),
            dataset.select_labels(
                tags="keep", fields="frames.detections", omit_empty=False
            ),
            dataset.exclude_labels(
                tags="keep", fields="frames.detections", omit_empty=False
            ),
            dataset.map_labels("frames.detections", {"car": "vehicle"}),
            dataset.map_values(
                "frames.detections.detections.label", {"sign": "car"}
            ),
            dataset.limit_labels("frames.detections", 1),
            dataset.match(F("weather") == "sunny")
            .sort_by("filepath")
            .limit(5)
            .filter_labels(
                "frames.detections",
                F("confidence") > 0.2,
                only_matches=False,
            ),
        ]

        for view in views:
            actual = await self._assert_window_matches_old_path(
                view, video.id, 10, 25
            )
            self.assertTrue(actual)
            self.assertFalse(set(actual) & {str(fn) for fn in _MISSING_FRAMES})
            self.assertTrue(all(10 <= int(fn) <= 25 for fn in actual))

    @drop_async_dataset
    async def test_window_omit_empty_outside_window(self, dataset):
        video = _add_window_videos(dataset)

        # Frames match only outside the window: the old path keeps the video
        # but has no windowed frames, the new path drops the video
        view = dataset.match_frames(F("frame_number") > 50)
        actual = await self._assert_window_matches_old_path(
            view, video.id, 10, 25
        )
        self.assertEqual(actual, {})

    @drop_async_dataset
    async def test_window_frame_match_falls_back(self, dataset):
        video = _add_window_videos(dataset)

        # The first view matches only outside the window, so the video is
        # kept and its windowed frames carry empty detections
        views = [
            dataset.filter_labels("frames.detections", F("label") == "person"),
            dataset.filter_labels(
                "frames.detections",
                F("label") == "person",
                only_matches=False,
                trajectories=True,
            ),
            dataset.select_labels(tags="keep", fields="frames.detections"),
            dataset.set_field("frames", F("frames")[:5]),
        ]

        actual = [
            await self._assert_window_matches_old_path(
                view, video.id, 10, 25, windowed=False
            )
            for view in views
        ]

        self.assertTrue(actual[0])
        self.assertTrue(
            all(not d["detections"]["detections"] for d in actual[0].values())
        )

    @drop_async_dataset
    async def test_window_clips_view(self, dataset):
        _add_window_videos(dataset)

        clips = dataset.to_clips(
            F("detections.detections").filter(F("label") == "car").length() > 0
        )
        clip = clips.match(F("support")[0] > 17).first()
        self.assertEqual(clip.support, [18, 30])

        view = clips.filter_labels(
            "frames.detections", F("label") == "car", only_matches=False
        )
        for v in (clips.view(), view):
            actual = await self._assert_window_matches_old_path(
                v, clip.id, 25, 40
            )
            self.assertEqual(set(actual), {str(fn) for fn in range(25, 31)})

    @drop_async_dataset
    async def test_window_group_video_slice(self, dataset):
        dataset.add_group_field("group", default="video")
        group = fo.Group()
        video = fo.Sample(filepath="video.mp4", group=group.element("video"))
        for frame_number in range(1, 31):
            video[frame_number]["detections"] = fo.Detections(
                detections=[
                    fo.Detection(label="car" if frame_number % 2 else "sign")
                ]
            )
        image = fo.Sample(filepath="image.png", group=group.element("image"))
        dataset.add_samples([video, image])

        view = dataset.filter_labels(
            "frames.detections", F("label") == "car", only_matches=False
        )
        for v in (dataset.view(), view):
            actual = await self._assert_window_matches_old_path(
                v, video.id, 5, 12
            )
            self.assertEqual(set(actual), {str(fn) for fn in range(5, 13)})

    @drop_async_dataset
    async def test_window_lookup_is_bounded(self, dataset):
        video = _add_window_videos(dataset)
        view = dataset.filter_labels(
            "frames.detections", F("label") == "car", only_matches=False
        )

        new_view, support = window_view(view, video.id, 10, 19)

        [lookup] = _frame_lookups(new_view, support)
        self.assertEqual(
            lookup["pipeline"][0],
            {"$match": {"frame_number": {"$gte": 10, "$lte": 19}}},
        )

        # Only the frame documents in the window are read; 15-17 are missing
        self._assert_docs_examined(new_view, support, 7)

        with fofp._disabled():
            [lookup] = _frame_lookups(new_view, support)
            conditions = lookup["pipeline"][0]["$match"]["$expr"]["$and"]
            self.assertIn({"$gte": ["$frame_number", 10]}, conditions)
            self.assertIn({"$lte": ["$frame_number", 19]}, conditions)
            self._assert_docs_examined(new_view, support, 7)

            old_view = _old_window_view(view, video.id, 10, 19)
            self._assert_docs_examined(
                old_view, None, 60 - len(_MISSING_FRAMES)
            )

    @drop_async_dataset
    async def test_frame_roles(self, dataset):
        _add_window_videos(dataset)

        cases = [
            (dataset.match(F("weather") == "sunny"), "sample"),
            (dataset.match(F("frames").length() > 5), None),
            (dataset.sort_by("filepath"), "sample"),
            (dataset.sort_by(F("frames").length()), None),
            (dataset.limit(1), "sample"),
            (dataset.select_fields("weather"), "sample"),
            (dataset.select_fields("frames.detections"), "frame"),
            (dataset.match_frames(F("frame_number") > 3), "frame"),
            (
                dataset.filter_labels(
                    "frames.detections", F("label") == "car"
                ),
                "frame_match",
            ),
            (
                dataset.filter_labels(
                    "frames.detections",
                    F("label") == "car",
                    only_matches=False,
                ),
                "frame",
            ),
            (dataset.set_field("frames.other.label", "x"), "frame"),
            (dataset.set_field("frames", F("frames")[:1]), None),
            (dataset.mongo([{"$limit": 1}]), None),
            (dataset.group_by("weather"), None),
        ]

        for view, role in cases:
            self.assertEqual(view._get_frame_roles(), [role], view)


def _add_dynamic_groups(dataset):
    inst_a = fo.Instance()
    inst_b = fo.Instance()
    mask = np.ones((4, 4), dtype=bool)

    samples = []
    for scene, num_members in (("a", 9), ("b", 4)):
        for order in range(num_members):
            detections = [
                fo.Detection(
                    label="person",
                    instance=inst_a,
                    index=1,
                    keyframe=order % 3 == 0,
                    mask=mask,
                    turn_signal="left" if order > 4 else "off",
                )
            ]
            if order not in (3, 4):
                detections.append(
                    fo.Detection(label="car", instance=inst_b, mask=mask)
                )
            if order == 2:
                detections.append(fo.Detection(label="sign", index=7))
                detections.append(fo.Detection(label="bare"))

            samples.append(
                fo.Sample(
                    filepath="%s-%d.png" % (scene, order),
                    scene=scene,
                    # stored out of order, so the group's order is not
                    # insertion order
                    order=(order * 5) % num_members,
                    detections=fo.Detections(detections=detections),
                    seg=(
                        fo.Segmentation(mask=mask.astype(np.uint8))
                        if order % 2
                        else None
                    ),
                )
            )

    dataset.add_samples(samples)
    return dataset.group_by("scene", order_by="order")


def _old_dynamic_index(view, field, dynamic_attributes):
    """The previous whole-group fold, ranking members by array index."""
    dataset = view._dataset
    fold = [
        {"$project": {field: True}},
        {"$group": {"_id": None, "docs": {"$push": "$$ROOT"}}},
        {"$unwind": {"path": "$docs", "includeArrayIndex": "rank"}},
        {
            "$replaceRoot": {
                "newRoot": {
                    "$mergeObjects": [
                        "$docs",
                        {"frame_number": {"$add": ["$rank", 1]}},
                    ]
                }
            }
        },
    ]
    pipeline = view._pipeline(
        post_pipeline=fold
        + index_post_pipeline(
            field,
            resolve_label_list_field(dataset, field, True),
            dynamic_attributes,
            singleton_address_id=resolve_singleton_address_id(
                dataset, field, True
            ),
        )
    )
    groups = list(foo.aggregate(dataset._sample_collection, pipeline))
    return build_instance_index(groups, dynamic_attributes)


def _member_entries_to_frames(entries, member_order, dynamic_attributes):
    """What the client does with a dynamic group's member index."""
    frame_of = {member: idx + 1 for idx, member in enumerate(member_order)}
    instances = []
    for entry in entries:
        frames = [frame_of[m] for m in entry["members"] if m in frame_of]
        segments = run_length_encode(frames)
        if not segments:
            continue

        mapped = {
            k: v
            for k, v in entry.items()
            if k not in ("members", "keyframeMembers", "attributeValues")
        }
        mapped["segments"] = segments
        mapped["keyframes"] = sorted(
            {frame_of[m] for m in entry["keyframeMembers"] if m in frame_of}
        )
        if dynamic_attributes:
            mapped["attributeSegments"] = {}
            for attr, pairs in entry["attributeValues"].items():
                runs = run_length_encode_values(
                    (frame_of[m], value) for m, value in pairs if m in frame_of
                )
                if runs:
                    mapped["attributeSegments"][attr] = runs

        instances.append(mapped)

    return instances


def _by_instance(instances):
    return {entry["instanceId"]: entry for entry in instances}


class VideoLabelsDynamicGroupIndexTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_member_index_matches_old_path(self, dataset):
        grouped = _add_dynamic_groups(dataset)

        for scene in ("a", "b"):
            view = grouped.get_dynamic_group(scene)
            member_order = [ObjectId(_id) for _id in view.values("id")]

            for field, attrs in (
                ("detections", []),
                ("detections", ["turn_signal"]),
                ("seg", []),
            ):
                result = await aggregate_index(
                    view, [field], attrs, dynamic_group=True
                )
                actual = _member_entries_to_frames(
                    result[field]["instances"], member_order, attrs
                )
                expected = _old_dynamic_index(view, field, attrs)

                self.assertTrue(expected)
                self.assertEqual(
                    _by_instance(actual), _by_instance(expected), field
                )

    @drop_async_dataset
    async def test_member_index_shape(self, dataset):
        view = _add_dynamic_groups(dataset).get_dynamic_group("a")

        post_pipeline = index_post_pipeline(
            "detections", "detections", ["turn_signal"], dynamic_group=True
        )
        pipeline = view._pipeline(post_pipeline=post_pipeline)

        self.assertNotIn(
            {"$push": "$$ROOT"},
            [
                acc
                for stage in pipeline
                if "$group" in stage
                for acc in stage["$group"].values()
            ],
        )
        self.assertFalse(
            any(
                "$group" in stage and stage["$group"]["_id"] is None
                for stage in pipeline
            )
        )
        self.assertFalse(
            any(
                isinstance(stage.get("$unwind"), dict)
                and "includeArrayIndex" in stage["$unwind"]
                for stage in pipeline
            )
        )

        # Only the label attributes the index reads reach the grouping
        self.assertEqual(
            post_pipeline[0],
            {
                "$project": {
                    "detections.detections.%s" % attr: True
                    for attr in (
                        "_id",
                        "index",
                        "instance",
                        "keyframe",
                        "label",
                        "turn_signal",
                    )
                }
            },
        )

        docs = list(
            foo.aggregate(
                dataset._sample_collection,
                view._pipeline(post_pipeline=post_pipeline[:-1]),
            )
        )
        self.assertTrue(docs)
        self.assertFalse(any("mask" in doc["labels"] for doc in docs))

        result = await aggregate_index(
            view, ["detections"], dynamic_group=True
        )
        [person] = [
            e
            for e in result["detections"]["instances"]
            if e["classLabel"] == "person"
        ]
        self.assertEqual(len(person["members"]), 9)
        self.assertNotIn("segments", person)


if __name__ == "__main__":
    unittest.main()
