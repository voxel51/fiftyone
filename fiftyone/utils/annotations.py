"""
Data annotation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging

import eta.core.annotations as etaa
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou


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
