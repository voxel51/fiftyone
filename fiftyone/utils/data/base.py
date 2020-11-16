"""
Data utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def parse_images_dir(dataset_dir, recursive=True):
    """Parses the contents of the given directory of images.

    See :class:`fiftyone.types.dataset_types.ImageDirectory` for format
    details. In particular, note that files with non-image MIME types are
    omitted.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories

    Returns:
        a list of image paths
    """
    filepaths = etau.list_files(
        dataset_dir, abs_paths=True, recursive=recursive
    )
    return [p for p in filepaths if etai.is_image_mime_type(p)]


def parse_videos_dir(dataset_dir, recursive=True):
    """Parses the contents of the given directory of videos.

    See :class:`fiftyone.types.dataset_types.VideoDirectory` for format
    details. In particular, note that files with non-video MIME types are
    omitted.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories

    Returns:
        a list of video paths
    """
    filepaths = etau.list_files(
        dataset_dir, abs_paths=True, recursive=recursive
    )
    return [p for p in filepaths if etav.is_video_mime_type(p)]


def parse_image_classification_dir_tree(dataset_dir):
    """Parses the contents of the given image classification dataset directory
    tree, which should have the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...

    Args:
        dataset_dir: the dataset directory

    Returns:
        samples: a list of ``(image_path, target)`` pairs
        classes: a list of class label strings
    """
    # Get classes
    classes = sorted(etau.list_subdirs(dataset_dir))
    labels_map_rev = {c: i for i, c in enumerate(classes)}

    # Generate dataset
    glob_patt = os.path.join(dataset_dir, "*", "*")
    samples = []
    for path in etau.get_glob_matches(glob_patt):
        chunks = path.split(os.path.sep)
        if any(s.startswith(".") for s in chunks[-2:]):
            continue

        target = labels_map_rev[chunks[-2]]
        samples.append((path, target))

    return samples, classes


def convert_classification_field_to_detections(
    dataset,
    classification_field,
    detections_field=None,
    keep_classification_field=False,
):
    """Converts the :class:`fiftyone.core.labels.Classification` field of the
    dataset into a :class:`fiftyone.core.labels.Detections` field containing
    the classification label.

    The detections are given bounding boxes that span the entire image.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        classification_field: the name of the
            :class:`fiftyone.core.labels.Classification` field to convert to
            detections
        detections_field (None): the name of the
            :class:`fiftyone.core.labels.Detections` field to create. By
            default, ``classification_field`` is overwritten
        keep_classification_field (False): whether to keep
            ``classification_field`` after the conversion is completed. By
            default, the field is deleted from the dataset. If
            ``classification_field`` is being overwritten, this flag has no
            effect
    """
    dataset.validate_field_type(
        classification_field,
        fof.EmbeddedDocumentField,
        embedded_doc_type=fol.Classification,
    )

    if detections_field is None:
        detections_field = classification_field

    overwrite = detections_field == classification_field
    if overwrite:
        logger.info(
            "Converting Classification field '%s' to Detections format",
            classification_field,
        )
        keep_classification_field = False
        detections_field = dataset.make_unique_field_name(
            root=classification_field
        )
    else:
        logger.info(
            "Converting Classification field '%s' to Detections format in "
            "field '%s'",
            classification_field,
            detections_field,
        )

    with fou.ProgressBar() as pb:
        for sample in pb(dataset):
            label = sample[classification_field]
            if label is None:
                continue

            detection = fol.Detection(
                label=label.label,
                bounding_box=[0, 0, 1, 1],  # entire image
                confidence=label.confidence,
            )
            sample[detections_field] = fol.Detections(detections=[detection])
            if not keep_classification_field:
                sample.clear_field(classification_field)

            sample.save()

    if not keep_classification_field:
        dataset.delete_sample_field(classification_field)

    if overwrite:
        dataset.rename_sample_field(detections_field, classification_field)
