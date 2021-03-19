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

import cv2

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud

boto3 = fou.lazy_import("boto3", callback=fou.ensure_boto3)
botocore = fou.lazy_import("botocore", callback=fou.ensure_boto3)


logger = logging.getLogger(__name__)


def download_open_images_split(
    dataset_dir=None,
    scratch_dir=None,
    split=None,
    label_types=None,
    classes=None,
    attrs=None,
    max_samples=None,
    seed=None,
    shuffle=None,
    image_ids=None,
    image_ids_file=None,
    num_workers=None,
    version="v6",
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
        scratch_dir (None): the temporary directory that raw data and
            annotations will be downloaded to initially
        split (None) a split to download, if applicable. Values are
            ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are downloaded.
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
        max_samples (None): a maximum number of samples to import per split. By
            default, all samples are imported
        seed (None): a random seed to use when shuffling
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        image_ids (None): a list of specific image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``
        image_ids_file (None): the path to a newline separated text, JSON, or
            CSV file containing a list of image IDs to load. The IDs can be
            specified either as ``<split>/<image-id>`` or ``<image-id>``. If
            ``image_ids`` is provided, this parameter is ignored
        num_workers (None): the number of processes to use when downloading
            individual images. By default, ``multiprocessing.cpu_count()`` is
            used
        version ("v6"): string indicating the version of Open Images to
            download. Currently only Open Images V6 is supported.
    """
    if version not in _SUPPORTED_VERSIONS:
        raise ValueError(
            "Version %s is not supported. Supported versions are: %s"
            % (version, ", ".join(_SUPPORTED_VERSIONS))
        )

    if seed is not None:
        random.seed(seed)

    if max_samples and (label_types or classes or attrs):
        # Only samples with every specified label type will be loaded
        guarantee_all_types = True
    else:
        # Samples may not contain multiple label types, but will contain at
        # least one
        guarantee_all_types = False

    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    # No matter what classes or attributes you specify, they will not be loaded
    # if you do not want to load labels
    if label_types == []:
        classes = []
        attrs = []

    # Determine the image IDs to load
    if not image_ids and not image_ids_file:
        if not label_types and not classes and not attrs:
            # No IDs were provided and no labels are being loaded
            # Load all image IDs
            split_image_ids = _download_image_ids(scratch_dir, split)
        else:
            # No specific image IDs were given, load all relevant images from
            # the given labels later
            split_image_ids = None
        downloaded_ids = _get_downloaded_ids(dataset_dir, scratch_dir, split)
    else:
        downloaded_ids = []
        split_image_ids = _parse_image_ids(
            image_ids, image_ids_file, split, scratch_dir
        )

    label_types = _parse_label_types(label_types)

    dataset = fod.Dataset()
    dataset.persistent = False

    # Map of class IDs to class names
    classes_map = _get_classes_map(
        dataset_dir=dataset_dir, scratch_dir=scratch_dir
    )

    all_classes = sorted(list(classes_map.values()))
    dataset.info["classes_map"] = classes_map
    dataset.info["classes"] = all_classes

    if classes == None:
        oi_classes = list(classes_map.keys())
        classes = all_classes

    else:
        oi_classes = []
        classes_map_rev = {v: k for k, v in classes_map.items()}
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

    attrs = []
    attrs_map = {}
    oi_attrs = []
    if "relationships" in label_types:
        # Map of attribute IDs to attribute names
        attrs_map = _get_attrs_map(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )

        all_attrs = sorted(list(attrs_map.values()))
        dataset.info["attributes_map"] = attrs_map
        dataset.info["attributes"] = all_attrs

        if attrs == None:
            oi_attrs = list(attrs_map.keys())
            attrs = all_attrs

        else:
            attrs_map_rev = {v: k for k, v in attrs_map.items()}
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
                    "`get_attributes()`\n" % ",".join(missing_attrs)
                )

    seg_classes = []
    if "segmentations" in label_types:
        seg_classes = _get_seg_classes(
            dataset_dir=dataset_dir,
            scratch_dir=scratch_dir,
            classes_map=classes_map,
        )

        dataset.info["segmentation_classes"] = seg_classes

    # Add class hierarchy to dataset.info, used in evaluation
    hierarchy = _get_hierarchy(
        dataset_dir=dataset_dir,
        scratch_dir=scratch_dir,
        classes_map=classes_map,
    )
    dataset.info["hierarchy"] = hierarchy

    dataset = _load_open_images_split(
        dataset,
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
        scratch_dir,
        split,
        classes,
        attrs,
        max_samples,
        shuffle,
        num_workers,
    )

    # Export the labels of each split in FiftyOneDataset format
    export_dir = os.path.join(dataset_dir, split)
    logger.info("Writing annotations for %s split to disk" % split)
    dataset.export(
        export_dir, dataset_type=fot.FiftyOneDataset, export_media=False
    )
    num_samples = len(dataset)
    dataset.delete()

    return num_samples, all_classes


def get_attributes(dataset_dir=None, version="v6"):
    """Gets the list of relationship attributes in the Open Images V6 dataset.
    This method can be called in isolation without having the dataset
    downloaded.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded
        version ("v6"): string indicating the version of Open Images to
            download. Currently only Open Images V6 is supported.

    Returns:
        a sorted list of attribute names
    """
    if version not in _SUPPORTED_VERSIONS:
        raise ValueError(
            "Version %s is not supported. Supported versions are: %s"
            % (version, ", ".join(_SUPPORTED_VERSIONS))
        )

    attrs = _load_metadata_if_possible(dataset_dir, "attributes")

    if attrs is not None:
        return attrs

    with etau.TempDir() as scratch_dir:
        attrs_map = _get_attrs_map(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )
        return sorted(list(attrs_map.values()))


def get_classes(dataset_dir=None, version="v6"):
    """Gets the 601 boxable classes that exist in classifications, detections,
    and relationships in the Open Images V6 dataset.
    This method can be called in isolation without having the dataset
    downloaded.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded and ``info.json`` is stored
        version ("v6"): string indicating the version of Open Images to
            download. Currently only Open Images V6 is supported.

    Returns:
        a sorted list of class name strings
    """
    if version not in _SUPPORTED_VERSIONS:
        raise ValueError(
            "Version %s is not supported. Supported versions are: %s"
            % (version, ", ".join(_SUPPORTED_VERSIONS))
        )

    classes = _load_metadata_if_possible(dataset_dir, "classes")

    if classes is not None:
        return classes

    with etau.TempDir() as scratch_dir:
        classes_map = _get_classes_map(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )
        return sorted(list(classes_map.values()))


def get_segmentation_classes(dataset_dir=None, version="v6"):
    """Gets the list of classes (350) that are labeled with segmentations in
    the Open Images V6 dataset.
    This method can be called in isolation without having the dataset
    downloaded.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded and ``info.json`` is stored
        version ("v6"): string indicating the version of Open Images to
            download. Currently only Open Images V6 is supported.

    Returns:
        a sorted list of segmentation class name strings
    """
    if version not in _SUPPORTED_VERSIONS:
        raise ValueError(
            "Version %s is not supported. Supported versions are: %s"
            % (version, ", ".join(_SUPPORTED_VERSIONS))
        )

    seg_classes = _load_metadata_if_possible(
        dataset_dir, "segmentation_classes"
    )

    if seg_classes is not None:
        return seg_classes

    with etau.TempDir() as scratch_dir:
        seg_classes = _get_seg_classes(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )
        return seg_classes


def _load_metadata_if_possible(dataset_dir, metadata_type):
    for split in _DEFAULT_SPLITS:
        if dataset_dir:
            metadata_path = os.path.join(dataset_dir, split, "metadata.json")
        else:
            metadata_path = os.path.join(
                fo.config.dataset_zoo_dir,
                "open-images-v6",
                split,
                "metadata.json",
            )

        if os.path.exists(metadata_path):
            metadata = etas.load_json(metadata_path)
            if (
                "info" in metadata.keys()
                and metadata_type in metadata["info"].keys()
            ):
                return metadata["info"][metadata_type]

    return None


def _get_attrs_map(dataset_dir=None, scratch_dir=None):
    for split in _DEFAULT_SPLITS:
        if dataset_dir:
            metadata_path = os.path.join(dataset_dir, split, "metadata.json")
        else:
            metadata_path = os.path.join(
                fo.config.dataset_zoo_dir,
                "open-images-v6",
                split,
                "metadata.json",
            )

        if os.path.exists(metadata_path):
            metadata = etas.load_json(metadata_path)
            if (
                "info" in metadata.keys()
                and "attributes_map" in metadata["info"].keys()
            ):
                return metadata["info"]["attributes_map"]

    if not scratch_dir:
        if not dataset_dir:
            scratch_dir = os.path.join(
                fo.config.dataset_zoo_dir, "open-images-v6", "tmp-download"
            )
        else:
            scratch_dir = os.path.join(dataset_dir, "tmp-download")

    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["attr_names"]
    attrs_csv_name = os.path.basename(annot_link)
    attrs_csv = os.path.join(scratch_dir, "general", attrs_csv_name)
    _download_if_necessary(attrs_csv, annot_link)
    attrs_data = _parse_csv(attrs_csv)
    attrs_map = {k: v for k, v in attrs_data}
    return attrs_map


def _get_classes_map(dataset_dir=None, scratch_dir=None):
    for split in _DEFAULT_SPLITS:
        if dataset_dir:
            metadata_path = os.path.join(dataset_dir, split, "metadata.json")
        else:
            metadata_path = os.path.join(
                fo.config.dataset_zoo_dir,
                "open-images-v6",
                split,
                "metadata.json",
            )

        if os.path.exists(metadata_path):
            metadata = etas.load_json(metadata_path)
            if (
                "info" in metadata.keys()
                and "classes_map" in metadata["info"].keys()
            ):
                return metadata["info"]["classes_map"]

    if not scratch_dir:
        if not dataset_dir:
            scratch_dir = os.path.join(
                fo.config.dataset_zoo_dir, "open-images-v6", "tmp-download"
            )

        else:
            scratch_dir = os.path.join(dataset_dir, "tmp-download")

    # Map of class IDs to class names
    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["class_names"]
    cls_csv_name = os.path.basename(annot_link)
    cls_csv = os.path.join(scratch_dir, "general", cls_csv_name)
    _download_if_necessary(cls_csv, annot_link)
    cls_data = _parse_csv(cls_csv)
    classes_map = {k: v for k, v in cls_data}
    return classes_map


def _get_seg_classes(dataset_dir=None, scratch_dir=None, classes_map=None):
    for split in _DEFAULT_SPLITS:
        if dataset_dir:
            metadata_path = os.path.join(dataset_dir, split, "metadata.json")
        else:
            metadata_path = os.path.join(
                fo.config.dataset_zoo_dir,
                "open-images-v6",
                split,
                "metadata.json",
            )

        if os.path.exists(metadata_path):
            metadata = etas.load_json(metadata_path)
            if (
                "info" in metadata.keys()
                and "segmentation_classes" in metadata["info"].keys()
            ):
                return metadata["info"]["segmentation_classes"]

    if not classes_map:
        classes_map = _get_classes_map(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )

    annot_link = _ANNOTATION_DOWNLOAD_LINKS["general"]["segmentation_classes"]
    seg_cls_txt_filename = os.path.basename(annot_link)
    seg_cls_txt = os.path.join(scratch_dir, "general", seg_cls_txt_filename)
    _download_if_necessary(seg_cls_txt, annot_link)

    with open(seg_cls_txt, "r") as f:
        seg_classes_oi = [l.rstrip("\n") for l in f]

    seg_classes = [classes_map[c] for c in seg_classes_oi]

    return sorted(seg_classes)


def _get_hierarchy(dataset_dir=None, scratch_dir=None, classes_map=None):
    for split in _DEFAULT_SPLITS:
        if dataset_dir:
            metadata_path = os.path.join(dataset_dir, split, "metadata.json")
        else:
            metadata_path = os.path.join(
                fo.config.dataset_zoo_dir,
                "open-images-v6",
                split,
                "metadata.json",
            )

        if os.path.exists(metadata_path):
            metadata = etas.load_json(metadata_path)
            if (
                "info" in metadata.keys()
                and "hierarchy" in metadata["info"].keys()
            ):
                return metadata["info"]["hierarchy"]

    if not scratch_dir:
        if not dataset_dir:
            scratch_dir = os.path.join(
                fo.config.dataset_zoo_dir, "open-images-v6", "tmp-download"
            )

        else:
            scratch_dir = os.path.join(dataset_dir, "tmp-download")

    link_path = _ANNOTATION_DOWNLOAD_LINKS["general"]["hierarchy"]
    fn = os.path.basename(link_path)
    filepath = os.path.join(scratch_dir, "general", fn)
    _download_if_necessary(filepath, link_path)
    hierarchy = etas.load_json(filepath)

    if classes_map is None:
        classes_map = _get_classes_map(
            dataset_dir=dataset_dir, scratch_dir=scratch_dir
        )

    # Not included in standard classes
    entity_classes_map = {"/m/0bl9f": "Entity"}
    entity_classes_map.update(classes_map)
    renamed_hierarchy = _rename_subcategories(hierarchy, entity_classes_map)
    return renamed_hierarchy


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


def _parse_csv(filename):
    with open(filename, "r", newline="") as csvfile:
        dialect = csv.Sniffer().sniff(csvfile.read(10240))
        csvfile.seek(0)
        if dialect.delimiter in _CSV_DELIMITERS:
            reader = csv.reader(csvfile, dialect)
        else:
            reader = csv.reader(csvfile)
        data = [row for row in reader]

    return data


def _parse_image_ids(image_ids, image_ids_file, split, scratch_dir):
    if image_ids:
        # image_ids has precedence over image_ids_file
        _image_ids = image_ids

    else:
        ext = os.path.splitext(image_ids_file)[-1]
        if ext == ".txt":
            with open(image_ids_file, "r") as f:
                _image_ids = [i for i in f.readlines()]

        elif ext == ".json":
            _image_ids = etas.load_json(image_ids_file)

        elif ext == ".csv":
            _image_ids = _parse_csv(image_ids_file)

            if isinstance(_image_ids[0], list):
                # Flatten list
                _image_ids = [i for lst in _image_ids for i in lst]

        else:
            raise ValueError(
                "Image ID file extension must be .txt, .csv, or .json, "
                "found %s" % ext
            )

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
        else:
            image_id = i.rstrip().replace(".jpg", "")
            unspecified_split_ids.append(image_id)

        if id_split != split:
            continue

        image_id = image_id.rstrip().replace(".jpg", "")
        split_image_ids.append(image_id)

    split_image_ids = _verify_image_ids(
        split_image_ids, unspecified_split_ids, scratch_dir, split
    )

    return split_image_ids


def _parse_label_types(label_types):
    if label_types is None:
        label_types = _DEFAULT_LABEL_TYPES

    _label_types = []
    for l in label_types:
        if l not in _DEFAULT_LABEL_TYPES:
            raise ValueError(
                "Label type %s is not supported. Options are "
                "('detections', 'classifications', 'relationships', 'segmentations')"
                % l
            )
        else:
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


def _verify_field(dataset, field_name, label_class):
    if field_name not in dataset.get_field_schema():
        dataset.add_sample_field(
            field_name,
            fof.EmbeddedDocumentField,
            embedded_doc_type=label_class,
        )
    return dataset


def _verify_image_ids(
    selected_split_ids, unspecified_ids, download_dir, split
):
    # Download all image IDs, verify given IDs, sort unspecified IDs into
    # current split
    split_ids = _download_image_ids(download_dir, split)

    # Need to verify image IDs are in correct split
    sid_set = set(split_ids)
    ssid_set = set(selected_split_ids)
    verified_split_ids = sid_set & ssid_set
    incorrect_split_ids = ssid_set - verified_split_ids
    if incorrect_split_ids:
        logger.info(
            "The following image IDs do not exist in split %s: %s"
            % (split, ",".join(list(incorrect_split_ids)))
        )

    # Find any unspecified IDs in this split and add them
    uids_set = set(unspecified_ids)
    unspecified_ids_in_split = sid_set & uids_set

    split_image_ids = list(verified_split_ids) + list(unspecified_ids_in_split)

    return split_image_ids


def _get_downloaded_ids(dataset_dir, scratch_dir, split):
    data_path = os.path.join(dataset_dir, split, "data")
    data_ids = []
    if os.path.exists(data_path):
        data_ids = os.listdir(data_path)

    scratch_path = os.path.join(scratch_dir, split, "images")
    scratch_ids = []
    if os.path.exists(scratch_path):
        scratch_ids = os.listdir(scratch_path)

    downloaded_files = list(set(scratch_ids + data_ids))
    return [os.path.splitext(i)[0] for i in downloaded_files]


def _get_label_data(
    dataset,
    split,
    label_type,
    annot_link,
    scratch_dir,
    label_inds,
    oi_classes,
    oi_attrs=[],
    id_ind=0,
):
    csv_name = os.path.basename(annot_link)
    csv_path = os.path.join(scratch_dir, split, label_type, csv_name)
    _download_if_necessary(
        csv_path, annot_link,
    )
    data = _parse_csv(csv_path)

    # Find intersection of ImageIDs with all annotations
    label_id_data = {}
    relevant_ids = set()
    oi_classes_attrs = set(oi_classes) | set(oi_attrs)
    for l in data[1:]:  # first row is headers
        image_id = l[id_ind]
        if image_id not in label_id_data:
            label_id_data[image_id] = [l]
        else:
            label_id_data[image_id].append(l)

        # Check that any labels for this entry exist in the given classes or
        # attributes
        valid_labels = []
        for i in label_inds:
            valid_labels.append(l[i] in oi_classes_attrs)

        if any(valid_labels):
            relevant_ids.add(image_id)

    #
    # Only keep samples with at least one label relevant to specified classes
    # or attributes
    #
    # Images without specified classes or attributes are []
    # Images without any of this label type do not exist in this dict
    #
    for image_id, data in label_id_data.items():
        if image_id not in relevant_ids:
            label_id_data[image_id] = []

    return label_id_data, relevant_ids, dataset


def _load_open_images_split(
    dataset,
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
    scratch_dir,
    split,
    classes,
    attrs,
    max_samples,
    shuffle,
    num_workers,
):

    ids_all_labels = None
    ids_any_labels = set()

    if "detections" in label_types:
        dataset = _verify_field(dataset, "detections", fol.Detections)
        annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["boxes"]
        det_id_data, det_ids, dataset = _get_label_data(
            dataset,
            split,
            "detections",
            annot_link,
            scratch_dir,
            [2],
            oi_classes,
        )

        if ids_all_labels is None:
            ids_all_labels = det_ids
        else:
            ids_all_labels = ids_all_labels & det_ids

        ids_any_labels = ids_any_labels | det_ids

    if "classifications" in label_types:
        dataset = _verify_field(
            dataset, "positive_labels", fol.Classifications
        )
        dataset = _verify_field(
            dataset, "negative_labels", fol.Classifications
        )
        annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["labels"]
        lab_id_data, lab_ids, dataset = _get_label_data(
            dataset,
            split,
            "classifications",
            annot_link,
            scratch_dir,
            [2],
            oi_classes,
        )

        if ids_all_labels is None:
            ids_all_labels = lab_ids
        else:
            ids_all_labels = ids_all_labels & lab_ids

        ids_any_labels = ids_any_labels | lab_ids

    if "relationships" in label_types:
        dataset = _verify_field(dataset, "relationships", fol.Detections)
        annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["relationships"]
        rel_id_data, rel_ids, dataset = _get_label_data(
            dataset,
            split,
            "relationships",
            annot_link,
            scratch_dir,
            [1, 2],
            oi_classes,
            oi_attrs=oi_attrs,
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
                "`get_segmentation_classes()`\n"
                % ",".join(list(non_seg_classes))
            )

        dataset = _verify_field(dataset, "segmentations", fol.Detections)
        annot_link = _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"][
            "mask_csv"
        ]
        seg_id_data, seg_ids, dataset = _get_label_data(
            dataset,
            split,
            "segmentations",
            annot_link,
            scratch_dir,
            [2],
            oi_classes,
            id_ind=1,
        )

        if ids_all_labels is None:
            ids_all_labels = seg_ids
        else:
            ids_all_labels = ids_all_labels & seg_ids

        ids_any_labels = ids_any_labels | seg_ids

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
                ids_all_labels = list(ids_all_labels)
                ids_not_all = list(ids_not_all)
                if shuffle:
                    random.shuffle(ids_all_labels)
                    random.shuffle(ids_not_all)

                # Prioritize loading existing images first
                non_existing_ids = set(ids_not_all) - set(downloaded_ids)
                existing_ids = set(ids_not_all) - non_existing_ids

                valid_ids = (
                    list(ids_all_labels)
                    + list(existing_ids)
                    + list(non_existing_ids)
                )
                valid_ids = valid_ids[:max_samples]

            else:
                valid_ids = ids_all_labels
        else:
            valid_ids = ids_any_labels

    valid_ids = list(valid_ids)

    if shuffle:
        random.shuffle(valid_ids)

    if max_samples and len(valid_ids) > max_samples:
        # Prioritize loading existing images first
        non_existing_ids = set(valid_ids) - set(downloaded_ids)
        existing_ids = set(valid_ids) - non_existing_ids
        valid_ids = list(existing_ids) + list(non_existing_ids)

        valid_ids = valid_ids[:max_samples]

    if not valid_ids:
        return dataset

    _download_specific_images(
        valid_ids, split, dataset_dir, scratch_dir, num_workers
    )

    if "segmentations" in label_types:
        _download_segmentation_masks(valid_ids, seg_ids, scratch_dir, split)

    # Move images from tmp scratch folder to dataset folder
    scratch_path = os.path.join(scratch_dir, split, "images")
    dataset_path = os.path.join(dataset_dir, split, "data")
    logger.info("Moving downloaded images to final location")
    for fn in os.listdir(scratch_path):
        scratch_img = os.path.join(scratch_path, fn)
        output_img = os.path.join(dataset_path, fn)
        etau.move_file(scratch_img, output_img)

    # Add samples to dataset
    samples = []
    logger.info("Parsing data into FiftyOne samples")
    with fou.ProgressBar() as pb:
        for image_id in pb(valid_ids):
            fp = os.path.join(dataset_dir, split, "data", "%s.jpg" % image_id)
            sample = fos.Sample(filepath=fp)
            sample.tags.append(split)

            if "classifications" in label_types:
                # Add labels
                pos_labels, neg_labels = _create_labels(
                    lab_id_data, image_id, classes_map
                )
                sample["positive_labels"] = pos_labels
                sample["negative_labels"] = neg_labels

            if "detections" in label_types:
                # Add detections
                detections = _create_detections(
                    det_id_data, image_id, classes_map
                )
                sample["detections"] = detections

            if "segmentations" in label_types:
                # Add segmentations
                segmentations = _create_segmentations(
                    seg_id_data, image_id, classes_map, scratch_dir, split
                )
                sample["segmentations"] = segmentations

            if "relationships" in label_types:
                # Add relationships
                relationships = _create_relationships(
                    rel_id_data, image_id, classes_map, attrs_map
                )
                sample["relationships"] = relationships

            sample["open_images_id"] = image_id
            samples.append(sample)

    logger.info("Adding samples to dataset")
    dataset.add_samples(samples)

    return dataset


def _create_labels(lab_id_data, image_id, classes_map):
    if image_id not in lab_id_data:
        return None, None

    pos_cls = []
    neg_cls = []

    # Get relevant data for this image
    sample_labs = lab_id_data[image_id]

    for sample_lab in sample_labs:
        # [ImageID,Source,LabelName,Confidence]
        label = classes_map[sample_lab[2]]
        conf = float(sample_lab[3])
        cls = fol.Classification(label=label, confidence=conf)

        if conf > 0.1:
            pos_cls.append(cls)
        else:
            neg_cls.append(cls)

    pos_labels = fol.Classifications(classifications=pos_cls)
    neg_labels = fol.Classifications(classifications=neg_cls)

    return pos_labels, neg_labels


def _create_detections(det_id_data, image_id, classes_map):
    if image_id not in det_id_data:
        return None

    dets = []
    sample_dets = det_id_data[image_id]

    for sample_det in sample_dets:
        # [ImageID,Source,LabelName,Confidence,XMin,XMax,YMin,YMax,IsOccluded,IsTruncated,IsGroupOf,IsDepiction,IsInside]
        label = classes_map[sample_det[2]]
        xmin = float(sample_det[4])
        xmax = float(sample_det[5])
        ymin = float(sample_det[6])
        ymax = float(sample_det[7])

        # Convert to [top-left-x, top-left-y, width, height]
        bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

        detection = fol.Detection(bounding_box=bbox, label=label)

        detection["IsOccluded"] = bool(int(sample_det[8]))
        detection["IsTruncated"] = bool(int(sample_det[9]))
        detection["IsGroupOf"] = bool(int(sample_det[10]))
        detection["IsDepiction"] = bool(int(sample_det[11]))
        detection["IsInside"] = bool(int(sample_det[12]))

        dets.append(detection)

    detections = fol.Detections(detections=dets)

    return detections


def _create_relationships(rel_id_data, image_id, classes_map, attrs_map):
    if image_id not in rel_id_data:
        return None

    rels = []
    sample_rels = rel_id_data[image_id]

    for sample_rel in sample_rels:
        # [ImageID,LabelName1,LabelName2,XMin1,XMax1,YMin1,YMax1,XMin2,XMax2,YMin2,YMax2,RelationshipLabel]
        attribute = False
        if sample_rel[1] in classes_map:
            label1 = classes_map[sample_rel[1]]
        else:
            label1 = attrs_map[sample_rel[1]]
            attribute = True

        if sample_rel[2] in classes_map:
            label2 = classes_map[sample_rel[2]]
        else:
            label2 = attrs_map[sample_rel[2]]
            attribute = True

        label_rel = sample_rel[-1]

        xmin1 = float(sample_rel[3])
        xmax1 = float(sample_rel[4])
        ymin1 = float(sample_rel[5])
        ymax1 = float(sample_rel[6])

        xmin2 = float(sample_rel[7])
        xmax2 = float(sample_rel[8])
        ymin2 = float(sample_rel[9])
        ymax2 = float(sample_rel[10])

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

        rels.append(detection_rel)

    relationships = fol.Detections(detections=rels)

    return relationships


def _create_segmentations(
    seg_id_data, image_id, classes_map, scratch_dir, split
):
    if image_id not in seg_id_data:
        return None

    segs = []
    sample_segs = seg_id_data[image_id]

    for sample_seg in sample_segs:
        # [MaskPath,ImageID,LabelName,BoxID,BoxXMin,BoxXMax,BoxYMin,BoxYMax,PredictedIoU,Clicks]
        label = classes_map[sample_seg[2]]
        xmin = float(sample_seg[4])
        xmax = float(sample_seg[5])
        ymin = float(sample_seg[6])
        ymax = float(sample_seg[7])

        # Convert to [top-left-x, top-left-y, width, height]
        bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

        # Load boolean mask
        mask_path = os.path.join(
            scratch_dir,
            split,
            "segmentations",
            "masks",
            image_id[0].upper(),
            sample_seg[0],
        )
        if not os.path.isfile(mask_path):
            logger.info("Segmentation %s does not exists" % mask_path)
            continue
        rgb_mask = etai.read(mask_path)
        mask = etai.rgb_to_gray(rgb_mask) > 122
        h, w = mask.shape
        cropped_mask = mask[
            int(ymin * h) : int(ymax * h), int(xmin * w) : int(xmax * w)
        ]

        segmentation = fol.Detection(
            bounding_box=bbox, label=label, mask=cropped_mask
        )

        segs.append(segmentation)

    segmentations = fol.Detections(detections=segs)

    return segmentations


def _download_if_necessary(filename, source, is_zip=False):
    if is_zip:
        # Check if unzipped directory exists
        unzipped_dir = os.path.splitext(filename)[0]
        if not os.path.isdir(unzipped_dir):
            os.makedirs(unzipped_dir)
        else:
            return

    if not os.path.isfile(filename):
        logger.info("Downloading %s to %s" % (source, filename))
        etau.ensure_basedir(filename)
        etaw.download_file(source, path=filename)

    if is_zip:
        # Unpack zipped directory
        logger.info("Unpacking zip...")
        etau.extract_zip(filename, outdir=unzipped_dir, delete_zip=True)


def _download_image_ids(download_dir, split):
    file_link = _ANNOTATION_DOWNLOAD_LINKS[split]["image_ids"]
    csv_filename = os.path.basename(file_link)
    csv_filepath = os.path.join(download_dir, split, csv_filename)
    _download_if_necessary(csv_filepath, file_link)
    csv_data = _parse_csv(csv_filepath)
    split_ids = [i[0].rstrip() for i in csv_data[1:]]
    return split_ids


def _download_segmentation_masks(valid_ids, seg_ids, download_dir, split):
    logger.info("Downloading relevant segmentation masks")
    seg_zip_names = list({i[0].upper() for i in (set(valid_ids) & seg_ids)})
    for zip_name in seg_zip_names:
        zip_path = os.path.join(
            download_dir, split, "segmentations", "masks", "%s.zip" % zip_name,
        )
        _download_if_necessary(
            zip_path,
            _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"]["mask_data"][
                zip_name
            ],
            is_zip=True,
        )


def _download_specific_images(
    valid_ids, split, download_dir, scratch_dir, num_workers
):
    logger.info("Downloading %s samples" % split)
    etau.ensure_dir(os.path.join(scratch_dir, split, "images"))
    etau.ensure_dir(os.path.join(download_dir, split, "data"))

    inputs = []
    existing = 0
    for image_id in valid_ids:
        scratch_fp = os.path.join(
            scratch_dir, split, "images", "%s.jpg" % image_id
        )
        fp = os.path.join(download_dir, split, "data", "%s.jpg" % image_id)
        fp_download = os.path.join(split, "%s.jpg" % image_id)
        if not os.path.isfile(fp) and not os.path.isfile(scratch_fp):
            inputs.append((scratch_fp, fp_download))
        else:
            existing += 1

    if not inputs:
        logger.info("All samples already downloaded")
        return

    if existing > 0:
        logger.info(
            "%d samples found, downloading the remaining %d"
            % (existing, len(inputs))
        )

    s3_client = None

    def initialize():
        global s3_client
        s3_client = boto3.client(
            "s3",
            config=botocore.config.Config(signature_version=botocore.UNSIGNED),
        )

    with fou.ProgressBar(total=len(inputs)) as pb:
        with multiprocessing.Pool(num_workers, initialize) as pool:
            for _ in pool.imap_unordered(_do_s3_download, inputs):
                pb.update()


def _do_s3_download(args):
    filepath, filepath_download = args
    s3_client.download_file(_BUCKET_NAME, filepath_download, filepath)


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
_UNSPECIFIED_SPLIT = "unspecified"
