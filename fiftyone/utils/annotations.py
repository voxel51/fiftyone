"""
Annotation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import getpass
import logging

import eta.core.annotations as etaa
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.annotation as foa
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.patches as fop
import fiftyone.core.utils as fou
import fiftyone.core.video as fov


logger = logging.getLogger(__name__)


def annotate(
    samples,
    anno_key,
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=True,
    media_field="filepath",
    backend=None,
    launch_editor=False,
    **kwargs,
):
    """Exports the samples and optional label field(s) to the given
    annotation backend.

    The ``backend`` parameter controls which annotation backend to use.
    Depending on the backend you use, you may want/need to provide extra
    keyword arguments to this function for the constructor of the backend's
    :class:`AnnotationBackendConfig` class.

    The natively provided backends and their associated config classes are:

    -   ``"cvat"``: :class:`fiftyone.utils.cvat.CVATBackendConfig`

    See :ref:`this page <requesting-annotations>` for more information about
    using this method, including how to define label schemas and how to
    configure login credentials for your annotation provider.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        anno_key: a string key to use to refer to this annotation run
        label_schema (None): a dictionary defining the label schema to use.
            If this argument is provided, it takes precedence over the other
            schema-related arguments
        label_field (None): a string indicating a new or existing label field
            to annotate
        label_type (None): a string or type indicating the type of labels to
            annotate. The possible label strings/types are:

            -   ``"classification"``: :class:`fiftyone.core.labels.Classification`
            -   ``"classifications"``: :class:`fiftyone.core.labels.Classifications`
            -   ``"detection"``: :class:`fiftyone.core.labels.Detection`
            -   ``"detections"``: :class:`fiftyone.core.labels.Detections`
            -   ``"segmentation"``: :class:`fiftyone.core.labels.Detection`
            -   ``"segmentations"``: :class:`fiftyone.core.labels.Detections`
            -   ``"semantic_segmentation"``: :class:`fiftyone.core.labels.Segmentation`
            -   ``"polyline"``: :class:`fiftyone.core.labels.Polyline`
            -   ``"polylines"``: :class:`fiftyone.core.labels.Polylines`
            -   ``"keypoint"``: :class:`fiftyone.core.labels.Keypoint`
            -   ``"keypoints"``: :class:`fiftyone.core.labels.Keypoints`

            You can also specify ``"scalar"`` for a primitive scalar field or
            pass any of the supported scalar field types:

            -   :class:`fiftyone.core.fields.IntField`
            -   :class:`fiftyone.core.fields.FloatField`
            -   :class:`fiftyone.core.fields.StringField`
            -   :class:`fiftyone.core.fields.BooleanField`

            All new label fields must have their type specified via this
            argument or in ``label_schema``. Note that annotation backends may
            not support all label types
        classes (None): a list of strings indicating the class options for
            ``label_field`` or all fields in ``label_schema`` without classes
            specified. All new label fields must have a class list provided via
            one of the supported methods. For existing label fields, if classes
            are not provided by this argument nor ``label_schema``, they are
            parsed from :meth:`fiftyone.core.dataset.Dataset.classes` or
            :meth:`fiftyone.core.dataset.Dataset.default_classes`
        attributes (True): specifies the label attributes of each label
            field to include (other than their ``label``, which is always
            included) in the annotation export. Can be any of the
            following:

            -   ``True``: export all label attributes
            -   ``False``: don't export any custom label attributes
            -   an attribute or list of attributes to export
            -   a dict mapping attribute names to dicts specifying the details
                of the attribute field

            If provided, this parameter will apply to all label fields in
            ``label_schema`` that do not define their attributes
        media_field ("filepath"): the field containing the paths to the
            media files to upload
        backend (None): the annotation backend to use. The supported values are
            ``fiftyone.annotation_config.backends.keys()`` and the default
            is ``fiftyone.annotation_config.default_backend``
        launch_editor (False): whether to launch the annotation backend's
            editor after uploading the samples
        **kwargs: keyword arguments for the :class:`AnnotationBackendConfig`
            subclass of the backend being used

    Returns:
        an :class:`AnnnotationResults`
    """
    # @todo support this?
    if isinstance(samples, fov.FramesView):
        raise ValueError("Annotating frames views is not supported")

    # Convert to equivalent regular view containing the same labels
    if isinstance(samples, (fop.PatchesView, fop.EvaluationPatchesView)):
        ids = _get_patches_view_label_ids(samples)
        samples = samples._root_dataset.select_labels(
            ids=ids, fields=samples._label_fields,
        )

    if not samples:
        raise ValueError(
            "%s is empty; there is nothing to annotate"
            % samples.__class__.__name__
        )

    config = _parse_config(backend, None, media_field, **kwargs)

    anno_backend = config.build()

    config.label_schema = _build_label_schema(
        samples,
        anno_backend,
        label_schema=label_schema,
        label_field=label_field,
        label_type=label_type,
        classes=classes,
        attributes=attributes,
    )

    # Don't allow overwriting an existing run with same `anno_key`
    anno_backend.register_run(samples, anno_key, overwrite=False)

    samples = _filter_segmentations(samples, config.label_schema)

    results = anno_backend.upload_annotations(
        samples, launch_editor=launch_editor
    )

    anno_backend.save_run_results(samples, anno_key, results)

    return results


def _filter_segmentations(samples, label_schema):
    """Ignore detections with masks for "detections" type and ignore detections
    without masks for "segmentations" type
    """
    for label_field, label_info in label_schema.items():
        if not label_info["existing_field"]:
            continue

        label_type = label_info["type"]
        if label_type in [
            "segmentation",
            "segmentations",
            "detection",
            "detections",
        ]:
            any_masks, only_masks = _check_for_masks(samples, label_field)

            if label_type in ["segmentation", "segmentations"]:
                expression = F("mask").exists()
            else:
                expression = ~(F("mask").exists())

            samples = samples.filter_labels(
                label_field, expression, only_matches=False
            )

    return samples


def _get_patches_view_label_ids(patches_view):
    ids = []
    for field in patches_view._label_fields:
        _, id_path = patches_view._get_label_field_path(field, "id")
        ids.extend(patches_view.values(id_path, unwind=True))

    return ids


def _parse_config(name, label_schema, media_field, **kwargs):
    if name is None:
        name = fo.annotation_config.default_backend

    backends = fo.annotation_config.backends

    if name not in backends:
        raise ValueError(
            "Unsupported backend '%s'. The available backends are %s"
            % (name, sorted(backends.keys()))
        )

    params = deepcopy(backends[name])

    config_cls = kwargs.pop("config_cls", None)

    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError("Annotation backend '%s' has no `config_cls`" % name)

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(name, label_schema, media_field=media_field, **params)


# The supported label field types and their string names
_LABEL_TYPES_MAP = {
    "classification": fol.Classification,
    "classifications": fol.Classifications,
    "detection": fol.Detection,
    "detections": fol.Detections,
    "segmentation": fol.Detection,
    "segmentations": fol.Detections,
    "_segmentation_and_detection": fol.Detection,
    "_segmentations_and_detections": fol.Detections,
    "semantic_segmentation": fol.Segmentation,
    "keypoint": fol.Keypoint,
    "keypoints": fol.Keypoints,
    "polyline": fol.Polyline,
    "polylines": fol.Polylines,
}

_LABEL_TYPES_MAP_REV = {
    fol.Classification: "classification",
    fol.Classifications: "classifications",
    fol.Detection: "detection",
    fol.Detections: "detections",
    fol.Segmentation: "semantic_segmentation",
    fol.Keypoint: "keypoint",
    fol.Keypoints: "keypoints",
    fol.Polyline: "polyline",
    fol.Polylines: "polylines",
}

# The label fields that are *always* annotated
_DEFAULT_LABEL_FIELDS_MAP = {
    fol.Classification: ["label"],
    fol.Detection: ["label", "bounding_box", "index", "mask"],
    fol.Polyline: ["label", "points", "index"],
    fol.Keypoint: ["label", "points", "index"],
    fol.Segmentation: ["mask"],
}

# The supported scalar field types
_SCALAR_TYPES = {
    fof.IntField,
    fof.FloatField,
    fof.StringField,
    fof.BooleanField,
}


def _build_label_schema(
    samples,
    backend,
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=None,
):
    if label_schema is None and label_field is None:
        raise ValueError("Either `label_schema` or `label_field` is required")

    if label_schema is None:
        label_schema = _init_label_schema(
            label_field, label_type, classes, attributes
        )
    elif isinstance(label_schema, list):
        label_schema = {lf: {} for lf in label_schema}

    _label_schema = {}

    for _label_field, _label_info in label_schema.items():
        _label_type, _existing_field = _get_label_type(
            samples, backend, label_type, _label_field, _label_info
        )

        _classes = _get_classes(
            samples,
            classes,
            _label_field,
            _label_info,
            _existing_field,
            _label_type,
        )

        if label_type == "semantic_segmentation" and len(_classes) > 255:
            raise ValueError(
                "Only 255 classes are allowed for "
                "`semantic_segmentation` annotations in order to store "
                "uint8 masks. Found %d classes." % len(_classes)
            )

        if _label_type != "scalar":
            _attributes = _get_attributes(
                samples,
                backend,
                attributes,
                _label_field,
                _label_info,
                _existing_field,
                _label_type,
            )
        else:
            _attributes = {}

        _label_schema[_label_field] = {
            "type": _label_type,
            "classes": _classes,
            "attributes": _attributes,
            "existing_field": _existing_field,
        }

    return _label_schema


def _init_label_schema(label_field, label_type, classes, attributes):
    d = {}

    if label_type is not None:
        d["type"] = label_type

    if classes is not None:
        d["classes"] = classes

    if attributes not in (True, False, None):
        d["attributes"] = attributes

    return {label_field: d}


def _get_label_type(samples, backend, label_type, label_field, label_info):
    if "type" in label_info:
        label_type = label_info["type"]

    if etau.is_str(label_type):
        # Convert strings to lowercase
        label_type = label_type.lower()
    elif label_type in _LABEL_TYPES_MAP_REV:
        # Allow `Label` types to be directly provided
        label_type = _LABEL_TYPES_MAP_REV[label_type]
    elif label_type in _SCALAR_TYPES:
        # Allow scalar `Field` types to be directly provided
        label_type = "scalar"
    elif label_type is not None:
        raise ValueError(
            "Field '%s' has unsupported label type %s. The supported label "
            "types are %s and the supported scalar types are %s"
            % (label_field, label_type, _LABEL_TYPES_MAP, _SCALAR_TYPES)
        )

    field, is_frame_field = samples._handle_frame_field(label_field)
    if is_frame_field:
        schema = samples.get_frame_field_schema()
    else:
        schema = samples.get_field_schema()

    if field in schema:
        _existing_type = _get_existing_label_type(
            samples, backend, label_field, schema[field], label_type
        )

        if label_type is not None and _existing_type != label_type:
            raise ValueError(
                "Manually reported label type '%s' for existing field '%s' "
                "does not match its actual type '%s'"
                % (label_type, label_field, _existing_type)
            )

        return _existing_type, True

    if label_type is None:
        raise ValueError(
            "You must specify a type for new label field '%s'" % label_field
        )

    if label_type == "scalar":
        return label_type, False

    if label_type not in _LABEL_TYPES_MAP:
        raise ValueError(
            "Field '%s' has unsupported label type '%s'. The supported label "
            "types are %s"
            % (label_field, label_type, sorted(_LABEL_TYPES_MAP.keys()))
        )

    fo_label_type = _LABEL_TYPES_MAP[label_type]
    if fo_label_type not in backend.supported_label_types:
        raise ValueError(
            "Field '%s' has unsupported label type %s. The '%s' backend "
            "supports %s"
            % (
                label_field,
                fo_label_type,
                backend.config.name,
                backend.supported_label_types,
            )
        )

    return label_type, False


def _get_existing_label_type(
    samples, backend, label_field, field_type, user_specified_type
):
    if isinstance(field_type, fof.EmbeddedDocumentField):
        fo_label_type = field_type.document_type

        if fo_label_type not in backend.supported_label_types:
            raise ValueError(
                "Existing field '%s' has unsupported label type %s. The '%s' "
                "backend supports %s"
                % (
                    label_field,
                    fo_label_type,
                    backend.config.name,
                    backend.supported_label_types,
                )
            )

        label_type = _LABEL_TYPES_MAP_REV[fo_label_type]
        if label_type in ("detection", "detections"):
            # Decide how to split up bounding boxes and masks for this field

            if user_specified_type in [
                "segmentation",
                "segmentations",
                "detection",
                "detections",
            ]:
                # If user provided a type, use that only
                return user_specified_type

            if label_type == "detection":
                seg_type = "segmentation"
                seg_and_det_type = "_segmentation_and_detection"
            else:
                seg_type = "segmentations"
                seg_and_det_type = "_segmentations_and_detections"

            any_masks, only_masks = _check_for_masks(samples, label_field)
            if not any_masks:
                # If only boxes exists, then only annotate detections
                return label_type
            elif only_masks:
                # If only masks exist, then only annotate segmentations
                return seg_type
            else:
                # If both exist, then annotate both
                return seg_and_det_type
        else:
            return label_type

    if type(field_type) not in backend.supported_scalar_types:
        raise TypeError(
            "Existing field '%s' has unsupported type %s. The '%s' backend "
            "supports label types %s and scalar types %s"
            % (
                label_field,
                field_type,
                backend.config.name,
                backend.supported_label_types,
                backend.supported_scalar_types,
            )
        )

    return "scalar"


def _get_classes(
    samples, classes, label_field, label_info, existing_field, label_type
):
    if label_type == "semantic_segmentation":
        # Allow access to any number 1-255
        # @todo incorporate mask_targets into schema
        if classes or "classes" in label_info:
            logger.info(
                "`Segmentation` field classes are currently only specified "
                "through `Dataset.default_mask_targets`, using integers as "
                "classes"
            )
        return [str(i) for i in range(1, 256)]

    if "classes" in label_info:
        return label_info["classes"]

    if classes:
        return classes

    if label_type == "scalar":
        return []

    if not existing_field:
        raise ValueError(
            "You must provide a class list for new label field '%s'"
            % label_field
        )

    if label_field in samples.classes:
        return samples.classes[label_field]

    if samples.default_classes:
        return samples.default_classes

    _, label_path = samples._get_label_field_path(label_field, "label")
    return samples._dataset.distinct(label_path)


def _get_attributes(
    samples,
    backend,
    attributes,
    label_field,
    label_info,
    existing_field,
    label_type,
):
    if "attributes" in label_info:
        attributes = label_info["attributes"]

    if attributes in [True, False, None]:
        if label_type == "scalar":
            attributes = {}
        elif existing_field and attributes == True:
            attributes = _get_label_attributes(samples, backend, label_field)
        else:
            attributes = {}

    return _format_attributes(backend, attributes)


def _get_label_attributes(samples, backend, label_field):
    _, label_path = samples._get_label_field_path(label_field)
    labels = samples.values(label_path, unwind=True)

    attributes = {}
    for label in labels:
        if label is not None:
            for name, _ in label.iter_attributes():
                if name not in attributes:
                    attributes[name] = {"type": backend.default_attr_type}

    return attributes


def _format_attributes(backend, attributes):
    if etau.is_str(attributes):
        attributes = [attributes]

    if isinstance(attributes, list):
        attributes = {a: {} for a in attributes}

    output_attrs = {}
    for attr, attr_info in attributes.items():
        formatted_info = {}

        attr_type = attr_info.get("type", None)
        values = attr_info.get("values", None)
        default = attr_info.get("default", None)
        mutable = attr_info.get("mutable", True)

        if attr_type is None:
            if values is None:
                formatted_info["type"] = backend.default_attr_type
            else:
                formatted_info["type"] = backend.default_categorical_attr_type
                formatted_info["values"] = values
                if default not in (None, "") and default in values:
                    formatted_info["default"] = default
        else:
            if attr_type in backend.supported_attr_types:
                formatted_info["type"] = attr_type
            else:
                raise ValueError(
                    "Attribute '%s' has unsupported type '%s'. The '%s' "
                    "backend supports types %s"
                    % (
                        attr,
                        attr_type,
                        backend.config.name,
                        backend.supported_attr_types,
                    )
                )

            if values is not None:
                formatted_info["values"] = values
            elif backend.requires_attr_values(attr_type):
                raise ValueError(
                    "Attribute '%s' of type '%s' requires a list of values"
                    % (attr, attr_type)
                )

            if default not in (None, ""):
                if values is not None and default not in values:
                    raise ValueError(
                        "Default value '%s' for attribute '%s' does not "
                        "appear in the list of values %s"
                        % (default, attr, values)
                    )

                formatted_info["default"] = default

        formatted_info["mutable"] = mutable
        output_attrs[attr] = formatted_info

    return output_attrs


def load_annotations(
    samples, anno_key, skip_unexpected=False, cleanup=False, **kwargs
):
    """Downloads the labels from the given annotation run from the annotation
    backend and merges them into the collection.

    See :ref:`this page <loading-annotations>` for more information about
    using this method to import annotations that you have scheduled by calling
    :func:`annotate`.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        anno_key: an annotation key
        skip_unexpected (False): whether to skip any unexpected labels that
            don't match the run's label schema when merging. If False and
            unexpected labels are encountered, you will be presented an
            interactive prompt to deal with them
        cleanup (False): whether to delete any informtation regarding this run
            from the annotation backend after loading the annotations
        **kwargs: optional keyword arguments for
            :meth:`AnnotationResults.load_credentials`
    """
    results = samples.load_annotation_results(anno_key, **kwargs)
    label_schema = results.config.label_schema
    annotations = results.backend.download_annotations(results)

    if not annotations:
        logger.warning("No annotations found")
        return

    for label_field, label_info in label_schema.items():
        label_type = label_info["type"]
        existing_field = label_info["existing_field"]

        anno_dict = annotations.get(label_field, {})

        if label_type == "scalar":
            expected_type = "scalar"
        else:
            fo_label_type = _LABEL_TYPES_MAP[label_type]
            if fo_label_type in fol._SINGLE_LABEL_TO_LIST_MAP:
                # Backend is expected to always return list types
                fo_list_type = fol._SINGLE_LABEL_TO_LIST_MAP[fo_label_type]
                expected_type = _LABEL_TYPES_MAP_REV[fo_list_type]
            elif label_type in [
                "_segmentations_and_detections",
                "segmentations",
            ]:
                expected_type = "detections"
            else:
                expected_type = label_type

        #
        # First add unexpected labels to new fields, if necessary
        #

        for new_type, new_annos in anno_dict.items():
            if new_type == expected_type:
                continue

            if skip_unexpected:
                new_field = None
            else:
                new_field = _prompt_new_field(samples, new_type, label_field)

            if new_field:
                _add_new_labels(samples, new_annos, new_field, new_type)
            else:
                logger.info(
                    "Skipping unexpected labels of type '%s' in field '%s'",
                    new_type,
                    label_field,
                )

        #
        # Now import expected labels into their appropriate fields
        #

        anno_dict = anno_dict.get(expected_type, {})

        if label_type == "scalar":
            _load_scalars(samples, anno_dict, label_field)
        elif existing_field:
            _merge_labels(samples, anno_dict, results, label_field, label_info)
        else:
            _add_new_labels(samples, anno_dict, label_field, label_type)

    results.backend.save_run_results(samples, anno_key, results)

    if cleanup:
        results.cleanup()


def _prompt_new_field(samples, new_type, label_field):
    new_field = input(
        "Found unexpected labels of type '%s' when loading annotations for "
        "field '%s'.\nPlease enter a new field name in which to store these "
        "annotations, or empty to skip them: " % (new_type, label_field)
    )

    if not new_field:
        return

    while samples._has_field(new_field):
        new_field = input(
            "Field '%s' already exists.\nPlease enter a new field name, or "
            "empty to skip them: " % new_field
        )
        if not new_field:
            break

    return new_field


def _load_scalars(samples, anno_dict, label_field):
    if not anno_dict:
        logger.warning("No annotations found for field '%s'", label_field)
        return

    logger.info("Loading annotations for field '%s'...", label_field)
    with fou.ProgressBar(total=len(anno_dict)) as pb:
        for sample_id, value in pb(anno_dict.items()):
            if isinstance(value, dict):
                field, _ = samples._handle_frame_field(label_field)
                sample = (
                    samples.select(sample_id)
                    .select_frames(list(value.keys()))
                    .first()
                )
                for frame in sample.frames.values():
                    frame[field] = value[frame.id]

                sample.save()
            else:
                sample = samples[sample_id]
                sample[label_field] = value
                sample.save()


def _add_new_labels(samples, anno_dict, label_field, label_type):
    if not anno_dict:
        logger.warning("No labels found for field '%s'", label_field)
        return

    if label_type not in _LABEL_TYPES_MAP:
        logger.warning(
            "Ignoring unsuported labels of type '%s' for field '%s'",
            label_type,
            label_field,
        )
        return

    is_video = samples.media_type == fom.VIDEO

    fo_label_type = _LABEL_TYPES_MAP[label_type]
    if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
        is_list = True
        list_field = fo_label_type._LABEL_LIST_FIELD
    else:
        is_list = False

    logger.info("Loading labels for field '%s'...", label_field)
    for sample in samples.select_fields().iter_samples(progress=True):
        if sample.id not in anno_dict:
            continue

        sample_annos = anno_dict[sample.id]

        if is_video:
            field, _ = samples._handle_frame_field(label_field)
            images = sample.frames.values()
        else:
            field = label_field
            images = [sample]

        for image in images:
            if is_video:
                if image.id not in sample_annos:
                    continue

                image_annos = sample_annos[image.id]
            else:
                image_annos = sample_annos

            if is_list:
                new_label = fo_label_type()
                new_label[list_field] = list(image_annos.values())
            elif image_annos:
                new_label = list(image_annos.values())[0]
            else:
                continue

            image[field] = new_label

        sample.save()


def _merge_labels(samples, anno_dict, results, label_field, label_info):
    label_type = label_info["type"]
    attributes = label_info.get("attributes", {})

    is_video = samples.media_type == fom.VIDEO

    id_map = results.id_map
    added_id_map = defaultdict(list)

    prev_ids = set()
    for ids in id_map[label_field].values():
        if isinstance(ids, list):
            if ids and isinstance(ids[0], list):
                for frame_ids in ids:
                    prev_ids.update(frame_ids)
            else:
                prev_ids.update(ids)
        elif ids is not None:
            prev_ids.add(ids)

    anno_ids = set()
    for sample in anno_dict.values():
        if is_video:
            for frame in sample.values():
                anno_ids.update(frame.keys())
        else:
            anno_ids.update(sample.keys())

    delete_ids = prev_ids - anno_ids
    new_ids = anno_ids - prev_ids
    merge_ids = anno_ids - new_ids

    if delete_ids:
        samples._dataset.delete_labels(ids=delete_ids, fields=label_field)

    if is_video and label_type in (
        "detections",
        "segmentations",
        "keypoints",
        "polylines",
    ):
        tracking_index_map, max_tracking_index = _make_tracking_index(
            samples, label_field, anno_dict
        )
    else:
        tracking_index_map = {}
        max_tracking_index = 0

    if label_type not in _LABEL_TYPES_MAP:
        logger.warning(
            "Ignoring unsuported labels of type '%s' for field '%s'",
            label_type,
            label_field,
        )
        return

    # Add or merge remaining labels
    fo_label_type = _LABEL_TYPES_MAP[label_type]
    if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
        is_list = True
        list_field = fo_label_type._LABEL_LIST_FIELD
    else:
        is_list = False

    sample_ids = list(anno_dict.keys())
    annotated_samples = samples._dataset.select(sample_ids).select_fields(
        label_field
    )

    logger.info("Merging labels for field '%s'...", label_field)
    for sample in annotated_samples.iter_samples(progress=True):
        sample_id = sample.id
        sample_annos = anno_dict[sample_id]

        if is_video:
            field, _ = samples._handle_frame_field(label_field)
            images = sample.frames.values()
        else:
            field = label_field
            images = [sample]

        for image in images:
            if is_video:
                image_annos = sample_annos[image.id]
            else:
                image_annos = sample_annos

            image_label = image[field]

            if image_label is None:
                # A previously unlabeled image is being labeled, or a single
                # label (e.g. Classification) was deleted in CVAT or FiftyOne
                if is_list:
                    new_label = fo_label_type()
                    new_label[list_field] = list(image_annos.values())
                    image[field] = new_label

                    added_id_map[sample_id].extend(list(image_annos.keys()))
                else:
                    # Singular label, check if any annotations are new, set
                    # the field to the first annotation if it exists
                    for anno_id, anno_label in image_annos.items():
                        if anno_id in new_ids:
                            image[field] = anno_label

                            if is_video:
                                added_id_map[sample_id].append(anno_id)
                            else:
                                added_id_map[sample_id] = anno_id

                            break

                continue

            if isinstance(image_label, fol._HasLabelList):
                has_label_list = True
                list_field = image_label._LABEL_LIST_FIELD
                labels = image_label[list_field]
            else:
                has_label_list = False
                labels = [image_label]

            # Merge labels that existed before and after annotation
            for label in labels:
                if label.id in merge_ids:
                    anno_label = image_annos[label.id]

                    if is_video and "index" in anno_label:
                        max_tracking_index = _update_tracking_index(
                            anno_label,
                            tracking_index_map[sample_id],
                            max_tracking_index,
                        )

                    _merge_label(label, anno_label, attributes)

            # Add new labels for label list fields
            # Non-list fields would have been deleted and replaced above
            if has_label_list:
                for anno_id, anno_label in image_annos.items():
                    if anno_id in new_ids:
                        if is_video and "index" in anno_label:
                            max_tracking_index = _update_tracking_index(
                                anno_label,
                                tracking_index_map[sample_id],
                                max_tracking_index,
                            )

                        labels.append(anno_label)
                        added_id_map[sample.id].append(anno_label.id)

        sample.save()

    # Update ID map on results object so that re-imports of this run will be
    # properly processed
    results.backend.update_label_id_map(id_map, added_id_map, label_field)


def _merge_label(label, anno_label, attributes):
    for field in _DEFAULT_LABEL_FIELDS_MAP.get(type(label), []):
        label[field] = anno_label[field]

    for name in attributes:
        value = anno_label.get_attribute_value(name, None)
        label.set_attribute_value(name, value)


def _make_tracking_index(samples, label_field, annotations):
    """Maps the object tracking indices of incoming annotations to existing
    indices for every sample. Also finds the absolute maximum index that is
    then used to assign new indices if needed in the future.

    The tracking_index_map is structured as follows::

        {
            "<sample-id>": {
                "<new-index>": "<existing-index>",
                ...
            },
            ...
        }
    """
    _, index_path = samples._get_label_field_path(label_field, "index")
    indices = samples.values(index_path, unwind=True)
    max_index = max([i for i in indices if i is not None]) + 1

    _, id_path = samples._get_label_field_path(label_field, "id")
    ids = samples.values(id_path, unwind=True)

    existing_index_map = dict(zip(ids, indices))
    tracking_index_map = {}
    for sid, sample_annos in annotations.items():
        if sid not in tracking_index_map:
            tracking_index_map[sid] = {}

        for fid, frame_annots in sample_annos.items():
            for lid, anno_label in frame_annots.items():
                if lid in existing_index_map:
                    tracking_index_map[sid][
                        anno_label.index
                    ] = existing_index_map[lid]

    return tracking_index_map, max_index


def _update_tracking_index(anno_label, sample_index_map, max_tracking_index):
    """Remaps the object tracking index of annotations to existing indices if
    possible. For new object tracks, the previous maximum index is used to
    assign a new index.
    """
    if anno_label.index in sample_index_map:
        anno_label.index = sample_index_map[anno_label.index]
    else:
        sample_index_map[anno_label.index] = max_tracking_index
        anno_label.index = max_tracking_index
        max_tracking_index += 1

    return max_tracking_index


class AnnotationBackendConfig(foa.AnnotationMethodConfig):
    """Base class for configuring an :class:`AnnotationBackend` instances.

    Subclasses are free to define additional keyword arguments if they desire.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    def __init__(self, name, label_schema, media_field="filepath", **kwargs):
        self.name = name
        self.label_schema = label_schema
        self.media_field = media_field
        super().__init__(**kwargs)

    @property
    def method(self):
        """The name of the annotation backend."""
        return self.name


class AnnotationBackend(foa.AnnotationMethod):
    """Base class for annotation backends.

    Args:
        config: an :class:`AnnotationBackendConfig`
    """

    @property
    def supported_label_types(self):
        """The set of label types supported by the backend.

        Backends may support any subset of the following label types:

        -   :class:`fiftyone.core.labels.Classification`
        -   :class:`fiftyone.core.labels.Classifications`
        -   :class:`fiftyone.core.labels.Detection`
        -   :class:`fiftyone.core.labels.Detections`
        -   :class:`fiftyone.core.labels.Polyline`
        -   :class:`fiftyone.core.labels.Polylines`
        -   :class:`fiftyone.core.labels.Keypoint`
        -   :class:`fiftyone.core.labels.Keypoints`
        """
        raise NotImplementedError(
            "subclass must implement supported_label_types"
        )

    @property
    def supported_scalar_types(self):
        """The set of supported scalar types supported by the backend.

        Backends may support any subset of the following scalar types:

        -   :class:`fiftyone.core.fields.IntField`
        -   :class:`fiftyone.core.fields.FloatField`
        -   :class:`fiftyone.core.fields.StringField`
        -   :class:`fiftyone.core.fields.BooleanField`
        """
        raise NotImplementedError(
            "subclass must implement supported_scalar_types"
        )

    @property
    def supported_attr_types(self):
        """The list of attribute types supported by the backend.

        This list defines the valid string values for the ``type`` field of
        an attributes dict of the label schema provided to the backend.

        For example, the CVAT API supports
        ``{"text", "select", "radio", "checkbox"}``.
        """
        raise NotImplementedError(
            "subclass must implement supported_attr_types"
        )

    @property
    def default_attr_type(self):
        """The default type for attributes with values of unspecified type.

        Must be a supported type from :meth:`supported_attr_types`.
        """
        raise NotImplementedError("subclass must implement default_attr_type")

    @property
    def default_categorical_attr_type(self):
        """The default type for attributes with categorical values.

        Must be a supported type from :meth:`supported_attr_types`.
        """
        raise NotImplementedError(
            "subclass must implement default_categorical_attr_type"
        )

    def requires_attr_values(self, attr_type):
        """Determines whether the list of possible values are required for
        attributes of the given type.

        Args:
            attr_type: the attribute type string

        Returns:
            True/False
        """
        raise NotImplementedError(
            "subclass must implement requires_attr_values()"
        )

    def upload_annotations(self, samples, launch_editor=False):
        """Uploads the samples and relevant existing labels from the label
        schema to the annotation backend.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            launch_editor (False): whether to launch the annotation backend's
                editor after uploading the samples

        Returns:
            an :class:`AnnotationResults`
        """
        raise NotImplementedError(
            "subclass must implement upload_annotations()"
        )

    def download_annotations(self, results):
        """Downloads the annotations from the annotation backend for the given
        results.

        The returned labels should be represented as either scalar values or
        :class:`fiftyone.core.labels.Label` instances.

        For image datasets, the return dictionary should have the following
        nested structure::

            # Scalar fields
            results[label_type][sample_id] = scalar

            # Label fields
            results[label_type][sample_id][label_id] = label

        For video datasets, the returned labels dictionary should have the
        following nested structure::

            # Scalar fields
            results[label_type][sample_id][frame_id] = scalar

            # Label fields
            results[label_type][sample_id][frame_id][label_id] = label

        Args:
            results: an :class:`AnnotationResults`

        Returns:
            the labels results dict
        """
        raise NotImplementedError(
            "subclass must implement download_annotations()"
        )

    def build_label_id_map(self, samples):
        """Utility method that builds a label ID dictionary for the given
        collection.

        The dictionary is structured as follows::

            {
                "<label-field>": {
                    "<sample-id>": "<label-id>" or ["<label-id>", ...],
                    ...
                },
                ...
            }

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a dict
        """
        id_map = {}
        for label_field, label_info in self.config.label_schema.items():
            if (
                not label_info["existing_field"]
                or label_info["type"] == "scalar"
            ):
                continue

            _, label_id_path = samples._get_label_field_path(label_field, "id")
            sample_ids, label_ids = samples.values(["id", label_id_path])

            # Flatten frames lists
            for ind, ids in enumerate(label_ids):
                if ids is not None and ids and isinstance(ids[0], list):
                    ids = [i for frame in ids for i in frame]
                    label_ids[ind] = ids

            id_map[label_field] = dict(zip(sample_ids, label_ids))

        return id_map

    @staticmethod
    def update_label_id_map(id_map, added_id_map, label_field):
        """Utility method that updates a label ID dictionary with new labels
        from another ID map.

        Args:
            id_map: an ID map generated by :meth:`build_label_id_map`
            added_id_map: an ID map of new labels to merge into ``id_map``
            label_field: the label field to update
        """
        for sample_id, label_ids in added_id_map.items():
            if isinstance(label_ids, list):
                if id_map[label_field][sample_id] is None:
                    id_map[label_field][sample_id] = []

                id_map[label_field][sample_id].extend(label_ids)
            elif label_ids is not None:
                id_map[label_field][sample_id] = label_ids

    def get_fields(self, samples, anno_key):
        return list(self.config.label_schema.keys())

    def cleanup(self, samples, anno_key):
        pass


class AnnotationResults(foa.AnnotationResults):
    """Base class for storing the intermediate results of an annotation run
    that has been initiated and is waiting for its results to be merged back
    into the FiftyOne dataset.

    .. note::

        This class is serialized for storage in the database by calling
        :meth:`serialize`.

        Any public attributes of this class are included in the representation
        generated by :meth:`serialize`, so they must be JSON serializable.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        config: an :class:`AnnotationBackendConfig`
        backend (None): an :class:`AnnotationBackend`
    """

    def __init__(self, samples, config, backend=None):
        if backend is None:
            backend = config.build()

        self._samples = samples
        self._backend = backend

    @property
    def config(self):
        """The :class:`AnnotationBackendConfig` for these results."""
        return self._backend.config

    @property
    def backend(self):
        """The :class:`AnnotationBackend` for these results."""
        return self._backend

    def load_credentials(self, **kwargs):
        """Loads any credentials from the given keyword arguments or the
        FiftyOne annotation config.

        Args:
            **kwargs: subclass-specific credentials
        """
        raise NotImplementedError("subclass must implement load_credentials()")

    def cleanup(self):
        """Deletes all information for this run from the annotation backend."""
        raise NotImplementedError("subclass must implement cleanup()")

    def _load_config_parameters(self, **kwargs):
        config = self.config
        parameters = fo.annotation_config.backends.get(config.name, {})

        for name, value in kwargs.items():
            if value is None:
                value = parameters.get(name, None)

            if value is not None:
                setattr(config, name, value)

    @classmethod
    def _from_dict(cls, d, samples, config):
        """Builds an :class:`AnnotationResults` from a JSON dict
        representation of it.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run
            config: the :class:`AnnotationBackendConfig` for the run

        Returns:
            an :class:`AnnotationResults`
        """
        raise NotImplementedError("subclass must implement _from_dict()")


class AnnotationAPI(object):
    """Base class for APIs that connect to annotation backend."""

    def _prompt_username_password(self, backend, username=None, password=None):
        prefix = "FIFTYONE_%s_" % backend.upper()
        logger.info(
            "Please enter your login credentials.\nYou can avoid this in the "
            "future by setting your `%sUSERNAME` and `%sPASSWORD` environment "
            "variables",
            prefix,
            prefix,
        )

        if username is None:
            username = input("Username: ")

        if password is None:
            password = getpass.getpass(prompt="Password: ")

        return username, password

    def _prompt_api_key(self, backend):
        prefix = "FIFTYONE_%s_" % backend.upper()
        logger.info(
            "Please enter your API key.\nYou can avoid this in the future by "
            "setting your `%sKEY` environment variable",
            prefix,
        )

        return getpass.getpass(prompt="API key: ")


#
# @todo: the default values for the fields customized in `__init__()` below are
# incorrect in the generated docstring
#
class DrawConfig(etaa.AnnotationConfig):
    """.. autoclass:: eta.core.annotations.AnnotationConfig"""

    __doc__ = etaa.AnnotationConfig.__doc__

    def __init__(self, d):
        #
        # Assume that the user is likely comparing multiple sets of labels,
        # e.g.., ground truth vs predicted, and therefore would prefer that
        # labels have one color per field rather than different colors for each
        # label
        #
        if "per_object_label_colors" not in d:
            d["per_object_label_colors"] = False

        if "per_polyline_label_colors" not in d:
            d["per_polyline_label_colors"] = False

        if "per_keypoints_label_colors" not in d:
            d["per_keypoints_label_colors"] = False

        super().__init__(d)


def draw_labeled_images(samples, output_dir, label_fields=None, config=None):
    """Renders annotated versions of the images in the collection with the
    specified label data overlaid to the given directory.

    The filenames of the sample images are maintained, unless a name conflict
    would occur in ``output_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The images are written in format ``fo.config.default_image_ext``.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        output_dir: the directory to write the annotated images
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels

    Returns:
        the list of paths to the labeled images
    """
    if config is None:
        config = DrawConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=output_dir)
    output_ext = fo.config.default_image_ext

    outpaths = []
    for sample in samples.iter_samples(progress=True):
        outpath = filename_maker.get_output_path(
            sample.filepath, output_ext=output_ext
        )
        draw_labeled_image(
            sample, outpath, label_fields=label_fields, config=config
        )
        outpaths.append(outpath)

    return outpaths


def draw_labeled_image(sample, outpath, label_fields=None, config=None):
    """Renders an annotated version of the sample's image with the specified
    label data overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    img = etai.read(sample.filepath)
    frame_labels = _to_frame_labels(sample, label_fields=label_fields)

    anno_img = etaa.annotate_image(img, frame_labels, annotation_config=config)
    etai.write(anno_img, outpath)


def draw_labeled_videos(samples, output_dir, label_fields=None, config=None):
    """Renders annotated versions of the videos in the collection with the
    specified label data overlaid to the given directory.

    The filenames of the videos are maintained, unless a name conflict would
    occur in ``output_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The videos are written in format ``fo.config.default_video_ext``.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        output_dir: the directory to write the annotated videos
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the samples to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels

    Returns:
        the list of paths to the labeled videos
    """
    if config is None:
        config = DrawConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=output_dir)
    output_ext = fo.config.default_video_ext

    outpaths = []
    for sample in samples.iter_samples(progress=True):
        outpath = filename_maker.get_output_path(
            sample.filepath, output_ext=output_ext
        )
        draw_labeled_video(
            sample, outpath, label_fields=label_fields, config=config
        )
        outpaths.append(outpath)

    return outpaths


def draw_labeled_video(sample, outpath, label_fields=None, config=None):
    """Renders an annotated version of the sample's video with the specified
    label data overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the sample to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    video_path = sample.filepath
    video_labels = _to_video_labels(sample, label_fields=label_fields)

    etaa.annotate_video(
        video_path, video_labels, outpath, annotation_config=config
    )


def _to_frame_labels(sample_or_frame, label_fields=None):
    frame_labels = etaf.FrameLabels()

    if label_fields is None:
        for name, field in sample_or_frame.iter_fields():
            if isinstance(field, fol.ImageLabel):
                frame_labels.merge_labels(field.to_image_labels(name=name))
    else:
        for name in label_fields:
            label = sample_or_frame[name]
            if label is not None:
                frame_labels.merge_labels(label.to_image_labels(name=name))

    return frame_labels


def _to_video_labels(sample, label_fields=None):
    video_labels = etav.VideoLabels()
    for frame_number, frame in sample.frames.items():
        video_labels[frame_number] = _to_frame_labels(
            frame, label_fields=label_fields
        )

    return video_labels


def _check_for_masks(samples, label_field):
    """Check if the given label field has masks and, if so, if it only contains
    masks. Used to check if segmentations are required for annotating existing
    :class:`fiftyone.core.labels.Detections` fields.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        label_field: the name of the field to check for masks

    Returns:
        tuple containing two booleans: (has any masks, has only masks) 
    """
    any_masks = False
    only_masks = False
    field, is_frame_field = samples._handle_frame_field(label_field)
    if is_frame_field:
        schema = samples.get_frame_field_schema()
    else:
        schema = samples.get_field_schema()

    field_type = schema[field]
    if isinstance(field_type, fof.EmbeddedDocumentField):
        fo_label_type = field_type.document_type
    else:
        fo_label_type = field_type

    if fo_label_type not in [fol.Detections, fol.Detection, fol.Segmentation]:
        return any_masks, only_masks

    full_field_path = label_field
    if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
        list_field = fo_label_type._LABEL_LIST_FIELD
        full_field_path += ".%s" % list_field

    _, mask_field = samples._get_label_field_path(label_field, "mask")
    num_masks = samples.count(mask_field)
    num_labels = samples.count(full_field_path)

    if num_masks > 0:
        any_masks = True
        if num_masks == num_labels:
            only_masks = True

    return any_masks, only_masks
