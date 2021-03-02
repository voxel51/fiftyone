"""
Open Images V6  utilities.
| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import os
import random

import cv2

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou

boto3 = fou.lazy_import("boto3", callback=fou.ensure_boto3)
import botocore


def load_open_images_v6(
    label_types=None,
    classes=None,
    split=None,
    splits=None,
    attrs=None,
    name=None,
    max_samples=None,
    dataset_dir=None,
):
    """Utility to download the `Open Images v6 dataset <https://storage.googleapis.com/openimages/web/index.html>`_ with annotations.

    Args:
        label_types (None): a list of types of labels to load. Values are
            ``("detections", "classifications", "relationships", "segmentations")``. 
            By default, all labels are loaded. Not all samples will include all
            label types
        classes (None): a list of strings of classes to load. Only data related
            to the specified classes will be downloaded. See available classes
            with `get_classes()`
        split (None) a split to download, if applicable. Values are
            ``("train", "validation", "test")``. If neither ``split`` nor
            ``splits`` are provided, all available splits are downloaded.
        splits (None): a list of splits to download, if applicable. 
            Values are ``("train", "validation", "test")``. If neither
            ``split`` nor ``splits`` are provided, all available splits are
            downloaded. 
        attrs (None): a list of strings for relationship attributes to load
        name (None): name for the :class:`Dataset` that will be created
        max_samples (None): a maximum number of samples to import per split. By default,
            all samples are imported
        dataset_dir (None): the directory to which the dataset will be
            downloaded
    
    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    if not label_types:
        label_types = [
            "detections",
            "classifications",
            "relationships",
            "segmentations",
        ]

    splits = _parse_splits(split, splits)
    if not name or not isinstance(name, str):
        name = "open-images-v6"

    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    dataset = fod.Dataset(name)

    # Map of class IDs to class names
    classes_map = _get_classes_map(dataset_dir)

    if classes == None:
        oi_classes = list(classes_map.keys())
        classes = list(classes_map.values())

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
            print(
                "The following are not available classes: %s\n\nSee available classes with fouo.get_classes()\n"
                % ",".join(missing_classes)
            )

    if "relationships" in label_types:
        # Map of attribute IDs to attribute names
        attrs_map = _get_attrs_map(dataset_dir)

        if attrs == None:
            oi_attrs = list(attrs_map.keys())
            attrs = list(attrs_map.values())

        else:
            oi_attrs = []
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
                print(
                    "The following are not available attributes: %s\n\nSee available attributes with fouo.get_attributes()\n"
                    % ",".join(missing_attrs)
                )

    else:
        attrs = []
        attrs_map = {}
        oi_attrs = []

    for split in splits:
        dataset = _load_open_images_split(
            dataset,
            label_types,
            classes_map,
            attrs_map,
            oi_classes,
            oi_attrs,
            dataset_dir,
            split,
            classes,
            attrs,
            max_samples,
        )

    return dataset


def get_attributes(dataset_dir=None):
    """List the attributes that exist in the relationships in Open Images V6.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded 

    Returns:
        a sorted list of attribute name strings
    """
    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    attrs_map = _get_attrs_map(dataset_dir)
    return sorted(list(attrs_map.values()))


def get_classes(dataset_dir=None):
    """List the 601 boxable classes that exist in classifications, detections,
    and relationships in Open Images V6.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded 

    Returns:
        a sorted list of class name strings
    """
    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    classes_map = _get_classes_map(dataset_dir)
    return sorted(list(classes_map.values()))


def get_segmentation_classes(dataset_dir=None, classes_map=None):
    """List the 350 classes that are labeled with segmentations in Open Images V6.

    Args:
        dataset_dir (None): the root directory the in which the dataset is
            downloaded 
        classes_map (None): a dict mapping the Open Images IDs of classes to
            the string class names

    Returns:
        a sorted list of segmentation class name strings
    """
    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    if not classes_map:
        classes_map = _get_classes_map(dataset_dir)

    seg_cls_txt = os.path.join(
        dataset_dir, "general", "segmentation_classes.txt"
    )
    _download_if_necessary(
        seg_cls_txt,
        _ANNOTATION_DOWNLOAD_LINKS["general"]["segmentation_classes"],
    )

    with open(seg_cls_txt, "r") as f:
        seg_classes_oi = [l.rstrip("\n") for l in f]
    seg_classes = [classes_map[c] for c in seg_classes_oi]

    return sorted(seg_classes)


def _get_attrs_map(dataset_dir=None):
    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    attrs_csv = os.path.join(
        dataset_dir, "general", "oidv6-attributes-description.csv"
    )
    _download_if_necessary(
        attrs_csv, _ANNOTATION_DOWNLOAD_LINKS["general"]["attr_names"]
    )
    attrs_data = _parse_csv(attrs_csv)
    attrs_map = {k: v for k, v in attrs_data}
    return attrs_map


def _get_classes_map(dataset_dir=None):
    if not dataset_dir:
        dataset_dir = os.path.join(fo.config.dataset_zoo_dir, "open-images-v6")

    # Map of class IDs to class names
    cls_csv = os.path.join(
        dataset_dir, "general", "class-descriptions-boxable.csv"
    )
    _download_if_necessary(
        cls_csv, _ANNOTATION_DOWNLOAD_LINKS["general"]["class_names"]
    )
    cls_data = _parse_csv(cls_csv)
    classes_map = {k: v for k, v in cls_data}
    return classes_map


def _parse_csv(filename):
    with open(filename) as f:
        reader = csv.reader(f, delimiter=",")
        data = [row for row in reader]
    return data


def _load_open_images_split(
    dataset,
    label_types,
    classes_map,
    attrs_map,
    oi_classes,
    oi_attrs,
    dataset_dir,
    split,
    classes,
    attrs,
    max_samples,
):

    valid_ids = set()

    if "detections" in label_types:
        if "detections" not in dataset.get_field_schema():
            dataset.add_sample_field(
                "detections",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.Detections,
            )
        det_csv = os.path.join(
            dataset_dir, split, "detections", "%s-annotations-bbox.csv" % split
        )
        _download_if_necessary(
            det_csv, _ANNOTATION_DOWNLOAD_LINKS[split]["boxes"],
        )
        det_data = _parse_csv(det_csv)

        # Find intersection of ImageIDs with all annotations
        det_ids = {l[0] for l in det_data[1:] if l[2] in oi_classes}
        valid_ids = valid_ids | det_ids

    if "classifications" in label_types:
        if "positive_labels" not in dataset.get_field_schema():
            dataset.add_sample_field(
                "positive_labels",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.Classifications,
            )
        if "negative_labels" not in dataset.get_field_schema():
            dataset.add_sample_field(
                "negative_labels",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.Classifications,
            )

        lab_csv = os.path.join(
            dataset_dir,
            split,
            "labels",
            "%s-annotations-human-imagelabels-boxable.csv" % split,
        )
        _download_if_necessary(
            lab_csv, _ANNOTATION_DOWNLOAD_LINKS[split]["labels"],
        )
        lab_data = _parse_csv(lab_csv)

        lab_ids = {l[0] for l in lab_data[1:] if l[2] in oi_classes}
        valid_ids = valid_ids | lab_ids

    if "relationships" in label_types:
        if "relationships" not in dataset.get_field_schema():
            dataset.add_sample_field(
                "relationships",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.Detections,
            )
        rel_csv = os.path.join(
            dataset_dir,
            split,
            "relationships",
            "oidv6-%s-annotations-vrd.csv" % split,
        )
        _download_if_necessary(
            rel_csv, _ANNOTATION_DOWNLOAD_LINKS[split]["relationships"],
        )
        rel_data = _parse_csv(rel_csv)
        rel_ids = set()
        oi_classes_attrs = set(oi_classes) | set(oi_classes)
        for l in rel_data[1:]:
            valid_label1 = l[1] in oi_classes_attrs
            valid_label2 = l[2] in oi_classes_attrs

            if valid_label1 or valid_label2:
                rel_ids.add(l[0])

        valid_ids = valid_ids | rel_ids

    if "segmentations" in label_types:
        seg_classes = get_segmentation_classes(dataset_dir, classes_map)
        non_seg_classes = set(classes) - set(seg_classes)

        # Notify which classes do not exist only when the user specified
        # classes
        if non_seg_classes and len(classes) != 601:
            print(
                "No segmentations exist for classes: %s\n\nView available segmentation classes with fouo.get_segmentation_classes()\n"
                % ",".join(list(non_seg_classes))
            )

        if "segmentations" not in dataset.get_field_schema():
            dataset.add_sample_field(
                "segmentations",
                fof.EmbeddedDocumentField,
                embedded_doc_type=fol.Detections,
            )

        seg_csv = os.path.join(
            dataset_dir,
            split,
            "segmentations",
            "%s-annotations-object-segmentation.csv" % split,
        )
        _download_if_necessary(
            seg_csv,
            _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"]["mask_csv"],
        )
        seg_data = _parse_csv(seg_csv)
        seg_ids = {l[1] for l in seg_data[1:] if l[2] in oi_classes}
        valid_ids = valid_ids | seg_ids

    valid_ids = list(valid_ids)
    if max_samples:
        random.shuffle(valid_ids)
        valid_ids = valid_ids[:max_samples]

    if not valid_ids:
        raise ValueError("No samples found")

    bucket = boto3.resource(
        "s3",
        config=botocore.config.Config(signature_version=botocore.UNSIGNED),
    ).Bucket(_BUCKET_NAME)

    print("Downloading %s samples" % split)
    etau.ensure_dir(os.path.join(dataset_dir, split, "images"))
    with fou.ProgressBar() as pb:
        for image_id in pb(valid_ids):
            fp = os.path.join(
                dataset_dir, split, "images", "%s.jpg" % image_id
            )
            if not os.path.isfile(fp):
                bucket.download_file(
                    os.path.join(split, "%s.jpg" % image_id), fp
                )

    if "segmentations" in label_types:
        print("Downloading relevant segmentation masks")
        seg_zip_names = list(
            {i[0].upper() for i in (set(valid_ids) & seg_ids)}
        )
        for zip_name in seg_zip_names:
            zip_path = os.path.join(
                dataset_dir,
                split,
                "segmentations",
                "masks",
                "%s.zip" % zip_name,
            )
            _download_if_necessary(
                zip_path,
                _ANNOTATION_DOWNLOAD_LINKS[split]["segmentations"][
                    "mask_data"
                ][zip_name],
                is_zip=True,
            )

    samples = []
    # Add Samples to Dataset
    for image_id in valid_ids:
        fp = os.path.join(dataset_dir, split, "images", "%s.jpg" % image_id)
        sample = fos.Sample(filepath=fp)

        if "classifications" in label_types:
            # Add Labels
            pos_labels, neg_labels = _create_labels(
                lab_data, image_id, classes, classes_map
            )
            sample["positive_labels"] = pos_labels
            sample["negative_labels"] = neg_labels

        if "detections" in label_types:
            # Add Detections
            detections = _create_detections(
                det_data, image_id, classes, classes_map
            )
            sample["detections"] = detections

        if "segmentations" in label_types:
            # Add Segmentations
            segmentations = _create_segmentations(
                seg_data, image_id, classes, classes_map, dataset_dir, split
            )
            sample["segmentations"] = segmentations

        if "relationships" in label_types:
            # Add Relationships
            relationships = _create_relationships(
                rel_data, image_id, classes, attrs, classes_map, attrs_map
            )
            sample["relationships"] = relationships

        sample["open_images_id"] = image_id
        samples.append(sample)

    print("Adding samples to dataset")
    dataset.add_samples(samples)

    return dataset


def _create_labels(lab_data, image_id, classes, classes_map):
    pos_cls = []
    neg_cls = []
    # Get relevant data for this image
    sample_labs = [i for i in lab_data if i[0] == image_id]

    if not sample_labs:
        return None

    for sample_lab in sample_labs:
        # sample_lab reference: [ImageID,Source,LabelName,Confidence]
        label = classes_map[sample_lab[2]]
        if label in classes:
            conf = float(sample_lab[3])
            cls = fol.Classification(label=label, confidence=conf)

            if conf > 0.1:
                pos_cls.append(cls)
            else:
                neg_cls.append(cls)

    pos_labels = fol.Classifications(classifications=pos_cls)
    neg_labels = fol.Classifications(classifications=neg_cls)

    return pos_labels, neg_labels


def _create_detections(det_data, image_id, classes, classes_map):
    dets = []
    sample_dets = [i for i in det_data if i[0] == image_id]

    if not sample_dets:
        return None

    for sample_det in sample_dets:
        # sample_det reference: [ImageID,Source,LabelName,Confidence,XMin,XMax,YMin,YMax,IsOccluded,IsTruncated,IsGroupOf,IsDepiction,IsInside]
        label = classes_map[sample_det[2]]
        if label in classes:
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


def _create_relationships(
    rel_data, image_id, classes, attrs, classes_map, attrs_map
):
    rels = []
    sample_rels = [i for i in rel_data if i[0] == image_id]

    if not sample_rels:
        return None

    for sample_rel in sample_rels:
        # sample_rel reference: [ImageID,LabelName1,LabelName2,XMin1,XMax1,YMin1,YMax1,XMin2,XMax2,YMin2,YMax2,RelationshipLabel]
        label1 = classes_map[sample_rel[1]]

        attribute = False
        if sample_rel[2] in classes_map:
            label2 = classes_map[sample_rel[2]]
        else:
            label2 = attrs_map[sample_rel[2]]
            attribute = True

        label_rel = sample_rel[-1]
        valid_label = (
            label1 in classes
            or label2 in classes
            or label1 in attrs
            or label2 in attrs
        )
        if valid_label:
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

            detection_rel = fol.Detection(
                bounding_box=bbox_int, label=label_rel
            )

            detection_rel["Label1"] = label1
            detection_rel["Label2"] = label2

            rels.append(detection_rel)

    relationships = fol.Detections(detections=rels)

    return relationships


def _create_segmentations(
    seg_data, image_id, classes, classes_map, dataset_dir, split
):
    segs = []
    sample_segs = [i for i in seg_data if i[1] == image_id]

    if not sample_segs:
        return None

    for sample_seg in sample_segs:
        # sample_seg reference: [MaskPath,ImageID,LabelName,BoxID,BoxXMin,BoxXMax,BoxYMin,BoxYMax,PredictedIoU,Clicks]
        label = classes_map[sample_seg[2]]
        if label in classes:
            xmin = float(sample_seg[4])
            xmax = float(sample_seg[5])
            ymin = float(sample_seg[6])
            ymax = float(sample_seg[7])

            # Convert to [top-left-x, top-left-y, width, height]
            bbox = [xmin, ymin, xmax - xmin, ymax - ymin]

            # Load boolean mask
            mask_path = os.path.join(
                dataset_dir,
                split,
                "segmentations",
                "masks",
                image_id[0].upper(),
                sample_seg[0],
            )
            if not os.path.isfile(mask_path):
                print("Segmentation %s does not exists" % mask_path)
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
        print("Downloading %s to %s" % (source, filename))
        etau.ensure_basedir(filename)
        etaw.download_file(source, path=filename)

    if is_zip:
        # Unpack zipped directory
        print("Unpacking zip...")
        etau.extract_zip(filename, outdir=unzipped_dir, delete_zip=True)


def _parse_splits(split, splits):
    if split is None and splits is None:
        return None

    _splits = []

    if split:
        _splits.append(split)

    if splits:
        _splits.extend(list(splits))

    return _splits


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
    },
}

_BUCKET_NAME = "open-images-dataset"
