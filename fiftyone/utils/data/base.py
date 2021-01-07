"""
Data utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import multiprocessing
import requests
import os
import urllib

import eta.core.image as etai
import eta.core.serial as etas
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


def download_image_classification_dataset(
    csv_path, dataset_dir, classes=None, num_workers=None
):
    """Downloads the classification dataset specified by the given CSV file,
    which should have the following format::

        <label1>,<image_url1>
        <label2>,<image_url2>
        ...

    The image filenames are the basenames of the URLs, which are assumed to be
    unique.

    The dataset is written to disk in
    :class:`fiftyone.types.dataset_types.FiftyOneImageClassificationDataset`
    format.

    Args:
        csv_path: a CSV file containing the labels and image URLs
        dataset_dir: the directory to write the dataset
        classes (None): an optional list of classes. By default, this will be
            inferred from the contents of ``csv_path``
        num_workers (None): the number of processes to use to download images.
            By default, ``multiprocessing.cpu_count()`` is used
    """
    labels, image_urls = zip(
        *[
            tuple(line.split(",", 1))
            for line in etau.read_file(csv_path).splitlines()
        ]
    )

    if classes is None:
        classes = sorted(set(labels))

    labels_map_rev = {label: idx for idx, label in enumerate(classes)}

    images_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.json")

    logger.info("Downloading images to '%s'...", images_dir)
    image_paths = download_images(
        image_urls, images_dir, num_workers=num_workers
    )

    labels_dict = {}
    for image_path, label in zip(image_paths, labels):
        uuid = os.path.splitext(os.path.basename(image_path))[0]
        labels_dict[uuid] = labels_map_rev[label]

    _labels = {"classes": classes, "labels": labels_dict}

    logger.info("Writing labels to '%s'", labels_path)
    etas.write_json(_labels, labels_path)


def download_images(image_urls, output_dir, num_workers=None):
    """Downloads the images from the given URLs.

    The filenames in ``output_dir`` are the basenames of the URLs, which are
    assumed to be unique.

    Args:
        image_urls: a list of image URLs to download
        output_dir: the directory to write the images
        num_workers (None): the number of processes to use. By default,
            ``multiprocessing.cpu_count()`` is used

    Returns:
        the list of downloaded image paths
    """
    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    inputs = []
    for url in image_urls:
        filename = os.path.basename(urllib.parse.urlparse(url).path)
        outpath = os.path.join(output_dir, filename)
        inputs.append((url, outpath))

    if num_workers == 1:
        _download_images(inputs)
    else:
        _download_images_multi(inputs, num_workers)

    return tuple(zip(*inputs))[1]


def _download_images(inputs):
    with fou.ProgressBar() as pb:
        for args in pb(inputs):
            _download_image(args)


def _download_images_multi(inputs, num_workers):
    with fou.ProgressBar(inputs) as pb:
        with multiprocessing.Pool(processes=num_workers) as pool:
            for _ in pb(pool.imap_unordered(_download_image, inputs)):
                pass


def _download_image(args):
    url, outpath = args
    img_bytes = requests.get(url).content
    etau.write_file(img_bytes, outpath)


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
