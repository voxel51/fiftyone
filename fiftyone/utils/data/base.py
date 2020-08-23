"""
Data utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.utils as fou


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


def expand_image_labels_field(
    dataset,
    label_field,
    prefix=None,
    multilabel=False,
    skip_non_categorical=False,
):
    """Expands the :class:`fiftyone.core.labels.ImageLabels` field of the
    dataset into per-label fields.

    If ``multilabel`` is False, frame attributes will be stored in separate
    :class:`fiftyone.core.labels.Classification` fields with names
    ``prefix + attr.name``.

    If ``multilabel`` if True, all frame attributes will be stored in a
    :class:`fiftyone.core.labels.Classifications` field called
    ``prefix + "attrs"``.

    All objects will be stored in a ``prefix + "objs"`` field.

    The ``label_field`` of the dataset will be deleted after the expansion is
    completed.

    Args:
        prefix (None): a string prefix to prepend to each expanded field name
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` field
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
    """
    # Expand image labels field
    with fou.ProgressBar() as pb:
        for sample in pb(dataset):
            labels = sample[label_field]
            if labels is None:
                continue

            sample.update_fields(
                labels.expand(
                    prefix=prefix,
                    multilabel=multilabel,
                    skip_non_categorical=skip_non_categorical,
                )
            )
            sample.clear_field(label_field)
            sample.save()

    dataset.delete_sample_field(label_field)
