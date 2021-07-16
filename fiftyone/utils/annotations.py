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
import fiftyone.core.utils as fou

fouc = fou.lazy_import("fiftyone.utils.cvat")


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
    samples, config=None, backend="cvat", label_field="ground_truth", **kwargs
):
    """Exports the samples and a label field to the given annotation
    backend.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        config (None): the :class:`AnnotationProviderConfig` containing the
            information needed to upload samples for  annotations
        backend ("cvat"): the name of the annotation backend to which to
            export the samples. Options are ("cvat")
        label_field: a string indicating the label field to export to the
            annotation backend. A value of `None` indicates exporting only
            the media.
        **kwargs: additional arguments to send to the annotation backend

    Returns:
        annotation_info: the
            :class:`fiftyone.utils.annotations.AnnotationInfo` used to
            upload and annotate the given samples
    """
    if backend == "cvat":
        annotation_info = fouc.annotate(
            samples, label_field=label_field, **kwargs
        )
    else:
        logger.warning("Unsupported annotation backend %s" % backend)
        return

    return annotation_info


def load_annotations(
    samples, info, backend="cvat", label_field="ground_truth", **kwargs
):
    """Loads labels from the given annotation backend.
    
    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        info (None): the :class`AnnotationInfo` returned from a call to
            `annotate()`
        backend ("cvat"): the annotation backend to load labels from.
            Options are ("cvat")
        label_field: the label field to create or to merge the annotations
            into
        **kwargs: additional arguments to pass to the `load_annotations`
            function of the specified backend
    """
    if backend == "cvat":
        if not isinstance(info, fouc.CVATAnnotationInfo):
            raise ValueError(
                "Expected info to be of type"
                " `fiftyone.utils.cvat.CVATAnnotationInfo` when"
                " using the CVAT backend. Found %s" % str(type(info))
            )

        annotations = fouc.load_annotations(info, **kwargs)
    else:
        logger.warning("Unsupported annotation backend %s" % backend)
        return

    annotation_label_ids = []
    for sample in annotations.values():
        annotation_label_ids.extend(list(sample.keys()))

    id_path = samples._get_label_field_path(label_field, "id")[1]
    current_label_ids = samples.distinct(id_path)

    prev_label_ids = []
    for ids in info.id_map.values():
        prev_label_ids.extend(ids)

    prev_ids = set(prev_label_ids)
    ann_ids = set(annotation_label_ids)
    curr_ids = set(current_label_ids)
    deleted_labels = prev_ids - ann_ids
    added_labels = ann_ids - prev_ids
    labels_to_check = curr_ids - deleted_labels

    # Remove deleted labels
    deleted_view = samples.select_labels(ids=list(deleted_labels))
    samples._dataset.delete_labels(view=deleted_view, fields=label_field)

    # Add new labels
    for sample_id, label_id_map in annotations.items():
        sample = samples._dataset[sample_id]
        labels = [
            label
            for l_id, label in label_id_map.items()
            if l_id in added_labels
        ]
        new_sample = fo.Sample(filepath=sample.filepath)
        new_sample[label_field] = fol.Detections(detections=labels)
        if labels != []:
            sample.merge(new_sample)
            sample.save()

    # Merge other labels
    # TODO: Figure out a better way to iterate through a set of labels based on
    # ID and merge their fields
    sample_id_map = dict(zip(samples.values("id"), samples.values("filepath")))
    full_samples = samples._dataset.select(list(annotations.keys()))
    label_field_path = samples._get_label_field_path(label_field)[1].split(".")
    for sample in full_samples:
        sample_annot_ids = set(annotations[sample.id].keys()) & labels_to_check
        view_to_check = samples._dataset.select_labels(
            ids=list(sample_annot_ids)
        )
        for sv in view_to_check:
            next_field = sv
            for field in label_field_path:
                next_field = next_field[field]

            for label in next_field:
                annot_label = annotations[sample.id][label.id]
                for field in annot_label._fields_ordered:
                    if field not in info.default_fields:
                        label[field] = annot_label[field]
        sample.save()


class BaseAnnotationAPI(object):
    """Basic interface for connecting to an annotation provider, sending samples for
    annotation, and importing them back into the collection.
    """

    def get_username_password(self, host=""):
        username = fo.annotation_config.cvat_username
        password = fo.annotation_config.cvat_password

        if username is None or password is None:
            logger.log(
                "No config or environment variables found for "
                "authentication. Please enter login information. Set the "
                "environment variables `FIFTYONE_ANNOTATION_USERNAME` and "
                "`FIFTYONE_ANNOTATION_PASSWORD` to avoid this in the future."
            )
            username = input("%s Username: " % host)
            password = getpass.getpass(prompt="%s Password: " % host)

        return {
            "username": username,
            "password": password,
        }

    def get_api_key(self, host=""):
        pass


class AnnotationInfo(object):
    """Basic interface for results returned from `annotate()` call"""

    def __init__(self, label_field, backend):
        self.label_field = label_field
        self.backend = backend
        self.id_map = None
        self.default_fields = []

    def store_label_ids(self, samples):
        label_id_path = samples._get_label_field_path(self.label_field, "id")[
            1
        ]
        label_ids = samples.values(label_id_path)
        sample_ids = samples.values("id")
        self.id_map = dict(zip(sample_ids, label_ids))
