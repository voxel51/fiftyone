"""
Data annotation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import getpass
import logging

import eta.core.annotations as etaa
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

fouc = fou.lazy_import("fiftyone.utils.cvat")


logger = logging.getLogger(__name__)


_SUPPORTED_LABEL_TYPES = (
    fol.Classifications,
    fol.Classification,
    fol.Detections,
    fol.Detection,
    fol.Keypoints,
    fol.Polylines,
    fol.Polyline,
)
_SUPPORTED_FIELD_TYPES = (
    fof.IntField,
    fof.FloatField,
    fof.StringField,
    fof.BooleanField,
)
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


def annotate(
    samples,
    backend="cvat",
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=True,
    media_field="filepath",
    launch_editor=False,
    **kwargs,
):
    """Exports the samples and optional label field(s) to the given
    annotation backend.

    The ``backend`` parameter controls which annotation backend to use.
    Depending on the backend you use, you may want/need to provide extra
    keyword arguments to this function for the constructor of the backend's
    annotation API:

    -   ``"cvat"``: :class:`fiftyone.utils.cvat.CVATAnnotationAPI`

    See :ref:`this page <cvat-annotation>` for more information about using
    this method, including how to define label schemas using the
    ``label_schema``, ``label_field``, ``label_type``, ``classes``, and
    ``attributes`` parameters, and how to configure login credentials for
    your annotation provider.

    Args:
        backend ("cvat"): the annotation backend to use. Supported values
            are ``("cvat")``
        label_schema (None): a dictionary defining the label schema to use.
            If this argument is provided, it takes precedence over
            ``label_field`` and ``label_type``
        label_field (None): a string indicating either a new or existing
            label field to annotate
        label_type (None): a string indicating the type of labels to expect
            when creating a new ``label_field``. Supported values are
            ``("detections", "classifications", "polylines", "keypoints", "scalar")``
        classes (None): a list of strings indicating the class options for
            either ``label_field`` or all fields in ``label_schema``
            without classes specified. All new label fields must have a
            class list provided via one of the supported methods. For
            existing label fields, if classes are not provided by this
            argument nor ``label_schema``, they are parsed from
            :meth:`fiftyone.core.dataset.Dataset.classes` or
            :meth:`fiftyone.core.dataset.Dataset.default_classes`
        attributes (True): specifies the label attributes of each label
            field to include (other than their ``label``, which is always
            included) in the annotation export. Can be any of the
            following:

            -   ``True``: export all label attributes
            -   ``False``: don't export any custom label attributes
            -   a list of label attributes to export
            -   a dict mapping attribute names to dicts specifying the details
                of the attribute field

            If provided, this parameter will apply to all label fields in
            ``label_schema`` that do not define their attributes
        media_field ("filepath"): the field containing the paths to the
            media files to upload
        launch_editor (False): whether to launch the annotation backend's
            editor after uploading the samples
        **kwargs: additional arguments to send to the annotation backend

    Returns:
        the :class:`AnnotationInfo` for the export
    """
    if not samples:
        raise ValueError("%s is empty" % samples.__class__.__name__)

    annotation_label_schema = AnnotationLabelSchema(
        backend=backend,
        label_schema=label_schema,
        label_field=label_field,
        classes=classes,
        attributes=attributes,
        label_type=label_type,
        samples=samples,
    )
    label_schema = annotation_label_schema.complete_label_schema

    if backend == "cvat":
        annotation_info = fouc.annotate(
            samples,
            launch_editor=launch_editor,
            label_schema=label_schema,
            media_field=media_field,
            **kwargs,
        )
    else:
        raise ValueError("Unsupported annotation backend %s" % backend)

    return annotation_info


def load_annotations(samples, info, **kwargs):
    """Loads the labels from the given annotation run into this dataset.

    See :ref:`this page <cvat-loading-annotations>` for more information about
    using this method to import annotations that you have scheduled by calling
    :func:`annotate`.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        info: the :class`AnnotationInfo` returned by the call to
            :meth:`fiftyone.core.collections.SampleCollection.annotate`
        **kwargs: keyword arguments to pass to the ``load_annotations()``
            method of the annotation backend
    """
    if info.backend == "cvat":
        if not isinstance(info, fouc.CVATAnnotationInfo):
            raise ValueError(
                "Expected info to be of type %s; but found %s"
                % (fouc.CVATAnnotationInfo, type(info))
            )

        annotations_results, additional_results = fouc.load_annotations(
            info, **kwargs
        )
    else:
        raise ValueError("Unsupported annotation backend %s" % info.backend)
        return

    if not annotations_results:
        logger.warning("No annotations found")
        return

    default_label_types_map_rev = {
        v: k for k, v in AnnotationLabelSchema.DEFAULT_LABEL_TYPES_MAP.items()
    }

    is_video = samples.media_type == fom.VIDEO

    label_schema = info.label_schema
    for label_field in label_schema:

        # First add unexpected labels to new fields
        if label_field in additional_results:
            new_results = additional_results[label_field]
            for new_type, annotations in new_results.items():
                new_field_name = input(
                    "\nFound unexpected labels of type '%s' when loading "
                    "annotations for field '%s'.\nPlease enter a new field "
                    "name in which to store these annotations, or an empty "
                    "name to skip them: " % (new_type, label_field)
                )
                if not new_field_name:
                    logger.info(
                        "Skipping unexpected labels of type '%s' in field "
                        "'%s'",
                        new_type,
                        label_field,
                    )

                if is_video and not new_field_name.startswith("frames."):
                    new_field_name = "frames." + new_field_name

                # Add new field
                fo_label_type = default_label_types_map_rev[new_type]
                if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
                    is_list = True
                    list_field = fo_label_type._LABEL_LIST_FIELD
                else:
                    is_list = False

                for sample in samples:
                    sample_id = sample.id
                    if sample_id in annotations:
                        sample_annots = annotations[sample_id]
                        if is_video:
                            images = sample.frames.values()
                        else:
                            images = [sample]

                        for image in images:
                            if is_video:
                                if image.id not in sample_annots:
                                    continue

                                image_annots = sample_annots[image.id]
                            else:
                                image_annots = sample_annots

                            if is_list:
                                new_label = fo_label_type()
                                annot_list = list(image_annots.values())
                                new_label[list_field] = annot_list
                            elif not image_annots:
                                continue
                            else:
                                new_label = list(image_annots.values())[0]

                            image[new_field_name] = new_label

                        sample.save()

        # Now import expected labels into their appropriate fields

        annotations = annotations_results.get(label_field, None)

        if not annotations:
            logger.info("No annotations found for field '%s'", label_field)
            continue

        label_info = label_schema[label_field]
        label_type = label_info["type"]
        existing_field = label_info["existing_field"]

        formatted_label_field = label_field
        if is_video and label_field.startswith("frames."):
            formatted_label_field = label_field[len("frames.") :]

        if not isinstance(list(annotations.values())[0], dict):
            # Only setting top-level sample or frame field, label parsing is
            # not required
            for sample_id, value in annotations.items():
                sample = samples[sample_id]
                if type(value) == dict:
                    frame_ids = list(value.keys())
                    frames = samples.select_frames(frame_ids).first()
                    for frame in frames.values():
                        if frame.id in value:
                            frame_value = value[frame.id]
                            frame[formatted_label_field] = frame_value
                            frame.save()
                else:
                    sample[label_field] = value
                    sample.save()

            continue

        if not existing_field:
            # Add new field
            fo_label_type = default_label_types_map_rev[label_type]
            if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
                is_list = True
                list_field = fo_label_type._LABEL_LIST_FIELD
            else:
                is_list = False

            for sample in samples:
                sample_id = sample.id
                if sample_id in annotations:
                    sample_annots = annotations[sample_id]
                    if is_video:
                        images = sample.frames.values()
                    else:
                        images = [sample]

                    for image in images:
                        if is_video:
                            if image.id not in sample_annots:
                                continue

                            image_annots = sample_annots[image.id]
                        else:
                            image_annots = sample_annots

                        if is_list:
                            new_label = fo_label_type()
                            annot_list = list(image_annots.values())
                            new_label[list_field] = annot_list
                        elif not image_annots:
                            continue
                        else:
                            new_label = list(image_annots.values())[0]

                        image[formatted_label_field] = new_label

                    sample.save()

            continue

        # Setting a label field, need to parse, add, delete, and merge labels
        annotation_label_ids = []
        for sample in annotations.values():
            if is_video:
                for frame in sample.values():
                    annotation_label_ids.extend(list(frame.keys()))
            else:
                annotation_label_ids.extend(list(sample.keys()))

        sample_ids = list(annotations.keys())

        _, id_path = samples._get_label_field_path(label_field, "id")

        prev_label_ids = []
        for ids in info.id_map[label_field].values():
            if ids is None:
                continue

            if len(ids) > 0 and type(ids[0]) == list:
                for frame_ids in ids:
                    prev_label_ids.extend(frame_ids)
            else:
                prev_label_ids.extend(ids)

        prev_ids = set(prev_label_ids)
        ann_ids = set(annotation_label_ids)
        deleted_labels = prev_ids - ann_ids
        added_labels = ann_ids - prev_ids
        labels_to_merge = ann_ids - deleted_labels - added_labels

        # Remove deleted labels
        deleted_view = samples.select_labels(ids=list(deleted_labels))
        samples._dataset.delete_labels(view=deleted_view, fields=label_field)

        if is_video and label_type in ("detections", "keypoints", "polylines"):
            tracking_index_map, max_tracking_index = _get_tracking_index_map(
                samples, label_field, annotations
            )
        else:
            tracking_index_map = {}
            max_tracking_index = 0

        # Add or merge remaining labels
        annotated_samples = samples._dataset.select(sample_ids)
        for sample in annotated_samples:
            sample_id = sample.id
            formatted_label_field = label_field
            if is_video:
                formatted_label_field, _ = samples._handle_frame_field(
                    label_field
                )
                images = sample.frames.values()
            else:
                images = [sample]

            sample_annots = annotations[sample_id]
            for image in images:
                if is_video:
                    image_annots = sample_annots[image.id]
                else:
                    image_annots = sample_annots

                has_label_list = False
                image_label = image[formatted_label_field]

                if isinstance(image_label, fol._HasLabelList):
                    has_label_list = True
                    list_field = image_label._LABEL_LIST_FIELD
                    labels = image_label[list_field]
                else:
                    labels = [image_label]

                for label in labels:
                    label_id = label.id
                    if label_id in labels_to_merge:
                        annot_label = image_annots[label_id]
                        if is_video and "index" in annot_label:
                            if (
                                annot_label.index
                                in tracking_index_map[sample_id]
                            ):
                                annot_label.index = tracking_index_map[
                                    sample_id
                                ][annot_label.index]
                            else:
                                tracking_index_map[sample_id][
                                    annot_label.index
                                ] = max_tracking_index
                                annot_label.index = max_tracking_index
                                max_tracking_index += 1

                        for field in annot_label._fields_ordered:
                            if (
                                field in label._fields_ordered
                                and label[field] == annot_label[field]
                            ):
                                pass
                            else:
                                label[field] = annot_label[field]

                if has_label_list:
                    for annot_label_id, annot_label in image_annots.items():
                        if annot_label_id in added_labels:
                            if is_video and "index" in annot_label:
                                if (
                                    annot_label.index
                                    in tracking_index_map[sample_id]
                                ):
                                    annot_label.index = tracking_index_map[
                                        sample_id
                                    ][annot_label.index]
                                else:
                                    tracking_index_map[sample_id][
                                        annot_label.index
                                    ] = max_tracking_index
                                    annot_label.index = max_tracking_index
                                    max_tracking_index += 1

                            labels.append(annot_label)

            sample.save()


def _get_tracking_index_map(samples, label_field, annotations):
    _, index_path = samples._get_label_field_path(label_field, "index")
    _, id_path = samples._get_label_field_path(label_field, "id")
    indices = flatten_list(samples.values(index_path))
    max_index = max([i for i in indices if i is not None]) + 1
    ids = flatten_list(samples.values(id_path))
    existing_index_map = dict(zip(ids, indices))
    tracking_index_map = {}
    for sid, sample_annots in annotations.items():
        if sid not in tracking_index_map:
            tracking_index_map[sid] = {}

        for fid, frame_annots in sample_annots.items():
            for lid, annot_label in frame_annots.items():
                if lid in existing_index_map:
                    tracking_index_map[sid][
                        annot_label.index
                    ] = existing_index_map[lid]

    return tracking_index_map, max_index


class BaseAnnotationAPI(object):
    """Base class for annotation backend APIs.

    Annotation APIs provide support for sending samples for annotation and
    importing them back into FiftyOne.
    """

    def prompt_username_password(self, host=None):
        prefix = "%s " % host if host else ""
        username = input("%susername: " % prefix)
        password = getpass.getpass(prompt="%spassword: " % prefix)
        return {"username": username, "password": password}

    def prompt_api_key(self, host=None):
        prefix = "%s " % host if host else ""
        return getpass.getpass(prompt="%sAPI key: " % prefix)


class AnnotationInfo(object):
    """Class containing the results of an annotation run created by
    :meth:`fiftyone.core.collections.SampleCollection.annotate`.
    """

    def __init__(self, label_schema, backend):
        self.label_schema = label_schema
        self.backend = backend
        self.id_map = {}

    def store_label_ids(self, samples):
        if not self.label_schema:
            return

        for label_field, schema in self.label_schema.items():
            if schema["type"] == "scalar":
                continue

            try:
                _, label_id_path = samples._get_label_field_path(
                    label_field, "id"
                )
            except:
                continue

            sample_ids, label_ids = samples.values(["id", label_id_path])
            self.id_map[label_field] = dict(zip(sample_ids, label_ids))


class AnnotationLabelSchema(object):
    """Class defining an annotation label schema for an annotation run
    performed by :meth:`fiftyone.core.collections.SampleCollection.annotate`.
    """

    DEFAULT_LABEL_TYPES = [
        "classifications",
        "classification",
        "detections",
        "keypoints",
        "polylines",
        "scalar",
    ]

    DEFAULT_LABEL_TYPES_MAP = {
        fol.Classification: "classification",
        fol.Classifications: "classifications",
        fol.Detection: "detection",
        fol.Detections: "detections",
        fol.Keypoint: "keypoint",
        fol.Keypoints: "keypoints",
        fol.Polyline: "polyline",
        fol.Polylines: "polylines",
    }

    def __init__(
        self,
        backend,
        label_schema,
        label_field,
        classes,
        attributes,
        label_type,
        samples,
    ):
        self.backend = backend
        self.label_field = label_field
        self.classes = classes
        self.attributes = attributes
        self.label_type = label_type
        self.samples = samples

        if label_schema is None:
            label_schema = self._init_schema_from_kwargs()

        self.label_schema = label_schema
        self.complete_label_schema = self._build_complete_schema()

    def backend_attr_types(self):
        """The list of attribute types supported by the annotation backend."""
        if self.backend == "cvat":
            return list(fouc.ATTRIBUTE_TYPES_REQUIREMENTS.keys())

        raise ValueError(
            "Annotation backend '%s' is not supported" % self.backend
        )

    def backend_default_attr_type(self):
        """The default attribute type for the annotation backend."""
        if self.backend == "cvat":
            return "text"

        raise ValueError(
            "Annotation backend '%s' is not supported" % self.backend
        )

    def backend_selection_attr_type(self):
        """The selection type for the annotation backend."""
        if self.backend == "cvat":
            return "select"

        raise ValueError(
            "Annotation backend '%s' is not supported" % self.backend
        )

    def backend_requires_attr_values(self, attr_type):
        """Determines whether the annotation backend requires a list of values
        for attributes of the given type.
        """
        if attr_type not in self.backend_attr_types():
            raise ValueError(
                "Annotation backend '%s' does not support attribute type '%s'"
                % (self.backend, attr_type)
            )

        if self.backend == "cvat":
            return "values" in fouc.ATTRIBUTE_TYPES_REQUIREMENTS[attr_type]

        raise ValueError(
            "Annotation backend '%s' is not supported" % self.backend
        )

    def _init_schema_from_kwargs(self):
        if self.label_field is None:
            raise ValueError(
                "Either `label_schema` or `label_field` is required"
            )

        schema = {}

        schema[self.label_field] = {}
        if self.classes is not None:
            schema[self.label_field]["classes"] = self.classes

        if self.attributes not in (True, False, None):
            schema[self.label_field]["attributes"] = self.attributes

        if self.label_type is not None:
            schema[self.label_field]["type"] = self.label_type

        return schema

    def _build_complete_schema(self):
        d = self.label_schema

        label_schema = {}
        field_schema = self.samples.get_field_schema() or []
        frame_field_schema = self.samples.get_frame_field_schema() or []

        if isinstance(d, list):
            d = {lf: {} for lf in d}

        if not isinstance(d, dict):
            raise ValueError("`label_schema` must be a dictionary or a list")

        for label_field, label_info in d.items():
            frame_field, is_frame_field = self.samples._handle_frame_field(
                label_field
            )

            existing_field = (
                label_field in field_schema
                or frame_field in frame_field_schema
            )

            label_type = self._get_label_type(
                label_field,
                label_info,
                existing_field,
                frame_field,
                is_frame_field,
            )
            classes = self._get_classes(
                label_field, label_info, existing_field, label_type,
            )
            if label_type != "scalar":
                attributes = self._get_attributes(
                    label_field, label_info, existing_field, label_type
                )
            else:
                attributes = {}

            label_schema[label_field] = {}
            label_schema[label_field]["type"] = label_type
            label_schema[label_field]["classes"] = classes
            label_schema[label_field]["attributes"] = attributes
            label_schema[label_field]["existing_field"] = existing_field

        return label_schema

    def _get_label_type(
        self,
        label_field,
        label_info,
        existing_field,
        frame_field,
        is_frame_field,
    ):
        if existing_field:
            self._field_label_type = None
            is_supported_label = False
            if label_field is not None:
                if is_frame_field:
                    field_type = self.samples.get_frame_field_schema()[
                        frame_field
                    ]
                else:
                    field_type = self.samples.get_field_schema()[label_field]

                if isinstance(field_type, fof.EmbeddedDocumentField):
                    doc_type = field_type.document_type
                    if doc_type in self.DEFAULT_LABEL_TYPES_MAP:
                        label_type = self.DEFAULT_LABEL_TYPES_MAP[doc_type]
                    else:
                        raise TypeError(
                            "Label field %s of type %s is not supported"
                            % (label_field, str(field_type.document_type))
                        )

                elif type(field_type) not in _SUPPORTED_FIELD_TYPES:
                    raise TypeError(
                        "Field %s of type %s is not supported as a scalar type"
                        % (label_field, str(field_type))
                    )
                else:
                    label_type = "scalar"
        else:
            if "type" in label_info:
                label_type = label_info["type"]
            elif self.label_type is not None:
                label_type = self.label_type
            else:
                raise ValueError(
                    "The `label_type` argument of 'type' in the "
                    "`label_schema` is required when defining a new label "
                    "field"
                )

            if label_type not in self.DEFAULT_LABEL_TYPES:
                raise ValueError(
                    "Unrecognized label type '%s'. Supported values are %s"
                    % (label_type, self.DEFAULT_LABEL_TYPES)
                )

        return label_type

    def _get_classes(
        self, label_field, label_info, existing_field, label_type
    ):
        if "classes" in label_info and label_info["classes"]:
            return label_info["classes"]

        if self.classes:
            return self.classes

        if label_type == "scalar":
            return []

        if not existing_field:
            raise ValueError(
                "You must provide a class list for new label field '%s'"
                % label_field
            )

        classes = self.samples.classes.get(label_field, None)
        if classes:
            return classes

        if self.samples.default_classes:
            return self.samples.default_classes

        _, label_path = self.samples._get_label_field_path(
            label_field, "label"
        )
        return self.samples._dataset.distinct(label_path)

    def _get_attributes(
        self, label_field, label_info, existing_field, label_type
    ):
        if "attributes" in label_info:
            attributes = label_info["attributes"]
        else:
            attributes = self.attributes

        if attributes not in [True, False, None]:
            pass
        elif label_type == "scalar":
            attributes = {}
        elif existing_field and attributes == True:
            attributes = self._get_label_attributes(label_field)
        else:
            attributes = {}

        return self._format_attributes(attributes)

    def _format_attributes(self, attributes):
        output_attrs = {}
        if isinstance(attributes, list):
            attributes = {a: {} for a in attributes}

        for attr, attr_info in attributes.items():
            formatted_info = {}

            attr_type = attr_info.get("type", None)
            values = attr_info.get("values", None)
            default = attr_info.get("default", None)

            if attr_type is None:
                if values is None:
                    formatted_info["type"] = self.backend_default_attr_type()
                else:
                    formatted_info["type"] = self.backend_selection_attr_type()
                    formatted_info["values"] = values
                    if default not in (None, "") and default in values:
                        formatted_info["default"] = default
            else:
                if attr_type in self.backend_attr_types():
                    formatted_info["type"] = attr_type
                else:
                    raise ValueError(
                        "Attribute type '%s' is not supported for backend '%s'"
                        % (attr_type, self.backend)
                    )

                if values is not None:
                    formatted_info["values"] = values
                elif self.backend_requires_attr_values(attr_type):
                    raise ValueError(
                        "Attribute type '%s' requires a list of values"
                        % attr_type
                    )

                if default not in (None, ""):
                    if values is not None and default not in values:
                        raise ValueError(
                            "Default value '%s' does not appear in list of "
                            "values '%s'" % (default, ", ".join(values))
                        )

                    formatted_info["default"] = default

            output_attrs[attr] = formatted_info

        return output_attrs

    def _get_label_attributes(self, label_field):
        attributes = {}
        label_type, label_path = self.samples._get_label_field_path(
            label_field
        )
        labels = self.samples.values(label_path)
        labels = flatten_list(labels)
        if len(labels) < 0:
            return attributes

        default_attr_fields = type(labels[0])._fields_ordered
        for label in labels:
            current_fields = label._fields_ordered
            non_default = list(set(current_fields) - set(default_attr_fields))
            for attr_field in non_default:
                if attr_field not in attributes:
                    attributes[attr_field] = {
                        "type": self.backend_default_attr_type()
                    }

            if hasattr(label, "attributes"):
                for attr in label.attributes.keys():
                    attr_name = "attribute:" + attr
                    if attr_name not in attributes:
                        attributes[attr_name] = {
                            "type": self.backend_default_attr_type()
                        }

        return attributes


def flatten_list(x):
    if isinstance(x, list):
        return [a for i in x for a in flatten_list(i)]

    return [x]
