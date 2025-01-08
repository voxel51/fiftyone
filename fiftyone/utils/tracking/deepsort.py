"""
`DeepSort <https://arxiv.org/abs/1703.07402>`_ wrapper for FiftyOne.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

dsrt = fou.lazy_import(
    "deep_sort_realtime.deepsort_tracker",
    callback=lambda: fou.ensure_package("deep-sort-realtime"),
)


logger = logging.getLogger(__name__)


class DeepSort(object):
    @staticmethod
    def track(
        sample_collection,
        in_field,
        out_field="frames.ds_tracks",
        max_age=5,
        keep_confidence=False,
        skip_failures=True,
        progress=None,
    ):
        """Performs object tracking using the DeepSort algorithm on the given
        video samples.

        DeepSort is an algorithm for tracking multiple objects in video streams
        based on deep learning techniques. It associates bounding boxes between
        frames and maintains tracks of objects over time.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            in_field: the name of a frame field containing
                :class:`fiftyone.core.labels.Detections` to track. The
                ``"frames."`` prefix is optional
            out_field ("frames.ds_tracks"): the name of a frame field to store
                the output :class:`fiftyone.core.labels.Detections` with
                tracking information. The ``"frames."`` prefix is optional
            max_age (5): the maximum number of missed misses before a track is
                deleted
            keep_confidence (False): whether to store the detection confidence
                of the tracked objects in the ``out_field``
            skip_failures (True): whether to gracefully continue without
                raising an error if tracking fails for a video
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
        """
        in_field, _ = sample_collection._handle_frame_field(in_field)
        out_field, _ = sample_collection._handle_frame_field(out_field)
        _in_field = sample_collection._FRAMES_PREFIX + in_field

        fov.validate_video_collection(sample_collection)
        fov.validate_collection_label_fields(
            sample_collection, _in_field, fo.Detections
        )

        view = sample_collection.select_fields(_in_field)

        for sample in view.iter_samples(autosave=True, progress=progress):
            try:
                DeepSort.track_sample(
                    sample,
                    in_field,
                    out_field=out_field,
                    max_age=max_age,
                    keep_confidence=keep_confidence,
                )
            except Exception as e:
                if not skip_failures:
                    raise e

                logger.warning("Sample: %s\nError: %s\n", sample.id, e)

    @staticmethod
    def track_sample(
        sample,
        in_field,
        out_field="ds_tracks",
        max_age=5,
        keep_confidence=False,
    ):
        """Performs object tracking using the DeepSort algorithm on the given
        video sample.

        DeepSort is an algorithm for tracking multiple objects in video streams
        based on deep learning techniques. It associates bounding boxes between
        frames and maintains tracks of objects over time.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            in_field: the name of the frame field containing
                :class:`fiftyone.core.labels.Detections` to track
            out_field ("ds_tracks"): the name of a frame field to store the
                output :class:`fiftyone.core.labels.Detections` with tracking
                information. The ``"frames."`` prefix is optional
            max_age (5): the maximum number of missed misses before a track is
                deleted
            keep_confidence (False): whether to store the detection confidence
                of the tracked objects in the ``out_field``
        """
        tracker = dsrt.DeepSort(max_age=max_age)

        with etav.FFmpegVideoReader(sample.filepath) as video_reader:
            for img in video_reader:
                frame = sample.frames[video_reader.frame_number]
                frame_width = img.shape[1]
                frame_height = img.shape[0]

                bbs = []

                if frame[in_field] is not None:
                    for detection in frame[in_field].detections:
                        bbox = detection.bounding_box
                        coordinates = [
                            bbox[0] * frame_width,
                            bbox[1] * frame_height,
                            bbox[2] * frame_width,
                            bbox[3] * frame_height,
                        ]
                        confidence = detection.confidence or 0
                        label = detection.label
                        bbs.append(((coordinates), confidence, label))

                tracks = tracker.update_tracks(bbs, frame=img)

                tracked_detections = []
                for track in tracks:
                    if not track.is_confirmed():
                        continue

                    ltrb = track.to_ltrb()
                    x1, y1, x2, y2 = ltrb
                    w, h = x2 - x1, y2 - y1

                    rel_x = max(0, min(x1 / frame_width, 1))
                    rel_y = max(0, min(y1 / frame_height, 1))
                    rel_w = min(w / frame_width, 1 - rel_x)
                    rel_h = min(h / frame_height, 1 - rel_y)

                    detection = fo.Detection(
                        label=track.get_det_class(),
                        bounding_box=[rel_x, rel_y, rel_w, rel_h],
                        index=track.track_id,
                    )
                    if keep_confidence:
                        detection.confidence = track.get_det_conf()

                    tracked_detections.append(detection)

                frame[out_field] = fo.Detections(detections=tracked_detections)
