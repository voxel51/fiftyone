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
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

fouc = fou.lazy_import("fiftyone.utils.cvat")
foul = fou.lazy_import("fiftyone.utils.labelbox")


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
class AnnotationConfig(etaa.AnnotationConfig):
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


def draw_labeled_images(
    samples, anno_dir, label_fields=None, annotation_config=None
):
    """Renders annotated versions of the image samples with label field(s)
    overlaid to the given directory.

    The filenames of the sample images are maintained, unless a name conflict
    would occur in ``anno_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The images are written in format ``fo.config.default_image_ext``.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        anno_dir: the directory to write the annotated images
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations

    Returns:
        the list of paths to the labeled images
    """
    if annotation_config is None:
        annotation_config = AnnotationConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=anno_dir)
    output_ext = fo.config.default_image_ext

    outpaths = []
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            outpath = filename_maker.get_output_path(
                sample.filepath, output_ext=output_ext
            )
            draw_labeled_image(
                sample,
                outpath,
                label_fields=label_fields,
                annotation_config=annotation_config,
            )
            outpaths.append(outpath)

    return outpaths


def draw_labeled_image(
    sample, outpath, label_fields=None, annotation_config=None
):
    """Draws an annotated version of the image sample with its label field(s)
    overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample` instance
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations
    """
    if annotation_config is None:
        annotation_config = AnnotationConfig.default()

    img = etai.read(sample.filepath)
    frame_labels = _to_frame_labels(sample, label_fields=label_fields)

    anno_img = etaa.annotate_image(
        img, frame_labels, annotation_config=annotation_config
    )

    etai.write(anno_img, outpath)


def draw_labeled_videos(
    samples, anno_dir, label_fields=None, annotation_config=None
):
    """Renders annotated versions of the video samples with label field(s)
    overlaid to the given directory.

    The filenames of the sample videos are maintained, unless a name conflict
    would occur in ``anno_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The videos are written in format ``fo.config.default_video_ext``.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        anno_dir: the directory to write the annotated videos
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the samples to render. If omitted, all
            compatiable fields are rendered
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations

    Returns:
        the list of paths to the labeled videos
    """
    if annotation_config is None:
        annotation_config = AnnotationConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=anno_dir)
    output_ext = fo.config.default_video_ext

    try:
        num_samples = len(samples)
    except:
        num_samples = None

    outpaths = []

    for idx, sample in enumerate(samples, 1):
        outpath = filename_maker.get_output_path(
            sample.filepath, output_ext=output_ext
        )

        if num_samples is not None:
            logger.info(
                "Rendering video %d/%d: '%s'", idx, num_samples, outpath
            )
        else:
            logger.info("Rendering video %d: '%s'", idx, outpath)

        draw_labeled_video(
            sample,
            outpath,
            label_fields=label_fields,
            annotation_config=annotation_config,
        )
        outpaths.append(outpath)

    return outpaths


def draw_labeled_video(
    sample, outpath, label_fields=None, annotation_config=None
):
    """Draws an annotated version of the video sample with its label field(s)
    overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample` instance
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the sample to render. If omitted, all
            compatiable fields are rendered
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations
    """
    if annotation_config is None:
        annotation_config = AnnotationConfig.default()

    video_path = sample.filepath
    video_labels = _to_video_labels(sample, label_fields=label_fields)

    etaa.annotate_video(
        video_path, video_labels, outpath, annotation_config=annotation_config
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
    launch_editor=False,
    **kwargs
):
    """Exports the samples and a label field to the given annotation
    backend.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        backend ("cvat"): the name of the annotation backend to which to
            export the samples. Options are ("cvat", "labelbox")
        label_schema (None): a dictionary indicating the type, class options, and
            attributes for each label field. This is required for new label fields
            if `classes` is not provided.
            For existing label fields, provided classes and attributes will be used
            instead of parsing existing classes or attributes
        label_field (None): a string indicating either an existing label field to upload,
            or the name of a new label field to create. Required if `label_schema` is not provided.
        label_type (None): a string indicating the type of labels to expect 
            when creating a new `label_field`. 
            Options: ("detections", "classifications", "polylines", "keypoints", "scalar")
        classes (None): a list of strings indicating the class options. These
            classes will be used as the default for all fields without classes
            specified in the `label_schema`. This is required for new label fields
            if `label_schema` is not provided. For existing label fields, if
            neither `classes` nor `label_schema` is given, default classes are used
            if available, otherwise classes are parsed from existing labels in the
            label field
        attributes (True): a list of string attributes or dictionary of attribute
            name, type, values, and default values that will be the default for
            every label field without attributes specified through the
            `label_schema`. `True` indicates loading all values for existing
            label fields. `False` indicates loading no attributes
        launch_editor (False): whether to launch the backend editor in a
            browser window after uploading samples
        **kwargs: additional arguments to send to the annotation backend

    Returns:
        annotation_info: the
            :class:`fiftyone.utils.annotations.AnnotationInfo` used to
            upload and annotate the given samples
    """
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
            **kwargs
        )
    elif backend == "labelbox":
        annotation_info = foul.annotate(
            samples,
            launch_editor=launch_editor,
            label_schema=label_schema,
            **kwargs
        )
    else:
        logger.warning("Unsupported annotation backend %s" % backend)
        return

    return annotation_info


def load_annotations(samples, info, **kwargs):
    """Loads labels from the given annotation information.
    
    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        info: the :class`AnnotationInfo` returned from a call to
            `annotate()`
        **kwargs: additional arguments to pass to the `load_annotations`
            function of the specified backend
    """
    if info.backend == "cvat":
        if not isinstance(info, fouc.CVATAnnotationInfo):
            raise ValueError(
                "Expected info to be of type"
                " `fiftyone.utils.cvat.CVATAnnotationInfo` when"
                " using the CVAT backend. Found %s" % str(type(info))
            )

        annotations_results, additional_results = fouc.load_annotations(
            info, **kwargs
        )
    elif info.backend == "labelbox":
        if not isinstance(info, foul.LabelboxAnnotationInfo):
            raise ValueError(
                "Expected info to be of type"
                " `fiftyone.utils.labelbox.LabelboxAnnotationInfo` when"
                " using the Labelbox backend. Found %s" % str(type(info))
            )

        annotations_results, additional_results = fouc.load_annotations(
            info, **kwargs
        )
    else:
        logger.warning("Unsupported annotation backend %s" % info.backend)
        return

    if not annotations_results:
        logger.warning("No annotations found")
        return

    default_label_types_map = {
        v: k for k, v in AnnotationLabelSchema.default_label_types_dict.items()
    }

    is_video = True if samples.media_type == fom.VIDEO else False

    label_schema = info.label_schema
    for label_field in label_schema.keys():
        if label_field in additional_results:
            for new_field, annotations in additional_results[
                label_field
            ].items():
                new_field_name = input(
                    "\nLabels of type '%s' found when loading annotations for field '%s'.\nPlease enter a name for the field in which to store these addtional annotations: "
                    % (new_field, label_field)
                )
                # Add new field
                fo_label_type = default_label_types_map[new_field]
                is_list = False
                if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
                    is_list = True
                    list_field = fo_label_type._LABEL_LIST_FIELD
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
                            else:
                                if len(image_annots) == 0:
                                    continue
                                else:
                                    new_label = list(image_annots.values())[0]

                            image[new_field_name] = new_label
                        sample.save()

        if label_field not in annotations_results:
            logger.info("No annotations found for field '%s'" % label_field)
            continue
        annotations = annotations_results[label_field]

        if len(annotations) == 0:
            logger.info("No annotations found for field '%s'" % label_field)
            continue

        label_info = label_schema[label_field]
        label_type = label_info["type"]
        existing_field = label_info["existing_field"]

        formatted_label_field = label_field
        is_frame_label = False
        if is_video and label_field.startswith("frames."):
            is_frame_label = True
            formatted_label_field = label_field[len("frames.") :]

        if type(list(annotations.values())[0]) != dict:
            # Only setting top-level sample or frame field, label parsing is not required
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
            fo_label_type = default_label_types_map[label_type]
            is_list = False
            if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
                is_list = True
                list_field = fo_label_type._LABEL_LIST_FIELD
            for sample in samples:
                sample_id = sample.id
                if sample_id in annotations:
                    sample_annots = annotations[sample_id]
                    if is_video and is_frame_label:
                        images = sample.frames.values()
                    else:
                        images = [sample]
                    for image in images:
                        if is_video and is_frame_label:
                            if image.id not in sample_annots:
                                continue

                            image_annots = sample_annots[image.id]
                        else:
                            image_annots = sample_annots

                        if is_list:
                            new_label = fo_label_type()
                            annot_list = list(image_annots.values())
                            new_label[list_field] = annot_list
                        else:
                            if len(image_annots) == 0:
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

        id_path = samples._get_label_field_path(label_field, "id")[1]
        current_label_ids = samples.distinct(id_path)

        prev_label_ids = []
        for ids in info.id_map[label_field].values():
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

        # Add or merge remaining labels
        annotated_samples = samples._dataset.select(sample_ids)
        for sample in annotated_samples:
            sample_id = sample.id
            formatted_label_field = label_field
            if is_video and is_frame_label:
                images = sample.frames.values()
            else:
                images = [sample]
            sample_annots = annotations[sample_id]
            for image in images:
                if is_video and is_frame_label:
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
                            labels.append(annot_label)

            sample.save()


class BaseAnnotationAPI(object):
    """Basic interface for connecting to an annotation provider, sending samples for
    annotation, and importing them back into the collection.
    """

    def prompt_username_password(self, host=""):
        username = input("%s Username: " % host)
        password = getpass.getpass(prompt="%s Password: " % host)
        return {"username": username, "password": password}

    def prompt_api_key(self, host=""):
        api_key = getpass.getpass(prompt="%s API Key: " % host)
        return api_key

    def get_api_key(self, host=""):
        pass


class AnnotationInfo(object):
    """Basic interface for results returned from `annotate()` call"""

    def __init__(self, label_schema, backend, extra_attrs=None):
        self.label_schema = label_schema
        self.backend = backend
        self.extra_attrs = extra_attrs
        self.id_map = {}

    def store_label_ids(self, samples):
        if self.label_schema is not None:
            for label_field in self.label_schema.keys():
                field_schema = samples.get_field_schema() or []
                frame_field_schema = samples.get_frame_field_schema() or []
                if (
                    label_field in field_schema
                    or label_field in frame_field_schema
                ):
                    label_id_path = samples._get_label_field_path(
                        label_field, "id"
                    )[1]
                    label_ids = samples.values(label_id_path)
                    sample_ids = samples.values("id")
                    self.id_map[label_field] = dict(zip(sample_ids, label_ids))


class AnnotationLabelSchema(object):
    default_label_types = [
        "classifications",
        "classification",
        "detections",
        "keypoints",
        "polylines",
        "scalar",
    ]

    default_label_types_dict = {
        fol.Classifications: "classifications",
        fol.Classification: "classification",
        fol.Detections: "detections",
        fol.Detection: "detection",
        fol.Keypoints: "keypoints",
        fol.Keypoint: "keypoint",
        fol.Polylines: "polylines",
        fol.Polyline: "polyline",
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
        self.label_schema = label_schema
        self.label_field = label_field
        self.classes = classes
        self.attributes = attributes
        self.label_type = label_type
        self.samples = samples

        if label_schema is None:
            if label_field is None:
                raise ValueError(
                    "Either `label_schema` or `label_field` is required"
                )
            else:
                self.label_schema = self.initialize_schema_from_kwargs()

        self.complete_label_schema = self.build_schema()

    def map_fiftyone_label_to_type(self, label_field, fiftyone_label_type):
        if fiftyone_label_type in self.default_label_types_dict:
            return self.default_label_types_dict[fiftyone_label_type]

    def initialize_schema_from_kwargs(self):
        schema = {}
        if self.label_field is None:
            raise ValueError(
                "`label_field` is required when no `label_schema` is provided"
            )

        schema[self.label_field] = {}
        if self.classes is not None:
            schema[self.label_field]["classes"] = self.classes
        if self.attributes not in [True, False, None]:
            schema[self.label_field]["attributes"] = self.attributes
        if self.label_type is not None:
            schema[self.label_field]["type"] = self.label_type

        return schema

    def build_schema(self):
        d = self.label_schema
        output_schema = {}
        field_schema = self.samples.get_field_schema() or []
        frame_field_schema = self.samples.get_frame_field_schema() or []
        if isinstance(d, list):
            d = {lf: {} for lf in d}

        if isinstance(d, dict):
            for label_field, label_info in d.items():
                frame_field = self.samples._is_frame_field(label_field)

                if (
                    label_field in field_schema
                    or label_field in frame_field_schema
                ):
                    existing_field = True
                else:
                    existing_field = False

                label_type = self.get_label_type(
                    label_field, label_info, existing_field, frame_field
                )
                classes = self.get_classes(
                    label_field,
                    label_info,
                    existing_field,
                    frame_field,
                    label_type,
                )
                if label_type != "scalar":
                    attributes = self.get_attributes(
                        label_field, label_info, existing_field, frame_field
                    )
                else:
                    attributes = {}

                output_schema[label_field] = {}
                output_schema[label_field]["type"] = label_type
                output_schema[label_field]["classes"] = classes
                output_schema[label_field]["attributes"] = attributes
                output_schema[label_field]["existing_field"] = existing_field

        else:
            raise ValueError("`label_schema` must be a dictionary or a list")

        return output_schema

    def get_label_type(
        self, label_field, label_info, existing_field, frame_field
    ):
        if existing_field:
            self._field_label_type = None
            is_supported_label = False
            if label_field is not None:
                if frame_field:
                    formatted_label_field = label_field[len("frames.") :]
                    field_type = self.samples.get_frame_field_schema()[
                        formatted_label_field
                    ]
                else:
                    field_type = self.samples.get_field_schema()[label_field]
                if isinstance(field_type, fof.EmbeddedDocumentField):
                    doc_type = field_type.document_type
                    if doc_type in self.default_label_types_dict:
                        # label_field is a non-primitive Label field
                        label_type = self.default_label_types_dict[doc_type]
                    else:
                        raise TypeError(
                            "Label field %s of type %s is not supported"
                            % (label_field, str(field_type.document_type))
                        )

                elif field_type not in _SUPPORTED_FIELD_TYPES:
                    raise TypeError(
                        "Field %s of type %s is not supported as a `scalar` type"
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
                    'The `label_type` argument of "type" in the `label_schema` is required when defining a new label field'
                )

            if label_type not in self.default_label_types:
                raise ValueError(
                    "label type '%s' is not one of the supported label types: '%s'"
                    % (label_type, ", ".join(self.default_label_types))
                )

        return label_type

    def get_classes(
        self, label_field, label_info, existing_field, frame_field, label_type
    ):
        if "classes" in label_info and label_info["classes"]:
            return label_info["classes"]
        elif self.classes:
            return self.classes
        elif self.label_type == "scalar":
            return []
        elif existing_field:
            if label_field in self.samples.classes:
                # Use label field specific classes
                classes = self.samples.classes[label_field]
                if classes:
                    return classes
            elif self.samples.default_classes:
                # Use general dataset default classes
                return self.samples.default_classes
            else:
                # Parse labels for existing classes
                label_path = self.samples._get_label_field_path(
                    label_field, "label"
                )[1]
                return self.samples._dataset.distinct(label_path)
        else:
            raise ValueError(
                '"classes" are required when defining a new label field'
            )

    def get_attributes(
        self, label_field, label_info, existing_field, frame_field
    ):
        if "attributes" in label_info:
            attributes = label_info["attributes"]
        elif self.attributes not in [True, False, None]:
            attributes = self.attributes
        elif self.label_type == "scalar":
            attributes = {}
        elif existing_field and self.attributes == True:
            attributes = self.parse_all_sample_attrs(label_field)
        else:
            attributes = {}

        return self.format_attributes(attributes)

    def backend_attr_types(self):
        if self.backend == "cvat":
            return list(fouc.ATTRIBUTE_TYPES_REQUIREMENTS.keys())
        elif self.backend == "labelbox":
            return list(foul.ATTRIBUTE_TYPES_REQUIREMENTS.keys())
        else:
            raise ValueError(
                "Annotation backend '%s' is not supported" % self.backend
            )

    def base_backend_attr_type(self):
        if self.backend == "cvat":
            return "text"
        elif self.backend == "labelbox":
            return "text"
        else:
            raise ValueError(
                "Annotation backend '%s' is not supported" % self.backend
            )

    def backend_attr_type_requires_values(self, attr_type):
        if attr_type not in self.backend_attr_types():
            raise ValueError(
                "Annotation backend '%s' does not support attribute type '%s'"
                % (self.backend, attr_type)
            )

        if self.backend == "cvat":
            return "values" in fouc.ATTRIBUTE_TYPES_REQUIREMENTS[attr_type]
        elif self.backend == "labelbox":
            return "values" in foul.ATTRIBUTE_TYPES_REQUIREMENTS[attr_type]
        else:
            raise ValueError(
                "Annotation backend '%s' is not supported" % self.backend
            )

    def selection_backend_attr_type(self):
        if self.backend == "cvat":
            return "select"
        elif self.backend == "labelbox":
            return "select"
        else:
            raise ValueError(
                "Annotation backend '%s' is not supported" % self.backend
            )

    def format_attributes(self, attributes):
        output_attrs = {}
        for attr, attr_info in attributes.items():
            formatted_info = {}

            attr_type = attr_info.get("type", None)
            values = attr_info.get("values", None)
            default_value = attr_info.get("default_value", None)

            if attr_type is None:
                if values is None:
                    formatted_info["type"] = self.base_backend_attr_type()
                else:
                    formatted_info["type"] = self.selection_backend_attr_type()
                    formatted_info["values"] = values
                    if (
                        default_value not in [None, ""]
                        and default_value in values
                    ):
                        formatted_info["default_value"] = default_value
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
                elif self.backend_attr_type_requires_values(attr_type):
                    raise ValueError(
                        "Attribute type '%s' requires a list of values"
                        % attr_type
                    )

                if default_value not in [None, ""]:
                    if values is not None and default_value not in values:
                        raise ValueError(
                            "Default value '%s' does not appear in list of values '%s'"
                            % (default_value, ", ".join(values))
                        )
                    formatted_info["default_value"] = default_value

            output_attrs[attr] = formatted_info
        return output_attrs

    def parse_all_sample_attrs(self, label_field):
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
                        "type": self.base_backend_attr_type()
                    }

            if hasattr(label, "attributes"):
                for attr in label.attributes.keys():
                    attr_name = "attribute:" + attr
                    if attr_name not in attributes:
                        attributes[attr_name] = {
                            "type": self.base_backend_attr_type()
                        }

        return attributes


def flatten_list(x):
    if isinstance(x, list):
        return [a for i in x for a in flatten_list(i)]
    else:
        return [x]
