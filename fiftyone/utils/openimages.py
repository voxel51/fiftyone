"""
Utilities for working with the
`Open Images <https://storage.googleapis.com/openimages/web/index.html>`
dataset.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import logging
import multiprocessing
import os
import random
import warnings

import pandas as pd

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud

boto3 = fou.lazy_import("boto3", callback=fou.ensure_boto3)
botocore = fou.lazy_import("botocore", callback=fou.ensure_boto3)


logger = logging.getLogger(__name__)


class OpenImagesV6DatasetImporter(foud.LabeledImageDatasetImporter):
    """Base class for importing datasets in Open Images V6 format.

    See :class:`fiftyone.types.dataset_types.OpenImagesV6Dataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats

            If provided, takes precedence over ``classes`` and ``max_samples``
        load_hierarchy (True): whether to load the classes hiearchy and add it
            to the dataset's ``info`` dictionary
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. If
            ``max_samples`` and ``label_types`` are both specified, then every
            sample will include the specified label types. By default, all
            matching samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        load_hierarchy=True,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.label_types = label_types
        self.classes = classes
        self.attrs = attrs
        self.image_ids = image_ids
        self.load_hierarchy = load_hierarchy

        self._data_dir = None
        self._images_map = None
        self._info = None
        self._label_types = None
        self._classes_map = None
        self._attrs_map = None
        self._lab_id_data = None
        self._det_id_data = None
        self._rel_id_data = None
        self._seg_id_data = None
        self._uuids = None
        self._iter_uuids = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return len(self._uuids)

    def __next__(self):
        image_id = next(self._iter_uuids)

        image_path = self._images_map[image_id]

        labels = {}

        if "classifications" in self._label_types:
            # Add labels
            pos_labels, neg_labels = _create_labels(
                self._lab_id_data, image_id, self._classes_map
            )
            if pos_labels is not None:
                labels["positive_labels"] = pos_labels

            if neg_labels is not None:
                labels["negative_labels"] = neg_labels

        if "detections" in self._label_types:
            # Add detections
            detections = _create_detections(
                self._det_id_data, image_id, self._classes_map
            )
            if detections is not None:
                labels["detections"] = detections

        if "segmentations" in self._label_types:
            # Add segmentations
            segmentations = _create_segmentations(
                self._seg_id_data,
                image_id,
                self._classes_map,
                self.dataset_dir,
            )
            if segmentations is not None:
                labels["segmentations"] = segmentations

        if "relationships" in self._label_types:
            # Add relationships
            relationships = _create_relationships(
                self._rel_id_data, image_id, self._classes_map, self._attrs_map
            )
            if relationships is not None:
                labels["relationships"] = relationships

        labels["open_images_id"] = image_id

        return image_path, None, labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return {
            "classifications": fol.Classifications,
            "detections": fol.Detections,
            "segmentations": fol.Detections,
            "relationships": fol.Detections,
            "open_images_id": str,
        }

    def setup(self):
        dataset_dir = self.dataset_dir
        seed = self.seed
        shuffle = self.shuffle
        max_samples = self.max_samples
        label_types = self.label_types
        classes = self.classes
        attrs = self.attrs
        image_ids = self.image_ids

        data_dir = os.path.join(self.dataset_dir, "data")

        images_map = {
            os.path.splitext(filename)[0]: os.path.join(data_dir, filename)
            for filename in etau.list_files(data_dir)
        }
        available_ids = set(images_map.keys())

        info = {}

        self._data_dir = data_dir
        self._images_map = images_map
        self._info = info

        if not available_ids:
            self._uuids = []
            return

        label_types = _parse_label_types(label_types)

        # No matter what classes or attributes you specify, they will not be
        # loaded if you do not want to load labels
        if not label_types:
            classes = []
            attrs = []

        if image_ids:
            # Load specific images (if available)
            image_ids = _parse_image_ids(image_ids, ignore_split=True)
            valid_ids = set(image_ids) & available_ids
        elif not label_types and not classes and not attrs:
            # No requirements given; load all images
            valid_ids = available_ids
        else:
            # Determine images to load from label requirements later
            valid_ids = None

        (
            guarantee_all_types,
            label_types,
            classes_map,
            all_classes,
            oi_classes,
            classes,
            attrs_map,
            oi_attrs,
            all_attrs,
            seg_classes,
        ) = _setup(
            dataset_dir,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            seed=seed,
            max_samples=max_samples,
            download=False,
        )

        (
            lab_id_data,
            det_id_data,
            rel_id_data,
            seg_id_data,
            _,
            ids_any_labels,
            ids_all_labels,
        ) = _get_all_label_data(
            dataset_dir,
            label_types,
            classes,
            oi_classes,
            oi_attrs=oi_attrs,
            download=False,
            seg_classes=seg_classes,
        )

        # Restrict IDs based on label requirements, if necessary
        if valid_ids is None:
            ids_any_labels &= available_ids
            ids_all_labels &= available_ids
            if guarantee_all_types:
                if max_samples and len(ids_all_labels) < max_samples:
                    # Prioritize samples with all labels but also add samples
                    # with any to reach max_samples
                    ids_not_all = ids_any_labels - ids_all_labels
                    ids_all_labels = sorted(ids_all_labels)
                    ids_not_all = sorted(ids_not_all)

                    if shuffle:
                        random.shuffle(ids_all_labels)
                        random.shuffle(ids_not_all)
                        shuffle = False

                    valid_ids = ids_all_labels + ids_not_all
                else:
                    valid_ids = ids_all_labels
            else:
                valid_ids = ids_any_labels

        valid_ids = list(valid_ids)

        if shuffle:
            random.shuffle(valid_ids)

        if max_samples:
            valid_ids = valid_ids[:max_samples]

        if self.load_hierarchy:
            info["hierarchy"] = _get_hierarchy(dataset_dir, download=False)

        if attrs_map:
            info["attributes_map"] = attrs_map

        if all_attrs:
            info["attributes"] = all_attrs

        if seg_classes:
            info["segmentation_classes"] = seg_classes

        info["classes_map"] = classes_map
        info["classes"] = all_classes

        self._label_types = label_types
        self._classes_map = classes_map
        self._attrs_map = attrs_map
        self._lab_id_data = lab_id_data
        self._det_id_data = det_id_data
        self._rel_id_data = rel_id_data
        self._seg_id_data = seg_id_data
        self._uuids = valid_ids

    def get_dataset_info(self):
        return self._info


def get_attributes(version="v6", dataset_dir=None):
    """Gets the list of relationship attributes in the Open Images dataset.

    Args:
        version ("v6"): the version of the Open Images dataset. Supported
            values are ``("v6")``
        dataset_dir (None): an optional root directory the in which the dataset
            is downloaded


    Returns:
        a sorted list of attribute names
    """
    _verify_version(version)

    if dataset_dir is None:
        dataset_dir = os.path.join(
            fo.config.dataset_zoo_dir, "open-images-%s" % version
        )

    try:
        # Try to use already downloaded file
        attrs_map = _get_attrs_map(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            attrs_map = _get_attrs_map(tmp_dir, download=True)

    return sorted(attrs_map.values())


def get_classes(version="v6", dataset_dir=None):
    """Gets the 601 boxable classes that exist in classifications, detections,
    and relationships in the Open Images dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        version ("v6"): the version of the Open Images dataset. Supported
            values are ``("v6")``
        dataset_dir (None): an optional root directory the in which the dataset
            is downloaded

    Returns:
        a sorted list of class name strings
    """
    _verify_version(version)

    if dataset_dir is None:
        dataset_dir = os.path.join(
            fo.config.dataset_zoo_dir, "open-images-%s" % version
        )

    try:
        # Try to use already downloaded file
        classes_map = _get_classes_map(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            classes_map = _get_classes_map(tmp_dir, download=True)

    return sorted(classes_map.values())


def get_segmentation_classes(version="v6", dataset_dir=None):
    """Gets the list of classes (350) that are labeled with segmentations in
    the Open Images V6 dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        version ("v6"): the version of the Open Images dataset. Supported
            values are ``("v6")``
        dataset_dir (None): an optional root directory the in which the dataset
            is downloaded

    Returns:
        a sorted list of segmentation class name strings
    """
    _verify_version(version)

    if dataset_dir is None:
        dataset_dir = os.path.join(
            fo.config.dataset_zoo_dir, "open-images-%s" % version
        )

    try:
        # Try to use already downloaded file
        seg_classes = _get_seg_classes(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            seg_classes = _get_seg_classes(tmp_dir, download=True)

    return seg_classes


def is_download_required(
    dataset_dir,
    split,
    version="v6",
    label_types=None,
    classes=None,
    attrs=None,
    image_ids=None,
    max_samples=None,
):
    """Checks whether :meth:`download_open_images_split` must be called in
    order for the given directory to contain enough samples to satisfy the
    given requirements.

    See :class:`fiftyone.types.dataset_types.OpenImagesV6Dataset` for the
    format in which ``dataset_dir`` must be arranged.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats

            If provided, takes precedence over ``classes`` and ``max_samples``
        max_samples (None): the maximum number of samples desired

    Returns:
        True/False
    """
    try:
        _download_open_images_split(
            dataset_dir,
            split,
            version,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            image_ids=image_ids,
            max_samples=max_samples,
            download=False,
        )
        return False  # everything was downloaded
    except:
        return True  # something(s) needs to be downloaded


def download_open_images_split(
    dataset_dir,
    split,
    version="v6",
    label_types=None,
    classes=None,
    attrs=None,
    image_ids=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
):
    """Utility that downloads full or partial splits of the
    `Open Images dataset <https://storage.googleapis.com/openimages/web/index.html>`_.

    See :class:`fiftyone.types.dataset_types.OpenImagesV6Dataset` for the
    format in which ``dataset_dir`` will be arranged.

    Any existing files are not re-downloaded.

    This method specifically downloads the subsets of annotations corresponding
    to the 600 boxable classes of Open Images.
    `See here <https://storage.googleapis.com/openimages/web/download.html>`_
    for other download options.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. Only samples containing at least one instance of a
            specified class will be loaded
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats

            If provided, takes precedence over ``classes`` and ``max_samples``
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to download per split.
            If ``max_samples`` and ``label_types`` are both specified, then
            every sample downloaded will include the specified label types. By
            default, all matching samples are downloaded

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded images
        -   classes: the list of all classes
    """
    return _download_open_images_split(
        dataset_dir,
        split,
        version,
        label_types=label_types,
        classes=classes,
        attrs=attrs,
        image_ids=image_ids,
        num_workers=num_workers,
        shuffle=shuffle,
        seed=seed,
        max_samples=max_samples,
        download=True,
    )


def _download_open_images_split(
    dataset_dir,
    split,
    version,
    label_types=None,
    classes=None,
    attrs=None,
    image_ids=None,
    num_workers=None,
    shuffle=None,
    seed=None,
    max_samples=None,
    download=True,
):
    _verify_version(version)

    label_types = _parse_label_types(label_types)

    # No matter what classes or attributes you specify, they will not be loaded
    # if you do not want to load labels
    if not label_types:
        classes = []
        attrs = []

    # Determine the image IDs to load
    if image_ids is None:
        downloaded_ids = _get_downloaded_image_ids(dataset_dir)
        if not label_types and not classes and not attrs:
            # No IDs were provided and no labels are being loaded
            # Load all image IDs
            split_image_ids = _load_all_image_ids(
                dataset_dir, split=split, download=download
            )
        else:
            # No specific image IDs were given, load all relevant images from
            # the given labels later
            split_image_ids = None
    else:
        downloaded_ids = []
        split_image_ids = _parse_and_verify_image_ids(
            image_ids, dataset_dir, split, download=download
        )

    (
        guarantee_all_types,
        label_types,
        classes_map,
        all_classes,
        oi_classes,
        classes,
        _,
        oi_attrs,
        _,
        seg_classes,
    ) = _setup(
        dataset_dir,
        label_types=label_types,
        classes=classes,
        attrs=attrs,
        seed=seed,
        max_samples=max_samples,
        download=download,
    )

    # Download class hierarchy if necessary (used in evaluation)
    _get_hierarchy(dataset_dir, classes_map=classes_map, download=download)

    num_samples = _download(
        label_types,
        guarantee_all_types,
        split_image_ids,
        downloaded_ids,
        oi_classes,
        oi_attrs,
        seg_classes,
        dataset_dir,
        split,
        classes=classes,
        max_samples=max_samples,
        shuffle=shuffle,
        num_workers=num_workers,
        download=download,
    )

    return num_samples, all_classes


def _setup(
    dataset_dir,
    label_types=None,
    classes=None,
    attrs=None,
    seed=None,
    max_samples=None,
    download=False,
):
    if etau.is_str(classes):
        classes = [classes]

    if seed is not None:
        random.seed(seed)

    if max_samples and (label_types or classes or attrs):
        # Only samples with every specified label type will be loaded
        guarantee_all_types = True
    else:
        # Samples may not contain multiple label types, but will contain at
        # least one
        guarantee_all_types = False

    # Map of class IDs to class names
    classes_map = _get_classes_map(dataset_dir, download=download)
    classes_map_rev = {v: k for k, v in classes_map.items()}

    all_classes = sorted(classes_map.values())

    if classes is None:
        if attrs is not None and "relationships" in label_types:
            oi_classes = []
            classes = []
        else:
            oi_classes = [classes_map_rev[c] for c in all_classes]
            classes = all_classes
    else:
        oi_classes = []
        missing_classes = []
        filtered_classes = []
        for c in classes:
            if c in classes_map_rev:
                oi_classes.append(classes_map_rev[c])
                filtered_classes.append(c)
            else:
                missing_classes.append(c)

        classes = filtered_classes
        if missing_classes:
            logger.warning(
                "Found invalid classes: %s\n\nYou can view the available "
                "classes via `get_classes()`\n",
                ",".join(missing_classes),
            )

    attrs_map = {}
    oi_attrs = []
    all_attrs = []
    if "relationships" in label_types:
        # Map of attribute IDs to attribute names
        attrs_map = _get_attrs_map(dataset_dir, download=download)
        attrs_map_rev = {v: k for k, v in attrs_map.items()}

        all_attrs = sorted(attrs_map.values())

        if attrs is None:
            if classes != all_classes:
                oi_attrs = []
                attrs = []
            else:
                oi_attrs = [attrs_map_rev[a] for a in all_attrs]
                attrs = all_attrs
        else:
            missing_attrs = []
            filtered_attrs = []
            for a in attrs:
                try:
                    oi_attrs.append(attrs_map_rev[a])
                    filtered_attrs.append(a)
                except:
                    missing_attrs.append(a)

            attrs = filtered_attrs
            if missing_attrs:
                logger.warning(
                    "Found invalid attributes: %s\n\nYou can view the "
                    "available attributes via `get_attributes()`\n",
                    ",".join(missing_attrs),
                )
    else:
        attrs = []

    seg_classes = []
    if "segmentations" in label_types:
        seg_classes = _get_seg_classes(
            dataset_dir, classes_map=classes_map, download=download
        )

    return (
        guarantee_all_types,
        label_types,
        classes_map,
        all_classes,
        oi_classes,
        classes,
        attrs_map,
        oi_attrs,
        all_attrs,
        seg_classes,
    )


def _get_general_metadata_file(dataset_dir, filename, url, download=True):
    filepath = os.path.join(dataset_dir, "metadata", filename)
    if not os.path.exists(filepath):
        for split in _SUPPORTED_SPLITS:
            split_filepath = os.path.join(
                dataset_dir, split, "metadata", filename
            )
            if os.path.exists(split_filepath):
                return split_filepath

    _download_file_if_necessary(filepath, url, quiet=0, download=download)

    return filepath


def _get_attrs_map(dataset_dir, download=True):
    url = _ANNOTATION_DOWNLOAD_URLS["general"]["attr_names"]
    attrs_csv = _get_general_metadata_file(
        dataset_dir, "attributes.csv", url, download=download
    )
    attrs_data = _parse_csv(attrs_csv)
    attrs_map = {k: v for k, v in attrs_data}
    return attrs_map


def _get_classes_map(dataset_dir, download=True):
    # Map of class IDs to class names
    url = _ANNOTATION_DOWNLOAD_URLS["general"]["class_names"]
    cls_csv = _get_general_metadata_file(
        dataset_dir, "classes.csv", url, download=download
    )
    cls_data = _parse_csv(cls_csv)
    classes_map = {k: v for k, v in cls_data}
    return classes_map


def _get_seg_classes(dataset_dir, classes_map=None, download=True):
    if not classes_map:
        classes_map = _get_classes_map(dataset_dir, download=download)

    url = _ANNOTATION_DOWNLOAD_URLS["general"]["segmentation_classes"]
    seg_cls_txt = _get_general_metadata_file(
        dataset_dir, "segmentation_classes.csv", url, download=download
    )

    with open(seg_cls_txt, "r") as f:
        seg_classes_oi = [l.rstrip("\n") for l in f]

    seg_classes = [classes_map[c] for c in seg_classes_oi]

    return sorted(seg_classes)


def _get_hierarchy(dataset_dir, classes_map=None, download=True):
    hierarchy_path = os.path.join(dataset_dir, "metadata", "hierarchy.json")
    if not os.path.exists(hierarchy_path):
        if not download:
            raise ValueError("Hierarchy file '%s' not found" % hierarchy_path)

        url = _ANNOTATION_DOWNLOAD_URLS["general"]["hierarchy"]
        with etau.TempDir() as tmp_dir:
            tmp_filepath = _get_general_metadata_file(
                tmp_dir, "hierarchy.json", url, download=download
            )

            hierarchy = etas.load_json(tmp_filepath)

            if classes_map is None:
                classes_map = _get_classes_map(tmp_dir, download=download)

            # Not included in standard classes
            entity_classes_map = {"/m/0bl9f": "Entity"}
            entity_classes_map.update(classes_map)
            hierarchy = _rename_subcategories(hierarchy, entity_classes_map)
            etas.write_json(hierarchy, hierarchy_path)
    else:
        hierarchy = etas.load_json(hierarchy_path)

    return hierarchy


def _rename_subcategories(hierarchy, classes_map):
    if "LabelName" in hierarchy.keys():
        curr_label = hierarchy["LabelName"]
        hierarchy["LabelName"] = classes_map[curr_label]

    if "Subcategory" in hierarchy.keys():
        subs = []
        for sub in hierarchy["Subcategory"]:
            subs.append(_rename_subcategories(sub, classes_map))

        hierarchy["Subcategory"] = subs

    if "Part" in hierarchy.keys():
        parts = []
        for part in hierarchy["Part"]:
            parts.append(_rename_subcategories(part, classes_map))

        hierarchy["Part"] = parts

    return hierarchy


def _parse_csv(filename, dataframe=False):
    if dataframe:
        data = pd.read_csv(filename)
    else:
        with open(filename, "r", newline="") as csvfile:
            dialect = csv.Sniffer().sniff(csvfile.read(10240))
            csvfile.seek(0)
            if dialect.delimiter in _CSV_DELIMITERS:
                reader = csv.reader(csvfile, dialect)
            else:
                reader = csv.reader(csvfile)

            data = [row for row in reader]

    return data


def _parse_image_ids(image_ids, ignore_split=False):
    # Load IDs from file
    if etau.is_str(image_ids):
        image_ids_path = image_ids
        ext = os.path.splitext(image_ids_path)[-1]
        if ext == ".txt":
            with open(image_ids_path, "r") as f:
                image_ids = [i for i in f.readlines()]

        elif ext == ".json":
            image_ids = etas.load_json(image_ids_path)

        elif ext == ".csv":
            image_ids = _parse_csv(image_ids_path)
            if isinstance(image_ids[0], list):
                # Flatten list
                image_ids = [i for lst in image_ids for i in lst]

        else:
            raise ValueError(
                "Invalid image ID file '%s'. Supported formats are .txt, "
                ".csv, and .json" % ext
            )

    image_ids = [i.strip() for i in image_ids]

    if ignore_split:
        # Remove `split/` prefix, if any
        image_ids = [os.path.basename(i) for i in image_ids]

    return image_ids


def _parse_and_verify_image_ids(image_ids, dataset_dir, split, download=True):
    image_ids = _parse_image_ids(image_ids)

    split_image_ids = []
    unspecified_split_ids = []

    # Ignore images from other splits
    for image_id in image_ids:
        if "/" in image_id:
            _split, image_id = image_id.split("/")
            if _split not in _SUPPORTED_SPLITS:
                raise ValueError(
                    "Invalid split '%s'. Supported splits are %s"
                    % (_split, _SUPPORTED_SPLITS)
                )

            if _split != split:
                continue

            split_image_ids.append(image_id)
        else:
            unspecified_split_ids.append(image_id)

    return _verify_image_ids(
        split_image_ids,
        unspecified_split_ids,
        dataset_dir,
        split,
        download=download,
    )


def _parse_label_types(label_types):
    if label_types is None:
        return _SUPPORTED_LABEL_TYPES

    if etau.is_str(label_types):
        label_types = [label_types]

    bad_types = [l for l in label_types if l not in _SUPPORTED_LABEL_TYPES]

    if len(bad_types) == 1:
        raise ValueError(
            "Unsupported label type '%s'. Supported types are %s"
            % (bad_types[0], _SUPPORTED_LABEL_TYPES)
        )

    if len(bad_types) > 1:
        raise ValueError(
            "Unsupported label types %s. Supported types are %s"
            % (bad_types, _SUPPORTED_LABEL_TYPES)
        )

    return label_types


def _verify_image_ids(
    selected_split_ids, unspecified_ids, dataset_dir, split, download=True
):
    # Download all image IDs, verify given IDs, sort unspecified IDs into
    # current split

    split_ids = _load_all_image_ids(
        dataset_dir, split=split, download=download
    )

    # Verify image IDs are in correct split
    sid_set = set(split_ids)
    ssid_set = set(selected_split_ids)
    verified_split_ids = sid_set & ssid_set
    incorrect_split_ids = ssid_set - verified_split_ids
    if incorrect_split_ids:
        logger.warning(
            "Found %d IDs that do not belong to split '%s': %s",
            len(incorrect_split_ids),
            split,
            incorrect_split_ids,
        )

    # Find any unspecified IDs in this split and add them
    uids_set = set(unspecified_ids)
    unspecified_ids_in_split = sid_set & uids_set

    split_image_ids = list(verified_split_ids) + list(unspecified_ids_in_split)

    return split_image_ids


def _get_downloaded_image_ids(dataset_dir):
    data_dir = os.path.join(dataset_dir, "data")
    if not os.path.exists(data_dir):
        return []

    return [os.path.splitext(n)[0] for n in etau.list_files(data_dir)]


def _get_label_data(
    label_type,
    dataset_dir,
    oi_classes,
    oi_attrs=None,
    url=None,
    download=True,
    ids_only=False,
):
    csv_path = os.path.join(dataset_dir, "labels", label_type + ".csv")
    _download_file_if_necessary(csv_path, url, quiet=0, download=download)

    df = _parse_csv(csv_path, dataframe=True)

    # Find intersection of ImageIDs with all annotations
    # Only keep samples with at least one label relevant to specified classes
    # or attributes

    label_id_data = {}
    relevant_ids = set()
    oi_classes_attrs = set(oi_classes) | set(oi_attrs or [])
    all_label_ids = df["ImageID"].unique()
    relevant_df = df[df.isin(oi_classes_attrs).any(axis=1)]
    relevant_ids = set(relevant_df["ImageID"].unique())

    if ids_only:
        # Only interested in downloading image ids, not loading annotations
        del df
        del relevant_df
        return {}, relevant_ids

    sorted_df = relevant_df.sort_values("ImageID")
    label_id_data = {
        "all_ids": all_label_ids,
        "relevant_ids": relevant_ids,
        "df": sorted_df,
    }

    del df
    del relevant_df

    return label_id_data, relevant_ids


def _get_all_label_data(
    dataset_dir,
    label_types,
    classes,
    oi_classes,
    oi_attrs=None,
    split=None,
    download=False,
    seg_classes=None,
    ids_only=False,
):
    lab_id_data = {}
    det_id_data = {}
    rel_id_data = {}
    seg_id_data = {}
    seg_ids = set()

    ids_all_labels = None
    ids_any_labels = set()

    if "detections" in label_types:
        url = None
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["boxes"]

        det_id_data, det_ids = _get_label_data(
            "detections",
            dataset_dir,
            oi_classes,
            url=url,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = det_ids
        else:
            ids_all_labels = ids_all_labels & det_ids

        ids_any_labels = ids_any_labels | det_ids

    if "classifications" in label_types:
        url = None
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["labels"]

        lab_id_data, lab_ids = _get_label_data(
            "classifications",
            dataset_dir,
            oi_classes,
            url=url,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = lab_ids
        else:
            ids_all_labels = ids_all_labels & lab_ids

        ids_any_labels = ids_any_labels | lab_ids

    if "relationships" in label_types:
        url = None
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["relationships"]

        rel_id_data, rel_ids = _get_label_data(
            "relationships",
            dataset_dir,
            oi_classes,
            oi_attrs=oi_attrs,
            url=url,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = rel_ids
        else:
            ids_all_labels = ids_all_labels & rel_ids

        ids_any_labels = ids_any_labels | rel_ids

    if "segmentations" in label_types:
        non_seg_classes = set(classes) - set(seg_classes)

        # Notify which classes do not exist only when the user specified
        # classes
        if non_seg_classes and len(classes) != 601:
            logger.warning(
                "No segmentations exist for classes: %s\n\nYou can view the "
                "available segmentation classes via "
                "`get_segmentation_classes()`\n",
                ",".join(list(non_seg_classes)),
            )

        url = None
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["segmentations"]["mask_csv"]

        seg_id_data, seg_ids = _get_label_data(
            "segmentations",
            dataset_dir,
            oi_classes,
            url=url,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = seg_ids
        else:
            ids_all_labels = ids_all_labels & seg_ids

        ids_any_labels = ids_any_labels | seg_ids

    return (
        lab_id_data,
        det_id_data,
        rel_id_data,
        seg_id_data,
        seg_ids,
        ids_any_labels,
        ids_all_labels,
    )


def _download(
    label_types,
    guarantee_all_types,
    split_image_ids,
    downloaded_ids,
    oi_classes,
    oi_attrs,
    seg_classes,
    dataset_dir,
    split,
    classes=None,
    max_samples=None,
    shuffle=False,
    num_workers=None,
    download=True,
):
    (
        _,
        _,
        _,
        _,
        seg_ids,
        ids_any_labels,
        ids_all_labels,
    ) = _get_all_label_data(
        dataset_dir,
        label_types,
        classes,
        oi_classes,
        oi_attrs=oi_attrs,
        split=split,
        download=download,
        seg_classes=seg_classes,
        ids_only=True,
    )

    downloaded_ids = set(downloaded_ids)
    target_ids = split_image_ids

    # Choose target IDs based on user requirements
    if target_ids is None:
        # No IDs specified, load all IDs relevant to given classes
        if guarantee_all_types:
            # When providing specific labels to load and max_samples, only load
            # samples that include all labels
            if max_samples and len(ids_all_labels) < max_samples:
                # Prioritize samples with all labels but also add samples with
                # any to reach max_samples
                ids_not_all = ids_any_labels - ids_all_labels

                # Prioritize loading existing images first
                non_existing_ids = ids_not_all - downloaded_ids
                existing_ids = ids_not_all - non_existing_ids

                ids_all_labels = sorted(ids_all_labels)
                non_existing_ids = sorted(non_existing_ids)
                existing_ids = sorted(existing_ids)

                if shuffle:
                    random.shuffle(ids_all_labels)
                    random.shuffle(existing_ids)
                    random.shuffle(non_existing_ids)
                    shuffle = False

                target_ids = ids_all_labels + existing_ids + non_existing_ids
                target_ids = target_ids[:max_samples]
            else:
                target_ids = ids_all_labels
        else:
            target_ids = ids_any_labels

    target_ids = list(target_ids)
    num_target = len(target_ids)

    if max_samples is not None and num_target < max_samples:
        logger.warning(
            "Only found %d (<%d) samples matching your requirements",
            num_target,
            max_samples,
        )

    if max_samples is not None and num_target > max_samples:
        # Prioritize loading existing images first
        target_ids = set(target_ids)
        non_existing_ids = target_ids - downloaded_ids
        existing_ids = target_ids - non_existing_ids

        non_existing_ids = sorted(non_existing_ids)
        existing_ids = sorted(existing_ids)

        if shuffle:
            random.shuffle(existing_ids)
            random.shuffle(non_existing_ids)

        target_ids = existing_ids + non_existing_ids
        target_ids = target_ids[:max_samples]
    elif shuffle:
        random.shuffle(target_ids)

    all_ids = list(downloaded_ids | set(target_ids))
    num_samples = len(all_ids)  # total downloaded

    if target_ids:
        _download_images_if_necessary(
            target_ids,
            split,
            dataset_dir,
            num_workers=num_workers,
            download=download,
        )

        if "segmentations" in label_types:
            _download_masks_if_necessary(
                all_ids, seg_ids, dataset_dir, split, download=download
            )

    return num_samples


def _get_dataframe_rows(df, image_id):
    left = df["ImageID"].searchsorted(image_id, "left")
    right = df["ImageID"].searchsorted(image_id, "right")
    return df[left:right]


def _create_labels(lab_id_data, image_id, classes_map):
    all_label_ids = lab_id_data["all_ids"]
    relevant_ids = lab_id_data["relevant_ids"]
    df = lab_id_data["df"]

    if image_id not in all_label_ids:
        return None, None

    if image_id not in relevant_ids:
        pos_labels = fol.Classifications()
        neg_labels = fol.Classifications()
        return pos_labels, neg_labels

    def _generate_one_label(label, conf):
        # [ImageID,Source,LabelName,Confidence]
        label = classes_map[label]
        conf = float(conf)
        return fol.Classification(label=label, confidence=conf)

    matching_df = _get_dataframe_rows(df, image_id)
    cls = [
        _generate_one_label(row[0], row[1])
        for row in zip(matching_df["LabelName"], matching_df["Confidence"])
    ]
    pos_cls = []
    neg_cls = []
    for c in cls:
        if c.confidence > 0.1:
            pos_cls.append(c)
        else:
            neg_cls.append(c)

    pos_labels = fol.Classifications(classifications=pos_cls)
    neg_labels = fol.Classifications(classifications=neg_cls)

    return pos_labels, neg_labels


def _create_detections(det_id_data, image_id, classes_map):
    all_label_ids = det_id_data["all_ids"]
    relevant_ids = det_id_data["relevant_ids"]
    df = det_id_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _generate_one_label(row):
        # ImageID,Source,LabelName,Confidence,XMin,XMax,YMin,YMax,IsOccluded,IsTruncated,IsGroupOf,IsDepiction,IsInside

        # Convert to [top-left-x, top-left-y, width, height]
        xmin = float(row["XMin"])
        xmax = float(row["XMax"])
        ymin = float(row["YMin"])
        ymax = float(row["YMax"])
        bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

        return fol.Detection(
            bounding_box=bbox,
            label=classes_map[row["LabelName"]],
            IsOccluded=bool(int(row["IsOccluded"])),
            IsTruncated=bool(int(row["IsTruncated"])),
            IsGroupOf=bool(int(row["IsGroupOf"])),
            IsDepiction=bool(int(row["IsDepiction"])),
            IsInside=bool(int(row["IsInside"])),
        )

    matching_df = _get_dataframe_rows(df, image_id)
    dets = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    return fol.Detections(detections=dets)


def _create_relationships(rel_id_data, image_id, classes_map, attrs_map):
    all_label_ids = rel_id_data["all_ids"]
    relevant_ids = rel_id_data["relevant_ids"]
    df = rel_id_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _generate_one_label(row):
        # ImageID,LabelName1,LabelName2,XMin1,XMax1,YMin1,YMax1,XMin2,XMax2,YMin2,YMax2,RelationshipLabel

        oi_label1 = row["LabelName1"]
        xmin1 = float(row["XMin1"])
        xmax1 = float(row["XMax1"])
        ymin1 = float(row["YMin1"])
        ymax1 = float(row["YMax1"])

        oi_label2 = row["LabelName2"]
        xmin2 = float(row["XMin2"])
        xmax2 = float(row["XMax2"])
        ymin2 = float(row["YMin2"])
        ymax2 = float(row["YMax2"])

        if oi_label1 in classes_map:
            label1 = classes_map[oi_label1]
        else:
            label1 = attrs_map[oi_label1]

        if oi_label2 in classes_map:
            label2 = classes_map[oi_label2]
        else:
            label2 = attrs_map[oi_label2]

        label_rel = row["RelationshipLabel"]

        xmin_int = min(xmin1, xmin2)
        ymin_int = min(ymin1, ymin2)
        xmax_int = max(xmax1, xmax2)
        ymax_int = max(ymax1, ymax2)

        # Convert to [top-left-x, top-left-y, width, height]
        bbox_int = [
            xmin_int,
            ymin_int,
            xmax_int - xmin_int,
            ymax_int - ymin_int,
        ]

        return fol.Detection(
            bounding_box=bbox_int,
            label=label_rel,
            Label1=label1,
            Label2=label2,
        )

    matching_df = _get_dataframe_rows(df, image_id)
    rels = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    return fol.Detections(detections=rels)


def _create_segmentations(seg_id_data, image_id, classes_map, dataset_dir):
    all_label_ids = seg_id_data["all_ids"]
    relevant_ids = seg_id_data["relevant_ids"]
    df = seg_id_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _generate_one_label(row):
        # MaskPath,ImageID,LabelName,BoxID,BoxXMin,BoxXMax,BoxYMin,BoxYMax,PredictedIoU,Clicks
        mask_path = row["MaskPath"]
        label = classes_map[row["LabelName"]]
        xmin = float(row["BoxXMin"])
        xmax = float(row["BoxXMax"])
        ymin = float(row["BoxYMin"])
        ymax = float(row["BoxYMax"])

        # Convert to [top-left-x, top-left-y, width, height]
        bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

        # Load boolean mask
        mask_path = os.path.join(
            dataset_dir, "labels", "masks", image_id[0].upper(), mask_path,
        )
        if not os.path.isfile(mask_path):
            msg = "Segmentation file %s does not exist", mask_path
            warnings.warn(msg)
            return None

        rgb_mask = etai.read(mask_path)
        mask = etai.rgb_to_gray(rgb_mask) > 122
        h, w = mask.shape
        cropped_mask = mask[
            int(ymin * h) : int(ymax * h), int(xmin * w) : int(xmax * w)
        ]

        return fol.Detection(bounding_box=bbox, label=label, mask=cropped_mask)

    matching_df = _get_dataframe_rows(df, image_id)
    segs = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    segs = [s for s in segs if s is not None]
    return fol.Detections(detections=segs)


def _load_all_image_ids(dataset_dir, split=None, download=True):
    csv_filepath = os.path.join(dataset_dir, "metadata", "image_ids.csv")
    url = _ANNOTATION_DOWNLOAD_URLS[split]["image_ids"]

    quiet = -1 if split == "train" else 0
    _download_file_if_necessary(
        csv_filepath, url, quiet=quiet, download=download
    )

    csv_data = _parse_csv(csv_filepath)
    return [i[0].strip() for i in csv_data[1:]]


def _download_file_if_necessary(
    filepath, url, is_zip=False, quiet=-1, download=True
):
    if is_zip:
        # Check if unzipped directory exists
        unzipped_dir = os.path.splitext(filepath)[0]
        if os.path.isdir(unzipped_dir):
            return

        os.makedirs(unzipped_dir)

    if not os.path.isfile(filepath):
        if not download:
            raise ValueError("File '%s' is not downloaded" % filepath)

        if quiet < 1:
            logger.info("Downloading '%s' to '%s'", url, filepath)

        etau.ensure_basedir(filepath)
        etaw.download_file(url, path=filepath, quiet=quiet != -1)

    if is_zip:
        etau.extract_zip(filepath, outdir=unzipped_dir, delete_zip=True)


def _download_masks_if_necessary(
    image_ids, seg_ids, dataset_dir, split, download=True
):
    seg_zip_names = list({i[0].upper() for i in set(image_ids) & seg_ids})
    mask_urls = _ANNOTATION_DOWNLOAD_URLS[split]["segmentations"]["mask_data"]
    masks_dir = os.path.join(dataset_dir, "labels", "masks")

    quiet = 1 if split == "validation" else 0
    for zip_name in seg_zip_names:
        url = mask_urls[zip_name]
        zip_path = os.path.join(masks_dir, zip_name + ".zip")
        _download_file_if_necessary(
            zip_path, url, is_zip=True, quiet=quiet, download=download
        )


def _download_images_if_necessary(
    image_ids, split, dataset_dir, num_workers=None, download=True
):
    if num_workers is None or num_workers < 1:
        num_workers = multiprocessing.cpu_count()

    data_dir = os.path.join(dataset_dir, "data")
    etau.ensure_dir(data_dir)

    inputs = []
    num_existing = 0
    for image_id in image_ids:
        fp = os.path.join(data_dir, image_id + ".jpg")
        fp_download = os.path.join(split, image_id + ".jpg")
        if not os.path.isfile(fp):
            inputs.append((fp, fp_download))
        else:
            num_existing += 1

    num_images = len(inputs)

    if not inputs:
        if download:
            logger.info("Necessary images already downloaded")

        return

    if not download:
        raise ValueError("%d images are not downloaded" % num_images)

    if num_existing > 0:
        logger.info(
            "Found %d images, downloading the remaining %d",
            num_existing,
            num_images,
        )
    else:
        logger.info("Downloading %d images", num_images)

    if num_workers == 1:
        s3_client = boto3.client(
            "s3",
            config=botocore.config.Config(signature_version=botocore.UNSIGNED),
        )
        with fou.ProgressBar() as pb:
            for path, obj in pb(inputs):
                s3_client.download_file(_BUCKET_NAME, obj, path)
    else:
        with fou.ProgressBar(total=num_images) as pb:
            with multiprocessing.Pool(num_workers, _initialize_worker) as pool:
                for _ in pool.imap_unordered(_do_s3_download, inputs):
                    pb.update()


def _initialize_worker():
    global s3_client
    s3_client = boto3.client(
        "s3",
        config=botocore.config.Config(signature_version=botocore.UNSIGNED),
    )


def _do_s3_download(args):
    filepath, filepath_download = args
    s3_client.download_file(_BUCKET_NAME, filepath_download, filepath)


def _verify_version(version):
    if version not in _SUPPORTED_VERSIONS:
        raise ValueError(
            "Version %s is not supported. Supported versions are: %s"
            % (version, ", ".join(_SUPPORTED_VERSIONS))
        )


_ANNOTATION_DOWNLOAD_URLS = {
    "general": {
        "class_names": "https://storage.googleapis.com/openimages/v5/class-descriptions-boxable.csv",
        "attr_names": "https://storage.googleapis.com/openimages/v6/oidv6-attributes-description.csv",
        "hierarchy": "https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy.json",
        "segmentation_classes": "https://storage.googleapis.com/openimages/v5/classes-segmentation.txt",
    },
    "test": {
        "boxes": "https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv",
        "segmentations": {
            "mask_csv": "https://storage.googleapis.com/openimages/v5/test-annotations-object-segmentation.csv",
            "mask_data": {
                "0": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-0.zip",
                "1": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-1.zip",
                "2": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-2.zip",
                "3": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-3.zip",
                "4": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-4.zip",
                "5": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-5.zip",
                "6": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-6.zip",
                "7": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-7.zip",
                "8": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-8.zip",
                "9": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-9.zip",
                "A": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-a.zip",
                "B": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-b.zip",
                "C": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-c.zip",
                "D": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-d.zip",
                "E": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-e.zip",
                "F": "https://storage.googleapis.com/openimages/v5/test-masks/test-masks-f.zip",
            },
        },
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-test-annotations-vrd.csv",
        "labels": "https://storage.googleapis.com/openimages/v5/test-annotations-human-imagelabels-boxable.csv",
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv",
        "num_images": 125436,
    },
    "train": {
        "boxes": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv",
        "segmentations": {
            "mask_csv": "https://storage.googleapis.com/openimages/v5/train-annotations-object-segmentation.csv",
            "mask_data": {
                "0": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-0.zip",
                "1": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-1.zip",
                "2": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-2.zip",
                "3": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-3.zip",
                "4": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-4.zip",
                "5": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-5.zip",
                "6": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-6.zip",
                "7": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-7.zip",
                "8": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-8.zip",
                "9": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-9.zip",
                "A": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-a.zip",
                "B": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-b.zip",
                "C": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-c.zip",
                "D": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-d.zip",
                "E": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-e.zip",
                "F": "https://storage.googleapis.com/openimages/v5/train-masks/train-masks-f.zip",
            },
        },
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-vrd.csv",
        "labels": "https://storage.googleapis.com/openimages/v5/train-annotations-human-imagelabels-boxable.csv",
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv",
        "num_images": 1743042,
    },
    "validation": {
        "boxes": "https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv",
        "segmentations": {
            "mask_csv": "https://storage.googleapis.com/openimages/v5/validation-annotations-object-segmentation.csv",
            "mask_data": {
                "0": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-0.zip",
                "1": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-1.zip",
                "2": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-2.zip",
                "3": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-3.zip",
                "4": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-4.zip",
                "5": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-5.zip",
                "6": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-6.zip",
                "7": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-7.zip",
                "8": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-8.zip",
                "9": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-9.zip",
                "A": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-a.zip",
                "B": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-b.zip",
                "C": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-c.zip",
                "D": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-d.zip",
                "E": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-e.zip",
                "F": "https://storage.googleapis.com/openimages/v5/validation-masks/validation-masks-f.zip",
            },
        },
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-validation-annotations-vrd.csv",
        "labels": "https://storage.googleapis.com/openimages/v5/validation-annotations-human-imagelabels-boxable.csv",
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv",
        "num_images": 41620,
    },
}

_BUCKET_NAME = "open-images-dataset"

_CSV_DELIMITERS = [",", ";", ":", " ", "\t", "\n"]

_SUPPORTED_LABEL_TYPES = [
    "detections",
    "classifications",
    "relationships",
    "segmentations",
]

_SUPPORTED_SPLITS = [
    "train",
    "test",
    "validation",
]

_SUPPORTED_VERSIONS = [
    "v6",
]
