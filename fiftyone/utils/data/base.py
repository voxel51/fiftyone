"""
Data utilities.

| Copyright 2017-2021, Voxel51, Inc.
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
