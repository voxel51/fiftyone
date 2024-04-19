"""
`DeepSort <https://arxiv.org/abs/1703.07402>`_ wrapper for FiftyOne.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from cv2 import cv2

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.core.utils as fou

dsrt = fou.lazy_import("deep_sort_realtime.deepsort_tracker")

logger = logging.getLogger(__name__)


class DeepSort:
    @staticmethod
    def track(
        dataset,
        in_field,
        out_field="frames.ds_tracks",
        max_age=5,
        progress=None,
    ):
        """Performs object tracking using the DeepSort algorithm on a video dataset.

        DeepSort is an algorithm for tracking multiple objects in video streams
        based on deep learning techniques. It associates bounding boxes between
        frames and maintains tracks of objects over time.

        Args:
            dataset: a FiftyOne dataset
            in_field: the name of the field containing detections in each frame
            out_field ("frames.ds_tracks"): the name of the field to store tracking
                information of the detections
            max_age (5): the maximum number of missed misses before a track
                is deleted.
            progress (None): whether to display a progress bar (True/False)
        """
        if not in_field.startswith("frames.") or not out_field.startswith(
            "frames."
        ):
            raise ValueError(
                "in_field and out_field must not be empty and must start with 'frames.'"
            )

        tracker = dsrt.DeepSort(max_age=max_age)

        for sample in dataset.iter_samples(autosave=True, progress=progress):
            cap = cv2.VideoCapture(sample.filepath)
            frames_list = []

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames_list.append(frame)

            cap.release()

            if len(frames_list) != len(sample.frames):
                logger.error(
                    "Unable to align the captured frames with the encoded frames!"
                )
                return

            for frame_idx, frame in sample.frames.items():
                frame_detections = frame[in_field[len("frames.") :]]
                bbs = []
                extracted_detections = foz.deepcopy(
                    frame_detections.detections
                )
                frame_width = frames_list[frame_idx - 1].shape[1]
                frame_height = frames_list[frame_idx - 1].shape[0]

                for detection in extracted_detections:
                    coordinates = detection.bounding_box
                    coordinates[0] *= frame_width
                    coordinates[1] *= frame_height
                    coordinates[2] *= frame_width
                    coordinates[3] *= frame_height
                    confidence = (
                        detection.confidence if detection.confidence else 0
                    )
                    detection_class = detection.label

                    bbs.append(((coordinates), confidence, detection_class))

                tracks = tracker.update_tracks(
                    bbs, frame=frames_list[frame_idx - 1]
                )

                tracked_detections = []

                for _, track in enumerate(tracks):
                    if not track.is_confirmed():
                        continue
                    ltrb = track.to_ltrb()
                    x1, y1, x2, y2 = ltrb
                    w, h = x2 - x1, y2 - y1
                    rel_x = x1 / frame_width
                    rel_y = y1 / frame_height
                    rel_w = w / frame_width
                    rel_h = h / frame_height

                    tracked_detections.append(
                        fo.Detection(
                            label=track.get_det_class(),
                            confidence=track.get_det_conf(),
                            bounding_box=[rel_x, rel_y, rel_w, rel_h],
                            index=track.track_id,
                        )
                    )

                frame[out_field[len("frames.") :]] = fo.Detections(
                    detections=tracked_detections
                )
