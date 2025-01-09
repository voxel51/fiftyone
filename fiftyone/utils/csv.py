"""
CSV utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import csv
import os

import eta.core.utils as etau

import fiftyone.core.utils as fou
import fiftyone.core.sample as fos
import fiftyone.utils.data as foud


class CSVDatasetImporter(
    foud.GenericSampleDatasetImporter, foud.ImportPathsMixin
):
    """A flexible CSV importer that represents slice(s) of field values of a
    dataset as columns of a CSV file.

    See :ref:`this page <CSVDataset-import>` for format details.

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
        media_field ("filepath"): the name of the column containing the media
            path for each sample. The media paths in this column may be:

            -   filenames or relative paths to media files in ``data_path``
            -   absolute media paths, in which case ``data_path`` has no effect
        fields (None): an optional parameter that specifies the columns to read
            and parse from the CSV file. Can be any of the following:

            -   an iterable of column names to parse as strings
            -   a dict mapping column names to functions that parse the column
                values into the appropriate type. Any keys with ``None`` values
                in this case are directly loaded as strings

            If not provided, all columns are parsed as strings
        skip_missing_media (False): whether to skip (True) or raise an error
            (False) when rows with no ``media_field`` are encountered
        include_all_data (False): whether to generate samples for all media in
            the data directory (True) rather than only creating samples for
            media with CSV rows (False)
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
        media_field="filepath",
        fields=None,
        skip_missing_media=False,
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
        self.fields = fields
        self.skip_missing_media = skip_missing_media
        self.include_all_data = include_all_data

        self._media_paths_map = None
        self._rows_map = None
        self._fields = None
        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filepath = next(self._iter_filepaths)

        row = self._rows_map.get(filepath, None)
        if row is None:
            return fos.Sample(filepath=filepath)

        kwargs = {}
        if isinstance(self._fields, dict):
            for key, parser in self._fields.items():
                value = row.get(key, "")
                if value:
                    kwargs[key] = parser(value)
        elif self._fields is not None:
            for key in self._fields:
                value = row.get(key, "")
                if value:
                    kwargs[key] = value
        else:
            for key, value in row.items():
                if value:
                    kwargs[key] = value

        return fos.Sample(filepath=filepath, **kwargs)

    @property
    def has_sample_field_schema(self):
        return False

    @property
    def has_dataset_info(self):
        return False

    def setup(self):
        media_paths_map = self._load_data_map(self.data_path, recursive=True)

        rows_map = {}
        fields = _parse_import_fields(self.fields, self.media_field)

        media_field = self.media_field
        if self.labels_path is not None and os.path.isfile(self.labels_path):
            with open(self.labels_path, "r") as f:
                reader = csv.DictReader(f)
                if media_field not in reader.fieldnames:
                    raise ValueError(
                        "Media field '%s' not found in '%s'"
                        % (media_field, self.labels_path)
                    )

                for row in reader:
                    filename = row.pop(media_field, None)
                    if filename is None or os.path.isabs(filename):
                        filepath = filename
                    else:
                        filepath = media_paths_map.get(filename, None)

                    if filepath is None:
                        if self.skip_missing_media:
                            continue
                        else:
                            raise ValueError(
                                "Found row with no '%s' value" % media_field
                            )

                    rows_map[filepath] = row

        filepaths = set(rows_map.keys())

        if self.include_all_data:
            filepaths.update(media_paths_map.values())

        filepaths = self._preprocess_list(sorted(filepaths))

        self._media_paths_map = media_paths_map
        self._rows_map = rows_map
        self._fields = fields
        self._filepaths = filepaths
        self._num_samples = len(filepaths)


def _parse_import_fields(fields, media_field):
    if isinstance(fields, dict):
        fields.pop(media_field, None)
        fields = {k: v or str for k, v in fields.items()}
    elif fields is not None:
        if etau.is_str(fields):
            fields = [fields]

        fields = [f for f in fields if f != media_field]

    return fields


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
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the media in the
            exported labels
        media_field ("filepath"): the name of the field containing the media to
            export for each sample
        fields (None): an optional argument specifying the fields or
            ``embedding.field.names`` to include as columns in the exported
            CSV. Can be:

            -   a field or iterable of fields
            -   a dict mapping field names to column names

            By default, only the ``media_field`` is exported
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
        self._paths = None
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

        (
            paths,
            header,
            media_idx,
            include_media,
            needs_metadata,
        ) = _parse_export_fields(
            self.fields, self.media_field, self.export_media
        )

        etau.ensure_basedir(self.labels_path)
        f = open(self.labels_path, "w", newline="")

        # QUOTE_MINIMAL ensures that list fields are handled properly
        csv_writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        csv_writer.writerow(header)

        self._f = f
        self._csv_writer = csv_writer
        self._paths = paths
        self._media_idx = media_idx
        self._include_media = include_media
        self._needs_metadata = needs_metadata

    def export_samples(self, sample_collection, progress=None):
        if self._needs_metadata:
            sample_collection.compute_metadata()

        idx = self._media_idx
        with fou.ProgressBar(total=sample_collection, progress=progress) as pb:
            for data in pb(zip(*sample_collection.values(self._paths))):
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
        self._media_exporter.close()


def _parse_export_fields(fields, media_field, export_media):
    if not fields:
        fields = media_field

    if isinstance(fields, dict):
        paths, header = zip(*fields.items())
    elif etau.is_str(fields):
        paths = [fields]
        header = [fields]
    else:
        paths = list(fields)
        header = list(fields)

    try:
        media_idx = paths.index(media_field)
        include_media = True
    except ValueError:
        include_media = False
        if export_media:
            paths.append(media_field)
            media_idx = len(paths) - 1
        else:
            media_idx = None

    needs_metadata = any(p.startswith("metadata.") for p in paths)

    return paths, header, media_idx, include_media, needs_metadata


def _parse_value(value):
    if value is None:
        return ""

    if not etau.is_container(value):
        return str(value)

    # Render lists as "list,of,values"
    return ",".join(str(v) for v in value)
