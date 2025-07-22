"""
Data utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import multiprocessing.dummy
import requests
import os
import pathlib
import urllib

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.video as etav

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def map_values(sample_collection, path, map, progress=False):
    """Maps the values in the given field to new values for each sample in
    the collection.

    This function performs the same operation as
    :meth:`map_values() <fiftyone.core.collections.SampleCollection.map_values>`
    but it immediately saves the mapped values to the database rather than
    creating a view.

    Examples::

        import random

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.utils.data as foud
        from fiftyone import ViewField as F

        ANIMALS = [
            "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
            "horse", "sheep", "zebra"
        ]

        dataset = foz.load_zoo_dataset("quickstart")

        values = [random.choice(ANIMALS) for _ in range(len(dataset))]
        dataset.set_values("str_field", values)
        dataset.set_values("list_field", [[v] for v in values])

        dataset.set_field("ground_truth.detections.tags", [F("label")]).save()

        # Map all animals to string "animal"
        mapping = {a: "animal" for a in ANIMALS}

        #
        # Map values in top-level fields
        #

        foud.map_values(dataset, "str_field", mapping)

        print(dataset.count_values("str_field"))
        # {"animal": 200}

        foud.map_values(dataset, "list_field", mapping)

        print(dataset.count_values("list_field"))
        # {"animal": 200}

        #
        # Map values in nested fields
        #

        foud.map_values(dataset, "ground_truth.detections.label", mapping)

        print(dataset.count_values("ground_truth.detections.label"))
        # {"animal": 183, ...}

        foud.map_values(dataset, "ground_truth.detections.tags", mapping)

        print(dataset.count_values("ground_truth.detections.tags"))
        # {"animal": 183, ...}

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        path: the field or ``embedded.field.name`` to map
        map: a dict mapping values to new values
        progress (False): whether to render a progress bar (True/False), use
            the default value ``fiftyone.config.show_progress_bars`` (None), or
            a progress callback function to invoke instead
    """
    root = sample_collection._get_root_field(path)

    if sample_collection._edits_field(root):
        _map_values_on_edited_field(
            sample_collection, path, map, progress=progress
        )
    else:
        sample_collection.map_values(path, map).save(root)


def _map_values_on_edited_field(sample_collection, path, map, progress=False):
    inputs = list(map.keys())

    (
        label_field,
        root,
        is_list_field,
        leaf,
    ) = sample_collection._parse_label_attribute(path)

    is_frame_field = sample_collection._is_frame_field(path)
    leaf_field = sample_collection.get_field(path)
    is_list_leaf = isinstance(leaf_field, fof.ListField)

    if is_frame_field:
        id_path = "frames.id"
        id_key = "frame_id"
    else:
        id_path = "id"
        id_key = "sample_id"

    if label_field is not None:
        label_id_path = root + ".id"

        if is_list_leaf:
            expr = F(leaf).exists() & (
                F(leaf).filter(F().is_in(inputs)).length() > 0
            )
        else:
            expr = F(leaf).is_in(inputs)

        view = sample_collection.filter_labels(label_field, expr)

        doc_ids, label_ids, curr_values = view.values(
            [id_path, label_id_path, path]
        )

        if is_frame_field:
            doc_ids = itertools.chain.from_iterable(doc_ids)
            label_ids = itertools.chain.from_iterable(label_ids)
            curr_values = itertools.chain.from_iterable(curr_values)

        new_values = []
        if is_list_field:
            for did, lids, cvals in zip(doc_ids, label_ids, curr_values):
                if lids is None:
                    continue

                for lid, cval in zip(lids, cvals):
                    if is_list_leaf:
                        nval = [map.get(v, v) for v in cval]
                    else:
                        nval = map.get(cval, cval)

                    new_values.append(
                        {id_key: did, "label_id": lid, "value": nval}
                    )
        else:
            for did, lid, cval in zip(doc_ids, label_ids, curr_values):
                if is_list_leaf:
                    nval = [map.get(v, v) for v in cval]
                else:
                    nval = map.get(cval, cval)

                new_values.append(
                    {id_key: did, "label_id": lid, "value": nval}
                )

        sample_collection.set_label_values(path, new_values, progress=progress)
    else:
        if is_frame_field:
            _path, _ = sample_collection._handle_frame_field(path)
        else:
            _path = path

        if is_list_leaf:
            expr = F(_path).exists() & (
                F(_path).filter(F().is_in(inputs)).length() > 0
            )
        else:
            expr = F(_path).is_in(inputs)

        if is_frame_field:
            view = sample_collection.match_frames(expr)
        else:
            view = sample_collection.match(expr)

        doc_ids, curr_values = view.values([id_path, path])

        if is_frame_field:
            doc_ids = itertools.chain.from_iterable(doc_ids)
            curr_values = itertools.chain.from_iterable(curr_values)

        new_values = {}
        if is_list_leaf:
            for did, cval in zip(doc_ids, curr_values):
                new_values[did] = [map.get(v, v) for v in cval]
        else:
            for did, cval in zip(doc_ids, curr_values):
                new_values[did] = map.get(cval, cval)

        sample_collection.set_values(
            path, new_values, key_field=id_path, progress=progress
        )


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
    samples = []
    for filepath in etau.list_files(dataset_dir, recursive=True):
        chunks = pathlib.PurePath(filepath).parts

        if any(c.startswith(".") for c in chunks):
            continue

        samples.append((filepath, chunks[0]))

    classes = sorted(set(s[1] for s in samples))
    labels_map_rev = {c: i for i, c in enumerate(classes)}

    samples = [
        (os.path.join(dataset_dir, f), labels_map_rev[c]) for f, c in samples
    ]

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
    :class:`fiftyone.types.FiftyOneImageClassificationDataset` format.

    Args:
        csv_path: a CSV file containing the labels and image URLs
        dataset_dir: the directory to write the dataset
        classes (None): an optional list of classes. By default, this will be
            inferred from the contents of ``csv_path``
        num_workers (None): a suggested number of threads to use to download
            images
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
        num_workers (None): a suggested number of threads to use

    Returns:
        the list of downloaded image paths
    """
    num_workers = fou.recommend_thread_pool_workers(num_workers)

    inputs = []
    for url in image_urls:
        filename = os.path.basename(urllib.parse.urlparse(url).path)
        outpath = os.path.join(output_dir, filename)
        inputs.append((url, outpath))

    if num_workers <= 1:
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
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            for _ in pb(pool.imap_unordered(_download_image, inputs)):
                pass


def _download_image(args):
    url, outpath = args
    img_bytes = requests.get(url).content
    etau.write_file(img_bytes, outpath)
