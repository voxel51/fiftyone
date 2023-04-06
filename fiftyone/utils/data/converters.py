"""
Dataset format conversion utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect
import logging
import os

import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.types as fot

from .exporters import build_dataset_exporter
from .importers import build_dataset_importer


logger = logging.getLogger(__name__)


def convert_dataset(
    input_dir=None,
    input_type=None,
    input_kwargs=None,
    dataset_importer=None,
    output_dir=None,
    output_type=None,
    output_kwargs=None,
    dataset_exporter=None,
    overwrite=False,
):
    """Converts a dataset stored on disk to another format on disk.

    The input dataset may be specified by providing either an ``input_dir`` and
    a corresponding ``input_type`` or by providing a ``dataset_importer``.

    The output dataset may be specified by providing either an ``output_dir``
    and a corresponding ``output_type`` or by providing a ``dataset_exporter``.

    Args:
        input_dir (None): the input dataset directory
        input_type (None): the :class:`fiftyone.types.Dataset` type of the
            dataset in ``input_dir``
        input_kwargs (None): optional kwargs dict to pass to the constructor of
            the :class:`fiftyone.utils.data.importers.DatasetImporter` for the
            ``input_type`` you specify
        dataset_importer (None): a
            :class:`fiftyone.utils.data.importers.DatasetImporter` to use to
            import the input dataset
        output_dir (None): the directory to which to write the output dataset
        output_type (None): the :class:`fiftyone.types.Dataset` type to write
            to ``output_dir``
        output_kwargs (None): optional kwargs dict to pass to the constructor
            of the :class:`fiftyone.utils.data.exporters.DatasetExporter` for
            the ``output_type`` you specify
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            export the dataset
        overwrite (False): whether to delete existing directories before
            performing the export (True) or to merge the export with existing
            files and directories (False)
    """
    if input_type is None and dataset_importer is None:
        raise ValueError(
            "Either `input_type` or `dataset_importer` must be provided"
        )

    if output_type is None and dataset_exporter is None:
        raise ValueError(
            "Either `output_type` or `dataset_exporter` must be provided"
        )

    dataset = fod.Dataset()
    images_dir = None

    try:
        # Build importer
        if dataset_importer is None:
            if input_kwargs is None:
                input_kwargs = {}

            # If the input dataset contains TFRecords, they must be unpacked
            # into a temporary directory during conversion
            if _is_tf_records(input_type) and "images_dir" not in input_kwargs:
                images_dir = etau.make_temp_dir()
                input_kwargs["images_dir"] = images_dir

            dataset_importer, _ = build_dataset_importer(
                input_type, dataset_dir=input_dir, **input_kwargs
            )

            logger.info(
                "Using input format: %s", etau.get_class_name(input_type)
            )
        else:
            input_dir = dataset_importer.input_dir
            logger.info(
                "Using importer: %s", etau.get_class_name(dataset_importer)
            )

        # Build exporter
        if dataset_exporter is None:
            if output_kwargs is None:
                output_kwargs = {}

            dataset_exporter, _ = build_dataset_exporter(
                output_type, export_dir=output_dir, **output_kwargs
            )
            logger.info(
                "Using export format: %s", etau.get_class_name(output_type)
            )
        else:
            output_dir = dataset_exporter.export_dir
            logger.info(
                "Using exporter: %s", etau.get_class_name(dataset_exporter)
            )

        # Import dataset
        if input_dir is not None:
            logger.info("Loading dataset from '%s'", input_dir)
        else:
            logger.info("Loading dataset")

        dataset.add_importer(dataset_importer)

        # Export dataset
        if output_dir is not None:
            logger.info("Exporting dataset to '%s'", output_dir)
        else:
            logger.info("Exporting dataset")

        dataset.export(dataset_exporter=dataset_exporter, overwrite=overwrite)
    finally:
        if images_dir is not None and os.path.isdir(images_dir):
            etau.delete_dir(images_dir)

        dataset.delete()


def _is_tf_records(dataset_type):
    if inspect.isclass(dataset_type):
        dataset_type = dataset_type()

    return isinstance(
        dataset_type,
        (fot.TFImageClassificationDataset, fot.TFObjectDetectionDataset),
    )
