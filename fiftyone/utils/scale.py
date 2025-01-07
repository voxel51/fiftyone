"""
Utilities for working with annotations in
`Scale AI format <https://docs.scale.com/reference/introduction>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import logging
import os
from uuid import uuid4
import warnings

import numpy as np

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.collections as foc
import fiftyone.core.labels as fol
import fiftyone.core.media as fomm
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
import fiftyone.utils.image as foui


logger = logging.getLogger(__name__)


def import_from_scale(
    dataset,
    labels_dir_or_json,
    label_prefix=None,
    scale_id_field="scale_id",
    progress=None,
):
    """Imports the Scale AI labels into the FiftyOne dataset.

    This method supports importing annotations from the following Scale API
    endpoints:

    -   `General Image Annotation <https://docs.scale.com/reference/general-image-annotation>`_
    -   `Semantic Segmentation Annotation <https://docs.scale.com/reference/semantic-segmentation-annotation>`_
    -   `General Video Annotation <https://docs.scale.com/reference/general-video-annotation>`_
    -   `Video Playback <https://docs.scale.com/reference/video-playback>`_

    The ``scale_id_field`` of the FiftyOne samples are used to associate
    samples with their corresponding Scale task IDs.

    The provided ``labels_dir_or_json`` can either be the path to a JSON
    export in the following format::

        [
            {
                "task_id": <scale-task-id1>,
                "response": {...},
                ...
            },
            {
                "task_id": <scale-task-id2>,
                "response": {...},
                ...
            },
            ...
        ]

    or a directory of per-task JSON files, which can either (a) directly
    contain the elements of the list above, or (b) contain task labels
    organized in the following format::

        labels_dir/
            <scale-task-id1>.json
            <scale-task-id2>.json
            ...

    where each JSON file contains only the contents of the ``response`` field
    for the task.

    The contents of the ``response`` field should be as follows:

    -   `General Image Annotation <https://docs.scale.com/reference/general-image-annotation>`_::

            {
                "annotations": [...]
                "global_attributes": {...}
            }

    -   `Semantic Segmentation Annotation <https://docs.scale.com/reference/semantic-segmentation-annotation>`_::

            {
                "annotations": {
                    ...
                    "combined": {
                        ...
                        "indexedImage": <url-or-filepath>
                    }
                },
                "labelMapping": {...}
            }

        where the ``indexedImage`` field (which is the only version of the
        segmentation used by this method) can contain either a URL, in which
        case the mask is downloaded from the web, or the path to the mask on
        disk.

    -   `General Video Annotation <https://docs.scale.com/reference/general-video-annotation>`_::

            {
                "annotations": {
                    "url": <url-or-filepath>
                },
                "events": {
                    "url": <url-or-filepath>
                }
            }

        where the ``url`` fields can contain either a URL, in which case the
        file is downloaded from the web, or the path to JSON file on disk.

        The annotations file should contain per-frame annotations in the
        following format::

            [
                {
                    "annotations": [...],
                    "global_attributes": {...}
                },
                {
                    "annotations": [...],
                    "global_attributes": {...}
                },
                ...
            ]

        where the n-th element in the list contains the labels for the n-th
        frame that was labeled.

        Note that, if parameters such as ``duration_time``, ``frame_rate``, and
        ``start_time`` were used to specify which frames of the video to
        annotate, then you must ensure that the ``labels_dir_or_json`` JSON
        that you provide to this method contains the ``task`` fields for each
        Scale task so that the correct frame numbers can be determined from
        these values.

        The optional events file should contain a list of events in the video::

            {
                "events": [...]
            }

    -   `Video Playback <https://docs.scale.com/reference/video-playback>`_::

            {
                "annotations": {
                    "url": <url-or-filepath>
                },
                "events": {
                    "url": <url-or-filepath>
                }
            }

        where the ``url`` fields can contain either a URL, in which case the
        file is downloaded from the web, or the path to JSON files on disk.

        The annotations file should contain a dictionary of object
        trajectories::

            {
                "annotations": {...}
            }

        The optional events file should contain a list of events in the video::

            {
                "events": [...]
            }

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        labels_dir_or_json: the path to a Scale AI JSON export or a directory
            of JSON exports as per the formats described above
        label_prefix (None): a prefix to prepend to the sample label field(s)
            that are created, separated by an underscore
        scale_id_field ("scale_id"): the sample field to use to associate Scale
            task IDs with FiftyOne samples
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    fov.validate_collection(dataset, media_type=(fomm.IMAGE, fomm.VIDEO))
    is_video = dataset.media_type == fomm.VIDEO

    # Load labels
    if labels_dir_or_json.endswith(".json"):
        labels = _load_labels(labels_dir_or_json)
    else:
        labels = _load_labels_dir(labels_dir_or_json)

    id_map = {k: v for k, v in zip(*dataset.values([scale_id_field, "id"]))}

    if label_prefix:
        label_key = lambda k: label_prefix + "_" + k
    else:
        label_key = lambda k: k

    pb = fou.ProgressBar(total=len(labels), progress=progress)
    ctx = foc.SaveContext(dataset)
    with pb, ctx:
        for task_id, task_labels in pb(labels.items()):
            if task_id not in id_map:
                logger.info(
                    "Skipping labels for unknown Scale ID '%s'", task_id
                )
                continue

            sample = dataset[id_map[task_id]]

            if sample.metadata is None:
                if is_video:
                    sample.metadata = fom.VideoMetadata.build_for(
                        sample.filepath
                    )
                else:
                    sample.metadata = fom.ImageMetadata.build_for(
                        sample.filepath
                    )

            if is_video:
                frames = _parse_video_labels(task_labels, sample.metadata)
                sample.frames.merge(
                    {
                        frame_number: {
                            label_key(fname): flabel
                            for fname, flabel in frame_dict.items()
                        }
                        for frame_number, frame_dict in frames.items()
                    }
                )
            else:
                frame_size = (sample.metadata.width, sample.metadata.height)
                anno_dict = task_labels["response"]
                labels_dict = _parse_image_labels(anno_dict, frame_size)
                sample.update_fields(
                    {label_key(k): v for k, v in labels_dict.items()}
                )

            ctx.save(sample)


# @todo add support for `duration_time`, `frame_rate`, and `start_time`
# parameters when exporting general video annotation labels?
def export_to_scale(
    sample_collection,
    json_path,
    video_labels_dir=None,
    video_events_dir=None,
    video_playback=False,
    label_field=None,
    frame_labels_field=None,
    progress=None,
):
    """Exports labels from the FiftyOne samples to Scale AI format.

    This function is useful for generating pre-annotations that can be provided
    to Scale AI via the ``hypothesis`` parameter of the following endpoints:

    -   `General Image Annotation <https://docs.scale.com/reference/general-image-annotation>`_
    -   `General Video Annotation <https://docs.scale.com/reference/general-video-annotation>`_
    -   `Video Playback <https://docs.scale.com/reference/video-playback>`_

    The output ``json_path`` will be a JSON file in the following format::

        {
            <sample-id1>: {
                "filepath": <filepath1>,
                "hypothesis": {...}
            },
            <sample-id2>: {
                "filepath": <filepath2>,
                "hypothesis": {...}
            },
            ...
        }

    The format of the ``hypothesis`` field depends on the label type:

    -   Sample-level classifications, detections, polylines, polygons, and
        keypoints::

            {
                "annotations": [...],
                "global_attributes": {...}
            }

    -   Video samples::

            {
                "annotations": {
                    "url": <filepath>
                }
            }

    When exporting labels for video datasets, the ``url`` field will contain
    the paths on disk to per-sample JSON files that are written to
    ``video_labels_dir`` as follows::

        video_labels_dir/
            <sample-id1>.json
            <sample-id2>.json
            ...

    When ``video_playback == False``, the per-sample JSON files are written in
    `General Video Annotation format <https://docs.scale.com/reference/general-video-annotation>`_::

        [
            {
                "annotations": [...],
                "global_attributes": {...}
            },
            {
                "annotations": [...],
                "global_attributes": {...}
            },
            ...
        ]

    where the n-th element in the list contains the labels for the n-th frame
    of the video.

    When ``video_playback == True``, the per-sample JSON files are written in
    `Video Playback format <https://docs.scale.com/reference/video-playback>`_::

        {
            "annotations": {...}
        }

    When exporting labels for videos and the ``video_events_dir`` parameter is
    provided, the ``hypothesis`` fields of the JSON written to ``json_path``
    will include an ``events`` field::

        {
            "annotations": {
                "url": <filepath>
            },
            "events": {
                "url": <filepath>
            }
        }

    whose ``url`` field will contain the paths on disk to per-sample JSON files
    that are written to ``video_events_dir`` as follows::

        video_events_dir/
            <sample-id1>.json
            <sample-id2>.json
            ...

    where each per-sample JSON file contains the
    `events in the video <https://docs.scale.com/reference/events>`_::

        {
            "events": [...]
        }

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        json_path: the path to write the JSON export
        video_labels_dir (None): a directory to write the per-sample video
            labels. Only applicable for video datasets
        video_events_dir (None): a directory to write the per-sample video
            events. Only applicable for video datasets
        video_playback (False): whether to export video labels in a suitable
            format for use with the
            `Video Playback <https://docs.scale.com/reference/video-playback>`_ task.
            By default, video labels are exported for in a suitable format for
            the `General Video Annotation <https://docs.scale.com/reference/general-video-annotation>`_
            task. Only applicable for video datasets
        label_field (None): optional label field(s) to export. Can be any of
            the following:

            -   the name of a label field to export
            -   a glob pattern of label field(s) to export
            -   a list or tuple of label field(s) to export
            -   a dictionary mapping label field names to keys to use when
                constructing the exported labels

            By default, no labels are exported
        frame_labels_field (None): optional frame label field(s) to export.
            Only applicable to video datasets. Can be any of the following:

            -   the name of a frame label field to export
            -   a glob pattern of frame label field(s) to export
            -   a list or tuple of frame label field(s) to export
            -   a dictionary mapping frame label field names to keys to use
                when constructing the exported frame labels

            By default, no frame labels are exported
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    fov.validate_collection(
        sample_collection, media_type=(fomm.IMAGE, fomm.VIDEO)
    )
    is_video = sample_collection.media_type == fomm.VIDEO

    # Get label fields to export
    label_fields = sample_collection._parse_label_field(
        label_field,
        allow_coercion=False,
        force_dict=True,
        required=False,
    )

    # Get frame label fields to export
    if is_video:
        frame_label_fields = sample_collection._parse_frame_labels_field(
            frame_labels_field,
            allow_coercion=False,
            required=False,
            force_dict=True,
        )

        if frame_label_fields and (
            video_labels_dir is None and video_events_dir is None
        ):
            raise ValueError(
                "Must provide `video_labels_dir` and/or `video_events_dir` "
                "when exporting labels for video datasets"
            )

    sample_collection.compute_metadata()

    # Export the labels
    labels = {}
    anno_dict = {}
    for sample in sample_collection.iter_samples(progress=progress):
        metadata = sample.metadata

        # Get frame size
        if is_video:
            frame_size = (metadata.frame_width, metadata.frame_height)
        else:
            frame_size = (metadata.width, metadata.height)

        # Export sample-level labels
        if label_fields:
            labels_dict = _get_labels(sample, label_fields)
            anno_dict = _to_scale_image_labels(labels_dict, frame_size)

        # Export frame-level labels
        if is_video and frame_label_fields:
            frames = _get_frame_labels(sample, frame_label_fields)
            make_events = video_events_dir is not None
            if video_playback:
                annotations, events = _to_scale_video_playback_labels(
                    frames, frame_size, make_events=make_events
                )
            else:
                annotations, events = _to_scale_video_annotation_labels(
                    frames, frame_size, make_events=make_events
                )

            # Write annotations
            if video_labels_dir:
                anno_path = os.path.join(video_labels_dir, sample.id + ".json")
                etas.write_json(annotations, anno_path)
                anno_dict["annotations"] = {"url": anno_path}

            # Write events
            if video_events_dir:
                events_path = os.path.join(
                    video_events_dir, sample.id + ".json"
                )
                etas.write_json(events, events_path)
                anno_dict["events"] = {"url": events_path}

        labels[sample.id] = {
            "filepath": sample.filepath,
            "hypothesis": anno_dict,
        }

    etas.write_json(labels, json_path)


def convert_scale_export_to_import(inpath, outpath):
    """Converts a Scale AI JSON export generated by :meth:`export_to_scale`
    into the format expected by :meth:`import_from_scale`.

    The output JSON file will have the same format that is generated when
    performing a bulk export of a Scale AI project's labels.

    Args:
        inpath: the path to an JSON file generated (for example) by
            :meth:`export_to_scale`
        outpath: the path to write a JSON file containing the converted labels

    Returns:
        a dictionary mapping sample IDs to the task IDs that were generated for
        each sample
    """
    labels = etas.read_json(inpath)

    id_map = {}
    annos = []
    for sample_id, task_dict in labels.items():
        task_id = str(uuid4())
        id_map[sample_id] = task_id
        annos.append({"task_id": task_id, "response": task_dict["hypothesis"]})

    etas.write_json(annos, outpath)

    return id_map


def _load_labels(json_path):
    d_list = etas.read_json(json_path)
    return {d["task_id"]: d for d in d_list}


def _load_labels_dir(labels_dir):
    labels = {}
    json_patt = os.path.join(labels_dir, "*.json")
    for json_path in etau.get_glob_matches(json_patt):
        task_id, task_labels = _load_task_labels(json_path)
        labels[task_id] = task_labels

    return labels


def _load_task_labels(json_path):
    d = etas.read_json(json_path)

    if "task_id" in d:
        task_id = d["task_id"]
        labels = d
    else:
        task_id = os.path.splitext(os.path.basename(json_path))[0]
        labels = {
            "task_id": task_id,
            "response": d,
            "task": None,
        }

    return task_id, labels


def _get_labels(sample_or_frame, label_fields):
    labels_dict = {}
    for field, key in label_fields.items():
        value = sample_or_frame[field]
        if value is not None:
            labels_dict[key] = value

    return labels_dict


def _get_frame_labels(sample, frame_label_fields):
    frames = {}
    for frame_number, frame in sample.frames.items():
        frames[frame_number] = _get_labels(frame, frame_label_fields)

    return frames


# https://docs.scale.com/reference/general-image-annotation
def _to_scale_image_labels(labels_dict, frame_size):
    annotations = []
    global_attributes = {}
    for name, label in labels_dict.items():
        if isinstance(label, fol.Classification):
            attrs_dict = _to_classification(name, label)
            global_attributes.update(attrs_dict)
        elif isinstance(label, (fol.Detection, fol.Detections)):
            annos = _to_detections(label, frame_size)
            annotations.extend(annos)
        elif isinstance(label, (fol.Polyline, fol.Polylines)):
            annos = _to_polylines(label, frame_size)
            annotations.extend(annos)
        elif isinstance(label, (fol.Keypoint, fol.Keypoints)):
            annos = _to_points(label, frame_size)
            annotations.extend(annos)
        elif label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)

    anno_dict = {"annotations": annotations}

    if global_attributes:
        anno_dict["global_attributes"] = global_attributes

    return anno_dict


# https://docs.scale.com/reference/general-video-annotation
def _to_scale_video_annotation_labels(frames, frame_size, make_events=False):
    in_progress_events = {}
    events = []

    annotations = []
    for frame_number, labels_dict in frames.items():
        # Generate events, if requested
        if make_events:
            _parse_frame_events(
                labels_dict, frame_number, events, in_progress_events
            )

        # Generate frame labels
        anno_dict = _to_scale_image_labels(labels_dict, frame_size)
        annotations.append(anno_dict)

    # Finalize all remaining events
    _finalize_events(events, None, in_progress_events)

    return annotations, {"events": events}


# https://docs.scale.com/reference/video-playback
def _to_scale_video_playback_labels(frames, frame_size, make_events=False):
    in_progress_events = {}
    events = []

    traj_uuids = {}
    annotations = {}
    for frame_number, frame in frames.items():
        # Ingst new labels
        for label in frame.values():
            if make_events and isinstance(
                label, (fol.Classification, fol.Classifications)
            ):
                _ingest_event_label(label, frame_number, in_progress_events)
            elif isinstance(label, (fol.Detection, fol.Detections)):
                if isinstance(label, fol.Detection):
                    detections = [label]
                else:
                    detections = label.detections

                for detection in detections:
                    if detection.index is None:
                        key = None
                    else:
                        key = (detection.label, detection.index)

                    uuid = traj_uuids.get(key, None)
                    if uuid is None:
                        uuid = str(uuid4())
                        annotations[uuid] = _init_video_box(detection.label)

                        if key is not None:
                            traj_uuids[key] = uuid

                    annotations[uuid]["frames"].append(
                        _make_video_box_frame(
                            detection, frame_number, frame_size
                        )
                    )

            elif label is not None:
                msg = "Ignoring unsupported label type '%s'" % label.__class__
                warnings.warn(msg)

        # Finalize in-progress events
        _finalize_events(events, frame_number, in_progress_events)

    # Finalize all remaining events
    _finalize_events(events, None, in_progress_events)

    return {"annotations": annotations}, {"events": events}


def _parse_frame_events(labels_dict, frame_number, events, in_progress_events):
    for name, label in labels_dict.items():
        if isinstance(label, (fol.Classification, fol.Classifications)):
            _ingest_event_label(label, frame_number, in_progress_events)
            labels_dict[name] = None

    # Finalize in-progress events
    _finalize_events(events, frame_number, in_progress_events)


def _ingest_event_label(label, frame_number, in_progress_events):
    if isinstance(label, fol.Classification):
        classifications = [label]
    else:
        classifications = label.classifications

    for classification in classifications:
        event_label = classification.label
        if event_label in in_progress_events:
            start = in_progress_events[event_label][0]
        else:
            start = frame_number

        in_progress_events[event_label] = (start, frame_number)


def _finalize_events(events, frame_number, in_progress_events):
    for event_label in list(in_progress_events.keys()):
        start, last = in_progress_events[event_label]
        if last != frame_number:
            events.append(_make_event(event_label, start, last))
            del in_progress_events[event_label]


# https://docs.scale.com/reference/events
def _make_event(label, start, end):
    if end == start:
        return {
            "label": label,
            "type": "point",
            "start": start,
        }

    return {
        "label": label,
        "type": "range",
        "start": start,
        "end": end,
    }


# https://docs.scale.com/reference/video-playback
def _init_video_box(label):
    return {
        "label": label,
        "geometry": "box",
        "frames": [],
    }


# https://docs.scale.com/reference/video-playback
def _make_video_box_frame(detection, frame_number, frame_size):
    x, y, w, h = detection.bounding_box
    width, height = frame_size
    frame_dict = {
        "key": frame_number,
        "x": round(x * width, 1),
        "y": round(y * height, 1),
        "width": round(w * width, 1),
        "height": round(h * height, 1),
    }

    attributes = _get_attributes(detection)
    if attributes:
        frame_dict["attributes"] = attributes

    return frame_dict


# https://docs.scale.com/reference/global-attributes
def _to_classification(name, label):
    return {name: label.label}


# https://docs.scale.com/reference/attributes-overview
def _get_attributes(label):
    attrs = {}
    for name, value in label.iter_attributes():
        if etau.is_str(value) or etau.is_numeric(value):
            attrs[name] = value
        else:
            msg = "Ignoring unsupported attribute type '%s'" % type(value)
            warnings.warn(msg)

    return attrs


# https://docs.scale.com/reference/boxes
def _to_detections(label, frame_size):
    if isinstance(label, fol.Detections):
        detections = label.detections
    else:
        detections = [label]

    annos = []
    for detection in detections:
        anno = _make_base_anno("box", detection.label)
        anno.update(_make_bbox(detection.bounding_box, frame_size))

        attributes = _get_attributes(detection)
        if attributes:
            anno["attributes"] = attributes

        annos.append(anno)

    return annos


# https://docs.scale.com/reference/polygons
# https://docs.scale.com/reference/line
def _to_polylines(label, frame_size):
    if isinstance(label, fol.Polylines):
        polylines = label.polylines
    else:
        polylines = [label]

    annos = []
    for polyline in polylines:
        type_ = "polygon" if polyline.filled else "line"
        attributes = _get_attributes(polyline)
        for points in polyline.points:
            anno = _make_base_anno(type_, polyline.label)
            anno["vertices"] = [_make_point(p, frame_size) for p in points]
            if attributes:
                anno["attributes"] = attributes

            annos.append(anno)

    return annos


# https://docs.scale.com/reference/points
def _to_points(label, frame_size):
    if isinstance(label, fol.Keypoints):
        keypoints = label.keypoints
    else:
        keypoints = [keypoints]

    annos = []
    for keypoint in keypoints:
        attributes = _get_attributes(keypoint)
        for point in keypoint.points:
            anno = _make_base_anno("point", keypoint.label)
            anno.update(_make_point(point, frame_size))
            if attributes:
                anno["attributes"] = attributes

            annos.append(anno)

    return annos


def _make_base_anno(type_, label):
    return {
        "type": type_,
        "label": label,
        "uuid": str(uuid4()),
    }


def _make_bbox(bounding_box, frame_size):
    x, y, w, h = bounding_box
    width, height = frame_size
    return {
        "left": round(x * width, 1),
        "top": round(y * height, 1),
        "width": round(w * width, 1),
        "height": round(h * height, 1),
    }


def _make_point(point, frame_size):
    x, y = point
    width, height = frame_size
    return {"x": round(x * width, 1), "y": round(y * height, 1)}


def _parse_video_labels(task_labels, metadata):
    anno_dict = task_labels["response"]

    if "annotations" in anno_dict:
        annos = _download_or_load_json(anno_dict["annotations"]["url"])
    else:
        annos = None

    if "events" in anno_dict:
        events = _download_or_load_json(anno_dict["events"]["url"])
    else:
        events = None

    if isinstance(annos, dict):
        return _parse_video_playback_labels(annos, events, metadata)

    task = task_labels.get("task", None)
    return _parse_video_annotation_labels(annos, events, metadata, task=task)


# https://docs.scale.com/reference/general-video-annotation
def _parse_video_annotation_labels(annos, events, metadata, task=None):
    if annos is not None:
        annos = annos.get("annotations", [])
    else:
        annos = []

    frame_numbers = None
    if task is not None:
        try:
            frame_numbers = _get_frame_numbers(task, metadata)
        except:
            pass

    if frame_numbers is None:
        frame_numbers = range(1, len(annos) + 1)

    if len(frame_numbers) != len(annos):
        logger.warning(
            "Unable to determine which frame numbers have labels. You may "
            "need to inspect the labels that are loaded..."
        )

    frame_size = (metadata.frame_width, metadata.frame_height)

    frames = defaultdict(dict)

    # Parse frame labels
    for frame_number, anno_dict in zip(frame_numbers, annos):
        frames[frame_number] = _parse_image_labels(anno_dict, frame_size)

    # Parse events
    if events is not None:
        events = events.get("events", [])
        _parse_video_playback_events(frames, events)

    return frames


def _get_frame_numbers(task, metadata):
    params = task["params"]

    if params["attachment_type"] != "video":
        return None

    frame_rate = metadata.frame_rate

    start_time = params.get("start_time", None)
    if start_time is not None:
        first_frame = 1 + int(round(frame_rate * start_time))
    else:
        first_frame = 1

    duration = params.get("duration_time", None)
    if duration is not None:
        last_frame = 1 + int(round(frame_rate * duration))
    else:
        last_frame = metadata.total_frame_count

    sampling_rate = params.get("frame_rate", frame_rate)
    accel = frame_rate / sampling_rate

    return sorted(
        set(int(round(f)) for f in np.arange(first_frame, last_frame, accel))
    )


# https://docs.scale.com/reference/video-playback
def _parse_video_playback_labels(annos, events, metadata):
    frames = defaultdict(dict)

    # Parse events
    if events is not None:
        events = events.get("events", [])
        _parse_video_playback_events(frames, events)

    # Parse video objects
    if annos is not None:
        annotations = annos.get("annotations", {})
        _parse_video_playback_objects(frames, annotations, metadata)

    return frames


def _parse_video_playback_events(frames, events):
    events_map = defaultdict(list)
    for event in events:
        type_ = event["type"]
        label = event["label"]
        start = event["start"]
        if type_ == "range":
            end = event["end"]
        elif type_ == "point":
            end = start
        else:
            msg = "Ignoring unsupported event type '%s'" % type_
            warnings.warn(msg)
            continue

        attributes = _parse_classifications(event.get("attributes", {}))

        for frame_number in range(start, end + 1):
            events_map[frame_number].append(fol.Classification(label=label))
            if attributes:
                frames[frame_number].update(deepcopy(attributes))

    for frame_number, classifications in events_map.items():
        frames[frame_number]["events"] = fol.Classifications(
            classifications=classifications
        )


def _parse_video_playback_objects(frames, annotations, metadata):
    frame_size = (metadata.frame_width, metadata.frame_height)

    index = 0
    detections_map = defaultdict(list)
    for _, video_obj in annotations.items():
        index += 1
        label = video_obj["label"]
        type_ = video_obj["geometry"]
        if type_ != "box":
            msg = "Ignoring unsupported video annotation geometry '%s'" % type_
            warnings.warn(msg)
            continue

        for frame_dict in video_obj["frames"]:
            frame_number = frame_dict["key"]
            attributes = frame_dict.get("attributes", {})
            bounding_box = _parse_video_bbox(frame_dict, frame_size)
            detection = fol.Detection(
                label=label,
                index=index,
                bounding_box=bounding_box,
                **attributes,
            )
            detections_map[frame_number].append(detection)

    for frame_number, detections in detections_map.items():
        frames[frame_number]["detections"] = fol.Detections(
            detections=detections
        )


# https://docs.scale.com/reference/general-image-annotation
def _parse_image_labels(anno_dict, frame_size):
    labels = {}

    # Parse classifications
    attrs = anno_dict.get("global_attributes", {})
    classifications = _parse_classifications(attrs)
    labels.update(classifications)

    # Parse objects
    objects = _parse_objects(anno_dict, frame_size)
    labels.update(objects)

    return labels


def _parse_classifications(attrs):
    classifications = {}
    for k, v in attrs.items():
        if isinstance(v, list):
            classes = [fol.Classification(label=label) for label in v]
            classifications[k] = fol.Classifications(classifications=classes)
        else:
            classifications[k] = fol.Classification(label=v)
    return classifications


def _parse_objects(anno_dict, frame_size):
    annos = anno_dict.get("annotations", [])

    if isinstance(annos, dict):
        return {"segmentation": _parse_mask(anno_dict)}

    detections = []
    polylines = []
    keypoints = []
    for anno in annos:
        type_ = anno["type"]
        label = anno.get("label", None)  # Scale supports unlabeled tasks

        attributes = anno.get("attributes", {})

        if type_ == "box":
            bounding_box = _parse_bbox(anno, frame_size)
            detections.append(
                fol.Detection(
                    label=label, bounding_box=bounding_box, **attributes
                )
            )
        elif type_ == "polygon":
            points = _parse_points(anno["vertices"], frame_size)
            polylines.append(
                fol.Polyline(
                    label=label,
                    points=[points],
                    closed=True,
                    filled=True,
                    **attributes,
                )
            )
        elif type_ == "line":
            points = _parse_points(anno["vertices"], frame_size)
            polylines.append(
                fol.Polyline(
                    label=label,
                    points=[points],
                    closed=False,
                    filled=False,
                    **attributes,
                )
            )
        elif type_ == "point":
            point = _parse_point(anno, frame_size)
            keypoints.append(
                fol.Keypoint(label=label, points=[point], **attributes)
            )
        else:
            msg = "Ignoring unsupported label type '%s'" % type_
            warnings.warn(msg)

    labels = {}

    if detections:
        labels["detections"] = fol.Detections(detections=detections)

    if polylines:
        labels["polylines"] = fol.Polylines(polylines=polylines)

    if keypoints:
        labels["keypoints"] = fol.Keypoints(keypoints=keypoints)

    return labels


def _parse_bbox(anno, frame_size):
    width, height = frame_size
    x = anno["left"] / width
    y = anno["top"] / height
    w = anno["width"] / width
    h = anno["height"] / height
    return [x, y, w, h]


def _parse_video_bbox(anno, frame_size):
    width, height = frame_size
    x = anno["x"] / width
    y = anno["y"] / height
    w = anno["width"] / width
    h = anno["height"] / height
    return [x, y, w, h]


def _parse_points(vertices, frame_size):
    return [_parse_point(vertex, frame_size) for vertex in vertices]


def _parse_point(vertex, frame_size):
    width, height = frame_size
    return (vertex["x"] / width, vertex["y"] / height)


# https://docs.scale.com/reference/segmentannotation-callback-format
def _parse_mask(anno_dict):
    indexed_image_uri = anno_dict["annotations"]["combined"]["indexedImage"]
    mask = _download_or_load_image(indexed_image_uri)

    segmentation = fol.Segmentation(mask=mask)

    label_mapping = anno_dict.get("labelMapping", None)
    if label_mapping is not None:
        label_map = {}
        for label, value in label_mapping.items():
            if isinstance(value, dict):
                value = [value]

            for instance in value:
                label_map[instance["index"]] = label

        segmentation.label_map = label_map

    return segmentation


def _download_or_load_json(url_or_filepath):
    if url_or_filepath.startswith("http"):
        json_bytes = etaw.download_file(url_or_filepath, quiet=True)
        return etas.load_json(json_bytes)

    return etas.read_json(url_or_filepath)


def _download_or_load_image(url_or_filepath):
    if url_or_filepath.startswith("http"):
        img_bytes = etaw.download_file(url_or_filepath, quiet=True)
        return etai.decode(img_bytes)

    return foui.read(url_or_filepath)
