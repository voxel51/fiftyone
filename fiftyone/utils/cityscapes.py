"""
Utilities for working with the
`Cityscapes dataset <https://www.cityscapes-dataset.com>`_.

| Copyright 2017-2022, Voxel51, Inc.
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
import fiftyone.types as fot


logger = logging.getLogger(__name__)


_IMAGES_ZIP = "leftImg8bit_trainvaltest.zip"
_FINE_ANNOS_ZIP = "gtFine_trainvaltest.zip"
_COARSE_ANNOS_ZIP = "gtCoarse.zip"
_PERSON_ANNOS_ZIP = "gtBbox_cityPersons_trainval.zip"


def parse_cityscapes_dataset(
    source_dir,
    dataset_dir,
    scratch_dir,
    splits,
    fine_annos=None,
    coarse_annos=None,
    person_annos=None,
):
    """Parses the Cityscapes archive(s) in the specified directory and writes
    the requested splits in subdirectories of ``dataset_dir`` in
    :class:`fiftyone.types.dataset_types.FiftyOneDataset` format.

    The archives must have been manually downloaded into the directory before
    this method is called.

    The ``source_dir`` should contain the following files::

        source_dir/
            leftImg8bit_trainvaltest.zip
            gtFine_trainvaltest.zip             # optional
            gtCoarse.zip                        # optional
            gtBbox_cityPersons_trainval.zip     # optional

    Args:
        source_dir: the directory continaining the manually downloaded
            Cityscapes files
        dataset_dir: the directory in which to build the output dataset
        scratch_dir: a scratch directory to use for temporary files
        splits: a list of splits to parse. Supported values are
            ``(train, test, validation)``
        fine_annos (None): whether to load the fine annotations (True), or not
            (False), or only if the ZIP file exists (None)
        coarse_annos (None): whether to load the coarse annotations (True), or
            not (False), or only if the ZIP file exists (None)
        person_annos (None): whether to load the personn detections (True), or
            not (False), or only if the ZIP file exists (None)

    Raises:
        OSError: if any required source files are not present
    """
    (
        images_zip_path,
        fine_annos_zip_path,
        coarse_annos_zip_path,
        person_annos_zip_path,
    ) = _parse_source_dir(source_dir, fine_annos, coarse_annos, person_annos)

    _splits = [_parse_split(s) for s in splits]

    images_dir = _extract_images(images_zip_path, scratch_dir)

    if fine_annos_zip_path:
        fine_annos_dir = _extract_fine_annos(fine_annos_zip_path, scratch_dir)
    else:
        fine_annos_dir = None

    if coarse_annos_zip_path:
        coarse_annos_dir = _extract_coarse_annos(
            coarse_annos_zip_path, scratch_dir
        )
    else:
        coarse_annos_dir = None

    if person_annos_zip_path:
        person_annos_dir = _extract_person_annos(
            person_annos_zip_path, scratch_dir
        )
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


def _parse_source_dir(source_dir, fine_annos, coarse_annos, person_annos):
    if source_dir is None:
        _raise_cityscapes_error(
            "You must provide a `source_dir` in order to load the Cityscapes "
            "dataset."
        )

    if not os.path.isdir(source_dir):
        _raise_cityscapes_error(
            "Source directory '%s' does not exist." % source_dir
        )

    files = etau.list_files(source_dir)

    if _IMAGES_ZIP not in files:
        _raise_cityscapes_error(
            "Images zip '%s' not found within '%s'."
            % (_IMAGES_ZIP, source_dir)
        )

    images_zip_path = os.path.join(source_dir, _IMAGES_ZIP)

    if fine_annos is None:
        fine_annos = _FINE_ANNOS_ZIP in files

    if fine_annos:
        if _FINE_ANNOS_ZIP not in files:
            _raise_cityscapes_error(
                "Fine annotations zip '%s' not found within '%s'."
                % (_FINE_ANNOS_ZIP, source_dir)
            )

        fine_annos_zip_path = os.path.join(source_dir, _FINE_ANNOS_ZIP)
    else:
        fine_annos_zip_path = None

    if coarse_annos is None:
        coarse_annos = _COARSE_ANNOS_ZIP in files

    if coarse_annos:
        if _COARSE_ANNOS_ZIP not in files:
            _raise_cityscapes_error(
                "Coarse annotations zip '%s' not found within '%s'."
                % (_COARSE_ANNOS_ZIP, source_dir)
            )

        coarse_annos_zip_path = os.path.join(source_dir, _COARSE_ANNOS_ZIP)
    else:
        coarse_annos_zip_path = None

    if person_annos is None:
        person_annos = _PERSON_ANNOS_ZIP in files

    if person_annos:
        if _PERSON_ANNOS_ZIP not in files:
            _raise_cityscapes_error(
                "Person annotations zip '%s' not found within '%s'."
                % (_PERSON_ANNOS_ZIP, source_dir)
            )

        person_annos_zip_path = os.path.join(source_dir, _PERSON_ANNOS_ZIP)
    else:
        person_annos_zip_path = None

    return (
        images_zip_path,
        fine_annos_zip_path,
        coarse_annos_zip_path,
        person_annos_zip_path,
    )


def _raise_cityscapes_error(msg):
    raise OSError(
        "\n\n"
        + msg
        + "\n\n"
        + "You must download the source files for the Cityscapes dataset "
        "manually."
        + "\n\n"
        + "Run `fiftyone zoo datasets info cityscapes` for more information"
    )


def _parse_split(split):
    if split == "validation":
        return "val"

    if split not in ("test", "train"):
        raise ValueError(
            "Invalid split '%s''; supported values are %s"
            % (split, ("train", "test", "validation"))
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
    images_map = _parse_images(images_dir, split)

    if fine_annos_dir:
        fine_annos_map = _parse_fine_annos(fine_annos_dir, split)
    else:
        fine_annos_map = {}

    if coarse_annos_dir:
        coarse_annos_map = _parse_coarse_annos(coarse_annos_dir, split)
    else:
        coarse_annos_map = {}

    if person_annos_dir:
        person_annos_map = _parse_person_annos(person_annos_dir, split)
    else:
        person_annos_map = {}

    dataset = fod.Dataset()
    dataset.media_type = fom.IMAGE

    has_fine_annos = bool(fine_annos_map)
    has_coarse_annos = bool(coarse_annos_map)
    has_person_annos = bool(person_annos_map)

    if has_fine_annos:
        dataset.add_sample_field(
            "gt_fine",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Polylines,
        )

    if has_coarse_annos:
        dataset.add_sample_field(
            "gt_coarse",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Polylines,
        )

    if has_person_annos:
        dataset.add_sample_field(
            "gt_person",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Detections,
        )

    uuids = sorted(images_map.keys())

    logger.info("Finalizing split '%s'...", split)
    exporter = foud.LegacyFiftyOneDatasetExporter(split_dir)
    pb = fou.ProgressBar()
    with exporter, pb:
        exporter.log_collection(dataset)
        for uuid in pb(uuids):
            sample = fos.Sample(filepath=images_map[uuid])

            if has_fine_annos:
                sample["gt_fine"] = fine_annos_map.get(uuid, None)

            if has_coarse_annos:
                sample["gt_coarse"] = coarse_annos_map.get(uuid, None)

            if has_person_annos:
                sample["gt_person"] = person_annos_map.get(uuid, None)

            exporter.export_sample(sample)

    dataset.delete()


def _extract_images(images_zip_path, scratch_dir):
    tmp_dir = os.path.join(scratch_dir, "images")
    images_dir = os.path.join(tmp_dir, "leftImg8bit")

    if not os.path.isdir(images_dir):
        logger.info("Extracting images...")
        etau.extract_zip(images_zip_path, outdir=tmp_dir, delete_zip=False)

    return images_dir


def _extract_fine_annos(fine_annos_zip_path, scratch_dir):
    tmp_dir = os.path.join(scratch_dir, "fine-annos")
    fine_annos_dir = os.path.join(tmp_dir, "gtFine")

    if not os.path.isdir(fine_annos_dir):
        logger.info("Extracting fine annotations...")
        etau.extract_zip(fine_annos_zip_path, outdir=tmp_dir, delete_zip=False)

    return fine_annos_dir


def _extract_coarse_annos(coarse_annos_zip_path, scratch_dir):
    tmp_dir = os.path.join(scratch_dir, "coarse-annos")
    coarse_annos_dir = os.path.join(tmp_dir, "gtCoarse")

    if not os.path.isdir(coarse_annos_dir):
        logger.info("Extracting coarse annotations...")
        etau.extract_zip(
            coarse_annos_zip_path, outdir=tmp_dir, delete_zip=False
        )

    return coarse_annos_dir


def _extract_person_annos(person_annos_zip_path, scratch_dir):
    tmp_dir = os.path.join(scratch_dir, "person-annos")
    person_annos_dir = os.path.join(tmp_dir, "gtBboxCityPersons")

    if not os.path.isdir(person_annos_dir):
        logger.info("Extracting person annotations...")
        etau.extract_zip(
            person_annos_zip_path, outdir=tmp_dir, delete_zip=False
        )

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
