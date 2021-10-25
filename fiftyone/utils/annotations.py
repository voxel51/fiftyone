"""
Annotation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict, OrderedDict
from copy import deepcopy
import getpass
import logging
import os
import warnings

from bson import ObjectId

import eta.core.annotations as etaa
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.aggregations as foag
import fiftyone.core.annotation as foa
import fiftyone.core.clips as foc
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
import fiftyone.utils.eta as foue


logger = logging.getLogger(__name__)


def annotate(
    samples,
    anno_key,
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=True,
    mask_targets=None,
    allow_additions=True,
    allow_deletions=True,
    allow_label_edits=True,
    allow_spatial_edits=True,
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
        label_type (None): a string indicating the type of labels to annotate.
            The possible values are:

            -   ``"classification"``: a single classification stored in
                :class:`fiftyone.core.labels.Classification` fields
            -   ``"classifications"``: multilabel classifications stored in
                :class:`fiftyone.core.labels.Classifications` fields
            -   ``"detections"``: object detections stored in
                :class:`fiftyone.core.labels.Detections` fields
            -   ``"instances"``: instance segmentations stored in
                :class:`fiftyone.core.labels.Detections` fields with their
                :attr:`mask <fiftyone.core.labels.Detection.mask>` attributes
                populated
            -   ``"polylines"``: polylines stored in
                :class:`fiftyone.core.labels.Polylines` fields with their
                :attr:`filled <fiftyone.core.labels.Polyline.filled>`
                attributes set to ``False``
            -   ``"polygons"``: polygons stored in
                :class:`fiftyone.core.labels.Polylines` fields with their
                :attr:`filled <fiftyone.core.labels.Polyline.filled>`
                attributes set to ``True``
            -   ``"keypoints"``: keypoints stored in
                :class:`fiftyone.core.labels.Keypoints` fields
            -   ``"segmentation"``: semantic segmentations stored in
                :class:`fiftyone.core.labels.Segmentation` fields
            -   ``"scalar"``: scalar labels stored in
                :class:`fiftyone.core.fields.IntField`,
                :class:`fiftyone.core.fields.FloatField`,
                :class:`fiftyone.core.fields.StringField`, or
                :class:`fiftyone.core.fields.BooleanField` fields

            All new label fields must have their type specified via this
            argument or in ``label_schema``. Note that annotation backends may
            not support all label types
        classes (None): a list of strings indicating the class options for
            ``label_field`` or all fields in ``label_schema`` without classes
            specified. All new label fields must have a class list provided via
            one of the supported methods. For existing label fields, if classes
            are not provided by this argument nor ``label_schema``, they are
            parsed from
            :meth:`fiftyone.core.collections.SampleCollection.get_classes` if
            possible, or else the observed labels on your dataset are used
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
        mask_targets (None): a dict mapping pixel values to semantic label
            strings. Only applicable when annotating semantic segmentations
        allow_additions (True): whether to allow new labels to be added. Only
            applicable when editing existing label fields
        allow_deletions (True): whether to allow labels to be deleted. Only
            applicable when editing existing label fields
        allow_label_edits (True): whether to allow the ``label`` attribute of
            existing labels to be modified. Only applicable when editing
            existing label fields
        allow_spatial_edits (True): whether to allow edits to the spatial
            properties (bounding boxes, vertices, keypoints, etc) of labels.
            Only applicable when editing existing label fields
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
    if samples._dataset._is_frames:
        raise ValueError("Annotating frames views is not supported")

    # @todo support this?
    if samples._dataset._is_clips:
        raise ValueError("Annotating clips views is not supported")

    # Convert to equivalent regular view containing the same labels
    if samples._dataset._is_patches:
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

    label_schema, samples = _build_label_schema(
        samples,
        anno_backend,
        label_schema,
        label_field,
        label_type,
        classes,
        attributes,
        mask_targets,
        allow_additions,
        allow_deletions,
        allow_label_edits,
        allow_spatial_edits,
    )
    config.label_schema = label_schema

    # Don't allow overwriting an existing run with same `anno_key`
    anno_backend.register_run(samples, anno_key, overwrite=False)

    results = anno_backend.upload_annotations(
        samples, launch_editor=launch_editor
    )

    anno_backend.save_run_results(samples, anno_key, results)

    return results


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


# The supported label type strings and their corresponding FiftyOne types
_LABEL_TYPES_MAP = {
    "classification": fol.Classification,
    "classifications": fol.Classifications,
    "detection": fol.Detection,
    "detections": fol.Detections,
    "instance": fol.Detection,
    "instances": fol.Detections,
    "polyline": fol.Polyline,
    "polylines": fol.Polylines,
    "polygon": fol.Polyline,
    "polygons": fol.Polylines,
    "keypoint": fol.Keypoint,
    "keypoints": fol.Keypoints,
    "segmentation": fol.Segmentation,
}

# Mapping from label types to the return type that the backend should use to
# store the results
_RETURN_TYPES_MAP = {
    "classification": "classifications",
    "classifications": "classifications",
    "detection": "detections",
    "detections": "detections",
    "instance": "detections",
    "instances": "detections",
    "polyline": "polylines",
    "polylines": "polylines",
    "polygon": "polylines",
    "polygons": "polylines",
    "keypoint": "keypoints",
    "keypoints": "keypoints",
    "segmentation": "segmentation",
    "scalar": "scalar",
}

# Label fields that are always overwritten when merging labels
_DEFAULT_LABEL_FIELDS_MAP = {
    fol.Classification: ["label"],
    fol.Detection: ["label", "index"],
    fol.Polyline: ["label", "index"],
    fol.Keypoint: ["label", "index"],
    fol.Segmentation: [],
}

# Label fields that are overwritten when spatial changes are allowed
_SPATIAL_LABEL_FIELDS_MAP = {
    fol.Classification: [],
    fol.Detection: ["bounding_box", "mask"],
    fol.Polyline: ["points", "closed", "filled"],
    fol.Keypoint: ["points"],
    fol.Segmentation: ["mask"],
}

# Label types that can be annotated as tracks in videos
_TRACKABLE_TYPES = (
    "detections",
    "instances",
    "polylines",
    "polygons",
    "keypoints",
)


def _build_label_schema(
    samples,
    backend,
    label_schema,
    label_field,
    label_type,
    classes,
    attributes,
    mask_targets,
    allow_additions,
    allow_deletions,
    allow_label_edits,
    allow_spatial_edits,
):
    if label_schema is None and label_field is None:
        raise ValueError("Either `label_schema` or `label_field` is required")

    if label_schema is None:
        label_schema = _init_label_schema(
            label_field,
            label_type,
            classes,
            attributes,
            mask_targets,
            allow_additions,
            allow_deletions,
            allow_label_edits,
            allow_spatial_edits,
        )
    elif isinstance(label_schema, list):
        label_schema = {lf: {} for lf in label_schema}

    _label_schema = {}

    for _label_field, _label_info in label_schema.items():
        _label_type, _existing_field, _multiple_types = _get_label_type(
            samples, backend, label_type, _label_field, _label_info
        )

        if _label_type not in backend.supported_label_types:
            raise ValueError(
                "Field '%s' has unsupported label type '%s'. The '%s' backend "
                "supports %s"
                % (
                    _label_field,
                    _label_type,
                    backend.config.name,
                    backend.supported_label_types,
                )
            )

        # We found an existing field with multiple label types, so we must
        # select only the relevant labels
        if _multiple_types:
            samples = _select_labels_with_type(
                samples, _label_field, _label_type
            )

        if _label_type == "segmentation":
            _mask_targets, _classes = _get_mask_targets(
                samples, mask_targets, _label_field, _label_info
            )
        else:
            _mask_targets = None
            _classes = _get_classes(
                samples,
                backend,
                classes,
                _label_field,
                _label_info,
                _existing_field,
                _label_type,
            )

        if _label_type not in ("scalar", "segmentation"):
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

        label_info = {
            "type": _label_type,
            "classes": _classes,
            "attributes": _attributes,
        }

        if _mask_targets is not None:
            label_info["mask_targets"] = _mask_targets

        label_info["existing_field"] = _existing_field

        if _existing_field:
            label_info["allow_additions"] = _label_info.get(
                "allow_additions", allow_additions
            )
            label_info["allow_deletions"] = _label_info.get(
                "allow_deletions", allow_deletions
            )
            label_info["allow_label_edits"] = _label_info.get(
                "allow_label_edits", allow_label_edits
            )
            label_info["allow_spatial_edits"] = _label_info.get(
                "allow_spatial_edits", allow_spatial_edits
            )

        if (
            _existing_field
            and samples.media_type == fom.VIDEO
            and _label_type in _TRACKABLE_TYPES
        ):
            # If we're uploading existing video tracks and there is at least
            # one object marked as a keyframe, then upload *only* keyframes
            _, keyframe_path = samples._get_label_field_path(
                _label_field, "keyframe"
            )
            keyframe_values = samples.distinct(keyframe_path)
            only_keyframes = True in keyframe_values

            if only_keyframes and not backend.supports_keyframes:
                logger.warning(
                    "The '%s' backend does not support uploading only "
                    "keyframes when editing existing video tracks",
                    backend.config.name,
                )

                only_keyframes = False
            elif keyframe_values and not only_keyframes:
                logger.warning(
                    "No keyframes found for existing labels in field '%s'. "
                    "All labels will be uploaded",
                    _label_field,
                )

            label_info["only_keyframes"] = only_keyframes

        _label_schema[_label_field] = label_info

    return _label_schema, samples


def _select_labels_with_type(samples, label_field, label_type):
    if label_type in ("detection", "detections"):
        return samples.filter_labels(
            label_field, ~F("mask").exists(), only_matches=False
        )

    if label_type in ("instance", "instances"):
        return samples.filter_labels(
            label_field, F("mask").exists(), only_matches=False
        )

    if label_type in ("polygon", "polygons"):
        return samples.filter_labels(
            label_field, F("filled") == True, only_matches=False
        )

    if label_type in ("polyline", "polylines"):
        return samples.filter_labels(
            label_field, F("filled") == False, only_matches=False
        )

    raise ValueError(
        "Field '%s' has unsupported multiple label type '%s'"
        % (label_field, label_type)
    )


def _init_label_schema(
    label_field,
    label_type,
    classes,
    attributes,
    mask_targets,
    allow_additions,
    allow_deletions,
    allow_label_edits,
    allow_spatial_edits,
):
    d = {}

    if label_type is not None:
        d["type"] = label_type

    if classes is not None:
        d["classes"] = classes

    if attributes not in (True, False, None):
        d["attributes"] = attributes

    if mask_targets is not None:
        d["mask_targets"] = mask_targets

    d["allow_additions"] = allow_additions
    d["allow_deletions"] = allow_deletions
    d["allow_label_edits"] = allow_label_edits
    d["allow_spatial_edits"] = allow_spatial_edits

    return {label_field: d}


def _get_label_type(samples, backend, label_type, label_field, label_info):
    if "type" in label_info:
        label_type = label_info["type"]

    field, is_frame_field = samples._handle_frame_field(label_field)
    if is_frame_field:
        schema = samples.get_frame_field_schema()
    else:
        schema = samples.get_field_schema()

    if field not in schema:
        if label_type is None:
            raise ValueError(
                "You must specify a type for new label field '%s'"
                % label_field
            )

        return label_type, False, False

    _existing_type = _get_existing_label_type(
        samples, backend, label_field, schema[field]
    )
    _multiple_types = isinstance(_existing_type, list)

    if label_type is not None:
        if label_type not in _to_list(_existing_type):
            raise ValueError(
                "Manually reported label type '%s' for existing field '%s' "
                "does not match its actual type '%s'"
                % (label_type, label_field, _existing_type)
            )

        return label_type, True, _multiple_types

    if not _multiple_types:
        return _existing_type, True, _multiple_types

    # Existing field contains multiple label types, so we must choose one
    if "detection" in _existing_type:
        _label_type = "detection"
    elif "detections" in _existing_type:
        _label_type = "detections"
    elif "polygon" in _existing_type:
        _label_type = "polygon"
    elif "polygons" in _existing_type:
        _label_type = "polygons"
    else:
        raise ValueError(
            "Existing field '%s' has unsupported multiple types "
            "%s" % (label_field, _existing_type)
        )

    logger.warning(
        "Found existing field '%s' with multiple types %s. Only the '%s' "
        "will be annotated",
        label_field,
        _existing_type,
        _label_type,
    )

    return _label_type, True, _multiple_types


def _to_list(value):
    if value is None:
        return []

    if isinstance(value, (list, tuple)):
        return list(value)

    return [value]


def _flatten_list(values):
    if not values:
        return []

    out = []
    for v in values:
        if isinstance(v, (list, tuple)):
            out.extend(v)
        elif v is not None:
            out.append(v)

    return out


def _unwrap(value):
    if not value:
        return None

    if len(value) == 1:
        return value[0]

    return value


def _get_existing_label_type(samples, backend, label_field, field_type):
    if not isinstance(field_type, fof.EmbeddedDocumentField):
        if not isinstance(field_type, tuple(backend.supported_scalar_types)):
            raise ValueError(
                "Field '%s' has unsupported scalar type %s. The '%s' backend "
                "supports %s"
                % (
                    label_field,
                    field_type,
                    backend.config.name,
                    backend.supported_scalar_types,
                )
            )

        return "scalar"

    fo_label_type = field_type.document_type

    if issubclass(fo_label_type, (fol.Detection, fol.Detections)):
        # Must check for detections vs instances
        _, label_path = samples._get_label_field_path(label_field)
        _, mask_path = samples._get_label_field_path(label_field, "mask")

        num_labels, num_masks = samples.aggregate(
            [foag.Count(label_path), foag.Count(mask_path)]
        )

        label_types = []

        if num_labels == 0 or num_labels > num_masks:
            label_types.append(
                "detection"
                if issubclass(fo_label_type, fol.Detection)
                else "detections"
            )

        if num_masks > 0:
            label_types.append(
                "instance"
                if issubclass(fo_label_type, fol.Detection)
                else "instances"
            )

        return _unwrap(label_types)

    if issubclass(fo_label_type, (fol.Polyline, fol.Polylines)):
        # Must check for polylines vs polygons
        _, path = samples._get_label_field_path(label_field, "filled")
        counts = samples.count_values(path)

        label_types = []

        if counts.get(True, 0) > 0:
            label_types.append(
                "polygon"
                if issubclass(fo_label_type, fol.Polyline)
                else "polygons"
            )

        if counts.get(False, 0) > 0:
            label_types.append(
                "polyline"
                if issubclass(fo_label_type, fol.Detection)
                else "polylines"
            )

        return _unwrap(label_types)

    if issubclass(fo_label_type, fol.Classification):
        return "classification"

    if issubclass(fo_label_type, fol.Classifications):
        return "classifications"

    if issubclass(fo_label_type, fol.Keypoint):
        return "keypoint"

    if issubclass(fo_label_type, fol.Keypoints):
        return "keypoints"

    if issubclass(fo_label_type, fol.Segmentation):
        return "segmentation"

    raise ValueError(
        "Field '%s' has unsupported type %s" % (label_field, fo_label_type)
    )


def _get_classes(
    samples,
    backend,
    classes,
    label_field,
    label_info,
    existing_field,
    label_type,
):
    if "classes" in label_info:
        classes = label_info["classes"]

    if classes:
        _classes = []
        for c in classes:
            if isinstance(c, dict):
                c = _parse_classes_dict(
                    c,
                    samples,
                    backend,
                    label_field,
                    existing_field,
                    label_type,
                )

            _classes.append(c)

        return _classes

    if label_type == "scalar":
        return []

    if not existing_field:
        raise ValueError(
            "You must provide a class list for new label field '%s'"
            % label_field
        )

    classes = samples.get_classes(label_field)
    if classes:
        return classes

    _, label_path = samples._get_label_field_path(label_field, "label")
    return samples._dataset.distinct(label_path)


def _parse_classes_dict(
    d, samples, backend, label_field, existing_field, label_type
):
    if "classes" not in d or "attributes" not in d:
        raise ValueError("Invalid classes dict %s" % str(d))

    classes = d["classes"]
    attributes = d["attributes"]

    if etau.is_str(classes):
        classes = [classes]
    else:
        classes = list(classes)

    attributes = _get_attributes(
        samples,
        backend,
        attributes,
        label_field,
        {},
        existing_field,
        label_type,
        classes=classes,
    )

    return {"classes": classes, "attributes": attributes}


def _get_mask_targets(samples, mask_targets, label_field, label_info):
    if "mask_targets" in label_info:
        mask_targets = label_info["mask_targets"]

    if mask_targets is None and label_field in samples.mask_targets:
        mask_targets = samples.mask_targets[label_field]

    if mask_targets is None and samples.default_mask_targets:
        mask_targets = samples.default_mask_targets

    if mask_targets is None:
        mask_targets = {i: str(i) for i in range(1, 256)}
        mask_targets[0] = "background"

    classes = [c for v, c in mask_targets.items() if v != 0]

    return mask_targets, classes


def _get_attributes(
    samples,
    backend,
    attributes,
    label_field,
    label_info,
    existing_field,
    label_type,
    classes=None,
):
    if "attributes" in label_info:
        attributes = label_info["attributes"]

    if attributes in [True, False, None]:
        if label_type == "scalar":
            attributes = {}
        elif existing_field and attributes == True:
            attributes = _get_label_attributes(
                samples, backend, label_field, label_type, classes=classes
            )
        else:
            attributes = {}

    return _format_attributes(backend, attributes)


def _get_label_attributes(
    samples, backend, label_field, label_type, classes=None
):
    if classes is not None:
        samples = samples.filter_labels(label_field, F("label").is_in(classes))

    _, label_path = samples._get_label_field_path(label_field)
    labels = samples.values(label_path, unwind=True)

    attributes = {}
    for label in labels:
        if label is not None:
            for name, value in label.iter_attributes():
                if value is not None and name not in attributes:
                    attributes[name] = backend.recommend_attr_tool(name, value)

    # The keyframe attribute has special semantics for video track annotations
    if samples.media_type == fom.VIDEO and label_type in _TRACKABLE_TYPES:
        attributes.pop("keyframe", None)

    return attributes


def _format_attributes(backend, attributes):
    if etau.is_str(attributes):
        attributes = [attributes]

    if isinstance(attributes, list):
        attributes = {a: {} for a in attributes}

    _attributes = {}

    for name, attr in attributes.items():
        if not attr:
            attr = backend.recommend_attr_tool(name, None)

        attr_type = attr.get("type", None)
        values = attr.get("values", None)
        default = attr.get("default", None)
        mutable = attr.get("mutable", None)
        read_only = attr.get("read_only", None)

        if attr_type is None:
            raise ValueError(
                "Attribute definition %s is missing a `type` key" % str(attr)
            )

        if attr_type not in backend.supported_attr_types:
            raise ValueError(
                "Attribute '%s' has unsupported type '%s'. The '%s' "
                "backend supports types %s"
                % (
                    name,
                    attr_type,
                    backend.config.name,
                    backend.supported_attr_types,
                )
            )

        _attr = {"type": attr_type}

        # Parse `values` property
        if values is not None:
            _attr["values"] = list(values)
        elif backend.requires_attr_values(attr_type):
            raise ValueError(
                "Attribute '%s' of type '%s' requires a list of values"
                % (name, attr_type)
            )

        # Parse `default` property
        if default is not None:
            if values is not None and default not in values:
                raise ValueError(
                    "Default value '%s' for attribute '%s' does not "
                    "appear in the list of values %s" % (default, name, values)
                )

            _attr["default"] = default

        # Parse `mutable` property
        if mutable is not None:
            _attr["mutable"] = mutable

        # Parse `read_only` property
        if read_only is not None:
            _attr["read_only"] = read_only

        _attributes[name] = _attr

    return _attributes


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

    for label_field, label_info in label_schema.items():
        label_type = label_info["type"]
        global_attrs, class_attrs = _parse_attributes(label_info)
        allow_additions = label_info.get("allow_additions", True)

        expected_type = _RETURN_TYPES_MAP[label_type]

        anno_dict = annotations.get(label_field, {})

        if expected_type not in anno_dict:
            anno_dict[expected_type] = {}

        for anno_type, annos in anno_dict.items():
            if anno_type == expected_type:
                # Expected labels
                if label_type == "scalar":
                    _merge_scalars(
                        samples,
                        annos,
                        results,
                        label_field,
                        label_info=label_info,
                    )
                else:
                    _merge_labels(
                        samples,
                        annos,
                        results,
                        label_field,
                        label_type,
                        label_info=label_info,
                        global_attrs=global_attrs,
                        class_attrs=class_attrs,
                    )
            else:
                # Unexpected labels
                if skip_unexpected or not allow_additions:
                    new_field = None
                else:
                    new_field = _prompt_field(
                        samples, anno_type, label_field, label_schema
                    )

                if new_field:
                    if anno_type == "scalar":
                        _merge_scalars(samples, annos, results, new_field)
                    else:
                        _merge_labels(
                            samples, annos, results, new_field, anno_type
                        )
                else:
                    logger.info(
                        "Skipping unexpected labels of type '%s' in field "
                        "'%s'",
                        anno_type,
                        label_field,
                    )

    results.backend.save_run_results(samples, anno_key, results)

    if cleanup:
        results.cleanup()


def _parse_attributes(label_info):
    classes = label_info.get("classes", [])
    attributes = label_info.get("attributes", {})
    class_attrs = defaultdict(list)

    global_attrs = _get_writeable_attributes(attributes)

    # Parse per-class attributes
    for _class in classes:
        if etau.is_str(_class):
            continue

        _classes = _class["classes"]
        _attrs = _get_writeable_attributes(_class["attributes"])

        for name in _classes:
            class_attrs[name].extend(_attrs)

    return global_attrs, dict(class_attrs)


def _get_writeable_attributes(attributes):
    return [k for k, v in attributes.items() if not v.get("read_only", False)]


def _prompt_field(samples, label_type, label_field, label_schema):
    new_field = input(
        "Found unexpected labels of type '%s' when loading annotations for "
        "field '%s'.\nPlease enter a new or compatible existing field name in "
        "which to store these annotations, or empty to skip: "
        % (label_type, label_field)
    )

    if not new_field:
        return None

    if label_type != "scalar":
        fo_label_type = _LABEL_TYPES_MAP[label_type]

    _, is_frame_field = samples._handle_frame_field(label_field)
    if is_frame_field:
        schema = samples.get_frame_field_schema()
    else:
        schema = samples.get_field_schema()

    while True:
        is_good_field = new_field not in label_schema

        if is_good_field:
            if is_frame_field:
                if not samples._is_frame_field(new_field):
                    new_field = samples._FRAMES_PREFIX + new_field

                field, _ = samples._handle_frame_field(new_field)
            else:
                field = new_field

            if field not in schema:
                break  # new field

            try:
                field_type = schema[field].document_type
            except:
                field_type = type(schema[field])

            if label_type == "scalar":
                # As long as it is not an embedded document field, assume the
                # user knows what they're doing
                is_good_type = not issubclass(
                    field_type, fof.EmbeddedDocumentField
                )
            else:
                is_good_type = issubclass(field_type, fo_label_type)
        else:
            is_good_type = False

        if is_good_field and is_good_type:
            break

        if not is_good_field:
            new_field = input(
                "Cannot add unexpected labels to field '%s' because it is "
                "involved in this annotation run.\nPlease enter a different "
                "field name or empty to skip: " % new_field
            )
        else:
            new_field = input(
                "Existing field '%s' of type %s is not compatible with labels "
                "of type '%s'.\nPlease enter a different field name or empty "
                "to skip: " % (new_field, field_type, label_type)
            )

        if not new_field:
            break

    return new_field


def _merge_scalars(samples, anno_dict, results, label_field, label_info=None):
    if label_info is None:
        label_info = {}

    allow_additions = label_info.get("allow_additions", True)
    allow_deletions = label_info.get("allow_deletions", True)

    is_video = samples._is_frame_field(label_field)

    # Retrieve a view that contains all samples involved in the annotation run
    id_map = results.id_map.get(label_field, {})
    uploaded_ids = set(k for k, v in id_map.items() if v is not None)
    sample_ids = list(uploaded_ids | set(anno_dict.keys()))
    view = samples._dataset.select(sample_ids)

    if is_video:
        field, _ = view._handle_frame_field(label_field)
        if view.has_frame_field(field):
            view = view.select_fields(label_field)
    else:
        field = label_field
        if view.has_sample_field(field):
            view = view.select_fields(label_field)

    num_additions = 0
    num_deletions = 0

    logger.info("Loading scalars for field '%s'...", label_field)
    for sample in view.iter_samples(progress=True):
        sample_annos = anno_dict.get(sample.id, None)

        if is_video:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            if is_video:
                if sample_annos is None:
                    new_value = None
                else:
                    new_value = sample_annos.get(image.id, None)
            else:
                new_value = sample_annos

            try:
                value = image[field]
            except:
                value = None  # field may not exist yet

            if value != new_value:
                if value is None:
                    # New value
                    num_additions += 1
                    if allow_additions:
                        image[field] = new_value
                elif new_value is None:
                    # Delete value
                    num_deletions += 1
                    if allow_deletions:
                        image[field] = None
                else:
                    # Edit value
                    image[field] = new_value

        sample.save()

    if num_additions > 0 and not allow_additions:
        logger.warning(
            "Ignored %d added scalars in field '%s' because "
            "`allow_additions=False`",
            num_additions,
            label_field,
        )

    if num_deletions > 0 and not allow_deletions:
        logger.warning(
            "Ignored %d deleted scalars in field '%s' because "
            "`allow_deletions=False`",
            num_deletions,
            label_field,
        )


def _merge_labels(
    samples,
    anno_dict,
    results,
    label_field,
    label_type,
    label_info=None,
    global_attrs=None,
    class_attrs=None,
):
    if label_info is None:
        label_info = {}

    only_keyframes = label_info.get("only_keyframes", False)
    allow_additions = label_info.get("allow_additions", True)
    allow_deletions = label_info.get("allow_deletions", True)
    allow_label_edits = label_info.get("allow_label_edits", True)
    allow_spatial_edits = label_info.get("allow_spatial_edits", True)

    fo_label_type = _LABEL_TYPES_MAP[label_type]
    if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
        is_list = True
        list_field = fo_label_type._LABEL_LIST_FIELD
    else:
        is_list = False

    _ensure_label_field(samples, label_field, fo_label_type)

    is_video = samples.media_type == fom.VIDEO

    if is_video and label_type in _TRACKABLE_TYPES:
        _update_tracks(samples, label_field, anno_dict, only_keyframes)

    id_map = results.id_map.get(label_field, {})

    if is_video:
        field, _ = samples._handle_frame_field(label_field)
        added_id_map = defaultdict(lambda: defaultdict(list))
    else:
        field = label_field
        added_id_map = defaultdict(list)

    existing_ids = set()
    for sample_labels in id_map.values():
        if is_video:
            for frame_labels in sample_labels.values():
                existing_ids.update(_to_list(frame_labels))
        else:
            existing_ids.update(_to_list(sample_labels))

    existing_ids.discard(None)

    anno_ids = set()
    for sample in anno_dict.values():
        if is_video:
            for frame in sample.values():
                anno_ids.update(frame.keys())
        else:
            anno_ids.update(sample.keys())

    delete_ids = existing_ids - anno_ids
    new_ids = anno_ids - existing_ids
    merge_ids = anno_ids - new_ids

    if delete_ids and allow_deletions:
        samples._dataset.delete_labels(ids=delete_ids, fields=label_field)

    sample_ids = list(anno_dict.keys())
    view = samples._dataset.select(sample_ids).select_fields(label_field)

    logger.info("Loading labels for field '%s'...", label_field)
    for sample in view.iter_samples(progress=True):
        sample_id = sample.id
        sample_annos = anno_dict[sample_id]

        if is_video:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            if is_video:
                image_annos = sample_annos.get(image.id, None)
                if not image_annos:
                    continue
            else:
                image_annos = sample_annos

            image_label = image[field]

            if image_label is None and allow_additions:
                # Add new labels to `None`-valued fields
                if is_list:
                    label_ids = list(image_annos.keys())
                    image[field] = fo_label_type(
                        **{list_field: list(image_annos.values())}
                    )

                    if is_video:
                        added_id_map[sample_id][image.id].extend(label_ids)
                    else:
                        added_id_map[sample_id].extend(label_ids)
                elif image_annos:
                    anno_id, anno_label = next(iter(image_annos.items()))
                    image[field] = anno_label

                    if is_video:
                        added_id_map[sample_id][image.id] = anno_id
                    else:
                        added_id_map[sample_id] = anno_id
            else:
                if is_list:
                    labels = image_label[list_field]
                else:
                    labels = [image_label]

                # Merge labels that existed before and after annotation
                for label in labels:
                    if label.id in merge_ids:
                        anno_label = image_annos[label.id]

                        _merge_label(
                            label,
                            anno_label,
                            global_attrs=global_attrs,
                            class_attrs=class_attrs,
                            allow_label_edits=allow_label_edits,
                            allow_spatial_edits=allow_spatial_edits,
                            only_keyframes=only_keyframes,
                        )

                # Add new labels to label list fields
                if is_list and allow_additions:
                    for anno_id, anno_label in image_annos.items():
                        if anno_id not in new_ids:
                            continue

                        labels.append(anno_label)

                        if is_video:
                            added_id_map[sample_id][image.id].append(anno_id)
                        else:
                            added_id_map[sample_id].append(anno_id)

        sample.save()

    if new_ids and not allow_additions:
        logger.warning(
            "Ignored %d added labels in field '%s' because "
            "`allow_additions=False`",
            len(new_ids),
            label_field,
        )

    if delete_ids and not allow_deletions:
        logger.warning(
            "Ignored %d deleted labels in field '%s' because "
            "`allow_deletions=False`",
            len(delete_ids),
            label_field,
        )

    # Record newly added IDs so that re-imports of this run will be properly
    # processed
    results._update_id_map(label_field, added_id_map)


def _ensure_label_field(samples, label_field, fo_label_type):
    field, is_frame_field = samples._handle_frame_field(label_field)
    if is_frame_field:
        if not samples.has_frame_field(field):
            samples._dataset.add_frame_field(
                field,
                fof.EmbeddedDocumentField,
                embedded_doc_type=fo_label_type,
            )
    else:
        if not samples.has_sample_field(field):
            samples._dataset.add_sample_field(
                field,
                fof.EmbeddedDocumentField,
                embedded_doc_type=fo_label_type,
            )


def _merge_label(
    label,
    anno_label,
    global_attrs=None,
    class_attrs=None,
    allow_label_edits=True,
    allow_spatial_edits=True,
    only_keyframes=False,
):
    for field in _DEFAULT_LABEL_FIELDS_MAP.get(type(label), []):
        if allow_label_edits or field != "label":
            label[field] = anno_label[field]

    if allow_spatial_edits:
        for field in _SPATIAL_LABEL_FIELDS_MAP.get(type(label), []):
            label[field] = anno_label[field]

    if only_keyframes:
        label.keyframe = anno_label.get_attribute_value("keyframe", None)

    if global_attrs is None:
        # All attributes
        for name, value in anno_label.iter_attributes():
            label.set_attribute_value(name, value)
    else:
        # Global attributes + class-specific attributes
        _class = label.get_attribute_value("label", None)
        attr_names = global_attrs + class_attrs.get(_class, [])
        for name in attr_names:
            value = anno_label.get_attribute_value(name, None)
            label.set_attribute_value(name, value)


def _update_tracks(samples, label_field, anno_dict, only_keyframes):
    # Using unfiltered samples is important here because we need to ensure
    # that any new indexes never clash with *any* existing tracks
    view = samples._dataset.select(list(anno_dict.keys()))

    _, id_path = samples._get_label_field_path(label_field, "id")
    _, index_path = samples._get_label_field_path(label_field, "index")

    sample_ids, frame_ids, label_ids, indexes = view.values(
        ["id", "frames.id", id_path, index_path]
    )

    id_map = {}
    index_map = {}
    max_index = {}
    existing_map = {}

    # Index existing labels
    for _id, _frame_ids, _frame_lids, _frame_inds in zip(
        sample_ids, frame_ids, label_ids, indexes
    ):
        # Max index for sample
        _indexes = [i for i in _flatten_list(_frame_inds) if i is not None]
        max_index[_id] = max(_indexes) if _indexes else 0

        for _frame_id, _label_ids, _indexes in zip(
            _frame_ids, _frame_lids, _frame_inds
        ):
            _label_ids = _to_list(_label_ids)
            _indexes = _to_list(_indexes)
            for _label_id, _index in zip(_label_ids, _indexes):
                if _index is not None:
                    existing_map[_label_id] = _index
                    id_map[(_id, _frame_id, _index)] = _label_id

    # Generate mapping from annotation track index to dataset track index
    for _id, sample_annos in anno_dict.items():
        _seen_indexes = set()
        for frame_annos in sample_annos.values():
            for _label_id, label in frame_annos.items():
                if _label_id in existing_map:
                    _existing_index = existing_map[_label_id]
                    if _existing_index not in _seen_indexes:
                        index_map[(_id, label.index)] = _existing_index
                        _seen_indexes.add(_existing_index)

    # Perform necessary transformations
    for _id, sample_annos in anno_dict.items():
        for _frame_id, frame_annos in sample_annos.items():
            for _label_id in list(frame_annos.keys()):  # list b/c we'll edit
                label = frame_annos[_label_id]

                # Don't remap non-trajectories
                if label.index is None:
                    continue

                # Map annotation track index to dataset track index
                _index = index_map.get((_id, label.index), None)
                if _index is None:
                    _index = max_index.get(_id, 0) + 1
                    index_map[(_id, label.index)] = _index
                    max_index[_id] = _index

                label.index = _index

                # If only keyframes were uploaded and this label coincides with
                # an existing observation of its track, inherit the label ID
                # from the existing observation so that the labels can be
                # merged
                if only_keyframes:
                    _existing_id = id_map.get((_id, _frame_id, _index), None)
                    if _existing_id is not None:
                        label._id = ObjectId(_existing_id)
                        del frame_annos[_label_id]
                        frame_annos[_existing_id] = label


class AnnotationBackendConfig(foa.AnnotationMethodConfig):
    """Base class for configuring an :class:`AnnotationBackend` instances.

    Subclasses are free to define additional keyword arguments if they desire.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attributes to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    def __init__(self, name, label_schema, media_field="filepath", **kwargs):
        super().__init__(**kwargs)

        self._sanitize_label_schema(label_schema)

        self.name = name
        self.label_schema = label_schema
        self.media_field = media_field

    @property
    def method(self):
        """The name of the annotation backend."""
        return self.name

    def _sanitize_label_schema(self, label_schema):
        if not label_schema:
            return

        # Mask target keys are serialized as strings; must undo this...
        for label_info in label_schema.values():
            mask_targets = label_info.get("mask_targets", None)
            if isinstance(mask_targets, dict):
                label_info["mask_targets"] = {
                    int(k): v for k, v in mask_targets.items()
                }

    def serialize(self, *args, **kwargs):
        d = super().serialize(*args, **kwargs)

        # Must serialize mask targets with string keys...
        label_schema = d.get("label_schema", {})
        for label_info in label_schema.values():
            mask_targets = label_info.get("mask_targets", None)
            if isinstance(mask_targets, dict):
                label_info["mask_targets"] = OrderedDict(
                    (str(k), v) for k, v in mask_targets.items()
                )

        return d


class AnnotationBackend(foa.AnnotationMethod):
    """Base class for annotation backends.

    Args:
        config: an :class:`AnnotationBackendConfig`
    """

    @property
    def supported_label_types(self):
        """The list of label types supported by the backend.

        Backends may support any subset of the following label types:

        -   ``"classification"``
        -   ``"classifications"``
        -   ``"detection"``
        -   ``"detections"``
        -   ``"instance"``
        -   ``"instances"``
        -   ``"polyline"``
        -   ``"polylines"``
        -   ``"polygon"``
        -   ``"polygons"``
        -   ``"keypoint"``
        -   ``"keypoints"``
        -   ``"segmentation"``
        -   ``"scalar"``
        """
        raise NotImplementedError(
            "subclass must implement supported_label_types"
        )

    @property
    def supported_scalar_types(self):
        """The list of scalar field types supported by the backend.

        For example, CVAT supports the following types:

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

        For example, CVAT supports ``["text", "select", "radio", "checkbox"]``.
        """
        raise NotImplementedError(
            "subclass must implement supported_attr_types"
        )

    @property
    def supports_keyframes(self):
        """Whether this backend supports uploading only keyframes when editing
        existing video track annotations.
        """
        raise NotImplementedError("subclass must implement supports_keyframes")

    def recommend_attr_tool(self, name, value):
        """Recommends an attribute tool for an attribute with the given name
        and value.

        For example, a backend may recommend a tool as follows for a boolean
        value::

            {
                "type": "radio",
                "values": [False, True],
            }

        or a tool as follows for a generic value::

            {"type": "text"}

        Args:
            name: the name of the attribute
            value: the attribute value, which may be ``None``

        Returns:
            an attribute type dict
        """
        raise NotImplementedError(
            "subclass must implement recommend_attr_tool()"
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

        The valid values for ``label_type`` are:

        -   "classifications": single or multilabel classifications
        -   "detections": detections or instance segmentations
        -   "polylines": polygons or polylines
        -   "segmentation": semantic segmentations
        -   "scalar": scalar values

        Args:
            results: an :class:`AnnotationResults`

        Returns:
            the labels results dict
        """
        raise NotImplementedError(
            "subclass must implement download_annotations()"
        )

    def get_fields(self, samples, anno_key):
        return list(self.config.label_schema.keys())

    def cleanup(self, samples, anno_key):
        pass


class AnnotationResults(foa.AnnotationResults):
    """Base class for storing the intermediate results of an annotation run
    that has been initiated and is waiting for its results to be merged back
    into the FiftyOne dataset.

    The ``id_map`` dictionary must record the IDs of any **existing labels**
    that are being edited by the annotation run. Any new label fields do not
    need to have keys in this dictionary.

    For image datasets, ``id_map`` should have the following format::

        {
            "<label-field>": {
                "<sample-id>": "label-id" or ["label-id", ...],
                ...
            },
            ...
        }

    For video datasets, ``id_map`` should have the following format::

        {
            "<label-field>": {
                "<sample-id>": {
                    "<frame-id>": label-id" or ["label-id", ...],
                    ...
                },
                ...
            },
            ...
        }

    When editing scalar fields, set the dictionary values corresponding to
    uploaded scalars to ``True`` (since scalars do not have IDs).

    If a particular sample or frame was included in the annotation run but no
    labels/scalars were uploaded for editing, the corresponding entry in
    ``id_map`` can be either missing or have a value of ``None``.

    .. note::

        This class is serialized for storage in the database by calling
        :meth:`serialize`.

        Any public attributes of this class are included in the representation
        generated by :meth:`serialize`, so they must be JSON serializable.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        config: an :class:`AnnotationBackendConfig`
        id_map: a dictionary recording the existing label IDs, in the format
            described above
        backend (None): an :class:`AnnotationBackend`
    """

    def __init__(self, samples, config, id_map, backend=None):
        if backend is None:
            backend = config.build()

        self._samples = samples
        self.id_map = id_map
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

    def launch_editor(self):
        """Launches the annotation backend's editor for these results."""
        raise NotImplementedError("subclass must implement launch_editor()")

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

    def _update_id_map(self, label_field, new_id_map):
        """Adds the given label IDs into this object's :attr:`id_map`.

        For image datasets, ``new_id_map`` should have the following format::

            {
                "<sample-id>": "label-id" or ["label-id", ...],
                ...
            },

        For video datasets, ``new_id_map`` should have the following format::

            {
                "<sample-id>": {
                    "<frame-id>": label-id" or ["label-id", ...],
                    ...
                },
                ...
            }

        Args:
            label_field: the label field
            new_id_map: a dictionary in the format described above
        """
        if label_field not in self.id_map:
            id_map = {}
            self.id_map[label_field] = id_map
        else:
            id_map = self.id_map[label_field]

        if self._samples._is_frame_field(label_field):
            for sample_id, content in new_id_map.items():
                if sample_id not in id_map:
                    id_map[sample_id] = {}

                sample_id_map = id_map[sample_id]
                for frame_id, label_ids in content.items():
                    sample_id_map[frame_id] = self._format_label_ids(
                        sample_id_map.get(frame_id, None), label_ids,
                    )
        else:
            for sample_id, label_ids in new_id_map.items():
                id_map[sample_id] = self._format_label_ids(
                    id_map.get(sample_id, None), label_ids
                )

    def _format_label_ids(self, ids1, ids2):
        return _unwrap(_to_list(ids1) + _to_list(ids2))

    @classmethod
    def _from_dict(cls, d, samples, config):
        """Builds an :class:`AnnotationResults` from a JSON dict representation
        of it.

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
        label_fields (None): a list of label fields to render. If omitted, all
            compatiable fields are rendered
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
        label_fields (None): a list of label fields to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    fov.validate_image_sample(sample)
    img = etai.read(sample.filepath)

    image_labels = _to_image_labels(sample, label_fields=label_fields)

    anno_img = etaa.annotate_image(img, image_labels, annotation_config=config)
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
        label_fields (None): a list of label fields to render. If omitted, all
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

    is_clips = samples._dataset._is_clips
    num_videos = len(samples)

    outpaths = []
    for idx, sample in enumerate(samples, 1):
        if is_clips:
            logger.info("Drawing labels for clip %d/%d", idx, num_videos)
            base, ext = os.path.splitext(sample.filepath)
            first, last = sample.support
            inpath = "%s-clip-%d-%d%s" % (base, first, last, ext)
        else:
            logger.info("Drawing labels for video %d/%d", idx, num_videos)
            inpath = sample.filepath

        outpath = filename_maker.get_output_path(inpath, output_ext=output_ext)
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
        label_fields (None): a list of label fields to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    video_path = sample.filepath
    video_labels = _to_video_labels(sample, label_fields=label_fields)

    if isinstance(sample, foc.ClipView):
        support = sample.support
    else:
        support = None

    etaa.annotate_video(
        video_path,
        video_labels,
        outpath,
        support=support,
        annotation_config=config,
    )


def _to_image_labels(sample, label_fields=None):
    labels = _get_sample_labels(sample, label_fields)
    return foue.to_image_labels(labels)


def _to_video_labels(sample, label_fields=None):
    if label_fields is not None:
        label_fields, frame_label_fields = fou.split_frame_fields(label_fields)
    else:
        frame_label_fields = None

    label = _get_sample_labels(sample, label_fields)
    frames = _get_frame_labels(sample, frame_label_fields)

    return foue.to_video_labels(label=label, frames=frames)


def _get_sample_labels(sample, label_fields):
    if label_fields is None:
        return {
            name: value
            for name, value in sample.iter_fields()
            if isinstance(value, fol.Label)
        }

    if label_fields:
        return {name: sample[name] for name in label_fields}

    return None


def _get_frame_labels(sample, frame_label_fields):
    if frame_label_fields is not None and not frame_label_fields:
        return None

    frames = {}
    for frame_number, frame in sample.frames.items():
        if frame_label_fields is None:
            frames[frame_number] = {
                name: value
                for name, value in frame.iter_fields()
                if isinstance(value, fol.Label)
            }
        else:
            frames[frame_number] = {
                name: frame[name] for name in frame_label_fields
            }

    return frames
