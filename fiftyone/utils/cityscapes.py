"""
Utilities for working with the
`Cityscapes dataset <https://www.cityscapes-dataset.com>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


_SUPPORTED_SPLITS = ("train", "test", "validation")
_IMAGES_ZIP = "leftImg8bit_trainvaltest.zip"
_FINE_ANNOS_ZIP = "gtFine_trainvaltest.zip"
_COARSE_ANNOS_ZIP = "gtCoarse.zip"
_PERSON_ANNOS_ZIP = "gtBbox_cityPersons_trainval.zip"


def parse_cityscapes_dataset(
    dataset_dir,
    scratch_dir,
    splits,
    fine_annos=False,
    coarse_annos=False,
    person_annos=False,
):
    """Parses the Cityscapes archive(s) in the specified directory.

    The archives must have been manually downloaded into the directory before
    this method is called.

    The dataset splits will saved in subdirectories of ``dataset_dir`` in
    :class:`fiftyone.types.dataset_types.FiftyOneDataset` format.

    Args:
        dataset_dir: the dataset directory
        scratch_dir: a scratch directory to use for temporary files
        splits: a list of splits to parse. Supported values are
            ``(train, test, validation)``
        fine_annos (False): whether to parse the fine annotations
        coarse_annos (False): whether to parse the coarse annotations
        person_annos (False): whether to parse the person annotations
    """
    _splits = [_parse_split(s) for s in splits]

    images_dir = _extract_images(dataset_dir, scratch_dir)

    if fine_annos:
        fine_annos_dir = _extract_fine_annos(dataset_dir, scratch_dir)
    else:
        fine_annos_dir = None

    if coarse_annos:
        coarse_annos_dir = _extract_coarse_annos(dataset_dir, scratch_dir)
    else:
        coarse_annos_dir = None

    if person_annos:
        person_annos_dir = _extract_person_annos(dataset_dir, scratch_dir)
    else:
        person_annos_dir = None

    for split, _split in zip(splits, _splits):
        split_dir = os.path.join(dataset_dir, split)
        _export_split(
            _split,
            split_dir,
            images_dir,
            fine_annos_dir,
            coarse_annos_dir,
            person_annos_dir,
        )


def _parse_split(split):
    if split == "validation":
        return "val"

    if split not in ("test", "train"):
        raise ValueError(
            "Invalid split '%s''; supported values are %s"
            % (split, _SUPPORTED_SPLITS)
        )

    return split


def _export_split(
    split,
    split_dir,
    images_dir,
    fine_annos_dir,
    coarse_annos_dir,
    person_annos_dir,
):
    name = fod.make_unique_dataset_name("cityscapes-" + split)
    dataset = fod.Dataset(name=name)
    dataset.media_type = fom.IMAGE

    images_map = _parse_images(images_dir, split)

    if fine_annos_dir:
        fine_annos_map = _parse_fine_annos(fine_annos_dir, split)
        dataset.add_sample_field(
            "gt_fine",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Polylines,
        )
    else:
        fine_annos_map = {}

    if coarse_annos_dir:
        coarse_annos_map = _parse_coarse_annos(coarse_annos_dir, split)
        dataset.add_sample_field(
            "gt_coarse",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Polylines,
        )
    else:
        coarse_annos_map = {}

    if person_annos_dir:
        person_annos_map = _parse_person_annos(person_annos_dir, split)
        dataset.add_sample_field(
            "gt_person",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Detections,
        )
    else:
        person_annos_map = {}

    uuids = sorted(
        set(fine_annos_map.keys())
        | set(coarse_annos_map.keys())
        | set(person_annos_map.keys())
    )

    logger.info("Finalizing split '%s'...", split)
    exporter = foud.FiftyOneDatasetExporter(split_dir, move_media=False)
    pb = fou.ProgressBar()
    with exporter, pb:
        exporter.log_collection(dataset)
        for uuid in pb(uuids):
            sample = fos.Sample(filepath=images_map[uuid])

            if fine_annos_dir:
                sample["gt_fine"] = fine_annos_map.get(uuid, None)

            if coarse_annos_dir:
                sample["gt_coarse"] = coarse_annos_map.get(uuid, None)

            if person_annos_dir:
                sample["gt_person"] = person_annos_map.get(uuid, None)

            exporter.export_sample(sample)


def _extract_images(dataset_dir, scratch_dir):
    images_zip = os.path.join(dataset_dir, _IMAGES_ZIP)
    tmp_dir = os.path.join(scratch_dir, "images")
    images_dir = os.path.join(tmp_dir, "leftImg8bit")

    if os.path.isdir(images_dir):
        return images_dir

    _ensure_archive(_IMAGES_ZIP, dataset_dir)

    logger.info("Extracting images...")
    etau.extract_zip(images_zip, outdir=tmp_dir, delete_zip=False)

    return images_dir


def _extract_fine_annos(dataset_dir, scratch_dir):
    fine_annos_zip = os.path.join(dataset_dir, _FINE_ANNOS_ZIP)
    tmp_dir = os.path.join(scratch_dir, "fine-annos")
    fine_annos_dir = os.path.join(tmp_dir, "gtFine")

    if os.path.isdir(fine_annos_dir):
        return fine_annos_dir

    _ensure_archive(_FINE_ANNOS_ZIP, dataset_dir)

    logger.info("Extracting fine annotations...")
    etau.extract_zip(fine_annos_zip, outdir=tmp_dir, delete_zip=False)

    return fine_annos_dir


def _extract_coarse_annos(dataset_dir, scratch_dir):
    coarse_annos_zip = os.path.join(dataset_dir, _COARSE_ANNOS_ZIP)
    tmp_dir = os.path.join(scratch_dir, "coarse-annos")
    coarse_annos_dir = os.path.join(tmp_dir, "gtCoarse")

    if os.path.isdir(coarse_annos_dir):
        return coarse_annos_dir

    _ensure_archive(_COARSE_ANNOS_ZIP, dataset_dir)

    logger.info("Extracting coarse annotations...")
    etau.extract_zip(coarse_annos_zip, outdir=tmp_dir, delete_zip=False)

    return coarse_annos_dir


def _extract_person_annos(dataset_dir, scratch_dir):
    person_annos_zip = os.path.join(dataset_dir, _PERSON_ANNOS_ZIP)
    tmp_dir = os.path.join(scratch_dir, "person-annos")
    person_annos_dir = os.path.join(tmp_dir, "gtBboxCityPersons")

    if os.path.isdir(person_annos_dir):
        return person_annos_dir

    _ensure_archive(_PERSON_ANNOS_ZIP, dataset_dir)

    logger.info("Extracting person annotations...")
    etau.extract_zip(person_annos_zip, outdir=tmp_dir, delete_zip=False)

    return person_annos_dir


def _parse_images(images_dir, split):
    paths_patt = os.path.join(images_dir, split, "*", "*")
    images_map = {}
    for image_path in etau.get_glob_matches(paths_patt):
        uuid = os.path.splitext(os.path.basename(image_path))[0][
            : -len("_leftImg8bit")
        ]
        images_map[uuid] = image_path

    return images_map


def _parse_fine_annos(fine_annos_dir, split):
    glob_patt = os.path.join(fine_annos_dir, split, "*", "*.json")
    return _parse_polygon_annos(glob_patt, split, "fine", "_gtFine_polygons")


def _parse_coarse_annos(coarse_annos_dir, split):
    glob_patt = os.path.join(coarse_annos_dir, split, "*", "*.json")
    return _parse_polygon_annos(
        glob_patt, split, "coarse", "_gtCoarse_polygons"
    )


def _parse_polygon_annos(glob_patt, split, anno_type, suffix):
    anno_paths = etau.get_glob_matches(glob_patt)
    if not anno_paths:
        return {}

    logger.info("Parsing %s annotations for split '%s'...", anno_type, split)
    annos_map = {}
    with fou.ProgressBar() as pb:
        for anno_path in pb(anno_paths):
            uuid = os.path.splitext(os.path.basename(anno_path))[0][
                : -len(suffix)
            ]
            annos_map[uuid] = _parse_polygons_file(anno_path)

    return annos_map


def _parse_person_annos(person_annos_dir, split):
    paths_patt = os.path.join(person_annos_dir, split, "*", "*.json")
    anno_paths = etau.get_glob_matches(paths_patt)
    if not anno_paths:
        return {}

    logger.info("Parsing person annotations for split '%s'...", split)
    detections_map = {}
    with fou.ProgressBar() as pb:
        for anno_path in pb(anno_paths):
            uuid = os.path.splitext(os.path.basename(anno_path))[0][
                : -len("_gtBboxCityPersons")
            ]
            detections_map[uuid] = _parse_bbox_file(anno_path)

    return detections_map


def _parse_polygons_file(json_path):
    d = etas.load_json(json_path)

    width = d["imgWidth"]
    height = d["imgHeight"]

    polylines = []
    for obj in d.get("objects", []):
        label = obj["label"]
        points = [(x / width, y / height) for x, y in obj["polygon"]]
        polyline = fol.Polyline(
            label=label, points=[points], closed=True, filled=True
        )
        polylines.append(polyline)

    return fol.Polylines(polylines=polylines)


def _parse_bbox_file(json_path):
    d = etas.load_json(json_path)

    width = d["imgWidth"]
    height = d["imgHeight"]

    detections = []
    for obj in d.get("objects", []):
        label = obj["label"]
        x, y, w, h = obj["bbox"]
        bounding_box = [x / width, y / height, w / width, h / height]
        detection = fol.Detection(label=label, bounding_box=bounding_box)
        detections.append(detection)

    return fol.Detections(detections=detections)


def _ensure_archive(archive_name, dataset_dir):
    archive_path = os.path.join(dataset_dir, archive_name)
    if not os.path.isfile(archive_path):
        raise OSError(
            (
                "Archive '%s' not found in directory '%s'."
                "\n\n"
                "You must download the source files for the Cityscapes "
                "dataset manually to the above directory."
                "\n\n"
                "Register at https://www.cityscapes-dataset.com/register in "
                "order to get links to download the data"
            )
            % (archive_name, dataset_dir)
        )
