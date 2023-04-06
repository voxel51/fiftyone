"""
Utilities for working with the
`Open Images <https://storage.googleapis.com/openimages/web/index.html>`
dataset.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import csv
from glob import glob
import logging
import os
import random
import warnings

import pandas as pd

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.utils.aws as foua
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class OpenImagesDatasetImporter(foud.LabeledImageDatasetImporter):
    """Base class for importing datasets in Open Images format.

    See :class:`fiftyone.types.OpenImagesDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "points", "relationships",
            "segmentations")``. "points" are only supported for open-images-v7.
            By default, all supported label types for version are loaded
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        attrs (None): a string or list of strings specifying required
            relationship attributes to load. Only applicable when
            ``label_types`` includes "relationships". If provided, only samples
            containing at least one instance of a specified attribute will be
            loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        include_id (True): whether to load the Open Images ID for each sample
            along with the labels
        only_matching (False): whether to only load labels that match the
            ``classes`` or ``attrs`` requirements that you provide (True), or
            to load all labels for samples that match the requirements (False)
        load_hierarchy (True): whether to load the classes hiearchy and add it
            to the dataset's ``info`` dictionary
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types``, ``classes``, and/or ``attrs`` are also specified,
            first priority will be given to samples that contain all of the
            specified label types, classes, and/or attributes, followed by
            samples that contain at least one of the specified labels types or
            classes. The actual number of samples loaded may be less than this
            maximum value if the dataset does not contain sufficient samples
            matching your requirements. By default, all matching samples are
            loaded
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        include_id=True,
        only_matching=False,
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

        # pylint: disable=no-member
        self.label_types = _parse_label_types(self.version, label_types)
        self.classes = classes
        self.attrs = attrs
        self.image_ids = image_ids
        self.only_matching = only_matching
        self.load_hierarchy = load_hierarchy

        self._images_map = None
        self._info = None
        self._classes_map = None
        self._attrs_map = None
        self._cls_data = None
        self._det_data = None
        self._pnt_data = None
        self._rel_data = None
        self._seg_data = None
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

        label = {}

        if "classifications" in self.label_types:
            # Add labels
            pos_labels, neg_labels = _create_classifications(
                self._cls_data, image_id, self._classes_map
            )
            if pos_labels is not None:
                label["positive_labels"] = pos_labels

            if neg_labels is not None:
                label["negative_labels"] = neg_labels

        if "detections" in self.label_types:
            # Add detections
            detections = _create_detections(
                self._det_data, image_id, self._classes_map
            )
            if detections is not None:
                label["detections"] = detections

        if "points" in self.label_types:
            # Add points
            points = _create_points(
                self._pnt_data,
                image_id,
                self._point_classes_map,
                self.dataset_dir,
            )
            if points is not None:
                label["points"] = points

        if "segmentations" in self.label_types:
            # Add segmentations
            segmentations = _create_segmentations(
                self._seg_data,
                image_id,
                self._classes_map,
                self.dataset_dir,
            )
            if segmentations is not None:
                label["segmentations"] = segmentations

        if "relationships" in self.label_types:
            # Add relationships
            relationships = _create_relationships(
                self._rel_data, image_id, self._classes_map, self._attrs_map
            )
            if relationships is not None:
                label["relationships"] = relationships

        if "open_images_id" in self.label_types:
            label["open_images_id"] = image_id

        if self._has_scalar_labels:
            label = next(iter(label.values())) if label else None

        return image_path, None, label

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    @property
    def _has_scalar_labels(self):
        return (
            len(self.label_types) == 1
            and self.label_types[0] != "classifications"
        )

    @property
    def label_cls(self):
        types = {
            "classifications": fol.Classifications,
            "detections": fol.Detections,
            "points": fol.Keypoints,
            "segmentations": fol.Detections,
            "relationships": fol.Detections,
            "open_images_id": fof.StringField,
        }

        if self._has_scalar_labels:
            return types[self.label_types[0]]

        return {k: v for k, v in types.items() if k in self.label_types}

    def setup(self):
        dataset_dir = self.dataset_dir
        seed = self.seed
        shuffle = self.shuffle
        max_samples = self.max_samples
        label_types = self.label_types
        classes = self.classes
        attrs = self.attrs
        image_ids = self.image_ids
        # pylint: disable=no-member
        version = self.version

        data_dir = os.path.join(self.dataset_dir, "data")

        images_map = {
            os.path.splitext(filename)[0]: os.path.join(data_dir, filename)
            for filename in etau.list_files(data_dir)
        }
        available_ids = list(images_map.keys())

        info = {}

        self._images_map = images_map
        self._info = info

        if not available_ids:
            self._uuids = []
            return

        if image_ids:
            image_ids = _parse_image_ids(image_ids, ignore_split=True)
            image_ids = list(set(image_ids) & set(available_ids))
        else:
            image_ids = available_ids

        (
            classes_map,
            all_classes,
            classes,
            oi_classes,
            attrs_map,
            all_attrs,
            attrs,
            oi_attrs,
            seg_classes,
            pnt_classes_map,
            _,
        ) = _setup(
            dataset_dir,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            seed=seed,
            download=False,
        )

        (
            cls_data,
            det_data,
            pnt_data,
            rel_data,
            seg_data,
            all_label_ids,
            any_label_ids,
            _,
        ) = _get_all_label_data(
            dataset_dir,
            image_ids,
            label_types=label_types,
            classes=classes,
            oi_classes=oi_classes,
            attrs=attrs,
            oi_attrs=oi_attrs,
            seg_classes=seg_classes,
            pnt_classes=pnt_classes_map,
            ids_only=False,
            track_all_ids=max_samples is not None,
            only_matching=self.only_matching,
            download=False,
            version=version,
        )

        if max_samples is not None:
            if self.classes is None and self.attrs is None:
                # No requirements were provided, so always make all samples
                # available
                extra_ids = set(image_ids) - set(any_label_ids)
            else:
                extra_ids = set()

            # Prioritize samples with all labels, then any, then extras
            not_all_ids = any_label_ids - all_label_ids
            all_label_ids = sorted(all_label_ids)
            not_all_ids = sorted(not_all_ids)
            extra_ids = sorted(extra_ids)

            if shuffle:
                random.shuffle(all_label_ids)
                random.shuffle(not_all_ids)
                random.shuffle(extra_ids)

            valid_ids = all_label_ids + not_all_ids + extra_ids
            valid_ids = valid_ids[:max_samples]
        else:
            if self.classes is None and self.attrs is None:
                # No requirements were provided, so always make all samples
                # available
                valid_ids = sorted(image_ids)
            else:
                valid_ids = sorted(any_label_ids)

            if shuffle:
                random.shuffle(valid_ids)

        if self.load_hierarchy:
            hierarchy, _ = _get_hierarchy(dataset_dir, download=False)
            info["hierarchy"] = hierarchy

        if attrs_map:
            info["attributes_map"] = attrs_map

        if all_attrs:
            info["attributes"] = all_attrs

        if seg_classes:
            info["segmentation_classes"] = seg_classes

        if pnt_classes_map:
            info["point_classes"] = list(pnt_classes_map.values())

        info["classes_map"] = classes_map
        info["classes"] = all_classes

        self._classes_map = classes_map
        self._point_classes_map = pnt_classes_map
        self._attrs_map = attrs_map
        self._cls_data = cls_data
        self._det_data = det_data
        self._pnt_data = pnt_data
        self._rel_data = rel_data
        self._seg_data = seg_data
        self._uuids = valid_ids

    def get_dataset_info(self):
        return self._info


class OpenImagesV6DatasetImporter(OpenImagesDatasetImporter):
    """Base class for importing datasets in Open Images V6 format.

    See :class:`fiftyone.types.OpenImagesDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "relationships",
            "segmentations")``.
            By default, all supported label types for version are loaded
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        attrs (None): a string or list of strings specifying required
            relationship attributes to load. Only applicable when
            ``label_types`` includes "relationships". If provided, only samples
            containing at least one instance of a specified attribute will be
            loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        include_id (True): whether to load the Open Images ID for each sample
            along with the labels
        only_matching (False): whether to only load labels that match the
            ``classes`` or ``attrs`` requirements that you provide (True), or
            to load all labels for samples that match the requirements (False)
        load_hierarchy (True): whether to load the classes hiearchy and add it
            to the dataset's ``info`` dictionary
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types``, ``classes``, and/or ``attrs`` are also specified,
            first priority will be given to samples that contain all of the
            specified label types, classes, and/or attributes, followed by
            samples that contain at least one of the specified labels types or
            classes. The actual number of samples loaded may be less than this
            maximum value if the dataset does not contain sufficient samples
            matching your requirements. By default, all matching samples are
            loaded
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        include_id=True,
        only_matching=False,
        load_hierarchy=True,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        self.version = "v6"
        super().__init__(
            dataset_dir,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            image_ids=image_ids,
            include_id=include_id,
            only_matching=only_matching,
            load_hierarchy=load_hierarchy,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )


class OpenImagesV7DatasetImporter(OpenImagesDatasetImporter):
    """Base class for importing datasets in Open Images V7 format.

    See :class:`fiftyone.types.OpenImagesDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "points", "relationships",
            "segmentations")``.
            By default, all supported label types for version are loaded
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        attrs (None): a string or list of strings specifying required
            relationship attributes to load. Only applicable when
            ``label_types`` includes "relationships". If provided, only samples
            containing at least one instance of a specified attribute will be
            loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        include_id (True): whether to load the Open Images ID for each sample
            along with the labels
        only_matching (False): whether to only load labels that match the
            ``classes`` or ``attrs`` requirements that you provide (True), or
            to load all labels for samples that match the requirements (False)
        load_hierarchy (True): whether to load the classes hiearchy and add it
            to the dataset's ``info`` dictionary
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types``, ``classes``, and/or ``attrs`` are also specified,
            first priority will be given to samples that contain all of the
            specified label types, classes, and/or attributes, followed by
            samples that contain at least one of the specified labels types or
            classes. The actual number of samples loaded may be less than this
            maximum value if the dataset does not contain sufficient samples
            matching your requirements. By default, all matching samples are
            loaded
    """

    def __init__(
        self,
        dataset_dir,
        label_types=None,
        classes=None,
        attrs=None,
        image_ids=None,
        include_id=True,
        only_matching=False,
        load_hierarchy=True,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        self.version = "v7"
        super().__init__(
            dataset_dir,
            label_types=label_types,
            classes=classes,
            attrs=attrs,
            image_ids=image_ids,
            include_id=include_id,
            only_matching=only_matching,
            load_hierarchy=load_hierarchy,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )


def get_attributes(version="v7", dataset_dir=None):
    """Gets the list of relationship attributes in the Open Images dataset.

    Args:
        version ("v7"): the version of the Open Images dataset. Supported
            values are ``("v6", "v7")``
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
        attrs_map, _ = _get_attrs_map(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            attrs_map, _ = _get_attrs_map(tmp_dir, download=True)

    return sorted(attrs_map.values())


def get_classes(version="v7", dataset_dir=None):
    """Gets the boxable classes that exist in classifications, detections,
    points, and relationships in the Open Images dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        version ("v7"): the version of the Open Images dataset. Supported
            values are ``("v6", "v7")``
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
        classes_map, _ = _get_classes_map(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            classes_map, _ = _get_classes_map(tmp_dir, download=True)

    return sorted(classes_map.values())


def get_segmentation_classes(version="v6", dataset_dir=None):
    """Gets the list of classes (350) that are labeled with segmentations in
    the Open Images V6/V7 dataset.

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
        seg_classes, _ = _get_seg_classes(dataset_dir, download=False)
    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            seg_classes, _ = _get_seg_classes(tmp_dir, download=True)

    return seg_classes


def get_point_classes(version="v7", dataset_dir=None):
    """Gets the list of classes that are labeled with points in
    the Open Images V7 dataset.

    This method can be called in isolation without downloading the dataset.

    Args:
        version ("v7"): the version of the Open Images dataset. Supported
            values are ``("v7")``
        dataset_dir (None): an optional root directory in which the dataset
            is downloaded

    Returns:
        a sorted list of segmentation class name strings
    """
    _verify_version(version)
    if version != "v7":
        logger.warning("only open-images-v7 supports point labels")
        return

    if dataset_dir is None:
        dataset_dir = os.path.join(
            fo.config.dataset_zoo_dir, "open-images-%s" % version
        )

    try:
        # Try to use already downloaded file
        pnt_classes_map, _ = _get_pnt_classes_map(dataset_dir, download=False)

    except:
        # Download file to temporary location
        with etau.TempDir() as tmp_dir:
            pnt_classes_map, _ = _get_pnt_classes_map(tmp_dir, download=True)
    return pnt_classes_map


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
    `Open Images dataset
    <https://storage.googleapis.com/openimages/web/index.html>`_.

    See :class:`fiftyone.types.OpenImagesDataset` for the format in which
    ``dataset_dir`` will be arranged.

    Any existing files are not re-downloaded.

    This method specifically downloads the subsets of annotations corresponding
    to the 600 boxable classes of Open Images.
    `See here <https://storage.googleapis.com/openimages/web/download.html>`_
    for other download options.

    Args:
        dataset_dir: the directory to download the dataset
        split: the split to download. Supported values are
            ``("train", "validation", "test")``
        version ("v7"): the version of the Open Images dataset to download.
            Supported values are ``("v6", "v7")``
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "classifications", "relationships",
            "segmentations")``
            for ``"v6"`` and
            ``("detections", "classifications", "points", "relationships",
            "segmentations")`` for ``"v7"``.
            By default, all label types are loaded
        classes (None): a string or list of strings specifying required classes
            to load. If provided, only samples containing at least one instance
            of a specified class will be loaded
        attrs (None): a string or list of strings specifying required
            relationship attributes to load. Only applicable when
            ``label_types`` includes "relationships". If provided, only samples
            containing at least one instance of a specified attribute will be
            loaded
        image_ids (None): an optional list of specific image IDs to load. Can
            be provided in any of the following formats:

            -   a list of ``<image-id>`` strings
            -   a list of ``<split>/<image-id>`` strings
            -   the path to a text (newline-separated), JSON, or CSV file
                containing the list of image IDs to load in either of the first
                two formats
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        shuffle (False): whether to randomly shuffle the order in which samples
            are chosen for partial downloads
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load per split. If
            ``label_types``, ``classes``, and/or ``attrs`` are also specified,
            first priority will be given to samples that contain all of the
            specified label types, classes, and/or attributes, followed by
            samples that contain at least one of the specified labels types or
            classes. The actual number of samples loaded may be less than this
            maximum value if the dataset does not contain sufficient samples
            matching your requirements. By default, all matching samples are
            loaded

    Returns:
        a tuple of:

        -   num_samples: the total number of downloaded images, or ``None`` if
            everything was already downloaded
        -   classes: the list of all classes, or ``None`` if everything was
            already downloaded
        -   did_download: whether any content was downloaded (True) or if all
            necessary files were already downloaded (False)
    """
    _verify_version(version)
    label_types = _parse_label_types(version, label_types)

    did_download = False

    if image_ids is not None:
        image_ids, _did_download = _parse_and_verify_image_ids(
            image_ids, dataset_dir, split, download=True
        )
        did_download |= _did_download
    else:
        image_ids, _did_download = _load_all_image_ids(
            dataset_dir, split=split, download=True
        )
        did_download |= _did_download

    downloaded_ids = _get_downloaded_image_ids(dataset_dir)

    (
        classes_map,
        all_classes,
        classes,
        oi_classes,
        attrs_map,
        all_attrs,
        attrs,
        oi_attrs,
        seg_classes,
        pnt_classes_map,
        _did_download,
    ) = _setup(
        dataset_dir,
        label_types=label_types,
        classes=classes,
        attrs=attrs,
        seed=seed,
        download=True,
    )

    did_download |= _did_download

    # Download class hierarchy if necessary (used in evaluation)
    _, _did_download = _get_hierarchy(
        dataset_dir, classes_map=classes_map, download=True
    )
    did_download |= _did_download

    num_samples, _did_download = _download(
        image_ids,
        downloaded_ids,
        oi_classes,
        oi_attrs,
        seg_classes,
        pnt_classes_map,
        dataset_dir,
        split,
        label_types=label_types,
        classes=classes,
        attrs=attrs,
        max_samples=max_samples,
        shuffle=shuffle,
        num_workers=num_workers,
        download=True,
        version=version,
    )

    did_download |= _did_download

    return num_samples, all_classes, did_download


def _setup(
    dataset_dir,
    label_types=None,
    classes=None,
    attrs=None,
    seed=None,
    download=False,
):

    did_download = False
    _label_types = label_types

    if etau.is_str(classes):
        classes = [classes]

    if etau.is_str(attrs):
        attrs = [attrs]

    if seed is not None:
        random.seed(seed)

    # Map of class IDs to class names
    classes_map, _did_download = _get_classes_map(
        dataset_dir, download=download
    )
    classes_map_rev = {v: k for k, v in classes_map.items()}
    did_download |= _did_download

    all_classes = sorted(classes_map.values())

    if classes is not None:
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
                "Ignoring invalid classes %s\nYou can view the available "
                "classes via `fiftyone.utils.openimages.get_classes()`",
                missing_classes,
            )
    else:
        oi_classes = None

    if "relationships" in _label_types:
        # Map of attribute IDs to attribute names
        attrs_map, _did_download = _get_attrs_map(
            dataset_dir, download=download
        )
        attrs_map_rev = {v: k for k, v in attrs_map.items()}
        did_download |= _did_download

        all_attrs = sorted(attrs_map.values())

        if attrs is None:
            oi_attrs = [attrs_map_rev[a] for a in all_attrs]
        else:
            oi_attrs = []
            missing_attrs = []
            filtered_attrs = []
            for a in attrs:
                if a in attrs_map_rev:
                    oi_attrs.append(attrs_map_rev[a])
                    filtered_attrs.append(a)
                else:
                    missing_attrs.append(a)

            attrs = filtered_attrs
            if missing_attrs:
                logger.warning(
                    "Ignoring invalid attributes %s\nYou can view the "
                    "available attributes via "
                    "`fiftyone.utils.openimages.get_attributes()`",
                    missing_attrs,
                )
    else:
        attrs = None
        attrs_map = None
        oi_attrs = None
        all_attrs = None

    if "segmentations" in _label_types:
        seg_classes, _did_download = _get_seg_classes(
            dataset_dir, classes_map=classes_map, download=download
        )
        did_download |= _did_download
    else:
        seg_classes = None

    if "points" in _label_types:
        pnt_classes_map, _did_download = _get_pnt_classes_map(
            dataset_dir, classes_map=classes_map, download=download
        )
        did_download |= _did_download
    elif "points" not in _label_types:
        pnt_classes_map = None

    return (
        classes_map,
        all_classes,
        classes,
        oi_classes,
        attrs_map,
        all_attrs,
        attrs,
        oi_attrs,
        seg_classes,
        pnt_classes_map,
        did_download,
    )


def _get_general_metadata_file(dataset_dir, filename, url, download=True):
    filepath = os.path.join(dataset_dir, "metadata", filename)
    if not os.path.exists(filepath):
        for split in _SUPPORTED_SPLITS:
            split_filepath = os.path.join(
                dataset_dir, split, "metadata", filename
            )
            if os.path.exists(split_filepath):
                return split_filepath, False

    did_download = _download_file_if_necessary(
        filepath, url, quiet=0, download=download
    )

    return filepath, did_download


def _get_attrs_map(dataset_dir, download=True):
    url = _ANNOTATION_DOWNLOAD_URLS["general"]["attr_names"]
    attrs_csv, did_download = _get_general_metadata_file(
        dataset_dir, "attributes.csv", url, download=download
    )
    attrs_data = _parse_csv(attrs_csv)
    attrs_map = {k: v for k, v in attrs_data}
    return attrs_map, did_download


def _get_classes_map(dataset_dir, download=True):
    url = _ANNOTATION_DOWNLOAD_URLS["general"]["class_names"]
    cls_csv, did_download = _get_general_metadata_file(
        dataset_dir, "classes.csv", url, download=download
    )
    cls_data = _parse_csv(cls_csv)
    classes_map = {k: v for k, v in cls_data}
    return classes_map, did_download


def _get_pnt_classes_map(dataset_dir, classes_map=None, download=True):
    url = _ANNOTATION_DOWNLOAD_URLS["general"]["point_classes"]
    pnt_cls_csv, did_download = _get_general_metadata_file(
        dataset_dir, "point_classes.csv", url, download=download
    )
    pnt_cls_data = _parse_csv(pnt_cls_csv)
    pnt_classes_map = {p[0]: p[1] for p in pnt_cls_data[1:]}
    return pnt_classes_map, did_download


def _get_seg_classes(dataset_dir, classes_map=None, download=True):
    did_download = False

    if not classes_map:
        classes_map, _did_download = _get_classes_map(
            dataset_dir, download=download
        )
        did_download |= _did_download

    url = _ANNOTATION_DOWNLOAD_URLS["general"]["segmentation_classes"]
    seg_cls_txt, _did_download = _get_general_metadata_file(
        dataset_dir, "segmentation_classes.csv", url, download=download
    )
    did_download |= _did_download

    with open(seg_cls_txt, "r", encoding="utf8") as f:
        seg_classes_oi = [l.rstrip("\n") for l in f]

    seg_classes = [classes_map[c] for c in seg_classes_oi]

    return sorted(seg_classes), did_download


def _get_hierarchy(dataset_dir, classes_map=None, download=True):
    hierarchy_path = os.path.join(dataset_dir, "metadata", "hierarchy.json")

    if os.path.exists(hierarchy_path):
        hierarchy = etas.load_json(hierarchy_path)
        return hierarchy, False

    if not download:
        raise ValueError("Hierarchy file '%s' not found" % hierarchy_path)

    with etau.TempDir() as tmp_dir:
        url = _ANNOTATION_DOWNLOAD_URLS["general"]["hierarchy"]
        tmp_filepath, _ = _get_general_metadata_file(
            tmp_dir, "hierarchy.json", url, download=download
        )

        hierarchy = etas.load_json(tmp_filepath)

        if classes_map is None:
            classes_map, _ = _get_classes_map(tmp_dir, download=download)

        # Not included in standard classes
        entity_classes_map = {"/m/0bl9f": "Entity"}
        entity_classes_map.update(classes_map)
        hierarchy = _rename_subcategories(hierarchy, entity_classes_map)
        etas.write_json(hierarchy, hierarchy_path)

    return hierarchy, True


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


def _parse_csv(filename, dataframe=False, index_col=None):
    if dataframe:
        data = pd.read_csv(filename, index_col=index_col)
    else:
        with open(filename, "r", newline="", encoding="utf8") as csvfile:
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


def _parse_label_types(version, label_types):
    slt = _SUPPORTED_LABEL_TYPES[version]
    if label_types is None:
        return slt

    if etau.is_str(label_types):
        label_types = [label_types]
    else:
        label_types = list(label_types)

    bad_types = [l for l in label_types if l not in slt]

    if len(bad_types) == 1:
        raise ValueError(
            "Unsupported label type '%s'. Supported types are %s"
            % (bad_types[0], slt)
        )

    if len(bad_types) > 1:
        raise ValueError(
            "Unsupported label types %s. Supported types are %s"
            % (bad_types, slt)
        )

    return label_types


def _verify_image_ids(
    selected_split_ids, unspecified_ids, dataset_dir, split, download=True
):
    # Download all image IDs, verify given IDs, sort unspecified IDs into
    # current split

    split_ids, did_download = _load_all_image_ids(
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

    return split_image_ids, did_download


def _get_downloaded_image_ids(dataset_dir):
    data_dir = os.path.join(dataset_dir, "data")
    if not os.path.exists(data_dir):
        return []

    return [os.path.splitext(n)[0] for n in etau.list_files(data_dir)]


def _get_all_label_data(
    dataset_dir,
    image_ids,
    label_types=None,
    classes=None,
    oi_classes=None,
    attrs=None,
    oi_attrs=None,
    seg_classes=None,
    pnt_classes=None,
    download_only=False,
    ids_only=False,
    track_all_ids=True,
    only_matching=False,
    split=None,
    download=False,
    version=None,
):
    cls_data = {}
    det_data = {}
    pnt_data = {}
    rel_data = {}
    seg_data = {}

    all_classes_ids = set(image_ids)
    any_classes_ids = set()

    all_attrs_ids = set(image_ids)
    any_attrs_ids = set()

    _label_types = _parse_label_types(version, label_types)

    did_download = False

    if "classifications" in _label_types:
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["classifications"]
        else:
            url = None

        cls_all_ids, cls_any_ids, cls_data, _did_download = _get_label_data(
            dataset_dir,
            image_ids,
            "classifications",
            classes=classes,
            oi_classes=oi_classes,
            download_only=download_only,
            ids_only=ids_only,
            track_all_ids=track_all_ids,
            only_matching=only_matching,
            url=url,
            download=download,
        )
        did_download |= _did_download

        # Classifications only capture the label schema, so don't use them for
        # ID list purposes unless they were the only label type requested
        if len(_label_types) == 1:
            all_classes_ids &= cls_all_ids
            any_classes_ids |= cls_any_ids

    if "detections" in _label_types:
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["detections"]
        else:
            url = None

        det_all_ids, det_any_ids, det_data, _did_download = _get_label_data(
            dataset_dir,
            image_ids,
            "detections",
            classes=classes,
            oi_classes=oi_classes,
            url=url,
            download=download,
            download_only=download_only,
            ids_only=ids_only,
            track_all_ids=track_all_ids,
            only_matching=only_matching,
        )
        did_download |= _did_download

        all_classes_ids &= det_all_ids
        any_classes_ids |= det_any_ids

    if "points" in _label_types:
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["points"]
        else:
            url = None

        pnt_all_ids, pnt_any_ids, pnt_data, _did_download = _get_label_data(
            dataset_dir,
            image_ids,
            "points",
            classes=classes,
            oi_classes=oi_classes,
            url=url,
            download=download,
            download_only=download_only,
            ids_only=ids_only,
            track_all_ids=track_all_ids,
            only_matching=only_matching,
        )
        did_download |= _did_download

        all_classes_ids &= pnt_all_ids
        any_classes_ids |= pnt_any_ids

    if "relationships" in _label_types:
        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["relationships"]
        else:
            url = None

        rel_all_ids, rel_any_ids, rel_data, _did_download = _get_label_data(
            dataset_dir,
            image_ids,
            "relationships",
            classes=attrs,
            oi_classes=oi_attrs,
            download_only=download_only,
            ids_only=ids_only,
            track_all_ids=track_all_ids,
            only_matching=only_matching,
            url=url,
            download=download,
        )
        did_download |= _did_download

        all_attrs_ids &= rel_all_ids
        any_attrs_ids |= rel_any_ids

    if "segmentations" in _label_types:
        if classes is not None and label_types is not None:
            non_seg_classes = sorted(set(classes) - set(seg_classes))
            if non_seg_classes:
                logger.warning(
                    "No segmentations exist for classes %s\nYou can view the "
                    "available segmentation classes via "
                    "`get_segmentation_classes()`",
                    non_seg_classes,
                )

        if download:
            url = _ANNOTATION_DOWNLOAD_URLS[split]["segmentations"]["mask_csv"]
        else:
            url = None

        seg_all_ids, seg_any_ids, seg_data, _did_download = _get_label_data(
            dataset_dir,
            image_ids,
            "segmentations",
            classes=classes,
            oi_classes=oi_classes,
            download_only=download_only,
            ids_only=ids_only,
            track_all_ids=track_all_ids,
            only_matching=only_matching,
            url=url,
            download=download,
        )
        did_download |= _did_download

        all_classes_ids &= seg_all_ids
        any_classes_ids |= seg_any_ids

    if classes is not None:
        all_label_ids = all_classes_ids
        any_label_ids = any_classes_ids

        if attrs is not None:
            all_label_ids &= all_attrs_ids
            any_label_ids &= any_attrs_ids
    elif attrs is not None:
        all_label_ids = all_attrs_ids
        any_label_ids = any_attrs_ids
    else:
        all_label_ids = all_classes_ids & all_attrs_ids
        any_label_ids = any_classes_ids | any_attrs_ids

    return (
        cls_data,
        det_data,
        pnt_data,
        rel_data,
        seg_data,
        all_label_ids,
        any_label_ids,
        did_download,
    )


def _get_label_data(
    dataset_dir,
    image_ids,
    label_type,
    classes=None,
    oi_classes=None,
    download_only=False,
    ids_only=False,
    track_all_ids=True,
    only_matching=False,
    url=None,
    download=True,
):
    csv_path = os.path.join(dataset_dir, "labels", label_type + ".csv")
    did_download = _download_file_if_necessary(
        csv_path, url, quiet=0, download=download
    )

    if download_only:
        return set(), set(), {}, did_download

    df = _parse_csv(csv_path, dataframe=True)

    if label_type == "points":
        df["ImageID"] = df["ImageId"]
        df = df.drop(columns=["ImageId"])

    df.set_index("ImageID", drop=False, inplace=True)
    df = df.loc[df.index.intersection(image_ids)]

    if classes is not None:
        # Restrict by classes
        if label_type == "relationships":
            cols = ["LabelName1", "LabelName2"]
        elif label_type == "points":
            cols = [
                "X",
                "Y",
                "Label",
                "EstimatedYesNo",
                "Source",
                "YesVotes",
                "NoVotes",
                "UnsureVotes",
                "TextLabel",
            ]
        else:
            cols = ["LabelName"]

        oi_classes = set(oi_classes)

        if track_all_ids:
            observed = defaultdict(set)
            for image_id, labels in zip(df["ImageID"].values, df[cols].values):
                observed[image_id].update(labels)

            all_ids = set()
            any_ids = set()
            for image_id, observed_classes in observed.items():
                if oi_classes.issubset(observed_classes):
                    all_ids.add(image_id)

                if oi_classes & observed_classes:
                    any_ids.add(image_id)
        else:
            any_df = df[df[cols].isin(oi_classes).any(axis=1)]
            all_ids = set()
            any_ids = set(any_df["ImageID"].unique())
    else:
        # No class restriction
        all_ids = set()
        any_ids = set(df["ImageID"].unique())

    if ids_only:
        return all_ids, any_ids, {}, did_download

    if classes is not None:
        if only_matching:
            # Only keep the specified labels
            relevant_df = df[df[cols].isin(oi_classes).any(axis=1)].copy()
        else:
            # Keep all labels for the relevant image IDs
            relevant_df = df.loc[df.index.intersection(any_ids)]
    else:
        relevant_df = df

    relevant_df.sort_index(inplace=True)

    data = {
        "all_ids": set(df["ImageID"].unique()),
        "relevant_ids": any_ids,
        "df": relevant_df,
    }

    return all_ids, any_ids, data, did_download


def _download(
    image_ids,
    downloaded_ids,
    oi_classes,
    oi_attrs,
    seg_classes,
    pnt_classes,
    dataset_dir,
    split,
    label_types=None,
    classes=None,
    attrs=None,
    max_samples=None,
    shuffle=False,
    num_workers=None,
    download=True,
    version=None,
):
    # Download any necessary labels, and, if specific classes/attributes are
    # requested, determine which image IDs have the specified labels
    (
        _,
        _,
        _,
        _,
        _,
        all_label_ids,
        any_label_ids,
        did_download,
    ) = _get_all_label_data(
        dataset_dir,
        image_ids,
        label_types=label_types,
        classes=classes,
        oi_classes=oi_classes,
        attrs=attrs,
        oi_attrs=oi_attrs,
        seg_classes=seg_classes,
        pnt_classes=pnt_classes,
        download_only=classes is None and attrs is None,
        ids_only=True,
        track_all_ids=max_samples is not None,
        split=split,
        download=download,
        version=version,
    )

    downloaded_ids = set(downloaded_ids)

    # Make list of `target_ids`
    if classes is not None or attrs is not None:
        if max_samples is not None:
            #
            # Bias sampling to meet user requirements per the priorities below:
            # (1) samples with all labels
            # (2) already downloaded samples with relevant labels
            # (3) non-downloaded samples with relevant labels
            #

            not_all_ids = any_label_ids - all_label_ids
            existing_ids = not_all_ids & downloaded_ids
            non_existing_ids = not_all_ids - downloaded_ids

            all_label_ids = sorted(all_label_ids)
            existing_ids = sorted(existing_ids)
            non_existing_ids = sorted(non_existing_ids)

            if shuffle:
                random.shuffle(all_label_ids)
                random.shuffle(existing_ids)
                random.shuffle(non_existing_ids)

            target_ids = all_label_ids + existing_ids + non_existing_ids
            target_ids = target_ids[:max_samples]
        else:
            # Include all samples that meet any requirement
            target_ids = sorted(any_label_ids)

            if shuffle:
                random.shuffle(target_ids)
    else:
        if max_samples is not None:
            # Bias sampling towards already-downloaded samples
            image_ids = set(image_ids)
            existing_ids = sorted(image_ids & downloaded_ids)
            non_existing_ids = sorted(image_ids - downloaded_ids)

            if shuffle:
                random.shuffle(existing_ids)
                random.shuffle(non_existing_ids)

            target_ids = existing_ids + non_existing_ids
            target_ids = target_ids[:max_samples]
        else:
            # Use all available samples
            target_ids = sorted(image_ids)

            if shuffle:
                random.shuffle(target_ids)

    num_target = len(target_ids)
    all_ids = list(downloaded_ids | set(target_ids))
    num_samples = len(all_ids)  # total downloaded

    if max_samples is not None and num_target < max_samples:
        logger.warning(
            "Only found %d (<%d) samples matching your requirements",
            num_target,
            max_samples,
        )

    if "segmentations" in label_types:
        _did_download = _download_masks_if_necessary(
            all_ids, dataset_dir, split, download=download
        )
        did_download |= _did_download
    num_downloaded = _download_images_if_necessary(
        target_ids,
        split,
        dataset_dir,
        num_workers=num_workers,
        download=download,
    )

    if num_downloaded > 0:
        did_download = True

    return num_samples, did_download


def _get_dataframe_rows(df, image_id):
    left = df["ImageID"].searchsorted(image_id, "left")
    right = df["ImageID"].searchsorted(image_id, "right")
    return df[left:right]


def _create_classifications(cls_data, image_id, classes_map):
    all_label_ids = cls_data["all_ids"]
    relevant_ids = cls_data["relevant_ids"]
    df = cls_data["df"]

    if image_id not in all_label_ids:
        return None, None

    if image_id not in relevant_ids:
        pos_labels = fol.Classifications()
        neg_labels = fol.Classifications()
        return pos_labels, neg_labels

    def _make_label(row):
        # [ImageID,Source,LabelName,Confidence]
        return fol.Classification(
            label=classes_map[row["LabelName"]],
            confidence=float(row["Confidence"]),
        )

    matching_df = _get_dataframe_rows(df, image_id)
    cls = [_make_label(row[1]) for row in matching_df.iterrows()]

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


def _create_detections(det_data, image_id, classes_map):
    all_label_ids = det_data["all_ids"]
    relevant_ids = det_data["relevant_ids"]
    df = det_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _make_label(row):
        # ImageID,Source,LabelName,Confidence,XMin,XMax,YMin,YMax,
        #   IsOccluded,IsTruncated,IsGroupOf,IsDepiction,IsInside

        xmin = float(row["XMin"])
        xmax = float(row["XMax"])
        ymin = float(row["YMin"])
        ymax = float(row["YMax"])
        bounding_box = [xmin, ymin, xmax - xmin, ymax - ymin]

        return fol.Detection(
            bounding_box=bounding_box,
            label=classes_map[row["LabelName"]],
            IsOccluded=bool(int(row["IsOccluded"])),
            IsTruncated=bool(int(row["IsTruncated"])),
            IsGroupOf=bool(int(row["IsGroupOf"])),
            IsDepiction=bool(int(row["IsDepiction"])),
            IsInside=bool(int(row["IsInside"])),
        )

    matching_df = _get_dataframe_rows(df, image_id)
    dets = [_make_label(row[1]) for row in matching_df.iterrows()]
    return fol.Detections(detections=dets)


def _create_relationships(rel_data, image_id, classes_map, attrs_map):
    all_label_ids = rel_data["all_ids"]
    relevant_ids = rel_data["relevant_ids"]
    df = rel_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _make_label(row):
        # ImageID,LabelName1,LabelName2,XMin1,XMax1,YMin1,YMax1,XMin2,
        #   XMax2,YMin2,YMax2,RelationshipLabel

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

        bounding_box = [
            xmin_int,
            ymin_int,
            xmax_int - xmin_int,
            ymax_int - ymin_int,
        ]

        return fol.Detection(
            bounding_box=bounding_box,
            label=label_rel,
            Label1=label1,
            Label2=label2,
        )

    matching_df = _get_dataframe_rows(df, image_id)
    rels = [_make_label(row[1]) for row in matching_df.iterrows()]
    return fol.Detections(detections=rels)


def _create_points(pnt_data, image_id, classes_map, dataset_dir):
    all_label_ids = pnt_data["all_ids"]
    relevant_ids = pnt_data["relevant_ids"]
    df = pnt_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Keypoints()

    def _make_label(row):
        label = classes_map[row["Label"]]
        points = [(float(row["X"]), float(row["Y"]))]
        estimated_yn = row["EstimatedYesNo"]
        source = row["Source"]
        yes_votes, no_votes = int(row["YesVotes"]), int(row["NoVotes"])
        unsure_votes = int(row["UnsureVotes"])

        return fol.Keypoint(
            label=label,
            points=points,
            estimated_yes_no=estimated_yn,
            source=source,
            yes_votes=yes_votes,
            no_votes=no_votes,
            unsure_votes=unsure_votes,
        )

    matching_df = _get_dataframe_rows(df, image_id)

    points = [_make_label(row[1]) for row in matching_df.iterrows()]
    points = [p for p in points if p is not None]
    return fol.Keypoints(keypoints=points)


def _create_segmentations(seg_data, image_id, classes_map, dataset_dir):
    all_label_ids = seg_data["all_ids"]
    relevant_ids = seg_data["relevant_ids"]
    df = seg_data["df"]

    if image_id not in all_label_ids:
        return None

    if image_id not in relevant_ids:
        return fol.Detections()

    def _make_label(row):
        # MaskPath,ImageID,LabelName,BoxID,BoxXMin,BoxXMax,BoxYMin,BoxYMax,
        #   PredictedIoU,Clicks

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
            dataset_dir,
            "labels",
            "masks",
            image_id[0].upper(),
            mask_path,
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
    segs = [_make_label(row[1]) for row in matching_df.iterrows()]
    segs = [s for s in segs if s is not None]
    return fol.Detections(detections=segs)


def _load_all_image_ids(dataset_dir, split=None, download=True):
    csv_filepath = os.path.join(dataset_dir, "metadata", "image_ids.csv")
    url = _ANNOTATION_DOWNLOAD_URLS[split]["image_ids"]

    quiet = -1 if split == "train" else 0
    did_download = _download_file_if_necessary(
        csv_filepath, url, quiet=quiet, download=download
    )

    csv_data = _parse_csv(csv_filepath)
    image_ids = [i[0].strip() for i in csv_data[1:]]

    return image_ids, did_download


def _download_file_if_necessary(
    filepath, url, is_zip=False, quiet=-1, download=True
):
    did_download = False

    if is_zip:
        # Check if unzipped directory exists
        unzipped_dir = os.path.splitext(filepath)[0]
        if os.path.isdir(unzipped_dir):
            return did_download

    if not os.path.isfile(filepath):
        if not download:
            raise ValueError("File '%s' is not downloaded" % filepath)

        if quiet < 1:
            logger.info("Downloading '%s' to '%s'", url, filepath)

        etau.ensure_basedir(filepath)
        etaw.download_file(url, path=filepath, quiet=quiet != -1)
        did_download = True

    if is_zip:
        etau.extract_zip(filepath, outdir=unzipped_dir, delete_zip=True)

    return did_download


def _download_masks_if_necessary(image_ids, dataset_dir, split, download=True):
    seg_zip_names = list({i[0].upper() for i in image_ids})
    mask_urls = _ANNOTATION_DOWNLOAD_URLS[split]["segmentations"]["mask_data"]
    masks_dir = os.path.join(dataset_dir, "labels", "masks")

    quiet = 1 if split == "validation" else 0
    did_download = False
    for zip_name in seg_zip_names:
        url = mask_urls[zip_name]
        zip_path = os.path.join(masks_dir, zip_name + ".zip")
        _did_download = _download_file_if_necessary(
            zip_path, url, is_zip=True, quiet=quiet, download=download
        )
        did_download |= _did_download

    return did_download


def _download_images_if_necessary(
    image_ids, split, dataset_dir, num_workers=None, download=True
):
    data_dir = os.path.join(dataset_dir, "data")
    etau.ensure_dir(data_dir)

    urls = {}
    num_existing = 0
    for image_id in image_ids:
        filepath = os.path.join(data_dir, image_id + ".jpg")
        obj = split + "/" + image_id + ".jpg"  # AWS path, always use "/"
        if not os.path.isfile(filepath):
            url = "s3://%s/%s" % (_BUCKET_NAME, obj)
            urls[url] = filepath
        else:
            num_existing += 1

    num_images = len(urls)

    if num_images == 0:
        if download:
            logger.info("Necessary images already downloaded")

        return num_images

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

    foua.download_public_s3_files(urls, num_workers=num_workers)

    return num_images


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
        "point_classes": "https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv",
    },
    "train": {
        "num_images": 1743042,
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv",
        "classifications": "https://storage.googleapis.com/openimages/v5/train-annotations-human-imagelabels-boxable.csv",
        "detections": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv",
        "points": "https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-point-labels.csv",
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-vrd.csv",
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
    },
    "test": {
        "num_images": 125436,
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv",
        "classifications": "https://storage.googleapis.com/openimages/v5/test-annotations-human-imagelabels-boxable.csv",
        "detections": "https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv",
        "points": "https://storage.googleapis.com/openimages/v7/oidv7-test-annotations-point-labels.csv",
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-test-annotations-vrd.csv",
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
    },
    "validation": {
        "num_images": 41620,
        "image_ids": "https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv",
        "classifications": "https://storage.googleapis.com/openimages/v5/validation-annotations-human-imagelabels-boxable.csv",
        "detections": "https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv",
        "points": "https://storage.googleapis.com/openimages/v7/oidv7-val-annotations-point-labels.csv",
        "relationships": "https://storage.googleapis.com/openimages/v6/oidv6-validation-annotations-vrd.csv",
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
    },
}

_BUCKET_NAME = "open-images-dataset"

_CSV_DELIMITERS = [",", ";", ":", " ", "\t", "\n"]

_SUPPORTED_LABEL_TYPES_V6 = [
    "classifications",
    "detections",
    "relationships",
    "segmentations",
]

_SUPPORTED_LABEL_TYPES_V7 = [
    "classifications",
    "detections",
    "points",
    "relationships",
    "segmentations",
]

_SUPPORTED_LABEL_TYPES = {
    "v6": _SUPPORTED_LABEL_TYPES_V6,
    "v7": _SUPPORTED_LABEL_TYPES_V7,
}


_SUPPORTED_SPLITS = [
    "train",
    "test",
    "validation",
]

_SUPPORTED_VERSIONS = [
    "v6",
    "v7",
]
