"""
FiftyOne Server /video-labels route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.view as fov
from fiftyone.server.routes.video_labels import (
    aggregate_index,
    aggregate_window,
    build_instance_index,
    resolve_label_list_field,
    run_length_encode,
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


class BuildInstanceIndexTests(unittest.TestCase):
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

        # The instance-less detection fragments into a single-frame entry.
        self.assertEqual(by_id[id_legacy]["segments"], [[1, 1]])
        self.assertEqual(by_id[id_legacy]["classLabel"], "car")

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


if __name__ == "__main__":
    unittest.main()
