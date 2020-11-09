"""
Utilities for working with annotations in
`Labelbox format <https://labelbox.com/docs/exporting-data/export-format-detail>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import logging
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
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


#
# @todo
#   Must add support add support for populating `schemaId` when exporting
#   labels in order for model-assisted labeling to work properly
#
#   cf https://labelbox.com/docs/automation/model-assisted-labeling
#


def import_from_labelbox(
    dataset,
    labelbox_project_or_json_path,
    label_prefix=None,
    download_dir=None,
    labelbox_id_field="labelbox_id",
):
    """Imports the labels from the Labelbox project into the FiftyOne dataset.

    The ``labelbox_id_field`` of the FiftyOne samples are used to associate the
    corresponding Labelbox labels. Any Labelbox IDs with no matching FiftyOne
    sample are added to the FiftyOne dataset, and their media is downloaded
    into ``download_dir``.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        labelbox_project_or_json_path: a ``labelbox.schema.project.Project`` or
            the path to the JSON export of a Labelbox project on disk
        label_prefix (None): a prefix to prepend to the sample label field(s)
        download_dir (None): a directory into which to download the media for
            any Labelbox IDs with no corresponding sample with the matching
            ``labelbox_id_field`` value. This can be omitted if all IDs are
            already present or you do not wish to download media and add new
            samples
        labelbox_id_field ("labelbox_id"): the sample field to lookup/store the
            IDs of the Labelbox DataRows
    """
    # Load labels
    if etau.is_str(labelbox_project_or_json_path):
        # Load JSON export from disk
        d_list = etas.load_json(labelbox_project_or_json_path)
    else:
        # Download project export from Labelbox
        logger.info("Downloading Labelbox export...")
        export_url = labelbox_project_or_json_path.export_labels()
        d_list = etas.load_json(etaw.download_file(export_url))

    if download_dir:
        filename_maker = fou.UniqueFilenameMaker(output_dir=download_dir)

    id_map = {}
    for sample in dataset.select_fields(labelbox_id_field):
        id_map[sample[labelbox_id_field]] = sample.id

    if label_prefix:
        label_key = lambda k: label_prefix + "_" + k
    else:
        label_key = lambda k: k

    is_video = dataset.media_type == fomm.VIDEO

    # ref: https://github.com/Labelbox/labelbox/blob/7c79b76310fa867dd38077e83a0852a259564da1/exporters/coco-exporter/coco_exporter.py#L33
    with fou.ProgressBar() as pb:
        for d in pb(d_list):
            labelbox_id = d["ID"]

            if labelbox_id in id_map:
                # Get existing sample
                sample = dataset[id_map[labelbox_id]]
            elif download_dir:
                # Download image and create new sample
                # @todo optimize by downloading images in a background thread
                # pool?
                image_url = d["Labeled Data"]
                filepath = filename_maker.get_output_path(image_url)
                etaw.download_file(image_url, path=filepath, quiet=True)
                sample = fos.Sample(filepath=filepath)
                dataset.add_sample(sample)
            else:
                logger.info(
                    "Skipping labels for unknown Labelbox ID '%s'; provide a "
                    "`download_dir` if you wish to download media and create "
                    "samples for new media",
                    labelbox_id,
                )
                continue

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
                frame_size = (
                    sample.metadata.frame_width,
                    sample.metadata.frame_height,
                )
                frames = _parse_video_labels(d["Label"], frame_size)
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
                labels_dict = _parse_image_labels(d["Label"], frame_size)
                sample.update_fields(
                    {label_key(k): v for k, v in labels_dict.items()}
                )

            sample.save()


def upload_media_to_labelbox(
    samples, labelbox_dataset, labelbox_id_field="labelbox_id"
):
    """Uploads the raw media for the FiftyOne samples to Labelbox.

    The IDs of the Labelbox DataRows that are created are stored in the
    ``labelbox_id_field`` of the samples.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        labelbox_dataset: a ``labelbox.schema.dataset.Dataset`` to which to
            add the media
        labelbox_id_field ("labelbox_id"): the sample field in which to store
            the IDs of the Labelbox DataRows
    """
    # @todo use `create_data_rows()` to optimize performance
    # @todo handle API rate limits
    # Reference: https://labelbox.com/docs/python-api/data-rows
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            try:
                has_id = sample[labelbox_id_field] is not None
            except:
                has_id = False

            if has_id:
                logger.warning(
                    "Skipping sample '%s' with an existing '%s' value",
                    sample.id,
                    labelbox_id_field,
                )
                continue

            filepath = sample.filepath
            data_row = labelbox_dataset.create_data_row(row_data=filepath)
            sample[labelbox_id_field] = data_row.uid
            sample.save()


def export_to_labelbox(
    sample_collection,
    labelbox_project_or_json_path,
    labelbox_id_field="labelbox_id",
    label_field=None,
    label_prefix=None,
    labels_dict=None,
    frame_labels_field=None,
    frame_labels_prefix=None,
    frame_labels_dict=None,
):
    """Exports labels from the FiftyOne samples to Labelbox.

    This function is useful for loading predictions into Labelbox for
    `model-assisted labeling <https://labelbox.com/docs/automation/model-assisted-labeling>`_.

    The IDs of the Labelbox DataRows corresponding to each sample must be
    stored in the ``labelbox_id_field`` of the samples. Any samples with no
    value in ``labelbox_id_field`` will be skipped.

    You can use :meth:`upload_media_to_labelbox` to upload sample media to
    Labelbox and populate the ``labelbox_id_field`` field, if necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        labelbox_project_or_json_path: a ``labelbox.schema.project.Project`` or
            the path to write an NDJSON export of the labels
        labelbox_id_field ("labelbox_id"): the sample field to lookup/store the
            IDs of the Labelbox DataRows
        label_field (None): the name of a label field to export
        label_prefix (None): a label field prefix; all fields whose name starts
            with the given prefix will be exported
        labels_dict (None): a dictionary mapping label field names to keys; all
            fields whose names are in this dictionary will be exported
        frame_labels_field (None): the name of a frame labels field to export
        frame_labels_prefix (None): a frame labels field prefix; all
            frame-level fields whose name starts with the given prefix will be
            exported
        frame_labels_dict (None): a dictionary mapping frame label fields to
            keys; all frame-level fields whose names are in this dictionary
            will be exported
    """
    # Build callback to export labels
    if etau.is_str(labelbox_project_or_json_path):
        # Append to NDJSON on disk
        json_path = labelbox_project_or_json_path
        etau.ensure_empty_file(json_path)

        def flush_fcn(annos):
            etas.write_ndjson(annos, json_path, append=True)

    else:
        # Upload to Labelbox server
        project = labelbox_project_or_json_path
        uploads = {"count": 0}

        def flush_fcn(annos):
            uploads["count"] += 1
            name = "%s-upload-request-%d" % (
                sample_collection.name,
                uploads["count"],
            )
            project.upload_annotations(name, annos)

    is_video = sample_collection.media_type == fomm.VIDEO

    # Get label fields to export
    label_fields = foc.get_label_fields(
        sample_collection,
        label_field=label_field,
        label_prefix=label_prefix,
        labels_dict=labels_dict,
        required=False,
        force_dict=True,
    )

    # Get frame label fields to export
    if is_video:
        frame_label_fields = foc.get_frame_labels_fields(
            sample_collection,
            frame_labels_field=frame_labels_field,
            frame_labels_prefix=frame_labels_prefix,
            frame_labels_dict=frame_labels_dict,
            required=False,
            force_dict=True,
        )

    # Export the labels
    annos = []
    with fou.ProgressBar() as pb:
        for sample in pb(sample_collection):
            labelbox_id = sample[labelbox_id_field]
            if labelbox_id is None:
                logger.warning(
                    "Skipping sample '%d' with no '%s' value",
                    sample.id,
                    labelbox_id_field,
                )
                continue

            # Compute metadata if necessary
            if sample.metadata is None:
                if is_video:
                    metadata = fom.VideoMetadata.build_for(sample.filepath)
                else:
                    metadata = fom.ImageMetadata.build_for(sample.filepath)

                sample.metadata = metadata
                sample.save()

            # Get frame size
            if is_video:
                frame_size = (
                    sample.metadata.frame_width,
                    sample.metadata.frame_height,
                )
            else:
                frame_size = (sample.metadata.width, sample.metadata.height)

            # Export sample-level labels
            if label_fields:
                labels_dict = _get_labels(sample, label_fields)
                sample_annos = _to_labelbox_image_labels(
                    labels_dict, frame_size, labelbox_id
                )
                annos.extend(sample_annos)

            # Export frame-level labels
            if is_video and frame_label_fields:
                frames = _get_frame_labels(sample, frame_label_fields)
                sample_annos = _to_labelbox_video_labels(
                    frames, frame_size, labelbox_id
                )
                flush_fcn(sample_annos)

            if len(annos) >= 1000:
                flush_fcn(annos)
                annos = []

    if annos:
        flush_fcn(annos)


def convert_labelbox_export_to_import(inpath, outpath):
    """Converts a Labelbox NDJSON export generated by
    :meth:`export_to_labelbox` into the format expected by
    :meth:`import_from_labelbox`.

    The output JSON file will have the same format that is generated when
    `exporting a Labelbox project's labels <https://labelbox.com/docs/exporting-data/export-overview>`_.

    The ``"Labeled Data"`` fields of the output labels will be ``None``.

    Args:
        inpath: the path to an NDJSON file generated (for example) by
            :meth:`export_to_labelbox`
        outpath: the path to write a JSON file containing the converted labels
    """
    din_list = etas.read_ndjson(inpath)

    dout_map = {}

    for din in din_list:
        uuid = din.pop("dataRow")["id"]
        if uuid not in dout_map:
            dout_map[uuid] = {
                "ID": uuid,
                "Labeled Data": None,
                "Label": {"objects": [], "classifications": [],},
            }

        dout = dout_map[uuid]

        din.pop("uuid")
        if any(k in din for k in ("bbox", "polygon", "line", "point", "mask")):
            # Object
            if "mask" in din:
                din["instanceURI"] = din.pop("mask")["instanceURI"]

            dout["Label"]["objects"].append(din)
        else:
            # Classification
            dout["Label"]["classifications"].append(din)

    dout = list(dout_map.values())
    etas.write_json(dout, outpath)


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


def _to_labelbox_image_labels(labels_dict, frame_size, data_row_id):
    annotations = []
    for name, label in labels_dict.items():
        if isinstance(label, (fol.Classification, fol.Classifications)):
            anno = _to_global_classification(name, label, data_row_id)
            annotations.append(anno)
        elif isinstance(label, (fol.Detection, fol.Detections)):
            annos = _to_detections(label, frame_size, data_row_id)
            annotations.extend(annos)
        elif isinstance(label, (fol.Polyline, fol.Polylines)):
            annos = _to_polylines(label, frame_size, data_row_id)
            annotations.extend(annos)
        elif isinstance(label, (fol.Keypoint, fol.Keypoints)):
            annos = _to_points(label, frame_size, data_row_id)
            annotations.extend(annos)
        elif isinstance(label, fol.Segmentation):
            annos = _to_mask(name, label, data_row_id)
            annotations.extend(annos)
        elif label is not None:
            msg = "Ignoring unsupported label type '%s'" % label.__class__
            warnings.warn(msg)

    return annotations


def _to_labelbox_video_labels(frames, frame_size, data_row_id):
    annotations = []
    for frame_number, labels_dict in frames.items():
        frame_annos = _to_labelbox_image_labels(
            labels_dict, frame_size, data_row_id
        )
        for anno in frame_annos:
            anno["frameNumber"] = frame_number
            annotations.append(anno)

    return annotations


# https://labelbox.com/docs/exporting-data/export-format-detail#classification
def _to_global_classification(name, label, data_row_id):
    anno = _make_base_anno(name, data_row_id=data_row_id)
    anno.update(_make_classification_answer(label))
    return anno


# https://labelbox.com/docs/exporting-data/export-format-detail#nested_classification
def _to_nested_classifications(attributes):
    classifications = []
    for name, attr in attributes.items():
        if not isinstance(attr, (fol.CategoricalAttribute, fol.ListAttribute)):
            msg = "Ignoring unsupported attribute type '%s'" % attr.__class__
            warnings.warn(msg)
            continue

        anno = _make_base_anno(name)
        anno.update(_make_classification_answer(attr))
        classifications.append(anno)

    return classifications


# https://labelbox.com/docs/automation/model-assisted-labeling#mask_annotations
def _to_mask(name, label, data_row_id):
    mask = np.asarray(label.mask)
    if mask.ndim < 3 or mask.dtype != np.uint8:
        raise ValueError(
            "Segmentation masks must be stored as RGB color uint8 images"
        )

    try:
        instance_uri = label.instance_uri
    except:
        raise ValueError(
            "You must populate the `instance_uri` field of segmentation masks"
        )

    # Get unique colors
    colors = np.unique(np.reshape(mask, (-1, 3)), axis=0).tolist()

    annos = []
    base_anno = _make_base_anno(name, data_row_id=data_row_id)
    for color in colors:
        anno = copy(base_anno)
        anno["mask"] = _make_mask(instance_uri, color)
        annos.append(anno)

    return annos


# https://labelbox.com/docs/exporting-data/export-format-detail#bounding_boxes
def _to_detections(label, frame_size, data_row_id):
    if isinstance(label, fol.Detections):
        detections = label.detections
    else:
        detections = [label]

    annos = []
    for detection in detections:
        anno = _make_base_anno(detection.label, data_row_id=data_row_id)
        anno["bbox"] = _make_bbox(detection.bounding_box, frame_size)
        if detection.attributes:
            anno["classifications"] = _to_nested_classifications(
                detection.attributes
            )

        annos.append(anno)

    return annos


# https://labelbox.com/docs/exporting-data/export-format-detail#polygons
# https://labelbox.com/docs/exporting-data/export-format-detail#polylines
def _to_polylines(label, frame_size, data_row_id):
    if isinstance(label, fol.Polylines):
        polylines = label.polylines
    else:
        polylines = [label]

    annos = []
    for polyline in polylines:
        field = "polygon" if polyline.filled else "line"
        if polyline.attributes:
            classifications = _to_nested_classifications(polyline.attributes)
        else:
            classifications = None

        for points in polyline.points:
            anno = _make_base_anno(polyline.label, data_row_id=data_row_id)
            anno[field] = [_make_point(point, frame_size) for point in points]
            if classifications is not None:
                anno["classifications"] = classifications

            annos.append(anno)

    return annos


# https://labelbox.com/docs/exporting-data/export-format-detail#points
def _to_points(label, frame_size, data_row_id):
    if isinstance(label, fol.Keypoints):
        keypoints = label.keypoints
    else:
        keypoints = [keypoints]

    annos = []
    for keypoint in keypoints:
        if keypoint.attributes:
            classifications = _to_nested_classifications(keypoint.attributes)
        else:
            classifications = None

        for point in keypoint.points:
            anno = _make_base_anno(keypoint.label, data_row_id=data_row_id)
            anno["point"] = _make_point(point, frame_size)
            if classifications is not None:
                anno["classifications"] = classifications

            annos.append(anno)

    return annos


def _make_base_anno(value, data_row_id=None):
    anno = {
        "uuid": str(uuid4()),
        "schemaId": None,
        "title": value,
        "value": value,
    }

    if data_row_id:
        anno["dataRow"] = {"id": data_row_id}

    return anno


def _make_classification_answer(label):
    if isinstance(label, fol.Classification):
        # Assume free text
        return {"answer": label.label}

    if isinstance(label, fol.Classifications):
        # Assume checklist
        answers = []
        for classification in label.classifications:
            answers.append({"value": classification.label})

        return {"answers": answers}

    if isinstance(label, fol.CategoricalAttribute):
        # Assume free text
        return {"answer": label.value}

    if isinstance(label, fol.ListAttribute):
        # Assume checklist
        answers = []
        for value in label.value:
            answers.append({"value": value})

        return {"answers": answers}

    raise ValueError("Cannot convert %s to a classification" % label.__class__)


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


def _make_mask(instance_uri, color):
    return {
        "instanceURI": instance_uri,
        "colorRGB": list(color),
    }


# https://labelbox.com/docs/exporting-data/export-format-detail#video
def _parse_video_labels(nd_labels_json_or_path, frame_size):
    if etau.is_str(nd_labels_json_or_path):
        label_d_list = etas.read_ndjson(nd_labels_json_or_path)
    else:
        label_d_list = nd_labels_json_or_path

    frames = {}
    for label_d in label_d_list:
        frame_number = label_d["frameNumber"]
        frames[frame_number] = _parse_image_labels(label_d, frame_size)

    return frames


# https://labelbox.com/docs/exporting-data/export-format-detail#images
def _parse_image_labels(label_d, frame_size):
    labels = {}

    # Parse classifications
    cd_list = label_d.get("classifications", [])
    classifications = _parse_classifications(cd_list)
    labels.update(classifications)

    # Parse objects
    # @todo what if `objects.keys()` conflicts with `classifications.keys()`?
    od_list = label_d.get("objects", [])
    objects = _parse_objects(od_list, frame_size)
    labels.update(objects)

    return labels


def _parse_classifications(cd_list):
    labels = {}

    for cd in cd_list:
        name = cd["value"]
        if "answer" in cd:
            answer = cd["answer"]
            if isinstance(answer, list):
                # Dropdown
                labels[name] = fol.Classifications(
                    classifications=[
                        fol.Classification(label=a["value"]) for a in answer
                    ]
                )
            elif isinstance(answer, dict):
                # Radio question
                labels[name] = fol.Classification(label=answer["value"])
            else:
                # Free text
                labels[name] = fol.Classification(label=answer)

        if "answers" in cd:
            # Checklist
            answers = cd["answers"]
            labels[name] = fol.Classifications(
                classifications=[
                    fol.Classification(label=a["value"]) for a in answers
                ]
            )

    return labels


def _parse_attributes(cd_list):
    attributes = {}

    for cd in cd_list:
        name = cd["value"]
        if "answer" in cd:
            answer = cd["answer"]
            if isinstance(answer, list):
                # Dropdown
                attributes[name] = fol.ListAttribute(
                    value=[a["value"] for a in answer]
                )
            elif isinstance(answer, dict):
                # Radio question
                attributes[name] = fol.CategoricalAttribute(
                    value=answer["value"]
                )
            else:
                # Free text
                attributes[name] = fol.CategoricalAttribute(value=answer)

        if "answers" in cd:
            # Checklist
            answers = cd["answers"]
            attributes[name] = fol.ListAttribute(
                value=[a["value"] for a in answers]
            )

    return attributes


def _parse_objects(od_list, frame_size):
    detections = []
    polylines = []
    keypoints = []
    mask = None
    mask_instance_uri = None
    for od in od_list:
        label = od["value"]
        attributes = _parse_attributes(od.get("classifications", []))

        if "bbox" in od:
            # Detection
            bounding_box = _parse_bbox(od["bbox"], frame_size)
            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    attributes=attributes,
                )
            )
        elif "polygon" in od:
            # Polyline
            points = _parse_points(od["polygon"], frame_size)
            polylines.append(
                fol.Polyline(
                    label=label,
                    points=[points],
                    closed=True,
                    filled=True,
                    attributes=attributes,
                )
            )
        elif "line" in od:
            # Polyline
            points = _parse_points(od["line"], frame_size)
            polylines.append(
                fol.Polyline(
                    label=label,
                    points=[points],
                    closed=True,
                    filled=False,
                    attributes=attributes,
                )
            )
        elif "point" in od:
            # Polyline
            point = _parse_point(od["point"], frame_size)
            keypoints.append(
                fol.Keypoint(
                    label=label, points=[point], attributes=attributes,
                )
            )
        elif "instanceURI" in od:
            # Segmentation mask
            if mask is None:
                mask_instance_uri = od["instanceURI"]
                mask = _parse_mask(mask_instance_uri)
            elif od["instanceURI"] != mask_instance_uri:
                msg = (
                    "Only one segmentation mask per image/frame is allowed; "
                    "skipping additional mask(s)"
                )
                warnings.warn(msg)
        else:
            msg = "Ignoring unsupported label"
            warnings.warn(msg)

    labels = {}

    if detections:
        labels["detections"] = fol.Detections(detections=detections)

    if polylines:
        labels["polylines"] = fol.Polylines(polylines=polylines)

    if keypoints:
        labels["keypoints"] = fol.Keypoints(keypoints=keypoints)

    if mask is not None:
        labels["segmentation"] = mask

    return labels


def _parse_bbox(bd, frame_size):
    width, height = frame_size
    x = bd["left"] / width
    y = bd["top"] / height
    w = bd["width"] / width
    h = bd["height"] / height
    return [x, y, w, h]


def _parse_points(pd_list, frame_size):
    return [_parse_point(pd, frame_size) for pd in pd_list]


def _parse_point(pd, frame_size):
    width, height = frame_size
    return (pd["x"] / width, pd["y"] / height)


def _parse_mask(instance_uri):
    img_bytes = etaw.download_file(instance_uri, quiet=True)
    return etai.decode(img_bytes)
