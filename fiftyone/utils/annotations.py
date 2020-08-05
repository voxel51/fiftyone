"""
Data annotation utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.annotations as etaa
import eta.core.image as etai

import fiftyone as fo
import fiftyone.core.utils as fou


class AnnotationConfig(etaa.AnnotationConfig):
    """.. autoclass:: eta.core.annotations.AnnotationConfig"""

    __doc__ = etaa.AnnotationConfig.__doc__


_DEFAULT_ANNOTATION_CONFIG = AnnotationConfig(
    {
        #
        # Assume that the user is likely comparing multiple sets of detections,
        # e.g.., ground truth vs predicted, and therefore would prefer that object
        # boxes have one color per label field rather than different colors for
        # each label
        #
        "per_object_label_colors": False,
    }
)


def draw_labeled_images(
    samples, label_fields, anno_dir, annotation_config=None
):
    """Renders annotated versions of the image samples with label field(s)
    overlaid to the given directory.

    The filenames of the sample images are maintained, unless a name conflict
    would occur in ``anno_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The images are written in format ``fo.config.default_image_ext``.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_fields: the list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render
        anno_dir: the directory to write the annotated images
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations

    Returns:
        the list of paths to the labeled images
    """
    if annotation_config is None:
        annotation_config = _DEFAULT_ANNOTATION_CONFIG

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
                label_fields,
                outpath,
                annotation_config=annotation_config,
            )
            outpaths.append(outpath)

    return outpaths


def draw_labeled_image(sample, label_fields, outpath, annotation_config=None):
    """Draws an annotated version of the image sample with its label field(s)
    overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample` instance
        label_fields: the list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render
        outpath: the path to write the annotated image
        annotation_config (None): an :class:`AnnotationConfig` specifying how
            to render the annotations
    """
    if annotation_config is None:
        annotation_config = _DEFAULT_ANNOTATION_CONFIG

    image_labels = etai.ImageLabels()
    for label_field in label_fields:
        label = sample[label_field]
        if label is None:
            continue

        image_labels.merge_labels(label.to_image_labels(name=label_field))

    img = etai.read(sample.filepath)

    anno_img = etaa.annotate_image(
        img, image_labels, annotation_config=annotation_config
    )

    etai.write(anno_img, outpath)
