"""
Sama utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import glob
import random
import json
import logging
import tempfile

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.utils.coco as fouc

logger = logging.getLogger(__name__)


def download_sama_coco_dataset_split(
    dataset_dir,
    split,
    label_types=None,
    classes=None,
    image_ids=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    raw_dir=None,
    scratch_dir=None,
):
    """Utility that downloads full or partial data splits of the
    `COCO dataset <https://cocodataset.org>`_ with annotation splits found
    at https://www.sama.com/sama-coco-dataset.

    See :ref:`this page <COCODetectionDataset-export>` for the format in which
    ``dataset_dir`` will be arranged.

    Any existing files are not re-downloaded.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        label_types (None): a label type or list of label types to load. The
            supported values are ``("detections", "segmentations")``. By
            default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` ints or strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        num_workers (None): a suggested number of threads to use when
            downloading individual images
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types`` and/or ``classes`` are also specified, first
            priority will be given to samples that contain all of the specified
            label types and/or classes, followed by samples that contain at
            least one of the specified labels types or classes. The actual
            number of samples loaded may be less than this maximum value if the
            dataset does not contain sufficient samples matching your
            requirements. By default, all matching samples are loaded
        raw_dir (None): a directory in which full annotations files may be
            stored to avoid re-downloads in the future
        scratch_dir (None): a scratch directory to use to download any
            necessary temporary files

    Returns:
        a tuple of:
        -   num_samples: the total number of downloaded images
        -   classes: the list of all classes
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    if split not in _IMAGE_DOWNLOAD_LINKS:
        raise ValueError(
            "Unsupported split '%s'; supported values are %s"
            % (split, tuple(_IMAGE_DOWNLOAD_LINKS.keys()))
        )

    if classes is not None and split == "test":
        logger.warning("Test split is unlabeled; ignoring classes requirement")
        classes = None

    if scratch_dir is None:
        scratch_dir = os.path.join(dataset_dir, "scratch")

    anno_path = os.path.join(dataset_dir, "labels.json")
    images_dir = os.path.join(dataset_dir, "data")
    split_size = _SPLIT_SIZES[split]

    etau.ensure_dir(images_dir)

    did_download = False

    #
    # Download annotations to `raw_dir`, if necessary
    #

    if raw_dir is None:
        raw_dir = os.path.join(dataset_dir, "raw")

    etau.ensure_dir(raw_dir)

    if split != "test":
        src_path = _ANNOTATION_DOWNLOAD_LINKS[split]
        rel_path = _ANNOTATION_PATHS[split]
        subdir = split
        anno_type = "annotations"
    else:
        src_path = _TEST_INFO_DOWNLOAD_LINK
        rel_path = _TEST_INFO_PATHS
        subdir = "test"
        anno_type = "test info"

    zip_path = os.path.join(scratch_dir, os.path.basename(src_path))
    unzip_dir = os.path.join(scratch_dir, subdir)
    content_dir = os.path.join(unzip_dir, os.path.dirname(rel_path))
    full_anno_path = os.path.join(raw_dir, os.path.basename(rel_path))

    if not os.path.isfile(full_anno_path):
        logger.info("Downloading %s to '%s'", anno_type, zip_path)
        etaw.download_file(src_path, path=zip_path)

        logger.info("Extracting %s to '%s'", anno_type, full_anno_path)

        if split != "test":
            merge_dir = tempfile.TemporaryDirectory()
            etau.extract_zip(zip_path, outdir=merge_dir.name, delete_zip=False)
            _merge_annotations(
                merge_dir.name,
                os.path.join(
                    unzip_dir, "annotations", f"sama_coco_{split}.json"
                ),
            )
            merge_dir.cleanup()
        else:
            etau.extract_zip(zip_path, outdir=unzip_dir, delete_zip=False)

        fouc._merge_dir(content_dir, raw_dir)
        did_download = True
    else:
        logger.info("Found %s at '%s'", anno_type, full_anno_path)

    # This will store the loaded annotations, if they were necessary
    d = None
    all_classes = None

    #
    # Download images to `images_dir`, if necessary
    #

    images_src_path = _IMAGE_DOWNLOAD_LINKS[split]
    images_zip_path = os.path.join(
        scratch_dir, os.path.basename(images_src_path)
    )
    unzip_images_dir = os.path.splitext(images_zip_path)[0]

    if classes is None and image_ids is None and max_samples is None:
        # Full image download
        num_existing = len(etau.list_files(images_dir))
        num_download = split_size - num_existing
        if num_download > 0:
            if num_existing > 0:
                logger.info(
                    "Found %d (< %d) downloaded images; must download full "
                    "image zip",
                    num_existing,
                    split_size,
                )

            logger.info("Downloading images to '%s'", images_zip_path)
            etaw.download_file(images_src_path, path=images_zip_path)
            logger.info("Extracting images to '%s'", images_dir)
            etau.extract_zip(images_zip_path, delete_zip=False)
            etau.move_dir(unzip_images_dir, images_dir)
            did_download = True
        else:
            logger.info("Images already downloaded")
    else:
        # Partial image download

        # Load annotations to use to determine what images to use
        d = etas.load_json(full_anno_path)
        (
            _,
            all_classes,
            _,
            images,
            annotations,
        ) = fouc._parse_coco_detection_annotations(d, extra_attrs=True)

        if image_ids is not None:
            # Start with specific images
            image_ids = fouc._parse_image_ids(image_ids, images, split=split)
        else:
            # Start with all images
            image_ids = list(images.keys())

        if classes is not None:
            # Filter by specified classes
            all_ids, any_ids = fouc._get_images_with_classes(
                image_ids, annotations, classes, all_classes
            )
        else:
            all_ids = image_ids
            any_ids = []

        all_ids = sorted(all_ids)
        any_ids = sorted(any_ids)

        if shuffle:
            if seed is not None:
                random.seed(seed)

            random.shuffle(all_ids)
            random.shuffle(any_ids)

        image_ids = all_ids + any_ids

        # Determine IDs to download
        existing_ids, downloadable_ids = fouc._get_existing_ids(
            images_dir, images, image_ids
        )

        if max_samples is not None:
            num_existing = len(existing_ids)
            num_downloadable = len(downloadable_ids)
            num_available = num_existing + num_downloadable
            if num_available < max_samples:
                logger.warning(
                    "Only found %d (<%d) samples matching your "
                    "requirements",
                    num_available,
                    max_samples,
                )

            if max_samples > num_existing:
                num_download = max_samples - num_existing
                download_ids = downloadable_ids[:num_download]
            else:
                download_ids = []
        else:
            download_ids = downloadable_ids

        # Download necessary images
        num_existing = len(existing_ids)
        num_download = len(download_ids)
        if num_existing > 0:
            if num_download > 0:
                logger.info(
                    "%d images found; downloading the remaining %d",
                    num_existing,
                    num_download,
                )
            else:
                logger.info("Sufficient images already downloaded")
        elif num_download > 0:
            logger.info("Downloading %d images", num_download)

        if num_download > 0:
            fouc._download_images(
                images_dir, download_ids, images, num_workers
            )
            did_download = True

    downloaded_filenames = etau.list_files(images_dir)
    num_samples = len(downloaded_filenames)  # total downloaded

    #
    # Write usable annotations file to `anno_path`, if necessary
    #

    if not os.path.isfile(anno_path):
        did_download = True

    if did_download:
        if d is None:
            d = etas.load_json(full_anno_path)

            categories = d.get("categories", None)
            if categories is not None:
                all_classes, _ = fouc.parse_coco_categories(categories)
            else:
                all_classes = None

        if num_samples >= split_size:
            logger.info("Writing annotations to '%s'", anno_path)
            etau.copy_file(full_anno_path, anno_path)
        else:
            logger.info(
                "Writing annotations for %d downloaded samples to '%s'",
                num_samples,
                anno_path,
            )
            fouc._write_partial_annotations(
                d, anno_path, split, downloaded_filenames
            )

    return num_samples, all_classes, did_download


def _merge_annotations(merge_dir, output):
    info = licenses = categories = None
    all_annotations = []
    all_images = []
    for json_file in glob.glob(f"{merge_dir}/*json"):
        with open(json_file) as f:
            coco = json.load(f)
            coco_annotations = coco["annotations"]
            all_annotations.extend(coco_annotations)
            coco_images = coco["images"]
            all_images.extend(coco_images)
            if not info:
                info = coco["info"]
            if not licenses:
                licenses = coco["licenses"]
            if not categories:
                categories = coco["categories"]

    merged_coco = {
        "info": info,
        "licenses": licenses,
        "categories": categories,
        "images": all_images,
        "annotations": all_annotations,
    }

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w") as f:
        json.dump(merged_coco, f)


_IMAGE_DOWNLOAD_LINKS = {
    "train": "http://images.cocodataset.org/zips/train2017.zip",
    "validation": "http://images.cocodataset.org/zips/val2017.zip",
    "test": "http://images.cocodataset.org/zips/test2017.zip",
}

_SPLIT_SIZES = {"train": 118287, "test": 40670, "validation": 5000}

_ANNOTATION_DOWNLOAD_LINKS = {
    "train": "https://sama-documentation-assets.s3.amazonaws.com/sama-coco/sama-coco-train.zip",
    "validation": "https://sama-documentation-assets.s3.amazonaws.com/sama-coco/sama-coco-val.zip",
}

_ANNOTATION_PATHS = {
    "train": "annotations/sama_coco_train.json",
    "validation": "annotations/sama_coco_validation.json",
}

_TEST_INFO_DOWNLOAD_LINK = (
    "http://images.cocodataset.org/annotations/image_info_test2017.zip"
)

_TEST_INFO_PATHS = "annotations/image_info_test2017.json"

_SUPPORTED_LABEL_TYPES = ["detections", "segmentations"]

_SUPPORTED_SPLITS = ["train", "validation", "test"]

_CSV_DELIMITERS = [",", ";", ":", " ", "\t", "\n"]
