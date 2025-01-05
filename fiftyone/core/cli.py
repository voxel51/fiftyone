"""
Definition of the `fiftyone` command-line interface (CLI).

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
from collections import defaultdict
from datetime import datetime
import json
import os
import subprocess
import sys
import time
import textwrap

import argcomplete
from bson import ObjectId
from tabulate import tabulate
import webbrowser

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.config as focg
import fiftyone.core.dataset as fod
import fiftyone.core.session as fos
import fiftyone.core.utils as fou
import fiftyone.migrations as fom
import fiftyone.operators as foo
import fiftyone.operators.delegated as food
import fiftyone.operators.executor as fooe
import fiftyone.plugins as fop
import fiftyone.utils.data as foud
import fiftyone.utils.image as foui
import fiftyone.utils.quickstart as fouq
import fiftyone.utils.video as fouv
import fiftyone.zoo.datasets as fozd
import fiftyone.zoo.models as fozm
from fiftyone import ViewField as F

# pylint: disable=import-error,no-name-in-module
import fiftyone.brain as fob
import fiftyone.brain.config as fobc


_TABLE_FORMAT = "simple"
_MAX_CONSTANT_VALUE_COL_WIDTH = 79


class Command(object):
    """Interface for defining commands.

    Command instances must implement the `setup()` method, and they should
    implement the `execute()` method if they perform any functionality beyond
    defining subparsers.
    """

    @staticmethod
    def setup(parser):
        """Setup the command-line arguments for the command.

        Args:
            parser: an `argparse.ArgumentParser` instance
        """
        raise NotImplementedError("subclass must implement setup()")

    @staticmethod
    def execute(parser, args):
        """Executes the command on the given args.

        args:
            parser: the `argparse.ArgumentParser` instance for the command
            args: an `argparse.Namespace` instance containing the arguments
                for the command
        """
        raise NotImplementedError("subclass must implement execute()")


class FiftyOneCommand(Command):
    """The FiftyOne command-line interface."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "quickstart", QuickstartCommand)
        _register_command(subparsers, "annotation", AnnotationCommand)
        _register_command(subparsers, "brain", BrainCommand)
        _register_command(subparsers, "evaluation", EvaluationCommand)
        _register_command(subparsers, "app", AppCommand)
        _register_command(subparsers, "config", ConfigCommand)
        _register_command(subparsers, "constants", ConstantsCommand)
        _register_command(subparsers, "convert", ConvertCommand)
        _register_command(subparsers, "datasets", DatasetsCommand)
        _register_command(subparsers, "migrate", MigrateCommand)
        _register_command(subparsers, "operators", OperatorsCommand)
        _register_command(subparsers, "delegated", DelegatedCommand)
        _register_command(subparsers, "plugins", PluginsCommand)
        _register_command(subparsers, "utils", UtilsCommand)
        _register_command(subparsers, "zoo", ZooCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class QuickstartCommand(Command):
    """Launch a FiftyOne quickstart.

    Examples::

        # Launch the quickstart
        fiftyone quickstart

        # Launch the quickstart with a video dataset
        fiftyone quickstart --video

        # Launch the quickstart as a remote session
        fiftyone quickstart --remote
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-v",
            "--video",
            action="store_true",
            help="launch the quickstart with a video dataset",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=None,
            type=int,
            help="the port number to use",
        )
        parser.add_argument(
            "-A",
            "--address",
            metavar="ADDRESS",
            default=None,
            type=str,
            help="the address (server name) to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote App session",
        )
        parser.add_argument(
            "-w",
            "--wait",
            metavar="WAIT",
            default=3,
            type=float,
            help=(
                "the number of seconds to wait for a new App connection "
                "before returning if all connections are lost. If negative, "
                "the process will wait forever, regardless of connections"
            ),
        )

    @staticmethod
    def execute(parser, args):
        _, session = fouq.quickstart(
            video=args.video,
            port=args.port,
            address=args.address,
            remote=args.remote,
        )

        _watch_session(session, args.wait)


class ConfigCommand(Command):
    """Tools for working with your FiftyOne config.

    Examples::

        # Print your entire config
        fiftyone config

        # Print a specific config field
        fiftyone config <field>

        # Print the location of your config on disk (if one exists)
        fiftyone config --locate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field", nargs="?", metavar="FIELD", help="a config field to print"
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your config on disk",
        )

    @staticmethod
    def execute(parser, args):
        if args.locate:
            config_path = focg.locate_config()
            print(config_path)
            return

        if args.field:
            field = getattr(fo.config, args.field)
            if etau.is_str(field):
                print(field)
            else:
                print(etas.json_to_str(field))
        else:
            print(fo.config)


class ConstantsCommand(Command):
    """Print constants from `fiftyone.constants`.

    Examples::

        # Print all constants
        fiftyone constants

        # Print a specific constant
        fiftyone constants <CONSTANT>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "constant",
            nargs="?",
            metavar="CONSTANT",
            help="the constant to print",
        )

    @staticmethod
    def execute(parser, args):
        if args.constant:
            print(getattr(foc, args.constant))
            return

        # Print all constants
        _print_constants_table(
            {
                k: v
                for k, v in vars(foc).items()
                if not k.startswith("_") and k == k.upper()
            }
        )


def _print_constants_table(d):
    contents = sorted(
        ((k, _render_constant_value(v)) for k, v in d.items()),
        key=lambda kv: kv[0],
    )
    table_str = tabulate(
        contents, headers=["constant", "value"], tablefmt=_TABLE_FORMAT
    )
    print(table_str)


def _render_constant_value(value):
    value = str(value)
    if (
        _MAX_CONSTANT_VALUE_COL_WIDTH is not None
        and len(value) > _MAX_CONSTANT_VALUE_COL_WIDTH
    ):
        value = value[: (_MAX_CONSTANT_VALUE_COL_WIDTH - 4)] + " ..."

    return value


class ConvertCommand(Command):
    """Convert datasets on disk between supported formats.

    Examples::

        # Convert an image classification directory tree to TFRecords format
        fiftyone convert \\
            --input-dir /path/to/image-classification-directory-tree \\
            --input-type fiftyone.types.ImageClassificationDirectoryTree \\
            --output-dir /path/for/tf-image-classification-dataset \\
            --output-type fiftyone.types.TFImageClassificationDataset

        # Convert a COCO detection dataset to CVAT image format
        fiftyone convert \\
            --input-dir /path/to/coco-detection-dataset \\
            --input-type fiftyone.types.COCODetectionDataset \\
            --output-dir /path/for/cvat-image-dataset \\
            --output-type fiftyone.types.CVATImageDataset

        # Perform a customized conversion via optional kwargs
        fiftyone convert \\
            --input-dir /path/to/coco-detection-dataset \\
            --input-type fiftyone.types.COCODetectionDataset \\
            --input-kwargs max_samples=100 shuffle=True \\
            --output-dir /path/for/cvat-image-dataset \\
            --output-type fiftyone.types.TFObjectDetectionDataset \\
            --output-kwargs force_rgb=True \\
            --overwrite
    """

    @staticmethod
    def setup(parser):
        required = parser.add_argument_group("required arguments")
        required.add_argument(
            "--input-type",
            metavar="INPUT_TYPE",
            help="the fiftyone.types.Dataset type of the input dataset",
            required=True,
        )
        required.add_argument(
            "--output-type",
            metavar="OUTPUT_TYPE",
            help="the fiftyone.types.Dataset type to output",
            required=True,
        )

        parser.add_argument(
            "--input-dir",
            metavar="INPUT_DIR",
            help="the directory containing the dataset",
        )
        parser.add_argument(
            "--input-kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional keyword arguments for "
                "`fiftyone.utils.data.convert_dataset(..., input_kwargs=)`"
            ),
        )
        parser.add_argument(
            "--output-dir",
            metavar="OUTPUT_DIR",
            help="the directory to which to write the output dataset",
        )
        parser.add_argument(
            "--output-kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional keyword arguments for "
                "`fiftyone.utils.data.convert_dataset(..., output_kwargs=)`"
            ),
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite an existing output directory",
        )

    @staticmethod
    def execute(parser, args):
        foud.convert_dataset(
            input_dir=args.input_dir,
            input_type=etau.get_class(args.input_type),
            input_kwargs=args.input_kwargs,
            output_dir=args.output_dir,
            output_type=etau.get_class(args.output_type),
            output_kwargs=args.output_kwargs,
            overwrite=args.overwrite,
        )


class DatasetsCommand(Command):
    """Tools for working with FiftyOne datasets."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", DatasetsListCommand)
        _register_command(subparsers, "info", DatasetsInfoCommand)
        _register_command(subparsers, "stats", DatasetsStatsCommand)
        _register_command(subparsers, "create", DatasetsCreateCommand)
        _register_command(subparsers, "head", DatasetsHeadCommand)
        _register_command(subparsers, "tail", DatasetsTailCommand)
        _register_command(subparsers, "stream", DatasetsStreamCommand)
        _register_command(subparsers, "export", DatasetsExportCommand)
        _register_command(subparsers, "draw", DatasetsDrawCommand)
        _register_command(subparsers, "rename", DatasetsRenameCommand)
        _register_command(subparsers, "delete", DatasetsDeleteCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DatasetsListCommand(Command):
    """List FiftyOne datasets.

    Examples::

        # List available datasets
        fiftyone datasets list

        # List datasets matching a given pattern
        fiftyone datasets list --glob-patt 'quickstart-*'

        # List datasets with the given tag(s)
        fiftyone datasets list --tags automotive healthcare
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-p",
            "--glob-patt",
            metavar="PATT",
            help="an optional glob pattern of dataset names to include",
        )
        parser.add_argument(
            "-t",
            "--tags",
            metavar="TAG",
            nargs="+",
            help="only show datasets with the given tag(s)",
        )

    @staticmethod
    def execute(parser, args):
        datasets = fod.list_datasets(glob_patt=args.glob_patt, tags=args.tags)

        if datasets:
            for dataset in datasets:
                print(dataset)
        else:
            print("No datasets found")


class DatasetsInfoCommand(Command):
    """Print information about FiftyOne datasets.

    Examples::

        # Print basic information about multiple datasets
        fiftyone datasets info
        fiftyone datasets info --glob-patt 'quickstart-*'
        fiftyone datasets info --tags automotive healthcare
        fiftyone datasets info --sort-by created_at
        fiftyone datasets info --sort-by name --reverse

        # Print information about a specific dataset
        fiftyone datasets info <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            nargs="?",
            metavar="NAME",
            help="the name of a dataset",
        )
        parser.add_argument(
            "-p",
            "--glob-patt",
            metavar="PATT",
            help="an optional glob pattern of dataset names to include",
        )
        parser.add_argument(
            "-t",
            "--tags",
            metavar="TAG",
            nargs="+",
            help="only show datasets with the given tag(s)",
        )
        parser.add_argument(
            "-s",
            "--sort-by",
            metavar="FIELD",
            default="last_loaded_at",
            help="a field to sort the dataset rows by",
        )
        parser.add_argument(
            "-r",
            "--reverse",
            action="store_true",
            help="whether to print the results in reverse order",
        )

    @staticmethod
    def execute(parser, args):
        if args.name:
            _print_dataset_info(args.name)
        else:
            _print_all_dataset_info(
                args.glob_patt, args.tags, args.sort_by, args.reverse
            )


def _print_dataset_info(name):
    dataset = fod.load_dataset(name)
    print(dataset)


def _print_all_dataset_info(glob_patt, tags, sort_by, reverse):
    info = fod.list_datasets(glob_patt=glob_patt, tags=tags, info=True)

    headers = [
        "name",
        "created_at",
        "last_loaded_at",
        "version",
        "persistent",
        "media_type",
        "tags",
    ]

    if sort_by in headers:
        key = lambda d: (d[sort_by] is not None, d[sort_by])
        info = sorted(info, key=key, reverse=not reverse)
    else:
        print("Ignoring invalid sort-by field '%s'" % sort_by)

    records = [tuple(_format_cell(i[key]) for key in headers) for i in info]

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


def _format_cell(cell):
    if cell is True:
        return "\u2713"

    if cell is False:
        return ""

    if cell is None:
        return "???"

    if isinstance(cell, datetime):
        # display as "2023-11-02 02:54:47"
        return cell.replace(microsecond=0)

        """
        # display as "12 minutes ago"
        if cell.tzinfo is None:
            cell = cell.replace(tzinfo=pytz.utc).astimezone()
        return humanize.naturaltime(cell)
        """

    if etau.is_container(cell):
        return ",".join(cell)

    return cell


class DatasetsStatsCommand(Command):
    """Print stats about FiftyOne datasets on disk.

    Examples::

        # Print stats about the given dataset on disk
        fiftyone datasets stats <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            help="the name of the dataset",
        )
        parser.add_argument(
            "-m",
            "--include-media",
            action="store_true",
            help=(
                "whether to include stats about the size of the raw media in "
                "the dataset"
            ),
        )
        parser.add_argument(
            "-c",
            "--compressed",
            action="store_true",
            help=(
                "whether to return the sizes of collections in their "
                "compressed form on disk"
            ),
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        stats = dataset.stats(
            include_media=args.include_media, compressed=args.compressed
        )
        _print_dict_as_table(stats)


class DatasetsCreateCommand(Command):
    """Tools for creating FiftyOne datasets.

    Examples::

        # Create a dataset from the given data on disk
        fiftyone datasets create \\
            --name <name> --dataset-dir <dataset-dir> --type <type>

        # Create a dataset from a random subset of the data on disk
        fiftyone datasets create \\
            --name <name> --dataset-dir <dataset-dir> --type <type> \\
            --kwargs max_samples=50 shuffle=True

        # Create a dataset from the given samples JSON file
        fiftyone datasets create --json-path <json-path>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-n",
            "--name",
            metavar="NAME",
            help="a name for the dataset",
        )
        parser.add_argument(
            "-d",
            "--dataset-dir",
            metavar="DATASET_DIR",
            help="the directory containing the dataset",
        )
        parser.add_argument(
            "-j",
            "--json-path",
            metavar="JSON_PATH",
            help="the path to a samples JSON file to load",
        )
        parser.add_argument(
            "-t",
            "--type",
            metavar="TYPE",
            help="the fiftyone.types.Dataset type of the dataset",
        )
        parser.add_argument(
            "-k",
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional type-specific keyword arguments for "
                "`fiftyone.core.dataset.Dataset.from_dir()`"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        dataset_dir = args.dataset_dir
        json_path = args.json_path
        dataset_type = etau.get_class(args.type) if args.type else None
        kwargs = args.kwargs or {}

        if json_path:
            dataset = fod.Dataset.from_json(json_path, name=name)
        else:
            dataset = fod.Dataset.from_dir(
                dataset_dir=dataset_dir,
                dataset_type=dataset_type,
                name=name,
                **kwargs,
            )

        dataset.persistent = True

        print("Dataset '%s' created" % dataset.name)


class DatasetsHeadCommand(Command):
    """Prints the first few samples in a FiftyOne dataset.

    Examples::

        # Print the first few samples in a dataset
        fiftyone datasets head <name>

        # Print the given number of samples from the head of a dataset
        fiftyone datasets head <name> --num-samples <num-samples>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-n",
            "--num-samples",
            metavar="NUM_SAMPLES",
            type=int,
            default=3,
            help="the number of samples to print",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        num_samples = args.num_samples

        dataset = fod.load_dataset(name)
        for sample in dataset.head(num_samples=num_samples):
            print(sample)


class DatasetsTailCommand(Command):
    """Prints the last few samples in a FiftyOne dataset.

    Examples::

        # Print the last few samples in a dataset
        fiftyone datasets tail <name>

        # Print the given number of samples from the tail of a dataset
        fiftyone datasets tail <name> --num-samples <num-samples>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-n",
            "--num-samples",
            metavar="NUM_SAMPLES",
            type=int,
            default=3,
            help="the number of samples to print",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        num_samples = args.num_samples

        dataset = fod.load_dataset(name)
        for sample in dataset.tail(num_samples=num_samples):
            print(sample)


class DatasetsStreamCommand(Command):
    """Stream samples in a FiftyOne dataset to the terminal.

    Examples::

        # Stream the samples of the dataset to the terminal
        fiftyone datasets stream <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        fou.stream_objects(dataset)


class DatasetsExportCommand(Command):
    """Export FiftyOne datasets to disk in supported formats.

    Examples::

        # Export the dataset to disk in the specified format
        fiftyone datasets export <name> \\
            --export-dir <export-dir> --type <type> --label-field <label-field>

        # Export the dataset to disk in JSON format
        fiftyone datasets export <name> --json-path <json-path>

        # Only export cats and dogs from the validation split
        fiftyone datasets export <name> \\
            --filters tags=validation ground_truth=cat,dog \\
            --export-dir <export-dir> --type <type> --label-field ground_truth

        # Perform a customized export of a dataset
        fiftyone datasets export <name> \\
            --type <type> \\
            --kwargs labels_path=/path/for/labels.json
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            help="the name of the dataset to export",
        )
        parser.add_argument(
            "-d",
            "--export-dir",
            metavar="EXPORT_DIR",
            help="the directory in which to export the dataset",
        )
        parser.add_argument(
            "-j",
            "--json-path",
            metavar="JSON_PATH",
            help="the path to export the dataset in JSON format",
        )
        parser.add_argument(
            "-f",
            "--label-field",
            metavar="LABEL_FIELD",
            help="the name of the label field to export",
        )
        parser.add_argument(
            "-t",
            "--type",
            metavar="TYPE",
            help="the fiftyone.types.Dataset type in which to export",
        )
        parser.add_argument(
            "--filters",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "specific sample tags or class labels to export. To use "
                "sample tags, pass tags as `tags=train,val` and to use label "
                "filters, pass label field and values as in "
                "ground_truth=car,person,dog"
            ),
        )
        parser.add_argument(
            "-k",
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional type-specific keyword arguments for "
                "`fiftyone.core.collections.SampleCollection.export()`"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        export_dir = args.export_dir
        json_path = args.json_path
        dataset_type = etau.get_class(args.type) if args.type else None
        label_field = args.label_field
        label_filters = args.filters or {}
        tags = label_filters.pop("tags", [])
        kwargs = args.kwargs or {}

        dataset = fod.load_dataset(name)

        if tags:
            dataset = dataset.match_tags(tags)

        for field_name, labels in label_filters.items():
            dataset = dataset.filter_labels(
                field_name, F("label").is_in(labels)
            )

        if json_path:
            dataset.write_json(json_path)
            print("Dataset '%s' exported to '%s'" % (name, json_path))
        else:
            dataset.export(
                export_dir=export_dir,
                dataset_type=dataset_type,
                label_field=label_field,
                **kwargs,
            )

            if export_dir:
                print("Dataset '%s' exported to '%s'" % (name, export_dir))
            else:
                print("Dataset '%s' export complete" % name)


class DatasetsDrawCommand(Command):
    """Renders annotated versions of samples in FiftyOne datasets to disk.

    Examples::

        # Write annotated versions of the media in the dataset with the
        # specified label field(s) overlaid to disk
        fiftyone datasets draw <name> \\
            --output-dir <output-dir> --label-fields <list>,<of>,<fields>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            help="the name of the dataset",
        )
        parser.add_argument(
            "-d",
            "--output-dir",
            metavar="OUTPUT_DIR",
            help="the directory to write the annotated media",
        )
        parser.add_argument(
            "-f",
            "--label-fields",
            metavar="LABEL_FIELDS",
            help="a comma-separated list of label fields to export",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        output_dir = args.output_dir
        label_fields = args.label_fields

        dataset = fod.load_dataset(name)

        if label_fields is not None:
            label_fields = [f.strip() for f in label_fields.split(",")]

        dataset.draw_labels(output_dir, label_fields=label_fields)
        print("Rendered media written to '%s'" % output_dir)


class DatasetsRenameCommand(Command):
    """Rename FiftyOne datasets.

    Examples::

        # Rename the dataset
        fiftyone datasets rename <old-name> <new-name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            help="the name of the dataset",
        )
        parser.add_argument(
            "new_name",
            metavar="NEW_NAME",
            help="a new name for the dataset",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        new_name = args.new_name

        dataset = fod.load_dataset(name)
        dataset.name = new_name
        print("Dataset '%s' renamed to '%s'" % (name, new_name))


class DatasetsDeleteCommand(Command):
    """Delete FiftyOne datasets.

    Examples::

        # Delete the datasets with the given name(s)
        fiftyone datasets delete <name1> <name2> ...

        # Delete the datasets whose names match the given glob pattern
        fiftyone datasets delete --glob-patt <glob-patt>

        # Delete all non-persistent datasets
        fiftyone datasets delete --non-persistent
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            nargs="*",
            help="the dataset name(s) to delete",
        )
        parser.add_argument(
            "-g",
            "--glob-patt",
            metavar="GLOB_PATT",
            help="a glob pattern of datasets to delete",
        )
        parser.add_argument(
            "--non-persistent",
            action="store_true",
            help="delete all non-persistent datasets",
        )

    @staticmethod
    def execute(parser, args):
        for name in args.name:
            fod.delete_dataset(name, verbose=True)

        if args.glob_patt:
            fod.delete_datasets(args.glob_patt, verbose=True)

        if args.non_persistent:
            fod.delete_non_persistent_datasets(verbose=True)


class AnnotationCommand(Command):
    """Tools for working with the FiftyOne annotation API."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "config", AnnotationConfigCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class AnnotationConfigCommand(Command):
    """Tools for working with your FiftyOne annotation config.

    Examples::

        # Print your entire annotation config
        fiftyone annotation config

        # Print a specific annotation config field
        fiftyone annotation config <field>

        # Print the location of your annotation config on disk (if one exists)
        fiftyone annotation config --locate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field",
            nargs="?",
            metavar="FIELD",
            help="an annotation config field to print",
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your annotation config on disk",
        )

    @staticmethod
    def execute(parser, args):
        if args.locate:
            annotation_config_path = focg.locate_annotation_config()
            print(annotation_config_path)
            return

        if args.field:
            field = getattr(fo.annotation_config, args.field)
            if etau.is_str(field):
                print(field)
            else:
                print(etas.json_to_str(field))
        else:
            print(fo.annotation_config)


class AppCommand(Command):
    """Tools for working with the FiftyOne App."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "config", AppConfigCommand)
        _register_command(subparsers, "launch", AppLaunchCommand)
        _register_command(subparsers, "view", AppViewCommand)
        _register_command(subparsers, "connect", AppConnectCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class AppConfigCommand(Command):
    """Tools for working with your FiftyOne App config.

    Examples::

        # Print your entire App config
        fiftyone app config

        # Print a specific App config field
        fiftyone app config <field>

        # Print the location of your App config on disk (if one exists)
        fiftyone app config --locate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field",
            nargs="?",
            metavar="FIELD",
            help="an App config field to print",
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your App config on disk",
        )

    @staticmethod
    def execute(parser, args):
        if args.locate:
            app_config_path = focg.locate_app_config()
            print(app_config_path)
            return

        if args.field:
            field = getattr(fo.app_config, args.field)
            if etau.is_str(field):
                print(field)
            else:
                print(etas.json_to_str(field))
        else:
            print(fo.app_config)


class AppLaunchCommand(Command):
    """Launch the FiftyOne App.

    Examples::

        # Launch the App
        fiftyone app launch

        # Launch the App with the given dataset loaded
        fiftyone app launch <name>

        # Launch a remote App session
        fiftyone app launch ... --remote

        # Launch the App in the non-default browser
        fiftyone app launch ... --browser firefox
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            nargs="?",
            help="the name of a dataset to open",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=None,
            type=int,
            help="the port number to use",
        )
        parser.add_argument(
            "-A",
            "--address",
            metavar="ADDRESS",
            default=None,
            type=str,
            help="the address (server name) to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote App session",
        )
        parser.add_argument(
            "-b",
            "--browser",
            metavar="BROWSER",
            default=None,
            type=str,
            help="the browser to use to open the App",
        )
        parser.add_argument(
            "-w",
            "--wait",
            metavar="WAIT",
            default=3,
            type=float,
            help=(
                "the number of seconds to wait for a new App connection "
                "before returning if all connections are lost. If negative, "
                "the process will wait forever, regardless of connections"
            ),
        )

    @staticmethod
    def execute(parser, args):
        if args.name:
            dataset = fod.load_dataset(args.name)
        else:
            dataset = None

        session = fos.launch_app(
            dataset=dataset,
            port=args.port,
            address=args.address,
            remote=args.remote,
            browser=args.browser,
        )

        _watch_session(session, args.wait)


def _watch_session(session, wait):
    # Automated tests may set `FIFTYONE_EXIT` so they can immediately exit
    if os.environ.get("FIFTYONE_EXIT", False):
        return

    try:
        print("\nTo exit, close the App or press ctrl + c\n")
        session.wait(wait)
    except KeyboardInterrupt:
        pass


def _wait():
    print("\nTo exit, press ctrl + c\n")

    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        pass


class AppViewCommand(Command):
    """View datasets in the App without persisting them to the database.

    Examples::

        # View a dataset stored on disk in the App
        fiftyone app view --dataset-dir <dataset-dir> --type <type>

        # View a zoo dataset in the App
        fiftyone app view --zoo-dataset <name> --splits <split1> ...

        # View a directory of images in the App
        fiftyone app view --images-dir <images-dir>

        # View a glob pattern of images in the App
        fiftyone app view --images-patt <images-patt>

        # View a directory of videos in the App
        fiftyone app view --videos-dir <videos-dir>

        # View a glob pattern of videos in the App
        fiftyone app view --videos-patt <videos-patt>

        # View a dataset stored in JSON format on disk in the App
        fiftyone app view --json-path <json-path>

        # View the dataset in a remote App session
        fiftyone app view ... --remote

        # View a random subset of the data stored on disk in the App
        fiftyone app view ... --kwargs max_samples=50 shuffle=True
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-n", "--name", metavar="NAME", help="a name for the dataset"
        )
        parser.add_argument(
            "-d",
            "--dataset-dir",
            metavar="DATASET_DIR",
            help="the directory containing the dataset to view",
        )
        parser.add_argument(
            "-t",
            "--type",
            metavar="TYPE",
            help="the fiftyone.types.Dataset type of the dataset",
        )
        parser.add_argument(
            "-z",
            "--zoo-dataset",
            metavar="NAME",
            help="the name of a zoo dataset to view",
        )
        parser.add_argument(
            "-s",
            "--splits",
            metavar="SPLITS",
            nargs="+",
            help="the dataset splits to load",
        )
        parser.add_argument(
            "--images-dir",
            metavar="IMAGES_DIR",
            help="the path to a directory of images",
        )
        parser.add_argument(
            "--images-patt",
            metavar="IMAGES_PATT",
            help="a glob pattern of images",
        )
        parser.add_argument(
            "--videos-dir",
            metavar="VIDEOS_DIR",
            help="the path to a directory of videos",
        )
        parser.add_argument(
            "--videos-patt",
            metavar="VIDEOS_PATT",
            help="a glob pattern of videos",
        )
        parser.add_argument(
            "-j",
            "--json-path",
            metavar="JSON_PATH",
            help="the path to a samples JSON file to view",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=None,
            type=int,
            help="the port number to use",
        )
        parser.add_argument(
            "-A",
            "--address",
            metavar="ADDRESS",
            default=None,
            type=str,
            help="the address (server name) to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote App session",
        )
        parser.add_argument(
            "-w",
            "--wait",
            metavar="WAIT",
            default=3,
            type=float,
            help=(
                "the number of seconds to wait for a new App connection "
                "before returning if all connections are lost. If negative, "
                "the process will wait forever, regardless of connections"
            ),
        )
        parser.add_argument(
            "-k",
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional type-specific keyword arguments for "
                "`fiftyone.core.dataset.Dataset.from_dir()`"
            ),
        )

    @staticmethod
    def execute(parser, args):
        if args.zoo_dataset:
            # View a zoo dataset
            name = args.zoo_dataset
            splits = args.splits
            dataset_dir = args.dataset_dir
            kwargs = args.kwargs or {}

            dataset = fozd.load_zoo_dataset(
                name, splits=splits, dataset_dir=dataset_dir, **kwargs
            )
        elif args.images_dir:
            # View a directory of images
            name = args.name
            images_dir = args.images_dir
            dataset = fod.Dataset.from_images_dir(images_dir, name=name)
        elif args.images_patt:
            # View a glob pattern of images
            name = args.name
            images_patt = args.images_patt
            dataset = fod.Dataset.from_images_patt(images_patt, name=name)
        elif args.videos_dir:
            # View a directory of images
            name = args.name
            videos_dir = args.videos_dir
            dataset = fod.Dataset.from_videos_dir(videos_dir, name=name)
        elif args.videos_patt:
            # View a glob pattern of videos
            name = args.name
            videos_patt = args.videos_patt
            dataset = fod.Dataset.from_videos_patt(videos_patt, name=name)
        elif args.json_path:
            # View a dataset from a JSON file
            name = args.name
            json_path = args.json_path
            dataset = fod.Dataset.from_json(json_path, name=name)
        else:
            # View a dataset from disk
            name = args.name
            dataset_dir = args.dataset_dir
            dataset_type = etau.get_class(args.type)
            kwargs = args.kwargs or {}

            dataset = fod.Dataset.from_dir(
                dataset_dir=dataset_dir,
                dataset_type=dataset_type,
                name=name,
                **kwargs,
            )

        session = fos.launch_app(
            dataset=dataset,
            port=args.port,
            address=args.address,
            remote=args.remote,
        )

        _watch_session(session, args.wait)


class AppConnectCommand(Command):
    """Connect to a remote FiftyOne App in your web browser.

    Examples::

        # Connect to a remote App with port forwarding already configured
        fiftyone app connect

        # Connect to a remote App session
        fiftyone app connect --destination <destination> --port <port>

        # Connect to a remote App session using an ssh key
        fiftyone app connect ... --ssh-key <path/to/key>

        # Connect to a remote App using a custom local port
        fiftyone app connect ... --local-port <port>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-d",
            "--destination",
            metavar="DESTINATION",
            type=str,
            help="the destination to connect to, e.g., [username@]hostname",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=None,
            type=int,
            help="the remote port to connect to",
        )
        parser.add_argument(
            "-l",
            "--local-port",
            metavar="PORT",
            default=None,
            type=int,
            help="the local port to use to serve the App",
        )
        parser.add_argument(
            "-i",
            "--ssh-key",
            metavar="KEY",
            default=None,
            type=str,
            help="optional ssh key to use to login",
        )

    @staticmethod
    def execute(parser, args):
        remote_port = args.port or fo.config.default_app_port
        local_port = args.local_port or fo.config.default_app_port

        if args.destination:
            if sys.platform.startswith("win"):
                raise RuntimeError(
                    "This command is currently not supported on Windows"
                )

            control_path = os.path.join(
                foc.FIFTYONE_CONFIG_DIR, "tmp", "ssh.sock"
            )
            etau.ensure_basedir(control_path)

            ssh_call = [
                "ssh",
                "-f",
                "-N",
                "-M",
                "-S",
                control_path,
                "-L",
                "%d:127.0.0.1:%d" % (local_port, remote_port),
            ]

            if args.ssh_key:
                ssh_call += ["-i", args.ssh_key]

            ssh_call.append(args.destination)

            # Port forwarding
            ret = subprocess.call(ssh_call)
            if ret != 0:
                print("ssh failed with exit code %r" % ret)
                return

            def stop_port_forward():
                subprocess.call(
                    [
                        "ssh",
                        "-S",
                        control_path,
                        "-O",
                        "exit",
                        args.destination,
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

            fou.call_on_exit(stop_port_forward)

        url = "http://localhost:%d/" % local_port
        webbrowser.open(url, new=2)

        _wait()


class BrainCommand(Command):
    """Tools for working with the FiftyOne Brain."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "config", BrainConfigCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class BrainConfigCommand(Command):
    """Tools for working with your FiftyOne Brain config.

    Examples::

        # Print your entire brain config
        fiftyone brain config

        # Print a specific brain config field
        fiftyone brain config <field>

        # Print the location of your brain config on disk (if one exists)
        fiftyone brain config --locate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field",
            nargs="?",
            metavar="FIELD",
            help="a brain config field to print",
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your brain config on disk",
        )

    @staticmethod
    def execute(parser, args):
        if args.locate:
            brain_config_path = fobc.locate_brain_config()
            print(brain_config_path)
            return

        if args.field:
            field = getattr(fob.brain_config, args.field)
            if etau.is_str(field):
                print(field)
            else:
                print(etas.json_to_str(field))
        else:
            print(fob.brain_config)


class EvaluationCommand(Command):
    """Tools for working with the FiftyOne evaluation API."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "config", EvaluationConfigCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class EvaluationConfigCommand(Command):
    """Tools for working with your FiftyOne evaluation config.

    Examples::

        # Print your entire evaluation config
        fiftyone evaluation config

        # Print a specific evaluation config field
        fiftyone evaluation config <field>

        # Print the location of your evaluation config on disk (if one exists)
        fiftyone evaluation config --locate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field",
            nargs="?",
            metavar="FIELD",
            help="an evaluation config field to print",
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your evaluation config on disk",
        )

    @staticmethod
    def execute(parser, args):
        if args.locate:
            evaluation_config_path = focg.locate_evaluation_config()
            print(evaluation_config_path)
            return

        if args.field:
            field = getattr(fo.evaluation_config, args.field)
            if etau.is_str(field):
                print(field)
            else:
                print(etas.json_to_str(field))
        else:
            print(fo.evaluation_config)


class ZooCommand(Command):
    """Tools for working with the FiftyOne Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "datasets", DatasetZooCommand)
        _register_command(subparsers, "models", ModelZooCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DatasetZooCommand(Command):
    """Tools for working with the FiftyOne Dataset Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", DatasetZooListCommand)
        _register_command(subparsers, "find", DatasetZooFindCommand)
        _register_command(subparsers, "info", DatasetZooInfoCommand)
        _register_command(subparsers, "download", DatasetZooDownloadCommand)
        _register_command(subparsers, "load", DatasetZooLoadCommand)
        _register_command(subparsers, "delete", DatasetZooDeleteCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DatasetZooListCommand(Command):
    """List datasets in the FiftyOne Dataset Zoo.

    Examples::

        # List available datasets
        fiftyone zoo datasets list

        # List available dataset names
        fiftyone zoo datasets list --names-only

        # List downloaded datasets
        fiftyone zoo datasets list --downloaded-only

        # List available datasets from the given source
        fiftyone zoo datasets list --source <source>

        # List available datasets with the given tag
        fiftyone zoo datasets list --tags <tag>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-n",
            "--names-only",
            action="store_true",
            help="only show dataset names",
        )
        parser.add_argument(
            "-d",
            "--downloaded-only",
            action="store_true",
            help="only show datasets that have been downloaded",
        )
        parser.add_argument(
            "-s",
            "--source",
            metavar="SOURCE",
            help="only show datasets available from the specified source",
        )
        parser.add_argument(
            "-t",
            "--tags",
            metavar="TAGS",
            help="only show datasets with the specified tag or list,of,tags",
        )

    @staticmethod
    def execute(parser, args):
        names_only = args.names_only
        downloaded_only = args.downloaded_only
        match_source = args.source
        match_tags = args.tags

        downloaded_datasets = fozd.list_downloaded_zoo_datasets()
        all_datasets, all_sources, default_source = fozd._get_zoo_datasets()

        _print_zoo_dataset_list(
            downloaded_datasets,
            all_datasets,
            all_sources,
            default_source,
            downloaded_only=downloaded_only,
            match_tags=match_tags,
            match_source=match_source,
            names_only=names_only,
        )


def _print_zoo_dataset_list(
    downloaded_datasets,
    all_datasets,
    all_sources,
    default_source,
    downloaded_only=False,
    match_tags=None,
    match_source=None,
    names_only=False,
):
    if match_tags is not None:
        match_tags = match_tags.split(",")

    available_datasets = defaultdict(dict)
    for source, datasets in all_datasets.items():
        for name, zoo_dataset in datasets.items():
            available_datasets[name][source] = zoo_dataset

    records = []

    # Iterate over available datasets
    for name in sorted(available_datasets):
        if downloaded_only and name not in downloaded_datasets:
            continue

        dataset_sources = available_datasets[name]

        if match_source is not None and match_source not in dataset_sources:
            continue

        tags = None
        for source, zoo_dataset in dataset_sources.items():
            if tags is None or source == default_source:
                tags = zoo_dataset.tags

        if (match_tags is not None) and (
            tags is None or not all(tag in tags for tag in match_tags)
        ):
            continue

        # Check for downloaded splits
        if name in downloaded_datasets:
            dataset_dir, info = downloaded_datasets[name]
        else:
            dataset_dir, info = None, None

        if names_only:
            records.append(name)
            continue

        # Get available splits across all sources
        splits = set()
        for zoo_dataset in dataset_sources.values():
            if zoo_dataset.has_splits:
                splits.update(zoo_dataset.supported_splits)
            else:
                splits.add("")

        # Iterate over available splits
        for split in sorted(splits):
            # Get available sources for the split
            srcs = []
            for source in all_sources:
                if source not in dataset_sources:
                    srcs.append("")
                    continue

                zoo_dataset = dataset_sources[source]
                if split and zoo_dataset.has_split(split):
                    srcs.append("\u2713")
                elif not split and not zoo_dataset.has_splits:
                    srcs.append("\u2713")
                else:
                    srcs.append("")

            # Get split directory
            if not split and dataset_dir:
                split_dir = dataset_dir
            elif split and info and info.is_split_downloaded(split):
                split_dir = zoo_dataset.get_split_dir(dataset_dir, split)
            else:
                split_dir = ""

            if downloaded_only and not split_dir:
                continue

            tags_str = ",".join(tags) if tags else ""
            is_downloaded = "\u2713" if split_dir else ""

            records.append(
                (name, tags_str, split, is_downloaded, split_dir) + tuple(srcs)
            )

    if names_only:
        for name in records:
            print(name)

        return

    headers = ["name", "tags", "split", "downloaded", "dataset_dir"]
    for source in all_sources:
        if source == default_source:
            source += " (*)"

        headers.append(source)

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class DatasetZooFindCommand(Command):
    """Locate a downloaded zoo dataset on disk.

    Examples::

        # Print the location of a downloaded zoo dataset on disk
        fiftyone zoo datasets find <name>

        # Print the location of a remotely-sourced zoo dataset on disk
        fiftyone zoo datasets find https://github.com/<user>/<repo>
        fiftyone zoo datasets find <url>

        # Print the location of a specific split of a dataset
        fiftyone zoo datasets find <name> --split <split>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the dataset",
        )
        parser.add_argument(
            "-s",
            "--split",
            metavar="SPLIT",
            help="a dataset split",
        )

    @staticmethod
    def execute(parser, args):
        name_or_url = args.name_or_url
        split = args.split

        dataset_dir = fozd.find_zoo_dataset(name_or_url, split=split)
        print(dataset_dir)


class DatasetZooInfoCommand(Command):
    """Print information about datasets in the FiftyOne Dataset Zoo.

    Examples::

        # Print information about a zoo dataset
        fiftyone zoo datasets info <name>

        # Print information about a remote zoo dataset
        fiftyone zoo datasets info https://github.com/<user>/<repo>
        fiftyone zoo datasets info <url>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the dataset",
        )

    @staticmethod
    def execute(parser, args):
        name_or_url = args.name_or_url

        zoo_dataset = fozd.get_zoo_dataset(name_or_url)

        try:
            dataset_dir = fozd.find_zoo_dataset(name_or_url)
        except:
            dataset_dir = None

        if zoo_dataset.is_remote:
            _print_dict_as_table(zoo_dataset.metadata)
            print("")
        else:
            description = textwrap.dedent("    " + zoo_dataset.__doc__)
            if description:
                print("***** Dataset description *****\n%s" % description)

            if zoo_dataset.has_tags:
                print("***** Tags *****")
                print("%s\n" % ", ".join(zoo_dataset.tags))

            if zoo_dataset.has_splits:
                print("***** Supported splits *****")
                print("%s\n" % ", ".join(zoo_dataset.supported_splits))

        print("***** Dataset location *****")
        if dataset_dir is not None:
            print(dataset_dir)
        else:
            print("Dataset '%s' is not downloaded" % name_or_url)


class DatasetZooDownloadCommand(Command):
    """Download zoo datasets.

    When downloading remotely-sourced zoo datasets, you can provide any of the
    following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Download a zoo dataset
        fiftyone zoo datasets download <name>

        # Download a remotely-sourced zoo dataset
        fiftyone zoo datasets download https://github.com/<user>/<repo>
        fiftyone zoo datasets download <url>

        # Download the specified split(s) of a zoo dataset
        fiftyone zoo datasets download <name> --splits <split1> ...

        # Download a zoo dataset that requires extra keyword arguments
        fiftyone zoo datasets download <name> \\
            --kwargs source_dir=/path/to/source/files
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the dataset",
        )
        parser.add_argument(
            "-s",
            "--splits",
            metavar="SPLITS",
            nargs="+",
            help="the dataset splits to download",
        )
        parser.add_argument(
            "-k",
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "optional dataset-specific keyword arguments for "
                "`fiftyone.zoo.download_zoo_dataset()`"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name_or_url = args.name_or_url
        splits = args.splits
        kwargs = args.kwargs or {}

        fozd.download_zoo_dataset(name_or_url, splits=splits, **kwargs)


class DatasetZooLoadCommand(Command):
    """Load zoo datasets as persistent FiftyOne datasets.

    When loading remotely-sourced zoo datasets, you can provide any of the
    following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Load the zoo dataset with the given name
        fiftyone zoo datasets load <name>

        # Load a remotely-sourced zoo dataset
        fiftyone zoo datasets load https://github.com/<user>/<repo>
        fiftyone zoo datasets load <url>

        # Load the specified split(s) of a zoo dataset
        fiftyone zoo datasets load <name> --splits <split1> ...

        # Load a zoo dataset with a custom name
        fiftyone zoo datasets load <name> --dataset-name <dataset-name>

        # Load a zoo dataset that requires custom keyword arguments
        fiftyone zoo datasets load <name> \\
            --kwargs source_dir=/path/to/source_files

        # Load a random subset of a zoo dataset
        fiftyone zoo datasets load <name> \\
            --kwargs max_samples=50 shuffle=True
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the dataset",
        )
        parser.add_argument(
            "-s",
            "--splits",
            metavar="SPLITS",
            nargs="+",
            help="the dataset splits to load",
        )
        parser.add_argument(
            "-n",
            "--dataset-name",
            metavar="DATASET_NAME",
            help="a custom name to give the FiftyOne dataset",
        )
        parser.add_argument(
            "-k",
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional dataset-specific keyword arguments for "
                "`fiftyone.zoo.load_zoo_dataset()`"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name_or_url = args.name_or_url
        splits = args.splits
        dataset_name = args.dataset_name
        kwargs = args.kwargs or {}

        dataset = fozd.load_zoo_dataset(
            name_or_url,
            splits=splits,
            dataset_name=dataset_name,
            persistent=True,
            **kwargs,
        )


class DatasetZooDeleteCommand(Command):
    """Deletes the local copy of the zoo dataset on disk.

    Examples::

        # Delete a zoo dataset from disk
        fiftyone zoo datasets delete <name>

        # Delete a remotely-sourced zoo dataset from disk
        fiftyone zoo datasets delete https://github.com/<user>/<repo>
        fiftyone zoo datasets delete <url>

        # Delete a specific split of a zoo dataset from disk
        fiftyone zoo datasets delete <name> --split <split>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the dataset",
        )
        parser.add_argument(
            "-s",
            "--split",
            metavar="SPLIT",
            help="a dataset split",
        )

    @staticmethod
    def execute(parser, args):
        name_or_url = args.name_or_url
        split = args.split
        fozd.delete_zoo_dataset(name_or_url, split=split)


class ModelZooCommand(Command):
    """Tools for working with the FiftyOne Model Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", ModelZooListCommand)
        _register_command(subparsers, "find", ModelZooFindCommand)
        _register_command(subparsers, "info", ModelZooInfoCommand)
        _register_command(
            subparsers, "requirements", ModelZooRequirementsCommand
        )
        _register_command(subparsers, "download", ModelZooDownloadCommand)
        _register_command(subparsers, "apply", ModelZooApplyCommand)
        _register_command(subparsers, "embed", ModelZooEmbedCommand)
        _register_command(subparsers, "delete", ModelZooDeleteCommand)
        _register_command(
            subparsers, "list-sources", ModelZooListSourcesCommand
        )
        _register_command(
            subparsers, "register-source", ModelZooRegisterSourceCommand
        )
        _register_command(
            subparsers, "delete-source", ModelZooDeleteSourceCommand
        )

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ModelZooListCommand(Command):
    """List models in the FiftyOne Model Zoo.

    Examples::

        # List available models
        fiftyone zoo models list

        # List available models (names only)
        fiftyone zoo models list --names-only

        # List downloaded models
        fiftyone zoo models list --downloaded-only

        # List available models with the given tag
        fiftyone zoo models list --tags <tag>

        # List available models from the given remote source
        fiftyone zoo models list --source <source>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-n",
            "--names-only",
            action="store_true",
            help="only show model names",
        )
        parser.add_argument(
            "-d",
            "--downloaded-only",
            action="store_true",
            help="only show models that have been downloaded",
        )
        parser.add_argument(
            "-t",
            "--tags",
            metavar="TAGS",
            help="only show models with the specified tag or list,of,tags",
        )
        parser.add_argument(
            "-s",
            "--source",
            metavar="SOURCE",
            help="only show models available from the specified remote source",
        )

    @staticmethod
    def execute(parser, args):
        names_only = args.names_only
        downloaded_only = args.downloaded_only
        tags = args.tags
        source = args.source

        if tags is not None:
            tags = tags.split(",")

        models = fozm._list_zoo_models(tags=tags, source=source)
        downloaded_models = fozm.list_downloaded_zoo_models()

        _print_zoo_models_list(
            models,
            downloaded_models,
            downloaded_only=downloaded_only,
            names_only=names_only,
        )


def _print_zoo_models_list(
    models,
    downloaded_models,
    downloaded_only=False,
    names_only=False,
):
    records = []
    for model in sorted(models, key=lambda model: model.name):
        name = model.name

        if downloaded_only and name not in downloaded_models:
            continue

        if names_only:
            records.append(name)
            continue

        if isinstance(model, fozm.RemoteZooModel):
            is_remote = "\u2713"
        else:
            is_remote = ""

        if name in downloaded_models:
            is_downloaded = "\u2713"
            model_path = downloaded_models[name][0]
        elif model.manager is None:
            is_downloaded = "?"
            model_path = "?"
        else:
            is_downloaded = ""
            model_path = ""

        tags = ",".join(model.tags or [])

        records.append((name, tags, is_remote, is_downloaded, model_path))

    if names_only:
        for name in records:
            print(name)

        return

    headers = ["name", "tags", "remote", "downloaded", "model_path"]
    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class ModelZooFindCommand(Command):
    """Locate the downloaded zoo model on disk.

    Examples::

        # Print the location of the downloaded zoo model on disk
        fiftyone zoo models find <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the model"
        )

    @staticmethod
    def execute(parser, args):
        name = args.name

        zoo_model = fozm.get_zoo_model(name)
        if zoo_model.manager is None:
            print("?????")
        else:
            model_path = fozm.find_zoo_model(name)
            print(model_path)


class ModelZooInfoCommand(Command):
    """Print information about models in the FiftyOne Model Zoo.

    Examples::

        # Print information about a zoo model
        fiftyone zoo models info <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the model"
        )

    @staticmethod
    def execute(parser, args):
        name = args.name

        # Print model info
        zoo_model = fozm.get_zoo_model(name)
        print("***** Model description *****\n%s\n" % str(zoo_model))

        # Check if model is downloaded
        print("***** Model location *****")
        if zoo_model.manager is None:
            print("?????")
        elif not fozm.is_zoo_model_downloaded(name):
            print("Model '%s' is not downloaded" % name)
        else:
            model_path = fozm.find_zoo_model(name)
            print(model_path)


class ModelZooRequirementsCommand(Command):
    """Handles package requirements for zoo models.

    Examples::

        # Print requirements for a zoo model
        fiftyone zoo models requirements <name> --print

        # Install any requirements for the zoo model
        fiftyone zoo models requirements <name> --install

        # Ensures that the requirements for the zoo model are satisfied
        fiftyone zoo models requirements <name> --ensure
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the model"
        )
        parser.add_argument(
            "-p",
            "--print",
            action="store_true",
            help="print the requirements for the zoo model",
        )
        parser.add_argument(
            "-i",
            "--install",
            action="store_true",
            help="install any requirements for the zoo model",
        )
        parser.add_argument(
            "-e",
            "--ensure",
            action="store_true",
            help="ensure the requirements for the zoo model are satisfied",
        )
        parser.add_argument(
            "--error-level",
            metavar="LEVEL",
            type=int,
            help=(
                "the error level (0=error, 1=warn, 2=ignore) to use when "
                "installing or ensuring model requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        error_level = args.error_level

        if args.print or (not args.install and not args.ensure):
            zoo_model = fozm.get_zoo_model(name)
            _print_model_requirements(zoo_model)

        if args.install:
            fozm.install_zoo_model_requirements(name, error_level=error_level)

        if args.ensure:
            fozm.ensure_zoo_model_requirements(name, error_level=error_level)


def _print_model_requirements(zoo_model):
    requirements = zoo_model.requirements
    if requirements is None:
        return

    # Model requirements
    print("***** Model requirements *****")
    print(requirements)

    # Current machine specs
    print("\n***** Current machine *****")
    if etau.has_gpu():
        print("GPU: yes")
        print("CUDA version: %s" % etau.get_cuda_version())
        print("cuDNN version: %s" % etau.get_cudnn_version())
    else:
        print("GPU: no")


class ModelZooDownloadCommand(Command):
    """Download zoo models.

    When downloading remotely-sourced zoo models, you can provide any of the
    following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Download a zoo model
        fiftyone zoo models download <name>

        # Download a remotely-sourced zoo model
        fiftyone zoo models download https://github.com/<user>/<repo> \\
            --model-name <name>
        fiftyone zoo models download <url> --model-name <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the model",
        )
        parser.add_argument(
            "-n",
            "--model-name",
            metavar="MODEL_NAME",
            default=None,
            help=(
                "the specific model to download, if `name_or_url` is a remote "
                "source"
            ),
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite any existing model files",
        )

    @staticmethod
    def execute(parser, args):
        fozm.download_zoo_model(
            args.name_or_url,
            model_name=args.model_name,
            overwrite=args.overwrite,
        )


class ModelZooApplyCommand(Command):
    """Apply zoo models to datasets.

    When applying remotely-sourced zoo models, you can provide any of the
    following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Apply a zoo model to a dataset
        fiftyone zoo models apply <model-name> <dataset-name> <label-field>

        # Apply a remotely-sourced zoo model to a dataset
        fiftyone zoo models apply https://github.com/<user>/<repo> \\
            <dataset-name> <label-field> --model-name <model-name>
        fiftyone zoo models apply <url> \\
            <dataset-name> <label-field> --model-name <model-name>

        # Apply a zoo model with some customized parameters
        fiftyone zoo models apply \\
            <model-name> <dataset-name> <label-field> \\
            --confidence-thresh 0.7 \\
            --store-logits \\
            --batch-size 32
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the zoo model",
        )
        parser.add_argument(
            "dataset_name",
            metavar="DATASET_NAME",
            help="the name of the FiftyOne dataset to process",
        )
        parser.add_argument(
            "label_field",
            metavar="LABEL_FIELD",
            help="the name of the field in which to store the predictions",
        )
        parser.add_argument(
            "-n",
            "--model-name",
            metavar="MODEL_NAME",
            default=None,
            help=(
                "the specific model to apply, if `name_or_url` is a remote "
                "source"
            ),
        )
        parser.add_argument(
            "-b",
            "--batch-size",
            metavar="BATCH_SIZE",
            default=None,
            type=int,
            help="an optional batch size to use during inference",
        )
        parser.add_argument(
            "-t",
            "--confidence-thresh",
            metavar="THRESH",
            default=None,
            type=float,
            help=(
                "an optional confidence threshold to apply to any applicable "
                "labels generated by the model"
            ),
        )
        parser.add_argument(
            "-l",
            "--store-logits",
            action="store_true",
            help="store logits for the predictions",
        )
        parser.add_argument(
            "-i",
            "--install",
            action="store_true",
            help="install any requirements for the zoo model",
        )
        parser.add_argument(
            "--error-level",
            metavar="LEVEL",
            type=int,
            help=(
                "the error level (0=error, 1=warn, 2=ignore) to use when "
                "installing or ensuring model requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        model = fozm.load_zoo_model(
            args.name_or_url,
            model_name=args.model_name,
            install_requirements=args.install,
            error_level=args.error_level,
        )

        dataset = fod.load_dataset(args.dataset_name)

        dataset.apply_model(
            model,
            args.label_field,
            confidence_thresh=args.confidence_thresh,
            store_logits=args.store_logits,
            batch_size=args.batch_size,
        )


class ModelZooEmbedCommand(Command):
    """Generate embeddings for datasets with zoo models.

    When applying remotely-sourced zoo models, you can provide any of the
    following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Generate embeddings for a dataset with a zoo model
        fiftyone zoo models embed <model-name> <dataset-name> <embeddings-field>

        # Generate embeddings for a dataset with a remotely-sourced zoo model
        fiftyone zoo models embed https://github.com/<user>/<repo> \\
            <dataset-name> <embeddings-field> --model-name <model-name>
        fiftyone zoo models embed <url> \\
            <dataset-name> <embeddings-field> --model-name <model-name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_url",
            metavar="NAME_OR_URL",
            help="the name or remote location of the zoo model",
        )
        parser.add_argument(
            "dataset_name",
            metavar="DATASET_NAME",
            help="the name of the FiftyOne dataset to process",
        )
        parser.add_argument(
            "embeddings_field",
            metavar="EMBEDDINGS_FIELD",
            help="the name of the field in which to store the embeddings",
        )
        parser.add_argument(
            "-n",
            "--model-name",
            metavar="MODEL_NAME",
            default=None,
            help=(
                "the specific model to apply, if `name_or_url` is a remote "
                "source"
            ),
        )
        parser.add_argument(
            "-b",
            "--batch-size",
            metavar="BATCH_SIZE",
            default=None,
            type=int,
            help="an optional batch size to use during inference",
        )
        parser.add_argument(
            "-i",
            "--install",
            action="store_true",
            help="install any requirements for the zoo model",
        )
        parser.add_argument(
            "--error-level",
            metavar="LEVEL",
            type=int,
            help=(
                "the error level (0=error, 1=warn, 2=ignore) to use when "
                "installing or ensuring model requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        model = fozm.load_zoo_model(
            args.name_or_url,
            model_name=args.model_name,
            install_requirements=args.install,
            error_level=args.error_level,
        )
        dataset = fod.load_dataset(args.dataset_name)
        dataset.compute_embeddings(
            model,
            embeddings_field=args.embeddings_field,
            batch_size=args.batch_size,
        )


class ModelZooDeleteCommand(Command):
    """Deletes the local copy of the zoo model on disk.

    Examples::

        # Delete the zoo model from disk
        fiftyone zoo models delete <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the model"
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        fozm.delete_zoo_model(name)


class ModelZooListSourcesCommand(Command):
    """Lists remote zoo model sources that are registered locally.

    Examples::

        # Lists the registered remote zoo model sources
        fiftyone zoo models list-sources
    """

    @staticmethod
    def setup(parser):
        pass

    @staticmethod
    def execute(parser, args):
        _, remote_sources = fozm._load_zoo_models_manifest()

        _print_zoo_model_sources_list(remote_sources)


def _print_zoo_model_sources_list(remote_sources):
    headers = ["name", "url"]

    rows = []
    for manifest in remote_sources.values():
        rows.append(
            {
                "name": manifest.name or "",
                "url": manifest.url,
            }
        )

    records = [tuple(_format_cell(r[key]) for key in headers) for r in rows]

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class ModelZooRegisterSourceCommand(Command):
    """Registers a remote source of zoo models.

    You can provide any of the following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Register a remote zoo model source
        fiftyone zoo models register-source https://github.com/<user>/<repo>
        fiftyone zoo models register-source <url>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "url_or_gh_repo",
            metavar="URL_OR_GH_REPO",
            help="the remote source to register",
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite any existing files",
        )

    @staticmethod
    def execute(parser, args):
        fozm.register_zoo_model_source(
            args.url_or_gh_repo, overwrite=args.overwrite
        )


class ModelZooDeleteSourceCommand(Command):
    """Deletes the remote source and all downloaded models associated with it.

    You can provide any of the following formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    -   a publicly accessible URL of an archive (eg zip or tar) file

    Examples::

        # Delete a remote zoo model source
        fiftyone zoo models delete-source https://github.com/<user>/<repo>
        fiftyone zoo models delete-source <url>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "url_or_gh_repo",
            metavar="URL_OR_GH_REPO",
            help="the remote source to delete",
        )

    @staticmethod
    def execute(parser, args):
        fozm.delete_zoo_model_source(args.url_or_gh_repo)


class OperatorsCommand(Command):
    """Tools for working with FiftyOne operators and panels."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", OperatorsListCommand)
        _register_command(subparsers, "info", OperatorsInfoCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class OperatorsListCommand(Command):
    """List operators and panels that are installed locally.

    Examples::

        # List all available operators and panels
        fiftyone operators list

        # List enabled operators and panels
        fiftyone operators list --enabled

        # List disabled operators and panels
        fiftyone operators list --disabled

        # List non-builtin operators and panels
        fiftyone operators list --no-builtins

        # List panels
        fiftyone operators list --panels-only
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-e",
            "--enabled",
            action="store_true",
            default=None,
            help="only show enabled operators and panels",
        )
        parser.add_argument(
            "-d",
            "--disabled",
            action="store_true",
            default=None,
            help="only show disabled operators and panels",
        )
        parser.add_argument(
            "-b",
            "--builtins-only",
            action="store_true",
            default=None,
            help="only show builtin operators and panels",
        )
        parser.add_argument(
            "-c",
            "--no-builtins",
            action="store_true",
            default=None,
            help="only show non-builtin operators and panels",
        )
        parser.add_argument(
            "-o",
            "--operators-only",
            action="store_true",
            default=None,
            help="only show non-panel operators",
        )
        parser.add_argument(
            "-p",
            "--panels-only",
            action="store_true",
            default=None,
            help="only show panels",
        )
        parser.add_argument(
            "-n",
            "--names-only",
            action="store_true",
            help="only show names",
        )

    @staticmethod
    def execute(parser, args):
        if args.enabled:
            enabled = True
        elif args.disabled:
            enabled = False
        else:
            enabled = "all"

        if args.builtins_only:
            builtin = True
        elif args.no_builtins:
            builtin = False
        else:
            builtin = "all"

        if args.operators_only:
            type = "operator"
        elif args.panels_only:
            type = "panel"
        else:
            type = None

        _print_operators_list(enabled, builtin, type, args.names_only)


def _print_operators_list(enabled, builtin, type, names_only):
    operators = foo.list_operators(enabled=enabled, builtin=builtin, type=type)

    if names_only:
        operators_map = defaultdict(list)
        for operator in operators:
            operators_map[operator.plugin_name].append(operator)

        for pname, ops in operators_map.items():
            print(pname)
            for op in ops:
                print("    " + op.name)

        return

    headers = ["uri", "enabled", "builtin", "panel", "unlisted"]

    enabled_plugins = set(fop.list_enabled_plugins())

    rows = []
    for op in operators:
        rows.append(
            {
                "uri": op.uri,
                "enabled": op.builtin or op.plugin_name in enabled_plugins,
                "builtin": op.builtin,
                "panel": isinstance(op, foo.Panel),
                "unlisted": op.config.unlisted,
            }
        )

    records = [tuple(_format_cell(r[key]) for key in headers) for r in rows]

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class OperatorsInfoCommand(Command):
    """Prints info about operators and panels that are installed locally.

    Examples::

        # Prints information about an operator or panel
        fiftyone operators info <uri>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "uri", metavar="URI", help="the operator or panel URI"
        )

    @staticmethod
    def execute(parser, args):
        _print_operator_info(args.uri)


def _print_operator_info(operator_uri):
    operator = foo.get_operator(operator_uri, enabled="all")

    d = operator.config.to_json()
    _print_dict_as_table(d)


class DelegatedCommand(Command):
    """Tools for working with FiftyOne delegated operations."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "launch", DelegatedLaunchCommand)
        _register_command(subparsers, "list", DelegatedListCommand)
        _register_command(subparsers, "info", DelegatedInfoCommand)
        _register_command(subparsers, "fail", DelegatedFailCommand)
        _register_command(subparsers, "delete", DelegatedDeleteCommand)
        _register_command(subparsers, "cleanup", DelegatedCleanupCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DelegatedLaunchCommand(Command):
    """Launches a service for running delegated operations.

    Examples::

        # Launch a local service
        fiftyone delegated launch
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-t",
            "--type",
            default="local",
            metavar="TYPE",
            help="the type of service to launch. The default is 'local'",
        )

    @staticmethod
    def execute(parser, args):
        supported_types = ("local",)
        if args.type not in supported_types:
            raise ValueError(
                "Unsupported service type '%s'. Supported values are %s"
                % (args.type, supported_types)
            )

        if args.type == "local":
            _launch_delegated_local()


def _launch_delegated_local():
    from fiftyone.core.session.session import _WELCOME_MESSAGE

    try:
        dos = food.DelegatedOperationService()

        print(_WELCOME_MESSAGE.format(foc.VERSION))
        print("Delegated operation service running")
        print("\nTo exit, press ctrl + c")
        while True:
            dos.execute_queued_operations(limit=1, log=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass


class DelegatedListCommand(Command):
    """List delegated operations.

    Examples::

        # List all delegated operations
        fiftyone delegated list

        # List some specific delegated operations
        fiftyone delegated list \\
            --dataset quickstart \\
            --operator @voxel51/io/export_samples \\
            --state COMPLETED \\
            --sort-by COMPLETED_AT \\
            --limit 10
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-o",
            "--operator",
            default=None,
            metavar="OPERATOR",
            help="only list operations for this operator",
        )
        parser.add_argument(
            "-d",
            "--dataset",
            default=None,
            metavar="DATASET",
            help="only list operations for this dataset",
        )
        parser.add_argument(
            "-s",
            "--state",
            default=None,
            help=(
                "only list operations with this state. Supported values are "
                "('SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')"
            ),
        )
        parser.add_argument(
            "--sort-by",
            default="QUEUED_AT",
            help=(
                "how to sort the operations. Supported values are "
                "('SCHEDULED_AT', 'QUEUED_AT', 'STARTED_AT', COMPLETED_AT', 'FAILED_AT', 'OPERATOR')"
            ),
        )
        parser.add_argument(
            "--reverse",
            action="store_true",
            default=False,
            help="whether to sort in reverse order",
        )
        parser.add_argument(
            "-l",
            "--limit",
            type=int,
            default=None,
            help="a maximum number of operations to show",
        )

    @staticmethod
    def execute(parser, args):
        dos = food.DelegatedOperationService()

        state = _parse_state(args.state)
        paging = _parse_paging(
            sort_by=args.sort_by, reverse=args.reverse, limit=args.limit
        )

        ops = dos.list_operations(
            operator=args.operator,
            dataset_name=args.dataset,
            run_state=state,
            paging=paging,
        )

        _print_delegated_list(ops)


def _parse_state(state):
    if state is None:
        return None

    return state.lower()


def _parse_paging(sort_by=None, reverse=None, limit=None):
    from fiftyone.factory import DelegatedOperationPagingParams

    sort_by = _parse_sort_by(sort_by)
    sort_direction = _parse_reverse(reverse)
    return DelegatedOperationPagingParams(
        sort_by=sort_by, sort_direction=sort_direction, limit=limit
    )


def _parse_sort_by(sort_by):
    if sort_by is None:
        return None

    return sort_by.lower()


def _parse_reverse(reverse):
    from fiftyone.factory import SortDirection

    return SortDirection.ASCENDING if reverse else SortDirection.DESCENDING


def _print_delegated_list(ops):
    headers = [
        "id",
        "operator",
        "dataset",
        "queued_at",
        "state",
        "completed",
    ]

    rows = []
    for op in ops:
        rows.append(
            {
                "id": op.id,
                "operator": op.operator,
                "dataset": op.context.request_params.get("dataset_name", None),
                "queued_at": op.queued_at,
                "state": op.run_state,
                "completed": op.run_state == fooe.ExecutionRunState.COMPLETED,
            }
        )

    records = [tuple(_format_cell(r[key]) for key in headers) for r in rows]

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class DelegatedInfoCommand(Command):
    """Prints information about a delegated operation.

    Examples::

        # Print information about a delegated operation
        fiftyone delegated info <id>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument("id", metavar="ID", help="the operation ID")

    @staticmethod
    def execute(parser, args):
        dos = food.DelegatedOperationService()
        op = dos.get(ObjectId(args.id))
        fo.pprint(op._doc)


class DelegatedFailCommand(Command):
    """Manually mark delegated operations as failed.

    Examples::

        # Manually mark the specified operation(s) as FAILED
        fiftyone delegated fail <id1> <id2> ...
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "ids",
            nargs="*",
            default=None,
            metavar="IDS",
            help="an operation ID or list of operation IDs",
        )

    @staticmethod
    def execute(parser, args):
        if not args.ids:
            return

        dos = food.DelegatedOperationService()
        for id in args.ids:
            op = dos.get(ObjectId(id))
            if op.run_state in (
                fooe.ExecutionRunState.QUEUED,
                fooe.ExecutionRunState.RUNNING,
            ):
                print(
                    "Marking operation %s in state %s as failed"
                    % (id, op.run_state.upper())
                )
                dos.set_failed(ObjectId(id))
            else:
                print(
                    "Cannot mark operation %s in state %s as failed"
                    % (id, op.run_state.upper())
                )


class DelegatedDeleteCommand(Command):
    """Delete delegated operations.

    Examples::

        # Delete the specified operation(s)
        fiftyone delegated delete <id1> <id2> ...
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "ids",
            nargs="*",
            default=None,
            metavar="IDS",
            help="an operation ID or list of operation IDs",
        )

    @staticmethod
    def execute(parser, args):
        if not args.ids:
            return

        dos = food.DelegatedOperationService()
        for id in args.ids:
            op = dos.get(ObjectId(id))
            if op.run_state != fooe.ExecutionRunState.RUNNING:
                print("Deleting operation %s" % id)
                dos.delete_operation(ObjectId(id))
            else:
                print(
                    "Cannot delete operation %s in state %s"
                    % (id, op.run_state.upper())
                )


class DelegatedCleanupCommand(Command):
    """Cleanup delegated operations.

    Examples::

        # Delete all failed operations associated with a given dataset
        fiftyone delegated cleanup --dataset quickstart --state FAILED

        # Delete all delegated operations associated with non-existent datasets
        fiftyone delegated cleanup --orphan

        # Print information about operations rather than actually deleting them
        fiftyone delegated cleanup --orphan --dry-run
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-o",
            "--operator",
            default=None,
            metavar="OPERATOR",
            help="cleanup operations for this operator",
        )
        parser.add_argument(
            "-d",
            "--dataset",
            default=None,
            metavar="DATASET",
            help="cleanup operations for this dataset",
        )
        parser.add_argument(
            "-s",
            "--state",
            default=None,
            help=(
                "delete operations in this state. Supported values are "
                "('SCHEDULED', 'QUEUED', 'COMPLETED', 'FAILED')"
            ),
        )
        parser.add_argument(
            "--orphan",
            action="store_true",
            default=None,
            help="delete all operations associated with non-existent datasets",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=None,
            help=(
                "whether to print information rather than actually deleting "
                "operations"
            ),
        )

    @staticmethod
    def execute(parser, args):
        if args.orphan:
            _cleanup_orphan_delegated(dry_run=args.dry_run)
        elif args.operator or args.dataset or args.state:
            state = _parse_state(args.state)
            _cleanup_delegated(
                operator=args.operator,
                dataset=args.dataset,
                state=state,
                dry_run=args.dry_run,
            )
        else:
            print("No cleanup options specified")


def _cleanup_orphan_delegated(dry_run=False):
    from fiftyone.core.odm import get_db_conn

    db = get_db_conn()
    dataset_ids = set(d["_id"] for d in db.datasets.find({}, {"_id": 1}))

    dos = food.DelegatedOperationService()
    ops = dos.list_operations()

    del_ids = set(op.id for op in ops if op.dataset_id not in dataset_ids)

    num_del = len(del_ids)
    if num_del == 0:
        return

    if dry_run:
        print("Found %d orphan operation(s)" % num_del)
    else:
        print("Deleting %d orphan operation(s)" % num_del)
        for del_id in del_ids:
            dos.delete_operation(del_id)


def _cleanup_delegated(operator=None, dataset=None, state=None, dry_run=False):
    if state == fooe.ExecutionRunState.RUNNING:
        raise ValueError(
            "Deleting operations that are currently running is not allowed"
        )

    dos = food.DelegatedOperationService()
    ops = dos.list_operations(
        operator=operator,
        dataset_name=dataset,
        run_state=state,
    )

    del_ids = set()
    for op in ops:
        if op.run_state != fooe.ExecutionRunState.RUNNING:
            del_ids.add(op.id)

    num_del = len(del_ids)
    if num_del == 0:
        return

    if dry_run:
        print("Found %d operation(s) to delete" % num_del)
    else:
        print("Deleting %d operation(s)" % num_del)
        for del_id in del_ids:
            dos.delete_operation(del_id)


class PluginsCommand(Command):
    """Tools for working with FiftyOne plugins."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", PluginsListCommand)
        _register_command(subparsers, "info", PluginsInfoCommand)
        _register_command(subparsers, "download", PluginsDownloadCommand)
        _register_command(
            subparsers, "requirements", PluginsRequirementsCommand
        )
        _register_command(subparsers, "create", PluginsCreateCommand)
        _register_command(subparsers, "enable", PluginsEnableCommand)
        _register_command(subparsers, "disable", PluginsDisableCommand)
        _register_command(subparsers, "delete", PluginsDeleteCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class PluginsListCommand(Command):
    """List plugins that are installed locally.

    Examples::

        # List all available plugins
        fiftyone plugins list

        # List enabled plugins
        fiftyone plugins list --enabled

        # List disabled plugins
        fiftyone plugins list --disabled

        # List non-builtin plugins
        fiftyone plugins list --no-builtins
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-e",
            "--enabled",
            action="store_true",
            default=None,
            help="only show enabled plugins",
        )
        parser.add_argument(
            "-d",
            "--disabled",
            action="store_true",
            default=None,
            help="only show disabled plugins",
        )
        parser.add_argument(
            "-b",
            "--builtins-only",
            action="store_true",
            default=None,
            help="only show builtin plugins",
        )
        parser.add_argument(
            "-c",
            "--no-builtins",
            action="store_true",
            default=None,
            help="only show non-builtin plugins",
        )
        parser.add_argument(
            "-n",
            "--names-only",
            action="store_true",
            help="only show names",
        )

    @staticmethod
    def execute(parser, args):
        if args.enabled:
            enabled = True
        elif args.disabled:
            enabled = False
        else:
            enabled = "all"

        if args.builtins_only:
            builtin = True
        elif args.no_builtins:
            builtin = False
        else:
            builtin = "all"

        _print_plugins_list(enabled, builtin, args.names_only)


def _print_plugins_list(enabled, builtin, names_only):
    plugin_defintions = fop.list_plugins(
        enabled=enabled, builtin=builtin, shadowed="all"
    )

    if names_only:
        for pd in plugin_defintions:
            print(pd.name)

        return

    enabled_plugins = set(fop.list_enabled_plugins())

    shadowed_paths = set()
    for pd in plugin_defintions:
        if pd.shadow_paths:
            shadowed_paths.update(pd.shadow_paths)

    headers = [
        "plugin",
        "version",
        "enabled",
        "builtin",
        "shadowed",
        "directory",
    ]
    rows = []
    for pd in plugin_defintions:
        shadowed = pd.directory in shadowed_paths
        enabled = (pd.builtin or pd.name in enabled_plugins) and not shadowed
        rows.append(
            {
                "plugin": pd.name,
                "version": pd.version or "",
                "enabled": enabled,
                "builtin": pd.builtin,
                "shadowed": shadowed,
                "directory": pd.directory,
            }
        )

    if not shadowed_paths:
        headers.remove("shadowed")

    records = [tuple(_format_cell(r[key]) for key in headers) for r in rows]

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class PluginsInfoCommand(Command):
    """Prints info about plugins that are installed locally.

    Examples::

        # Prints information about a plugin
        fiftyone plugins info <name>

        # Prints information about a plugin in a given directory
        fiftyone plugins info <dir>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name_or_dir",
            metavar="NAME_OR_DIR",
            help="the plugin name or directory",
        )

    @staticmethod
    def execute(parser, args):
        _print_plugin_info(args.name_or_dir)


def _print_plugin_info(name_or_dir):
    try:
        pd = fop.get_plugin(name_or_dir)
    except:
        if os.path.isdir(name_or_dir):
            pd = fop.get_plugin(plugin_dir=name_or_dir)
        else:
            raise

    d = pd.to_dict()
    d["directory"] = pd.directory
    _print_dict_as_table(d)


class PluginsDownloadCommand(Command):
    """Download plugins from the web.

    When downloading plugins from GitHub, you can provide any of the following
    formats:

    -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
    -   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
        ``https://github.com/<user>/<repo>/commit/<commit>``
    -   a GitHub ref string like ``<user>/<repo>[/<ref>]``

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Examples::

        # Download plugins from a GitHub repository URL
        fiftyone plugins download <github-repo-url>

        # Download plugins by specifying the GitHub repository details
        fiftyone plugins download <user>/<repo>[/<ref>]

        # Download specific plugins from a URL
        fiftyone plugins download <url> --plugin-names <name1> <name2> <name3>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "url_or_gh_repo",
            metavar="URL_OR_GH_REPO",
            help="A URL or <user>/<repo>[/<ref>] of a GitHub repository",
        )
        parser.add_argument(
            "-n",
            "--plugin-names",
            nargs="*",
            default=None,
            metavar="PLUGIN_NAMES",
            help="a plugin name or list of plugin names to download",
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite existing plugins",
        )

    @staticmethod
    def execute(parser, args):
        fop.download_plugin(
            args.url_or_gh_repo,
            plugin_names=args.plugin_names,
            overwrite=args.overwrite,
        )


class PluginsRequirementsCommand(Command):
    """Handles package requirements for plugins.

    Examples::

        # Print requirements for a plugin
        fiftyone plugins requirements <name> --print

        # Install any requirements for the plugin
        fiftyone plugins requirements <name> --install

        # Ensures that the requirements for the plugin are satisfied
        fiftyone plugins requirements <name> --ensure
    """

    @staticmethod
    def setup(parser):
        parser.add_argument("name", metavar="NAME", help="the plugin name")
        parser.add_argument(
            "-p",
            "--print",
            action="store_true",
            help="print the requirements for the plugin",
        )
        parser.add_argument(
            "-i",
            "--install",
            action="store_true",
            help="install any requirements for the plugin",
        )
        parser.add_argument(
            "-e",
            "--ensure",
            action="store_true",
            help="ensure the requirements for the plugin are satisfied",
        )
        parser.add_argument(
            "--error-level",
            metavar="LEVEL",
            type=int,
            help=(
                "the error level (0=error, 1=warn, 2=ignore) to use when "
                "installing or ensuring plugin requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        error_level = args.error_level

        if args.print or (not args.install and not args.ensure):
            _print_plugin_requirements(name)

        if args.install:
            fop.ensure_plugin_compatibility(
                name, error_level=error_level, log_success=True
            )
            fop.install_plugin_requirements(name, error_level=error_level)

        if args.ensure:
            fop.ensure_plugin_compatibility(
                name, error_level=error_level, log_success=True
            )
            fop.ensure_plugin_requirements(
                name, error_level=error_level, log_success=True
            )


def _print_plugin_requirements(name):
    pd = fop.get_plugin(name)
    req_str = pd.fiftyone_requirement
    if req_str is not None:
        print(req_str)

    requirements = fop.load_plugin_requirements(name)
    if requirements is not None:
        for req_str in requirements:
            print(req_str)


class PluginsCreateCommand(Command):
    """Creates or initializes a plugin.

    Examples::

        # Initialize a new plugin
        fiftyone plugins create <name>

        # Create a plugin from existing files
        fiftyone plugins create \\
            <name> \\
            --from-files /path/to/dir \\
            --description <description>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            help="the plugin name",
        )
        parser.add_argument(
            "-f",
            "--from-files",
            nargs="*",
            default=None,
            metavar="FILES",
            help=(
                "a directory or list of explicit filepaths to include in the "
                "plugin"
            ),
        )
        parser.add_argument(
            "-d",
            "--outdir",
            metavar="OUTDIR",
            help="a directory in which to create the plugin",
        )
        parser.add_argument(
            "--description",
            metavar="DESCRIPTION",
            help="a description for the plugin",
        )
        parser.add_argument(
            "--version",
            metavar="VERSION",
            help="an optional FiftyOne version requirement for the plugin",
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite existing plugins",
        )
        parser.add_argument(
            "--kwargs",
            nargs="+",
            metavar="KEY=VAL",
            action=_ParseKwargsAction,
            help=(
                "additional keyword arguments to include in the plugin "
                "definition"
            ),
        )

    @staticmethod
    def execute(parser, args):
        fop.create_plugin(
            args.name,
            from_files=args.from_files,
            outdir=args.outdir,
            description=args.description,
            version=args.version,
            overwrite=args.overwrite,
            **args.kwargs or {},
        )


class PluginsEnableCommand(Command):
    """Enables the given plugin(s).

    Examples::

        # Enable a plugin
        fiftyone plugins enable <name>

        # Enable multiple plugins
        fiftyone plugins enable <name1> <name2> ...

        # Enable all plugins
        fiftyone plugins enable --all
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            nargs="*",
            help="the plugin name(s)",
        )
        parser.add_argument(
            "-a",
            "--all",
            action="store_true",
            help="whether to enable all plugins",
        )

    @staticmethod
    def execute(parser, args):
        if args.all:
            names = fop.list_disabled_plugins()
        else:
            names = args.name

        for name in names:
            fop.enable_plugin(name)


class PluginsDisableCommand(Command):
    """Disables the given plugin(s).

    Examples::

        # Disable a plugin
        fiftyone plugins disable <name>

        # Disable multiple plugins
        fiftyone plugins disable <name1> <name2> ...

        # Disable all plugins
        fiftyone plugins disable --all
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            nargs="*",
            help="the plugin name(s)",
        )
        parser.add_argument(
            "-a",
            "--all",
            action="store_true",
            help="whether to disable all plugins",
        )

    @staticmethod
    def execute(parser, args):
        if args.all:
            names = fop.list_enabled_plugins()
        else:
            names = args.name

        for name in names:
            fop.disable_plugin(name)


class PluginsDeleteCommand(Command):
    """Delete plugins from your local machine.

    Examples::

        # Delete a plugin from local disk
        fiftyone plugins delete <name>

        # Delete multiple plugins from local disk
        fiftyone plugins delete <name1> <name2> ...

        # Delete all plugins from local disk
        fiftyone plugins delete --all
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name",
            metavar="NAME",
            nargs="*",
            help="the plugin name(s)",
        )
        parser.add_argument(
            "-a",
            "--all",
            action="store_true",
            help="whether to delete all plugins",
        )

    @staticmethod
    def execute(parser, args):
        if args.all:
            names = fop.list_downloaded_plugins()
        else:
            names = args.name

        for name in names:
            fop.delete_plugin(name)


class MigrateCommand(Command):
    """Tools for migrating the FiftyOne database.

    See :ref:`this page <database-migrations>` for more information about
    migrating FiftyOne deployments.

    Examples::

        # Print information about the current revisions of all datasets
        fiftyone migrate --info

        # Migrate the database and all datasets to the current client version
        fiftyone migrate --all

        # Migrate to a specific revision
        fiftyone migrate --all --version <VERSION>

        # Migrate a specific dataset
        fiftyone migrate ... --dataset-name <DATASET_NAME>

        # Update the database version without migrating any existing datasets
        fiftyone migrate
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-i",
            "--info",
            action="store_true",
            help="whether to print info about the current revisions",
        )
        parser.add_argument(
            "-a",
            "--all",
            action="store_true",
            help="whether to migrate the database and all datasets",
        )
        parser.add_argument(
            "-v",
            "--version",
            metavar="VERSION",
            help="the revision to migrate to",
        )
        parser.add_argument(
            "-n",
            "--dataset-name",
            nargs="+",
            metavar="DATASET_NAME",
            help="the name of a specific dataset to migrate",
        )
        parser.add_argument(
            "--error-level",
            metavar="LEVEL",
            type=int,
            default=1,
            help=(
                "the error level (0=error, 1=warn, 2=ignore) to use when "
                "migrating individual datasets"
            ),
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="whether to log incremental migrations that are performed",
        )

    @staticmethod
    def execute(parser, args):
        if args.info:
            db_ver = fom.get_database_revision() or ""

            if args.dataset_name is not None:
                for name in args.dataset_name:
                    print(fom.get_dataset_revision(name))

                return

            dataset_vers = {
                name: fom.get_dataset_revision(name)
                for name in fod.list_datasets()
            }

            _print_migration_table(db_ver, dataset_vers)
            return

        if args.all:
            fom.migrate_all(
                destination=args.version,
                error_level=args.error_level,
                verbose=args.verbose,
            )
            return

        if args.dataset_name:
            for name in args.dataset_name:
                fom.migrate_dataset_if_necessary(
                    name,
                    destination=args.version,
                    error_level=args.error_level,
                    verbose=args.verbose,
                )
        else:
            fom.migrate_database_if_necessary(
                destination=args.version,
                verbose=args.verbose,
            )


def _print_migration_table(db_ver, dataset_vers):
    print("Client version: %s" % foc.VERSION)

    if foc.COMPATIBLE_VERSIONS:
        print("Compatible versions: %s" % foc.COMPATIBLE_VERSIONS)
        print("")

    print("Database version: %s" % db_ver)

    if dataset_vers:
        print("")
        _print_dict_as_table(dataset_vers, headers=["dataset", "version"])


class UtilsCommand(Command):
    """FiftyOne utilities."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(
            subparsers, "compute-metadata", ComputeMetadataCommand
        )
        _register_command(
            subparsers, "transform-images", TransformImagesCommand
        )
        _register_command(
            subparsers, "transform-videos", TransformVideosCommand
        )

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ComputeMetadataCommand(Command):
    """Populates the `metadata` field of all samples in the dataset.

    Examples::

        # Populate all missing `metadata` sample fields
        fiftyone utils compute-metadata <dataset-name>

        # (Re)-populate the `metadata` field for all samples
        fiftyone utils compute-metadata <dataset-name> --overwrite
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="DATASET_NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-o",
            "--overwrite",
            action="store_true",
            help="whether to overwrite existing metadata",
        )
        parser.add_argument(
            "-n",
            "--num-workers",
            default=None,
            type=int,
            help="a suggested number of worker processes to use",
        )
        parser.add_argument(
            "-s",
            "--skip-failures",
            action="store_true",
            help=(
                "whether to gracefully continue without raising an error if "
                "metadata cannot be computed for a sample"
            ),
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        dataset.compute_metadata(
            overwrite=args.overwrite,
            num_workers=args.num_workers,
            skip_failures=args.skip_failures,
        )


class TransformImagesCommand(Command):
    """Transforms the images in a dataset per the specified parameters.

    Examples::

        # Convert the images in the dataset to PNGs
        fiftyone utils transform-images <dataset-name> --ext .png --delete-originals

        # Ensure that no images in the dataset exceed 1920 x 1080
        fiftyone utils transform-images <dataset-name> --max-size 1920,1080
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="DATASET_NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "--size",
            metavar="SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a `width,height` for each image. A dimension can be -1 if "
                "no constraint should be applied"
            ),
        )
        parser.add_argument(
            "--min-size",
            metavar="MIN_SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a minimum `width,height` for each image. A dimension can be "
                "-1 if no constraint should be applied"
            ),
        )
        parser.add_argument(
            "--max-size",
            metavar="MAX_SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a maximum `width,height` for each image. A dimension can be "
                "-1 if no constraint should be applied"
            ),
        )
        parser.add_argument(
            "-i",
            "--interpolation",
            default=None,
            type=int,
            help="an optional `interpolation` argument for `cv2.resize()`",
        )
        parser.add_argument(
            "-e",
            "--ext",
            metavar="EXT",
            help="an image format to convert to (e.g., '.png' or '.jpg')",
        )
        parser.add_argument(
            "-f",
            "--force-reencode",
            action="store_true",
            help=(
                "whether to re-encode images whose parameters already meet "
                "the specified values"
            ),
        )
        parser.add_argument(
            "--media-field",
            metavar="MEDIA_FIELD",
            default="filepath",
            help="the input field containing the image paths to transform",
        )
        parser.add_argument(
            "--output-field",
            metavar="OUTPUT_FIELD",
            help=(
                "an optional field in which to store the paths to the "
                "transformed images. By default, `media_field` is updated "
                "in-place"
            ),
        )
        parser.add_argument(
            "--output-dir",
            metavar="OUTPUT_DIR",
            help=(
                "an optional output directory in which to write the "
                "transformed images. If none is provided, the images are "
                "updated in-place"
            ),
        )
        parser.add_argument(
            "--rel-dir",
            metavar="REL_DIR",
            help=(
                "an optional relative directory to strip from each input "
                "filepath to generate a unique identifier that is joined with "
                "`output_dir` to generate an output path for each image"
            ),
        )
        parser.add_argument(
            "--no-update-filepaths",
            dest="update_filepaths",
            action="store_false",
            default=True,
            help=(
                "whether to store the output filepaths on the sample "
                "collection"
            ),
        )
        parser.add_argument(
            "-d",
            "--delete-originals",
            action="store_true",
            help="whether to delete the original images after transforming",
        )
        parser.add_argument(
            "-n",
            "--num-workers",
            default=None,
            type=int,
            help="a suggested number of worker processes to use",
        )
        parser.add_argument(
            "-s",
            "--skip-failures",
            action="store_true",
            help=(
                "whether to gracefully continue without raising an error if "
                "an image cannot be transformed"
            ),
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        foui.transform_images(
            dataset,
            size=args.size,
            min_size=args.min_size,
            max_size=args.max_size,
            interpolation=args.interpolation,
            ext=args.ext,
            force_reencode=args.force_reencode,
            media_field=args.media_field,
            output_field=args.output_field,
            output_dir=args.output_dir,
            rel_dir=args.rel_dir,
            update_filepaths=args.update_filepaths,
            delete_originals=args.delete_originals,
            num_workers=args.num_workers,
            skip_failures=args.skip_failures,
        )


class TransformVideosCommand(Command):
    """Transforms the videos in a dataset per the specified parameters.

    Examples::

        # Re-encode the videos in the dataset as H.264 MP4s
        fiftyone utils transform-videos <dataset-name> --reencode

        # Ensure that no videos in the dataset exceed 1920 x 1080 and 30fps
        fiftyone utils transform-videos <dataset-name> \\
            --max-size 1920,1080 --max-fps 30.0
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="DATASET_NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "--fps",
            metavar="FPS",
            default=None,
            type=float,
            help="a frame rate at which to resample the videos",
        )
        parser.add_argument(
            "--min-fps",
            metavar="MIN_FPS",
            default=None,
            type=float,
            help=(
                "a minimum frame rate. Videos with frame rate below this "
                "value are upsampled"
            ),
        )
        parser.add_argument(
            "--max-fps",
            metavar="MAX_FPS",
            default=None,
            type=float,
            help=(
                "a maximum frame rate. Videos with frame rate exceeding this "
                "value are downsampled"
            ),
        )
        parser.add_argument(
            "--size",
            metavar="SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a `width,height` for each frame. A dimension can be -1 if "
                "no constraint should be applied"
            ),
        )
        parser.add_argument(
            "--min-size",
            metavar="MIN_SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a minimum `width,height` for each frame. A dimension can be "
                "-1 if no constraint should be applied"
            ),
        )
        parser.add_argument(
            "--max-size",
            metavar="MAX_SIZE",
            action=_StoreSizeTupleAction,
            help=(
                "a maximum `width,height` for each frame. A dimension can be "
                "-1 if no constraint should be applied"
            ),
        )
        parser.add_argument(
            "-r",
            "--reencode",
            action="store_true",
            help="whether to re-encode the videos as H.264 MP4s",
        )
        parser.add_argument(
            "-f",
            "--force-reencode",
            action="store_true",
            help=(
                "whether to re-encode videos whose parameters already meet "
                "the specified values"
            ),
        )
        parser.add_argument(
            "--media-field",
            metavar="MEDIA_FIELD",
            default="filepath",
            help="the input field containing the video paths to transform",
        )
        parser.add_argument(
            "--output-field",
            metavar="OUTPUT_FIELD",
            help=(
                "an optional field in which to store the paths to the "
                "transformed videos. By default, `media_field` is updated "
                "in-place"
            ),
        )
        parser.add_argument(
            "--output-dir",
            metavar="OUTPUT_DIR",
            help=(
                "an optional output directory in which to write the "
                "transformed videos. If none is provided, the videos are "
                "updated in-place"
            ),
        )
        parser.add_argument(
            "--rel-dir",
            metavar="REL_DIR",
            help=(
                "an optional relative directory to strip from each input "
                "filepath to generate a unique identifier that is joined with "
                "`output_dir` to generate an output path for each video"
            ),
        )
        parser.add_argument(
            "--no-update-filepaths",
            dest="update_filepaths",
            action="store_false",
            default=True,
            help=(
                "whether to store the output filepaths on the sample "
                "collection"
            ),
        )
        parser.add_argument(
            "-d",
            "--delete-originals",
            action="store_true",
            help="whether to delete the original videos after transforming",
        )
        parser.add_argument(
            "-s",
            "--skip-failures",
            action="store_true",
            help=(
                "whether to gracefully continue without raising an error if "
                "a video cannot be transformed"
            ),
        )
        parser.add_argument(
            "-v",
            "--verbose",
            action="store_true",
            help="whether to log the `ffmpeg` commands that are executed",
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        fouv.transform_videos(
            dataset,
            fps=args.fps,
            min_fps=args.min_fps,
            max_fps=args.max_fps,
            size=args.size,
            min_size=args.min_size,
            max_size=args.max_size,
            reencode=args.reencode,
            force_reencode=args.force_reencode,
            media_field=args.media_field,
            output_field=args.output_field,
            output_dir=args.output_dir,
            rel_dir=args.rel_dir,
            update_filepaths=args.update_filepaths,
            delete_originals=args.delete_originals,
            skip_failures=args.skip_failures,
            verbose=args.verbose,
        )


def _print_dict_as_json(d):
    print(json.dumps(d, indent=4))


def _print_dict_as_table(d, headers=None):
    if headers is None:
        headers = ["key", "value"]

    records = []
    for k, v in d.items():
        if isinstance(v, list) and v:
            records.append((k, v[0]))
            for e in v[1:]:
                records.append(("", e))
        else:
            records.append((k, v))

    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


def _has_subparsers(parser):
    for action in parser._actions:
        if isinstance(action, argparse._SubParsersAction):
            return True

    return False


def _iter_subparsers(parser):
    for action in parser._actions:
        if isinstance(action, argparse._SubParsersAction):
            for subparser in action.choices.values():
                yield subparser


class _RecursiveHelpAction(argparse._HelpAction):
    def __call__(self, parser, *args, **kwargs):
        self._recurse(parser)
        parser.exit()

    @staticmethod
    def _recurse(parser):
        print("\n%s\n%s" % ("*" * 79, parser.format_help()))
        for subparser in _iter_subparsers(parser):
            _RecursiveHelpAction._recurse(subparser)


class _ParseKwargsAction(argparse.Action):
    def __call__(self, parser, namespace, values, option_string=None):
        kwargs = {}
        if not isinstance(values, list):
            values = [values]

        for value in values:
            if "=" not in value:
                key = value
                val = "True"
            else:
                key, val = value.split("=")

            kwargs[key.replace("-", "_")] = _parse_kwargs_value(val)

        setattr(namespace, self.dest, kwargs)


def _parse_kwargs_value(value):
    try:
        return int(value)
    except:
        pass

    try:
        return float(value)
    except:
        pass

    if value in ("True", "true"):
        return True

    if value in ("False", "false"):
        return False

    if value in ("None", ""):
        return None

    if "," in value:
        return [_parse_kwargs_value(v) for v in value.split(",")]

    return value


class _StoreSizeTupleAction(argparse.Action):
    def __call__(self, parser, namespace, value, option_string=None):
        if value is not None:
            try:
                l, r = value.split(",")
                size = (int(l), int(r))
            except:
                raise ValueError(
                    "Invalid argument %s for parameter '%s'; expected "
                    "`width,height`" % (value, self.dest)
                )

        else:
            size = None

        setattr(namespace, self.dest, size)


def _register_main_command(command, version=None, recursive_help=True):
    parser = argparse.ArgumentParser(description=command.__doc__.rstrip())

    parser.set_defaults(execute=lambda args: command.execute(parser, args))
    command.setup(parser)

    if version:
        parser.add_argument(
            "-v",
            "--version",
            action="version",
            version=version,
            help="show version info",
        )

    if recursive_help and _has_subparsers(parser):
        parser.add_argument(
            "--all-help",
            action=_RecursiveHelpAction,
            help="show help recursively and exit",
        )

    argcomplete.autocomplete(parser)
    return parser


def _register_command(parent, name, command, recursive_help=True):
    parser = parent.add_parser(
        name,
        help=command.__doc__.splitlines()[0],
        description=command.__doc__.rstrip(),
        formatter_class=argparse.RawTextHelpFormatter,
    )

    parser.set_defaults(execute=lambda args: command.execute(parser, args))
    command.setup(parser)

    if recursive_help and _has_subparsers(parser):
        parser.add_argument(
            "--all-help",
            action=_RecursiveHelpAction,
            help="show help recursively and exit",
        )

    return parser


def main():
    """Executes the `fiftyone` tool with the given command-line args."""
    parser = _register_main_command(FiftyOneCommand, version=foc.VERSION_LONG)
    args = parser.parse_args()
    args.execute(args)
