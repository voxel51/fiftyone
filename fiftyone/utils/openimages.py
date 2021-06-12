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


class OpenImagesDatasetImporter(foud.LabeledImageDatasetImporter):
    """Base class for importing datasets in Open Images format.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a list of types of labels to load. Values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all labels are loaded but not every sample will include
            each label type. If ``max_samples`` and ``label_types`` are both
            specified, then every sample will include the specified label
            types
        classes (None): a list of strings specifying required classes to load.
            Only samples containing at least one instance of a specified
            classes will be downloaded. Use :meth:`get_classes` to see the
            available classes
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): a list of specific image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``
        image_ids_file (None): the path to a newline separated text, JSON, or
            CSV file containing a list of image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``. If
            ``image_ids`` is provided, this parameter is ignored
        load_hierarchy (True): whether to load the classes hiearchy and add it
            to the dataset's ``info`` dictionary
        version ("v6"): the Open Images dataset format version being used.
            Supported values are ``("v6")``
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By
            default, all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        image_ids_file=None,
        load_hierarchy=True,
        version="v6",
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.label_types = label_types
        self.classes = classes
        self.attrs = attrs
        self.image_ids = image_ids
        self.image_ids_file = image_ids_file
        self.load_hierarchy = load_hierarchy
        self.version = version

        self._data_dir = None
        self._info = None
        self._classes = None
        self._supercategory_map = None
        self._images_map = None
        self._annotations = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        image_path = os.path.join(self._data_dir, filename)
        image_id = os.path.splitext(os.path.basename(filename))[0]

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
        self._data_dir = os.path.join(self.dataset_dir, "data")

        dataset_dir = self.dataset_dir
        seed = self.seed
        shuffle = self.shuffle
        max_samples = self.max_samples
        label_types = self.label_types
        classes = self.classes
        attrs = self.attrs
        version = self.version
        image_ids = self.image_ids
        image_ids_file = self.image_ids_file

        _verify_version(version)

        downloaded_ids = etau.list_files(self._data_dir)

        if downloaded_ids:
            ext = os.path.splitext(downloaded_ids[0])[1]
        else:
            logger.warning("No images found in %s", self._data_dir)
            self._filenames = []
            return

        # No matter what classes or attributes you specify, they will not be
        # loaded if you do not want to load labels
        if label_types == []:
            classes = []
            attrs = []

        # Determine the image IDs to load
        if not image_ids and not image_ids_file:
            if not label_types and not classes and not attrs:
                # No IDs were provided and no labels are being loaded
                # Load all image IDs
                specified_image_ids = downloaded_ids
            else:
                # No specific image IDs were given, load all relevant images
                # from the given labels later
                specified_image_ids = None
        else:
            specified_image_ids = _parse_image_ids(
                image_ids, image_ids_file, dataset_dir,
            )
            specified_image_ids = [s + ext for s in specified_image_ids]
            specified_image_ids = sorted(
                list(set(specified_image_ids) & set(downloaded_ids))
            )

        download = False

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
            download,
            seed,
            max_samples,
            label_types,
            classes,
            attrs,
            dataset_dir,
        )

        (
            lab_id_data,
            det_id_data,
            rel_id_data,
            seg_id_data,
            seg_ids,
            ids_any_labels,
            ids_all_labels,
        ) = _get_all_label_data(
            dataset_dir,
            label_types,
            classes,
            oi_classes,
            oi_attrs=oi_attrs,
            download=download,
            seg_classes=seg_classes,
        )

        valid_ids = specified_image_ids

        if valid_ids is None:
            if ids_any_labels and ext not in list(ids_any_labels)[0]:
                ids_any_labels = set([i + ext for i in ids_any_labels])
            if ids_all_labels and ext not in list(ids_all_labels)[0]:
                ids_all_labels = set([i + ext for i in ids_all_labels])

            ids_any_labels = ids_any_labels & set(downloaded_ids)
            ids_all_labels = ids_all_labels & set(downloaded_ids)

            # No IDs specified, load all IDs relevant to given classes
            if guarantee_all_types:
                # When providing specific labels to load and max_samples, only
                # load samples that include all labels
                if max_samples and len(ids_all_labels) < max_samples:
                    # Prioritize samples with all labels but also add samples
                    # with any to reach max_samples
                    ids_not_all = ids_any_labels - ids_all_labels
                    ids_all_labels = sorted(list(ids_all_labels))
                    ids_not_all = sorted(list(ids_not_all))
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

        self._info = {}
        if self.load_hierarchy:
            # Add class hierarchy to dataset.info, used in evaluation
            hierarchy = _get_hierarchy(
                dataset_dir=dataset_dir, download=False,
            )
            self._info["hierarchy"] = hierarchy

        if attrs_map:
            self._info["attributes_map"] = attrs_map

        if all_attrs:
            self._info["attributes"] = all_attrs

        if seg_classes:
            self._info["segmentation_classes"] = seg_classes

        self._info["classes_map"] = classes_map
        self._info["classes"] = all_classes

        self._lab_id_data = lab_id_data
        self._det_id_data = det_id_data
        self._rel_id_data = rel_id_data
        self._seg_id_data = seg_id_data

        self._classes_map = classes_map
        self._attrs_map = attrs_map

        self._label_types = label_types

        self._filenames = valid_ids

    def get_dataset_info(self):
        return self._info


class OpenImagesV6DatasetImporter(OpenImagesDatasetImporter):
    """Importer for datasets in Open Images V6 format.

    See :class:`fiftyone.types.dataset_types.OpenImagesV6Dataset` for format
    details.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a list of types of labels to load. Values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all labels are loaded but not every sample will include
            each label type. If ``max_samples`` and ``label_types`` are both
            specified, then every sample will include the specified label
            types.
        classes (None): a list of strings specifying required classes to load.
            Only samples containing at least one instance of a specified
            classes will be downloaded. Use :meth:`get_classes` to see the
            available classes
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): a list of specific image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``
        image_ids_file (None): the path to a newline separated text, JSON, or
            CSV file containing a list of image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``. If
            ``image_ids`` is provided, this parameter is ignored
        load_hierarchy (True): optionally load the classes hiearchy and add it
            to the info of the dataset
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        image_ids_file=None,
        load_hierarchy=True,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            image_ids=image_ids,
            image_ids_file=image_ids_file,
            load_hierarchy=load_hierarchy,
            version="v6",
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )


def download_open_images_split(
    dataset_dir=None,
    split=None,
    label_types=None,
    classes=None,
    attrs=None,
    image_ids=None,
    image_ids_file=None,
    num_workers=None,
    version="v6",
    shuffle=None,
    seed=None,
    max_samples=None,
):
    """Utility to download the
    `Open Images dataset <https://storage.googleapis.com/openimages/web/index.html>`_
    and store it in the :class:`FiftyOneDataset` format on disk.

    This specifically downloads the subsets of annotations corresponding to the
    600 boxable classes of Open Images.

    All download information can be found under the Open Images V6
    `downloads page. <https://storage.googleapis.com/openimages/web/download.html>`_.

    Args:
        dataset_dir (None): the directory to which the dataset will be
            downloaded
        split (None) a split to download, if applicable. Values are
            ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are downloaded
        label_types (None): a list of types of labels to load. Values are
            ``("detections", "classifications", "relationships", "segmentations")``.
            By default, all labels are loaded but not every sample will include
            each label type. If ``max_samples`` and ``label_types`` are both
            specified, then every sample will include the specified label
            types
        classes (None): a list of strings specifying required classes to load.
            Only samples containing at least one instance of a specified
            classes will be downloaded. Use :meth:`get_classes` to see the
            available classes
        attrs (None): a list of strings for relationship attributes to load
        image_ids (None): a list of specific image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``
        image_ids_file (None): the path to a newline separated text, JSON, or
            CSV file containing a list of image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``. If
            ``image_ids`` is provided, this parameter is ignored
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import per split. By
            default, all samples are imported
    """
    _verify_version(version)

    if num_workers is None or num_workers < 1:
        num_workers = multiprocessing.cpu_count()

    # No matter what classes or attributes you specify, they will not be loaded
    # if you do not want to load labels
    if label_types == []:
        classes = []
        attrs = []

    # Determine the image IDs to load
    if not image_ids and not image_ids_file:
        downloaded_ids = _get_downloaded_ids(dataset_dir)
        if not label_types and not classes and not attrs:
            # No IDs were provided and no labels are being loaded
            # Load all image IDs
            split_image_ids = _load_all_image_ids(
                dataset_dir, split, download=True
            )
        else:
            # No specific image IDs were given, load all relevant images from
            # the given labels later
            split_image_ids = None
    else:
        downloaded_ids = []
        split_image_ids = _parse_image_ids(
            image_ids, image_ids_file, dataset_dir, split=split, download=True
        )

    download = True

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
        download, seed, max_samples, label_types, classes, attrs, dataset_dir,
    )

    # Download class hierarchy, used in evaluation
    hierarchy = _get_hierarchy(
        dataset_dir=dataset_dir, classes_map=classes_map,
    )

    num_samples = _load_open_images_split(
        label_types,
        guarantee_all_types,
        split_image_ids,
        downloaded_ids,
        classes_map,
        attrs_map,
        oi_classes,
        oi_attrs,
        seg_classes,
        dataset_dir,
        split,
        classes,
        max_samples,
        shuffle,
        num_workers,
    )

    return num_samples, all_classes


def _setup(
    download, seed, max_samples, label_types, classes, attrs, dataset_dir,
):

    if seed is not None:
        random.seed(seed)

    if max_samples and (label_types or classes or attrs):
        # Only samples with every specified label type will be loaded
        guarantee_all_types = True
    else:
        # Samples may not contain multiple label types, but will contain at
        # least one
        guarantee_all_types = False

    label_types = _parse_label_types(label_types)

    # Map of class IDs to class names
    classes_map = _get_classes_map(dataset_dir=dataset_dir, download=download)
    classes_map_rev = {v: k for k, v in classes_map.items()}

    all_classes = sorted(list(classes_map.values()))

    if classes == None:
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
            try:
                oi_classes.append(classes_map_rev[c])
                filtered_classes.append(c)
            except:
                missing_classes.append(c)

        classes = filtered_classes
        if missing_classes:
            logger.warning(
                "The following are not available classes: %s\n\nYou can view "
                "the available classes via `get_classes()`\n"
                % ",".join(missing_classes)
            )

    attrs_map = {}
    oi_attrs = []
    all_attrs = []
    if "relationships" in label_types:
        # Map of attribute IDs to attribute names
        attrs_map = _get_attrs_map(dataset_dir=dataset_dir, download=download)
        attrs_map_rev = {v: k for k, v in attrs_map.items()}

        all_attrs = sorted(list(attrs_map.values()))

        if attrs == None:
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
                    "The following are not available attributes: %s\n\nYou "
                    "can view the available attributes via "
                    "`get_attributes()`\n",
                    ",".join(missing_attrs),
                )
    else:
        attrs = []

    seg_classes = []
    if "segmentations" in label_types:
        seg_classes = _get_seg_classes(
            dataset_dir=dataset_dir,
            classes_map=classes_map,
            download=download,
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


def get_attributes(dataset_dir=None, version="v6"):
    """Gets the list of relationship attributes in the Open Images V6 dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``

    Returns:
        a sorted list of attribute names
    """
    _verify_version(version)

    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images")

    try:
        attrs_map = _get_attrs_map(dataset_dir, download=False)
    except FileNotFoundError:
        with etau.TempDir() as tmp_dir:
            attrs_map = _get_attrs_map(dataset_dir=tmp_dir, download=True,)

    return sorted(list(attrs_map.values()))


def get_classes(dataset_dir=None, version="v6"):
    """Gets the 601 boxable classes that exist in classifications, detections,
    and relationships in the Open Images V6 dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded and ``info.json`` is stored
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``

    Returns:
        a sorted list of class name strings
    """
    _verify_version(version)

    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images")

    try:
        classes_map = _get_classes_map(dataset_dir, download=False)
    except FileNotFoundError:
        with etau.TempDir() as tmp_dir:
            classes_map = _get_classes_map(dataset_dir=tmp_dir, download=True)

    return sorted(list(classes_map.values()))


def get_segmentation_classes(dataset_dir=None, version="v6"):
    """Gets the list of classes (350) that are labeled with segmentations in
    the Open Images V6 dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded and ``info.json`` is stored
        version ("v6"): the version of the Open Images dataset to download.
            Supported values are ``("v6")``

    Returns:
        a sorted list of segmentation class name strings
    """
    _verify_version(version)

    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images")

    try:
        seg_classes = _get_seg_classes(dataset_dir, download=False)
    except FileNotFoundError:
        with etau.TempDir() as tmp_dir:
            seg_classes = _get_seg_classes(dataset_dir=tmp_dir, download=True)

    return seg_classes


def _get_general_metadata_file(
    dataset_dir, filename, annot_link, download=True
):
    filepath = os.path.join(dataset_dir, "metadata", filename)
    if not os.path.exists(filepath):
        for split in _DEFAULT_SPLITS:
            split_filepath = os.path.join(
                dataset_dir, split, "metadata", filename
            )
            if os.path.exists(split_filepath):
                return split_filepath

    if download:
        _download_if_necessary(filepath, annot_link, quiet=0)

    return filepath


def _get_attrs_map(dataset_dir, download=True):
    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["attr_names"]
    attrs_csv = _get_general_metadata_file(
        dataset_dir, "attributes.csv", annot_link, download=download
    )
    attrs_data = _parse_csv(attrs_csv)
    attrs_map = {k: v for k, v in attrs_data}
    return attrs_map


def _get_classes_map(dataset_dir, download=True):
    # Map of class IDs to class names
    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["class_names"]
    cls_csv = _get_general_metadata_file(
        dataset_dir, "classes.csv", annot_link, download=download
    )
    cls_data = _parse_csv(cls_csv)
    classes_map = {k: v for k, v in cls_data}
    return classes_map


def _get_seg_classes(dataset_dir, classes_map=None, download=True):
    if not classes_map:
        classes_map = _get_classes_map(
            dataset_dir=dataset_dir, download=download
        )

    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["segmentation_classes"]
    seg_cls_txt = _get_general_metadata_file(
        dataset_dir, "segmentation_classes.csv", annot_link, download=download
    )

    with open(seg_cls_txt, "r") as f:
        seg_classes_oi = [l.rstrip("\n") for l in f]

    seg_classes = [classes_map[c] for c in seg_classes_oi]

    return sorted(seg_classes)


def _get_hierarchy(dataset_dir, classes_map=None, download=True):
    hierarchy_path = os.path.join(dataset_dir, "metadata", "hierarchy.json")
    if download and not os.path.exists(hierarchy_path):
        annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["hierarchy"]
        with etau.TempDir() as tmp_dir:
            tmp_filepath = _get_general_metadata_file(
                tmp_dir, "hierarchy.json", annot_link, download=True
            )

            hierarchy = etas.load_json(tmp_filepath)

            if classes_map is None:
                classes_map = _get_classes_map(
                    dataset_dir=tmp_dir, download=download
                )

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


def _parse_image_ids(
    image_ids,
    image_ids_file,
    dataset_dir,
    split=None,
    download=False,
    ext=".jpg",
):
    if image_ids:
        # image_ids has precedence over image_ids_file
        _image_ids = image_ids

    else:
        id_file_ext = os.path.splitext(image_ids_file)[-1]
        if id_file_ext == ".txt":
            with open(image_ids_file, "r") as f:
                _image_ids = [i for i in f.readlines()]

        elif id_file_ext == ".json":
            _image_ids = etas.load_json(image_ids_file)

        elif id_file_ext == ".csv":
            _image_ids = _parse_csv(image_ids_file)

            if isinstance(_image_ids[0], list):
                # Flatten list
                _image_ids = [i for lst in _image_ids for i in lst]

        else:
            raise ValueError(
                "Image ID file extension must be .txt, .csv, or .json, "
                "found %s" % id_file_ext
            )

    if split is None:
        return [
            os.path.basename(i).rstrip().replace(ext, "") for i in _image_ids
        ]

    split_image_ids = []
    unspecified_split_ids = []

    # Parse each provided ID into the given split
    for i in _image_ids:
        if "/" in i:
            id_split, image_id = i.split("/")
            if id_split not in _DEFAULT_SPLITS:
                raise ValueError(
                    "Split %s does not exist. Options are "
                    "(train, test, validation)" % id_split
                )
            if id_split != split:
                continue

            image_id = image_id.rstrip().replace(ext, "")
            split_image_ids.append(image_id)

        else:
            image_id = i.rstrip().replace(ext, "")
            unspecified_split_ids.append(image_id)

    split_image_ids = _verify_image_ids(
        split_image_ids,
        unspecified_split_ids,
        dataset_dir,
        split,
        download=download,
    )

    return split_image_ids


def _parse_label_types(label_types):
    if label_types is None:
        label_types = _DEFAULT_LABEL_TYPES

    _label_types = []
    for l in label_types:
        if l not in _DEFAULT_LABEL_TYPES:
            raise ValueError(
                "Unrecognized label type '%s'. Supported values are %s"
                % (l, _DEFAULT_LABEL_TYPES)
            )

        _label_types.append(l)

    return _label_types


def _parse_splits(split, splits):
    _splits = []

    if split:
        _splits.append(split)

    if splits:
        _splits.extend(list(splits))

    if not _splits:
        _splits = _DEFAULT_SPLITS

    return list(set(_splits))


def _verify_image_ids(
    selected_split_ids, unspecified_ids, download_dir, split, download=True
):
    # Download all image IDs, verify given IDs, sort unspecified IDs into
    # current split
    split_ids = _load_all_image_ids(download_dir, split, download)

    # Need to verify image IDs are in correct split
    sid_set = set(split_ids)
    ssid_set = set(selected_split_ids)
    verified_split_ids = sid_set & ssid_set
    incorrect_split_ids = ssid_set - verified_split_ids
    if incorrect_split_ids:
        logger.info(
            "The following image IDs do not exist in split %s: %s",
            split,
            ",".join(list(incorrect_split_ids)),
        )

    # Find any unspecified IDs in this split and add them
    uids_set = set(unspecified_ids)
    unspecified_ids_in_split = sid_set & uids_set

    split_image_ids = list(verified_split_ids) + list(unspecified_ids_in_split)

    return split_image_ids


def _get_downloaded_ids(dataset_dir):
    data_path = os.path.join(dataset_dir, "data")
    data_ids = []
    if os.path.exists(data_path):
        data_ids = os.listdir(data_path)

    return [os.path.splitext(i)[0] for i in data_ids]


def _get_label_data(
    label_type,
    dataset_dir,
    label_inds,
    oi_classes,
    oi_attrs=[],
    id_ind=0,
    annot_link=None,
    download=True,
    ids_only=False,
):
    csv_path = os.path.join(dataset_dir, "labels", label_type + ".csv")
    if download:
        _download_if_necessary(
            csv_path, annot_link, quiet=0,
        )
    df = _parse_csv(csv_path, dataframe=True)

    # Find intersection of ImageIDs with all annotations
    # Only keep samples with at least one label relevant to specified classes
    # or attributes

    label_id_data = {}
    relevant_ids = set()
    oi_classes_attrs = set(oi_classes) | set(oi_attrs)
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
        annot_link = None
        if download:
            annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["boxes"]

        det_id_data, det_ids = _get_label_data(
            "detections",
            dataset_dir,
            [2],
            oi_classes,
            annot_link=annot_link,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = det_ids
        else:
            ids_all_labels = ids_all_labels & det_ids

        ids_any_labels = ids_any_labels | det_ids

    if "classifications" in label_types:
        annot_link = None
        if download:
            annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["labels"]

        lab_id_data, lab_ids = _get_label_data(
            "classifications",
            dataset_dir,
            [2],
            oi_classes,
            annot_link=annot_link,
            download=download,
            ids_only=ids_only,
        )

        if ids_all_labels is None:
            ids_all_labels = lab_ids
        else:
            ids_all_labels = ids_all_labels & lab_ids

        ids_any_labels = ids_any_labels | lab_ids

    if "relationships" in label_types:
        annot_link = None
        if download:
            annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["relationships"]

        rel_id_data, rel_ids = _get_label_data(
            "relationships",
            dataset_dir,
            [1, 2],
            oi_classes,
            oi_attrs=oi_attrs,
            annot_link=annot_link,
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

        annot_link = None
        if download:
            annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"][
                "mask_csv"
            ]

        seg_id_data, seg_ids = _get_label_data(
            "segmentations",
            dataset_dir,
            [2],
            oi_classes,
            id_ind=1,
            annot_link=annot_link,
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


def _load_open_images_split(
    label_types,
    guarantee_all_types,
    split_image_ids,
    downloaded_ids,
    classes_map,
    attrs_map,
    oi_classes,
    oi_attrs,
    seg_classes,
    dataset_dir,
    split,
    classes,
    max_samples,
    shuffle,
    num_workers,
):

    (
        lab_id_data,
        det_id_data,
        rel_id_data,
        seg_id_data,
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
        download=True,
        seg_classes=seg_classes,
        ids_only=True,
    )

    valid_ids = split_image_ids

    if valid_ids is None:
        # No IDs specified, load all IDs relevant to given classes
        if guarantee_all_types:
            # When providing specific labels to load and max_samples, only load
            # samples that include all labels
            if max_samples and len(ids_all_labels) < max_samples:
                # prioritize samples with all labels but also add samples with
                # any to reach max_samples
                ids_not_all = ids_any_labels - ids_all_labels

                # Prioritize loading existing images first
                non_existing_ids = ids_not_all - set(downloaded_ids)
                existing_ids = ids_not_all - non_existing_ids

                ids_all_labels = sorted(list(ids_all_labels))
                existing_ids = sorted(list(existing_ids))
                non_existing_ids = sorted(list(non_existing_ids))

                if shuffle:
                    random.shuffle(ids_all_labels)
                    random.shuffle(existing_ids)
                    random.shuffle(non_existing_ids)
                    shuffle = False

                valid_ids = ids_all_labels + existing_ids + non_existing_ids
                valid_ids = valid_ids[:max_samples]

            else:
                valid_ids = ids_all_labels
        else:
            valid_ids = ids_any_labels

    valid_ids = list(valid_ids)

    if max_samples and len(valid_ids) > max_samples:
        # Prioritize loading existing images first
        non_existing_ids = set(valid_ids) - set(downloaded_ids)
        existing_ids = set(valid_ids) - non_existing_ids

        non_existing_ids = sorted(list(non_existing_ids))
        existing_ids = sorted(list(existing_ids))

        if shuffle:
            random.shuffle(existing_ids)
            random.shuffle(non_existing_ids)

        valid_ids = existing_ids + non_existing_ids
        valid_ids = valid_ids[:max_samples]

    elif shuffle:
        random.shuffle(valid_ids)

    if not valid_ids:
        return 0

    _download_specific_images(valid_ids, split, dataset_dir, num_workers)

    if "segmentations" in label_types:
        _download_segmentation_masks(
            list(set(downloaded_ids + valid_ids)), seg_ids, dataset_dir, split
        )

    return len(valid_ids)


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
        pos_labels = fol.Classifications(classifications=[])
        neg_labels = fol.Classifications(classifications=[])
        return pos_labels, neg_labels

    def _generate_one_label(label, conf):
        # [ImageID,Source,LabelName,Confidence]
        label = classes_map[label]
        conf = float(conf)
        cls = fol.Classification(label=label, confidence=conf)
        return cls

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
        return fol.Detections(detections=[])

    def _generate_one_label(row):
        # ImageID,Source,LabelName,Confidence,XMin,XMax,YMin,YMax,IsOccluded,IsTruncated,IsGroupOf,IsDepiction,IsInside
        label = classes_map[row["LabelName"]]
        xmin = float(row["XMin"])
        xmax = float(row["XMax"])
        ymin = float(row["YMin"])
        ymax = float(row["YMax"])

        # Convert to [top-left-x, top-left-y, width, height]
        bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

        detection = fol.Detection(bounding_box=bbox, label=label)

        detection["IsOccluded"] = bool(int(row["IsOccluded"]))
        detection["IsTruncated"] = bool(int(row["IsTruncated"]))
        detection["IsGroupOf"] = bool(int(row["IsGroupOf"]))
        detection["IsDepiction"] = bool(int(row["IsDepiction"]))
        detection["IsInside"] = bool(int(row["IsInside"]))
        return detection

    matching_df = _get_dataframe_rows(df, image_id)
    dets = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    detections = fol.Detections(detections=dets)

    return detections


def _create_relationships(rel_id_data, image_id, classes_map, attrs_map):
    all_label_ids = rel_id_data["all_ids"]
    relevant_ids = rel_id_data["relevant_ids"]
    df = rel_id_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections(detections=[])

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

        detection_rel = fol.Detection(bounding_box=bbox_int, label=label_rel)

        detection_rel["Label1"] = label1
        detection_rel["Label2"] = label2

        return detection_rel

    matching_df = _get_dataframe_rows(df, image_id)
    rels = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    relationships = fol.Detections(detections=rels)

    return relationships


def _create_segmentations(seg_id_data, image_id, classes_map, dataset_dir):
    all_label_ids = seg_id_data["all_ids"]
    relevant_ids = seg_id_data["relevant_ids"]
    df = seg_id_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections(detections=[])

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
            logger.warning("Segmentation file %s does not exist", mask_path)
            return

        rgb_mask = etai.read(mask_path)
        mask = etai.rgb_to_gray(rgb_mask) > 122
        h, w = mask.shape
        cropped_mask = mask[
            int(ymin * h) : int(ymax * h), int(xmin * w) : int(xmax * w)
        ]

        segmentation = fol.Detection(
            bounding_box=bbox, label=label, mask=cropped_mask
        )
        return segmentation

    matching_df = _get_dataframe_rows(df, image_id)
    segs = [_generate_one_label(row[1]) for row in matching_df.iterrows()]
    segs = [s for s in segs if s is not None]
    segmentations = fol.Detections(detections=segs)

    return segmentations


def _download_if_necessary(filename, source, is_zip=False, quiet=-1):
    if is_zip:
        # Check if unzipped directory exists
        unzipped_dir = os.path.splitext(filename)[0]
        if not os.path.isdir(unzipped_dir):
            os.makedirs(unzipped_dir)
        else:
            return

    if not os.path.isfile(filename):
        if quiet < 1:
            logger.info("Downloading %s to %s", source, filename)

        etau.ensure_basedir(filename)
        q = False if quiet == -1 else True
        etaw.download_file(source, path=filename, quiet=q)

    if is_zip:
        # Unpack zipped directory
        etau.extract_zip(filename, outdir=unzipped_dir, delete_zip=True)


def _load_all_image_ids(download_dir, split=None, download=False):
    csv_filepath = os.path.join(download_dir, "metadata", "image_ids.csv")
    if download:
        annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["image_ids"]
        quiet = -1 if split == "train" else 0
        _download_if_necessary(csv_filepath, annot_link, quiet=quiet)

    csv_data = _parse_csv(csv_filepath)
    split_ids = [i[0].rstrip() for i in csv_data[1:]]
    return split_ids


def _download_segmentation_masks(valid_ids, seg_ids, dataset_dir, split):
    logger.info("Downloading relevant segmentation masks")
    seg_zip_names = list({i[0].upper() for i in (set(valid_ids) & seg_ids)})
    quiet = 1 if split == "validation" else 0
    for zip_name in seg_zip_names:
        zip_path = os.path.join(
            dataset_dir, "labels", "masks", "%s.zip" % zip_name,
        )
        _download_if_necessary(
            zip_path,
            _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"]["mask_data"][
                zip_name
            ],
            is_zip=True,
            quiet=quiet,
        )


def _download_specific_images(
    valid_ids, split, dataset_dir, num_workers, ext=".jpg"
):
    logger.info("Downloading %s samples", split)
    etau.ensure_dir(os.path.join(dataset_dir, "data"))

    inputs = []
    existing = 0
    for image_id in valid_ids:
        fp = os.path.join(dataset_dir, "data", "%s%s" % (image_id, ext))
        fp_download = os.path.join(split, "%s%s" % (image_id, ext))
        if not os.path.isfile(fp):
            inputs.append((fp, fp_download))
        else:
            existing += 1

    if not inputs:
        logger.info("All samples already downloaded")
        return

    if existing > 0:
        logger.info(
            "%d samples found, downloading the remaining %d",
            existing,
            len(inputs),
        )

    with fou.ProgressBar(total=len(inputs)) as pb:
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


_ANNOTATION_DOWNLOAD_LINKS = {
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

_DEFAULT_LABEL_TYPES = [
    "detections",
    "classifications",
    "relationships",
    "segmentations",
]

_DEFAULT_SPLITS = [
    "train",
    "test",
    "validation",
]

_SUPPORTED_VERSIONS = [
    "v6",
]
