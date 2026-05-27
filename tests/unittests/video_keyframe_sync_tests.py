import unittest

from bson import ObjectId

import fiftyone as fo

from decorators import drop_datasets


class KeyframeSyncTests(unittest.TestCase):
    @drop_datasets
    def setUp(self) -> None:
        self.dataset: fo.Dataset = fo.Dataset()
        sample: fo.Sample = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=3),
        )
        sample.frames[1] = fo.Frame(
            filepath="frame1.jpg",
            detections=fo.Detections(detections=[
                fo.Detection(
                    label="car",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                ),
            ])
        )
        self.dataset.add_sample(sample)
        self.sample: fo.Sample = sample

    def test_keyframe_dynamic_attr_persists_on_direct_edit(self) -> None:
        det: fo.Detection = self.sample.frames[1].detections.detections[0]
        det.keyframe = True
        det.propagation = None
        self.sample.save()

        roundtripped: fo.Detection = (
            self.dataset.first().frames[1].detections.detections[0]
        )
        self.assertIs(roundtripped.keyframe, True)
        self.assertIsNone(getattr(roundtripped, "propagation", None))

    def test_propagation_blob_persists_on_direct_edit(self) -> None:
        run_id: ObjectId = ObjectId()
        parent_a: ObjectId = ObjectId()
        parent_b: ObjectId = ObjectId()
        det: fo.Detection = self.sample.frames[1].detections.detections[0]
        det.keyframe = False
        det.propagation = {
            "method": "linear",
            "run_id": run_id,
            "parent_keyframes": [parent_a, parent_b],
        }
        self.sample.save()

        roundtripped: fo.Detection = (
            self.dataset.first().frames[1].detections.detections[0]
        )
        self.assertIs(roundtripped.keyframe, False)
        self.assertEqual(roundtripped.propagation["method"], "linear")
        self.assertEqual(roundtripped.propagation["run_id"], run_id)
        self.assertEqual(
            roundtripped.propagation["parent_keyframes"],
            [parent_a, parent_b],
        )

    def test_keyframe_attr_roundtrips_through_frames_view(self) -> None:
        frames_view = self.dataset.to_frames()
        frame_sample = frames_view.first()
        det: fo.Detection = frame_sample.detections.detections[0]
        det.keyframe = True
        det.propagation = None
        frame_sample.save()

        roundtripped: fo.Detection = (
            self.dataset.first().frames[1].detections.detections[0]
        )
        self.assertIs(roundtripped.keyframe, True)
        self.assertIsNone(roundtripped.propagation)

    def test_propagation_blob_roundtrips_through_frames_view(self) -> None:
        run_id: ObjectId = ObjectId()
        parent_a: ObjectId = ObjectId()
        parent_b: ObjectId = ObjectId()
        frames_view = self.dataset.to_frames()
        frame_sample = frames_view.first()
        det: fo.Detection = frame_sample.detections.detections[0]
        det.keyframe = False
        det.propagation = {
            "method": "linear",
            "run_id": run_id,
            "parent_keyframes": [parent_a, parent_b],
        }
        frame_sample.save()

        roundtripped: fo.Detection = (
            self.dataset.first().frames[1].detections.detections[0]
        )
        self.assertIs(roundtripped.keyframe, False)
        self.assertEqual(roundtripped.propagation["method"], "linear")
        self.assertEqual(roundtripped.propagation["run_id"], run_id)
        self.assertEqual(
            roundtripped.propagation["parent_keyframes"],
            [parent_a, parent_b],
        )


if __name__ == "__main__":
    unittest.main()
