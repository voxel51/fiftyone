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
        # @todo replace with `dataset.rename_field()` when such a method exists
        logger.info("Finalizing operation")
        dataset.clone_field(detections_field, classification_field)
        dataset.delete_sample_field(detections_field)


def expand_image_labels_field(
    dataset,
    label_field,
    prefix=None,
    labels_dict=None,
    multilabel=False,
    skip_non_categorical=False,
    keep_label_field=False,
):
    """Expands the :class:`fiftyone.core.labels.ImageLabels` field of the
    dataset into per-label fields.

    Provide ``labels_dict`` if you want to customize which components of the
    labels are expanded. Otherwise, all objects/attributes are expanded as
    explained below.

    If ``multilabel`` is False, frame attributes will be stored in separate
    :class:`fiftyone.core.labels.Classification` fields with names
    ``prefix + attr.name``.

    If ``multilabel`` if True, all frame attributes will be stored in a
    :class:`fiftyone.core.labels.Classifications` field called
    ``prefix + "attrs"``.

    Objects are stored in :class:`fiftyone.core.labels.Detections` fields whose
    names are ``prefix + obj.name``, or ``prefix + "objs"`` for objects that
    do not have their ``name`` field populated.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        label_field: the name of the :class:`fiftyone.core.labels.ImageLabels`
            field to expand
        prefix (None): a string prefix to prepend to each expanded field name
        labels_dict (None): a dictionary mapping names of attributes/objects
            in ``label_field`` to field names into which to expand them
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` field
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
        keep_label_field (False): whether to keep ``label_field`` after the
            expansion is completed. By default, the field is deleted from the
            dataset
    """
    logger.info("Expanding image labels field '%s'", label_field)
    with fou.ProgressBar() as pb:
        for sample in pb(dataset):
            labels = sample[label_field]
            if labels is None:
                continue

            sample.update_fields(
                labels.expand(
                    prefix=prefix,
                    labels_dict=labels_dict,
                    multilabel=multilabel,
                    skip_non_categorical=skip_non_categorical,
                )
            )
            if not keep_label_field:
                sample.clear_field(label_field)

            sample.save()

    if not keep_label_field:
        dataset.delete_sample_field(label_field)


def condense_image_labels_field(
    dataset,
    label_field,
    prefix=None,
    labels_dict=None,
    keep_label_fields=False,
):
    """Condenses multiple :class:`fiftyone.core.labels.Label`` fields into a
    single :class:`fiftyone.core.labels.ImageLabels` field.

    Provide either ``prefix`` or ``labels_dict`` to customize the fields that
    are condensed. If you provide neither, all
    :class:`fiftyone.core.labels.Label`` fields are condensed.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        label_field: the name of the :class:`fiftyone.core.labels.ImageLabels`
            field to create
        prefix (None): a label field prefix; all
            :class:`fiftyone.core.labels.Label` fields matching this prefix are
            merged into ``label_field``, with the prefix removed from the names
            of the labels
        labels_dict (None): a dictionary mapping names of
            :class:`fiftyone.core.labels.Label` fields to names to give them in
            the condensed :class:`fiftyone.core.labels.ImageLabels`
        keep_label_fields (False): whether to keep the input label fields after
            ``label_field`` is created. By default, the fields are deleted
    """
    if prefix is None:
        prefix = ""

    if labels_dict is None:
        labels_dict = _get_label_dict_for_prefix(dataset, prefix)

    logger.info("Condensing image labels into field '%s'", label_field)
    with fou.ProgressBar() as pb:
        for sample in pb(dataset):
            image_labels = etai.ImageLabels()
            for field_name, name in labels_dict.items():
                image_labels.merge_labels(
                    sample[field_name].to_image_labels(name=name)
                )
                if not keep_label_fields:
                    sample.clear_field(field_name)

            sample[label_field] = fol.ImageLabels(labels=image_labels)
            sample.save()

    if not keep_label_fields:
        for field_name in labels_dict:
            dataset.delete_sample_field(field_name)


def _get_label_dict_for_prefix(dataset, prefix):
    label_fields = dataset.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )
    labels_dict = {}
    for field_name in label_fields:
        if field_name.startswith(prefix):
            labels_dict[field_name] = field_name[len(prefix) :]

    return labels_dict
