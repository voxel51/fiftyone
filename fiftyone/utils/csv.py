"""
CSV utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import os
import random

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.sample as fos
import fiftyone.utils.data as foud


class CSVDatasetExporter(foud.BatchDatasetExporter, foud.ExportPathsMixin):
    """A flexible CSV exporter that represents slice(s) of field values of a
    dataset as columns of a CSV file.

    See :ref:`this page <CSVDataset-export>` for exporting datasets of this
    type.

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

            -   a filename like ``"labels.csv"`` specifying the location in
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
            filepath to generate a unique identifier for each media. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported media. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.utils.normalize_path`
        abs_paths (False): whether to store absolute paths to the media in the
            exported labels
        media_field ("filepath"): the name of the field containing the media to
            export for each sample
        fields (None): a field or iterable of fields to include as columns in
            the exported CSV file. By default, only the ``media_field`` is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        rel_dir=None,
        abs_paths=False,
        media_field="filepath",
        fields=None,
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
            default="labels.csv",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
        self.media_field = media_field
        self.fields = fields

        self._media_exporter = None
        self._f = None
        self._csv_writer = None
        self._fields = None
        self._media_idx = None
        self._include_media = None
        self._needs_metadata = None

    def setup(self):
        self._media_exporter = foud.MediaExporter(
            self.export_media,
            export_path=self.data_path,
            rel_dir=self.rel_dir,
        )
        self._media_exporter.setup()

        fields, media_idx, include_media = _parse_fields(
            self.fields, self.media_field, self.export_media
        )
        needs_metadata = any(p.startswith("metadata.") for p in fields)

        header = fields.copy()
        if not include_media and media_idx is not None:
            header.pop(media_idx)

        etau.ensure_basedir(self.labels_path)
        f = open(self.labels_path, "w")

        # QUOTE_MINIMAL is default, but pass it anyway to make sure
        #   list fields we try to write are handled properly
        csv_writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        csv_writer.writerow(header)

        self._f = f
        self._csv_writer = csv_writer
        self._fields = fields
        self._media_idx = media_idx
        self._include_media = include_media
        self._needs_metadata = needs_metadata

    def export_samples(self, sample_collection):
        if self._needs_metadata:
            sample_collection.compute_metadata()

        idx = self._media_idx
        with fou.ProgressBar(total=len(sample_collection)) as pb:
            for data in pb(zip(*sample_collection.values(self._fields))):
                data = [_parse_value(d) for d in data]

                if idx is not None:
                    media_path = data[idx]
                    out_media_path, uuid = self._media_exporter.export(
                        media_path
                    )
                    if self._include_media:
                        data[idx] = out_media_path if self.abs_paths else uuid
                    else:
                        data.pop(idx)

                self._csv_writer.writerow(data)

    def close(self, *args):
        self._f.close()


def _parse_fields(fields, media_field, export_media):
    if not fields:
        fields = media_field

    if etau.is_str(fields):
        fields = [fields]
    else:
        fields = list(fields)

    try:
        media_idx = fields.index(media_field)
        include_media = True
    except ValueError:
        if export_media != False:
            fields.append(media_field)
            media_idx = len(fields) - 1
            include_media = False
        else:
            media_idx = None
            include_media = False

    return fields, media_idx, include_media


def _parse_value(value):
    if value is None:
        return ""

    if not etau.is_container(value):
        return str(value)

    # Render lists as "list,of,values"
    return ",".join(str(v) for v in value)


class Parsers:
    @staticmethod
    def StringParser(value):
        return None if value == "" else str(value)

    DefaultParser = StringParser

    @staticmethod
    def IntParser(value):
        return int(value) if value else 0

    @staticmethod
    def FloatParser(value):
        return float(value) if value else None

    @staticmethod
    def ListParser(subparser=DefaultParser):
        def _ListParser(value):
            return (
                []
                if value == ""
                else [subparser(sv) for sv in value.split(",")]
            )

        return _ListParser

    @staticmethod
    def ClassificationParser(value):
        return fol.Classification(label=value) if value else None


class CSVDatasetImporter(foud.BatchDatasetImporter, foud.ImportPathsMixin):
    """Importer for COCO detection datasets stored on disk.

    See :ref:`this page <COCODetectionDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
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

            -   a filename like ``"labels.csv"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.csv``
        media_field ("filepath"): the name of the field containing the media path
            for each sample
        fields (None): An optional parameter that specifies fields to read and parse
            from the CSV file. Can be any of the following:
            -   `None`. Will use all fields in the CSV and parse with default
                string parser.
            -   `List[str]` which are the field names to be read from
                the CSV. All data will be parsed with default string parser.
            -   `Dict[str, Optional[fiftyone.utils.csv.Parsers]]` where the key
                specifies the field name to be read and the value specifies the
                parser to be used, e.g., `StringParser` or `IntParser`. If `None`,
                default string parser will be used. `ListParser` can be uniquely
                used by passing in sub parser type to use for each data field.
                For example:
                {
                    "float_field": Parsers.FloatParser,
                    "list_field": Parsers.ListParser(Parsers.StringParser),
                    "classification_field": Parsers.ClassificationParser,
                    "string_field": None # uses DefaultParser
                }
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load. If
            ``label_types`` and/or ``classes`` are also specified, first
            priority will be given to samples that contain all of the specified
            label types and/or classes, followed by samples that contain at
            least one of the specified labels types or classes. The actual
            number of samples loaded may be less than this maximum value if the
            dataset does not contain sufficient samples matching your
            requirements. By default, all matching samples are loaded
    """

    TAGS_FIELD = "tags"

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        media_field="filepath",
        fields=None,
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
            default="labels.csv",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.media_field = media_field

        if fields is not None:
            if not isinstance(fields, list) and not isinstance(fields, dict):
                raise ValueError(
                    f"Unsupported fields parameter of type {type(fields)}"
                )
            if any("." in f for f in fields):
                raise ValueError(
                    "Embedded fields not supported in fields parameter"
                )

        self.field_parsers = fields

    def import_samples(self, dataset, tags=None):
        """Imports samples and labels stored on disk in CSV format.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset`
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """

        with open(self.labels_path, "r") as labels_file:
            labels_csv = csv.DictReader(labels_file)
            if self.media_field not in labels_csv.fieldnames:
                raise ValueError(
                    f"No media field '{self.media_field}'"
                    f" found in '{self.labels_path}'"
                )
            if self.field_parsers is None:
                _field_parsers = {
                    field: Parsers.DefaultParser
                    for field in labels_csv.fieldnames
                }
            elif isinstance(self.field_parsers, list):
                _field_parsers = {
                    field: Parsers.DefaultParser
                    for field in self.field_parsers
                }
            elif isinstance(self.field_parsers, dict):
                _field_parsers = {
                    f: p or Parsers.DefaultParser
                    for f, p in self.field_parsers.items()
                }
            else:
                raise ValueError(
                    f"Unsupported fields parameter of type {type(self.field_parsers)}"
                )

            embedded_fields = [
                f.split(".")[0] for f in labels_csv.fieldnames if "." in f
            ]
            if len(embedded_fields) != len(set(embedded_fields)):
                raise ValueError(
                    "Cannot import embedded document type with multiple fields"
                )

            has_tags = self.TAGS_FIELD in labels_csv.fieldnames
            samples = []
            with fou.ProgressBar(total=self.max_samples) as pb:
                for csv_row in pb(labels_csv):
                    media_loc = csv_row.pop(self.media_field)
                    if not os.path.isabs(media_loc):
                        media_loc = os.path.join(self.data_path, media_loc)

                    _tags = None
                    if has_tags:
                        _tags = Parsers.ListParser(Parsers.DefaultParser)(
                            csv_row[self.TAGS_FIELD]
                        )
                        _tags += tags or []
                        csv_row.pop(self.TAGS_FIELD)

                    sample = fos.Sample(filepath=media_loc, tags=_tags)
                    for field, value in csv_row.items():
                        field = field.split(".")[0]
                        if field in _field_parsers:
                            sample[field] = _field_parsers[field](value)
                    samples.append(sample)

                    if (
                        self.max_samples is not None
                        and labels_csv.line_num > self.max_samples
                    ):
                        break

            if self.shuffle:
                shuffler = random.Random(self.seed)
                shuffler.shuffle(samples)

            return dataset.add_samples(samples)
