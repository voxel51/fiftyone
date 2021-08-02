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
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

fouc = fou.lazy_import("fiftyone.utils.cvat")
foul = fou.lazy_import("fiftyone.utils.labelbox")


logger = logging.getLogger(__name__)


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
    label_field=None,
    launch_editor=False,
    extra_attrs=None,
    **kwargs
):
    """Exports the samples and a label field to the given annotation
    backend.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        backend ("cvat"): the name of the annotation backend to which to
            export the samples. Options are ("cvat", "labelbox")
        label_field (None): a string indicating the label field to export to the
            annotation backend. A value of `None` indicates exporting only
            the media.
        launch_editor (False): whether to launch the backend editor in a
            browser window after uploading samples
        extra_attrs (None): a list of attribute field names or dictionary of
            attribute field names to `AnnotationWidgetType` specifying the
            attribute field names on the `label_field` to annotate. By
            default, no extra attributes are sent for annotation, only the
            label
        **kwargs: additional arguments to send to the annotation backend

    Returns:
        annotation_info: the
            :class:`fiftyone.utils.annotations.AnnotationInfo` used to
            upload and annotate the given samples
    """
    if backend == "cvat":
        annotation_info = fouc.annotate(
            samples,
            label_field=label_field,
            launch_editor=launch_editor,
            extra_attrs=extra_attrs,
            **kwargs
        )
    elif backend == "labelbox":
        annotation_info = foul.annotate(
            samples,
            label_field=label_field,
            launch_editor=launch_editor,
            extra_attrs=extra_attrs,
            **kwargs
        )
    else:
        logger.warning("Unsupported annotation backend %s" % backend)
        return

    return annotation_info


def load_annotations(samples, info, label_field, **kwargs):
    """Loads labels from the given annotation information.
    
    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        info: the :class`AnnotationInfo` returned from a call to
            `annotate()`
        label_field: the label field to create or to merge the annotations
            into
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

        annotations = fouc.load_annotations(info, **kwargs)
    elif info.backend == "labelbox":
        if not isinstance(info, foul.LabelboxAnnotationInfo):
            raise ValueError(
                "Expected info to be of type"
                " `fiftyone.utils.labelbox.LabelboxAnnotationInfo` when"
                " using the Labelbox backend. Found %s" % str(type(info))
            )

        annotations = fouc.load_annotations(info, **kwargs)
    else:
        logger.warning("Unsupported annotation backend %s" % info.backend)
        return

    if not annotations:
        logger.warning("No annotations found")
        return

    is_video = True if samples.media_type == fom.VIDEO else False

    if type(list(annotations.values())[0]) != dict:
        # Only setting top-level field, label parsing is not required
        for sample_id, value in annotations.items():
            sample = samples[sample_id]
            sample[label_field] = value
            sample.save()
        return

    # TODO: Add check to see if label_field doesn't exist, then just add all
    # annotation labels to that new field

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
    for ids in info.id_map.values():
        if len(ids) > 0 and type(ids[0]) == list:
            for frame_ids in ids:
                prev_label_ids.extend(frame_ids)
        else:
            prev_label_ids.extend(ids)

    prev_ids = set(prev_label_ids)
    ann_ids = set(annotation_label_ids)
    curr_ids = set(current_label_ids)  # Not currently used, remove in future
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
        if is_video:
            images = sample.frames.values()
            if label_field.startswith("frames."):
                formatted_label_field = label_field[len("frames.") :]
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

    def __init__(self, label_field, backend):
        self.label_field = label_field
        self.backend = backend
        self.id_map = None

    def store_label_ids(self, samples):
        if self.label_field is not None:
            label_id_path = samples._get_label_field_path(
                self.label_field, "id"
            )[1]
            label_ids = samples.values(label_id_path)
            sample_ids = samples.values("id")
            self.id_map = dict(zip(sample_ids, label_ids))
