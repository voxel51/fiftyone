"""
Dataset format conversion utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
import logging

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.types as fot


logger = logging.getLogger(__name__)


def convert_dataset(
    input_dir=None,
    input_type=None,
    dataset_importer=None,
    output_dir=None,
    output_type=None,
    dataset_exporter=None,
):
    """Converts a dataset stored on disk to another format on disk.

    The input dataset may be specified by providing either an ``input_dir`` and
    a corresponding ``input_type`` or by providing a ``dataset_importer``.

    The output dataset may be specified by providing either an ``output_dir``
    and a corresponding ``output_type`` or by providing a ``dataset_exporter``.

    Args:
        input_dir (None): the input dataset directory
        input_type (None): the :class:`fiftyone.types.dataset_types.Dataset`
            type of the dataset in ``input_dir``
        dataset_importer (None): a
            :class:`fiftyone.utils.data.importers.DatasetImporter` to use to
            import the input dataset
        output_dir (None): the directory to which to write the output dataset
        output_type (None): the :class:`fiftyone.types.dataset_types.Dataset`
            type to write to ``output_dir``
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            export the dataset
    """
    if input_type is None and dataset_importer is None:
        raise ValueError(
            "Either `input_type` or `dataset_importer` must be provided"
        )

    if output_type is None and dataset_exporter is None:
        raise ValueError(
            "Either `output_type` or `dataset_exporter` must be provided"
        )

    # Label field used (if necessary) when converting labeled datasets
    label_field = "label"

    # Import dataset
    if dataset_importer is not None:
        # Import via ``dataset_importer``
        logger.info("Loading dataset from '%s'", dataset_importer.dataset_dir)
        logger.info(
            "Using DatasetImporter '%s'", etau.get_class_name(dataset_importer)
        )
        dataset = fo.Dataset.from_importer(
            dataset_importer, label_field=label_field
        )
        logger.info("Import complete")
    else:
        # Import via ``input_type``
        if inspect.isclass(input_type):
            input_type = input_type()

        # If the input dataset contains TFRecords, they must be unpacked into a
        # temporary directory during conversion
        if isinstance(
            input_type,
            (fot.TFImageClassificationDataset, fot.TFObjectDetectionDataset),
        ):
            with etau.TempDir() as images_dir:
                dataset_importer_cls = input_type.get_dataset_importer_cls()
                dataset_importer = dataset_importer_cls(input_dir, images_dir)
                convert_dataset(
                    dataset_importer=dataset_importer,
                    output_dir=output_dir,
                    output_type=output_type,
                    dataset_exporter=dataset_exporter,
                )
                return

        logger.info("Loading dataset from '%s'", input_dir)
        logger.info("Input format '%s'", etau.get_class_name(input_type))
        dataset = fo.Dataset.from_dir(
            input_dir, input_type, label_field=label_field
        )
        logger.info("Import complete")

    # Export dataset
    if dataset_exporter is not None:
        # Export via ``dataset_exporter``
        logger.info("Exporting dataset to '%s'", dataset_exporter.export_dir)
        logger.info(
            "Using DatasetExporter '%s'", etau.get_class_name(dataset_exporter)
        )
        dataset.export(
            dataset_exporter=dataset_exporter, label_field=label_field
        )
        logger.info("Export complete")
    else:
        # Export via ``output_type``
        if inspect.isclass(output_type):
            output_type = output_type()

        logger.info("Exporting dataset to '%s'", output_dir)
        logger.info("Export format '%s'", etau.get_class_name(output_type))
        dataset.export(
            export_dir=output_dir,
            dataset_type=output_type,
            label_field=label_field,
        )
        logger.info("Export complete")

    # Cleanup
    dataset.delete()
