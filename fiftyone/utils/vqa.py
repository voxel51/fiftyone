"""
VQA dataset format utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import os

import eta.core.serial as etas

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.storage as fos
import fiftyone.utils.data as foud


class VQADatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for VQA datasets stored on disk in a simple JSON format.

    See :ref:`this page <VQADataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        group_questions (True): whether to create one sample per image with a
            :class:`fiftyone.core.labels.VQAs` field containing all of its
            questions (True) or one sample per question with a single
            :class:`fiftyone.core.labels.VQA` field (False)
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with labels (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        group_questions=True,
        compute_metadata=False,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.group_questions = group_questions
        self.compute_metadata = compute_metadata
        self.include_all_data = include_all_data

        self._image_paths_map = None
        self._rows_map = None
        self._keys = None
        self._iter_keys = None
        self._num_samples = None

    def __iter__(self):
        self._iter_keys = iter(self._keys)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        key = next(self._iter_keys)

        if self.group_questions:
            uuid = key
            rows = self._rows_map.get(uuid, None)
            if rows:
                label = fol.VQAs(vqas=[_parse_vqa(row) for row in rows])
            else:
                label = None
        else:
            uuid, row = key
            label = _parse_vqa(row) if row is not None else None

        if os.path.isabs(uuid):
            image_path = uuid
        else:
            image_path = self._image_paths_map[uuid]

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.VQAs if self.group_questions else fol.VQA

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.read_json(self.labels_path)
        else:
            labels = {}

        rows_map = defaultdict(list)
        for row in labels.get("questions", []):
            rows_map[fos.normpath(row["image"])].append(row)

        rows_map = dict(rows_map)

        if self.group_questions:
            keys = set(rows_map.keys())
            if self.include_all_data:
                keys.update(image_paths_map.keys())

            keys = self._preprocess_list(sorted(keys))
        else:
            keys = [
                (uuid, row)
                for uuid in sorted(rows_map.keys())
                for row in rows_map[uuid]
            ]
            if self.include_all_data:
                unlabeled = set(image_paths_map.keys()) - set(rows_map.keys())
                keys.extend((uuid, None) for uuid in sorted(unlabeled))

            keys = self._preprocess_list(keys)

        self._image_paths_map = image_paths_map
        self._rows_map = rows_map
        self._keys = keys
        self._num_samples = len(keys)


class VQADatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes VQA datasets to disk in a simple JSON format.

    See :ref:`this page <VQADataset-export>` for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.json"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        rel_dir=None,
        abs_paths=False,
        image_format=None,
        pretty_print=False,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
        self.image_format = image_format
        self.pretty_print = pretty_print

        self._rows = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return (fol.VQA, fol.VQAs)

    def setup(self):
        self._rows = []
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, label, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if label is None:
            return

        key = out_image_path if self.abs_paths else uuid

        if isinstance(label, fol.VQAs):
            vqas = label.vqas
        else:
            vqas = [label]

        self._rows.extend(_make_row(key, vqa) for vqa in vqas)

    def close(self, *args):
        etas.write_json(
            {"questions": self._rows},
            self.labels_path,
            pretty_print=self.pretty_print,
        )
        self._media_exporter.close()


def _parse_vqa(d):
    answer = d.get("answer", None)
    choices = d.get("choices", None)
    answer_index = d.get("answer_index", None)

    if (
        answer is None
        and answer_index is not None
        and choices
        and 0 <= answer_index < len(choices)
    ):
        answer = choices[answer_index]

    question_id = d.get("question_id", None)
    if question_id is not None:
        question_id = str(question_id)

    vqa = fol.VQA(
        question=d.get("question", None),
        answer=answer,
        answers=d.get("answers", None) or [],
        choices=choices or [],
        question_type=d.get("question_type", None),
        answer_type=d.get("answer_type", None),
        question_id=question_id,
        confidence=d.get("confidence", None),
    )

    if answer_index is not None:
        vqa["answer_index"] = answer_index

    return vqa


def _make_row(uuid, vqa):
    row = {"image": uuid}

    for field in (
        "question",
        "answer",
        "question_id",
        "question_type",
        "answer_type",
        "confidence",
    ):
        value = vqa.get_field(field)
        if value is not None:
            row[field] = value

    if vqa.answers:
        row["answers"] = list(vqa.answers)

    if vqa.choices:
        row["choices"] = list(vqa.choices)

    if vqa.has_field("answer_index") and vqa["answer_index"] is not None:
        row["answer_index"] = vqa["answer_index"]

    return row
