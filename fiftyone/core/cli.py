"""
Definition of the `fiftyone` command-line interface (CLI).

| Copyright 2017-2021, Voxel51, Inc.
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
import fiftyone.utils.data as foud
import fiftyone.utils.image as foui
import fiftyone.utils.quickstart as fouq
import fiftyone.utils.video as fouv
import fiftyone.zoo.datasets as fozd
import fiftyone.zoo.models as fozm


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
        _register_command(subparsers, "app", AppCommand)
        _register_command(subparsers, "config", ConfigCommand)
        _register_command(subparsers, "constants", ConstantsCommand)
        _register_command(subparsers, "convert", ConvertCommand)
        _register_command(subparsers, "datasets", DatasetsCommand)
        _register_command(subparsers, "migrate", MigrateCommand)
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

        # Launch the quickstart in a desktop App session
        fiftyone quickstart --desktop
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
            "-a",
            "--desktop",
            action="store_true",
            help="whether to launch a desktop App instance",
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
        # If desktop wasn't explicitly requested, fallback to default
        desktop = args.desktop or None

        _, session = fouq.quickstart(
            video=args.video,
            port=args.port,
            address=args.address,
            remote=args.remote,
            desktop=desktop,
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
            if os.path.isfile(config_path):
                print(config_path)
            else:
                print("No config file found at '%s'" % config_path)

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
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "--input-dir",
            metavar="INPUT_DIR",
            help="the directory containing the dataset",
        )
        parser.add_argument(
            "--input-type",
            metavar="INPUT_TYPE",
            help="the fiftyone.types.Dataset type of the input dataset",
        )
        parser.add_argument(
            "--output-dir",
            metavar="OUTPUT_DIR",
            help="the directory to which to write the output dataset",
        )
        parser.add_argument(
            "--output-type",
            metavar="OUTPUT_TYPE",
            help="the fiftyone.types.Dataset type to output",
        )

    @staticmethod
    def execute(parser, args):
        input_dir = args.input_dir
        input_type = etau.get_class(args.input_type)

        output_dir = args.output_dir
        output_type = etau.get_class(args.output_type)

        foud.convert_dataset(
            input_dir=input_dir,
            input_type=input_type,
            output_dir=output_dir,
            output_type=output_type,
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
    """

    @staticmethod
    def setup(parser):
        pass

    @staticmethod
    def execute(parser, args):
        datasets = fod.list_datasets()

        if datasets:
            for dataset in datasets:
                print(dataset)
        else:
            print("No datasets found")


class DatasetsInfoCommand(Command):
    """Print information about FiftyOne datasets.

    Examples::

        # Print basic information about all datasets
        fiftyone datasets info
        fiftyone datasets info --sort-by created_at
        fiftyone datasets info --sort-by name --reverse

        # Print information about a specific dataset
        fiftyone datasets info <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", nargs="?", metavar="NAME", help="the name of a dataset",
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
            _print_all_dataset_info(args.sort_by, args.reverse)


def _print_dataset_info(name):
    dataset = fod.load_dataset(name)
    print(dataset)


def _print_all_dataset_info(sort_by, reverse):
    info = fod.list_datasets(info=True)

    headers = [
        "name",
        "created_at",
        "last_loaded_at",
        "version",
        "persistent",
        "media_type",
        "num_samples",
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
    if cell == True:
        return "\u2713"

    if cell == False:
        return ""

    if cell is None:
        return "???"

    if isinstance(cell, datetime):
        return cell.replace(microsecond=0)

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
            "name", metavar="NAME", help="the name of the dataset",
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
            "-n", "--name", metavar="NAME", help="a name for the dataset",
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

        # Perform a customized export of a dataset
        fiftyone datasets export <name> \\
            --type <type> \\
            --kwargs labels_path=/path/for/labels.json
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset to export",
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
        kwargs = args.kwargs or {}

        dataset = fod.load_dataset(name)

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
            "name", metavar="NAME", help="the name of the dataset",
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
            "name", metavar="NAME", help="the name of the dataset",
        )
        parser.add_argument(
            "new_name", metavar="NEW_NAME", help="a new name for the dataset",
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
            if os.path.isfile(annotation_config_path):
                print(annotation_config_path)
            else:
                print(
                    "No annotation config file found at '%s'"
                    % annotation_config_path
                )

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
            if os.path.isfile(app_config_path):
                print(app_config_path)
            else:
                print("No App config file found at '%s'" % app_config_path)

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

        # Launch a desktop App session
        fiftyone app launch ... --desktop
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
            "-a",
            "--desktop",
            action="store_true",
            help="whether to launch a desktop App instance",
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
        # If desktop wasn't explicitly requested, fallback to default
        desktop = args.desktop or None

        if args.name:
            dataset = fod.load_dataset(args.name)
        else:
            dataset = None

        session = fos.launch_app(
            dataset=dataset,
            port=args.port,
            address=args.address,
            remote=args.remote,
            desktop=desktop,
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

        # View the dataset using the desktop App
        fiftyone app view ... --desktop

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
            "-a",
            "--desktop",
            action="store_true",
            help="whether to launch a desktop App instance",
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

        # If desktop wasn't explicitly requested, fallback to default
        desktop = args.desktop or None

        session = fos.launch_app(
            dataset=dataset,
            port=args.port,
            address=args.address,
            remote=args.remote,
            desktop=desktop,
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

        # List available datasets (names only)
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
        parser.add_argument(
            "-b",
            "--base-dir",
            metavar="BASE_DIR",
            help=(
                "a custom base directory in which to search for downloaded "
                "datasets"
            ),
        )

    @staticmethod
    def execute(parser, args):
        names_only = args.names_only
        downloaded_only = args.downloaded_only
        match_source = args.source
        match_tags = args.tags

        all_datasets = fozd._get_zoo_datasets()
        all_sources, default_source = fozd._get_zoo_dataset_sources()

        base_dir = args.base_dir
        downloaded_datasets = fozd.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

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
        for name, zoo_dataset_cls in datasets.items():
            available_datasets[name][source] = zoo_dataset_cls()

    records = []

    # Iterate over available datasets
    for name in sorted(available_datasets):
        if downloaded_only and name not in downloaded_datasets:
            continue

        dataset_sources = available_datasets[name]

        if match_source is not None and match_source not in dataset_sources:
            continue

        tags = None
        for source, zoo_model in dataset_sources.items():
            if tags is None or source == default_source:
                tags = zoo_model.tags

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
    """Locate the downloaded zoo dataset on disk.

    Examples::

        # Print the location of the downloaded zoo dataset on disk
        fiftyone zoo datasets find <name>

        # Print the location of a specific split of the dataset
        fiftyone zoo datasets find <name> --split <split>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-s", "--split", metavar="SPLIT", help="a dataset split",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        split = args.split

        dataset_dir = fozd.find_zoo_dataset(name, split=split)
        print(dataset_dir)


class DatasetZooInfoCommand(Command):
    """Print information about datasets in the FiftyOne Dataset Zoo.

    Examples::

        # Print information about a zoo dataset
        fiftyone zoo datasets info <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-b",
            "--base-dir",
            metavar="BASE_DIR",
            help=(
                "a custom base directory in which to search for downloaded "
                "datasets"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name

        # Print dataset info
        zoo_dataset = fozd.get_zoo_dataset(name)
        print(
            "***** Dataset description *****\n%s"
            % textwrap.dedent("    " + zoo_dataset.__doc__)
        )

        # Check if dataset is downloaded
        base_dir = args.base_dir
        downloaded_datasets = fozd.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

        if zoo_dataset.has_tags:
            print("***** Tags *****")
            print("%s\n" % ", ".join(zoo_dataset.tags))

        if zoo_dataset.has_splits:
            print("***** Supported splits *****")
            print("%s\n" % ", ".join(zoo_dataset.supported_splits))

        print("***** Dataset location *****")
        if name not in downloaded_datasets:
            print("Dataset '%s' is not downloaded" % name)
        else:
            dataset_dir, info = downloaded_datasets[name]
            print(dataset_dir)
            print("\n***** Dataset info *****")
            print(info)


class DatasetZooDownloadCommand(Command):
    """Download zoo datasets.

    Examples::

        # Download the entire zoo dataset
        fiftyone zoo datasets download <name>

        # Download the specified split(s) of the zoo dataset
        fiftyone zoo datasets download <name> --splits <split1> ...

        # Download the zoo dataset to a custom directory
        fiftyone zoo datasets download <name> --dataset-dir <dataset-dir>

        # Download a zoo dataset that requires extra keyword arguments
        fiftyone zoo datasets download <name> \\
            --kwargs source_dir=/path/to/source/files
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-s",
            "--splits",
            metavar="SPLITS",
            nargs="+",
            help="the dataset splits to download",
        )
        parser.add_argument(
            "-d",
            "--dataset-dir",
            metavar="DATASET_DIR",
            help="a custom directory to which to download the dataset",
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
        name = args.name
        splits = args.splits
        dataset_dir = args.dataset_dir
        kwargs = args.kwargs or {}

        fozd.download_zoo_dataset(
            name, splits=splits, dataset_dir=dataset_dir, **kwargs
        )


class DatasetZooLoadCommand(Command):
    """Load zoo datasets as persistent FiftyOne datasets.

    Examples::

        # Load the zoo dataset with the given name
        fiftyone zoo datasets load <name>

        # Load the specified split(s) of the zoo dataset
        fiftyone zoo datasets load <name> --splits <split1> ...

        # Load the zoo dataset with a custom name
        fiftyone zoo datasets load <name> --dataset-name <dataset-name>

        # Load the zoo dataset from a custom directory
        fiftyone zoo datasets load <name> --dataset-dir <dataset-dir>

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
            "name", metavar="NAME", help="the name of the dataset"
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
            "-d",
            "--dataset-dir",
            metavar="DATASET_DIR",
            help="a custom directory in which the dataset is downloaded",
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
        name = args.name
        splits = args.splits
        dataset_name = args.dataset_name
        dataset_dir = args.dataset_dir
        kwargs = args.kwargs or {}

        dataset = fozd.load_zoo_dataset(
            name,
            splits=splits,
            dataset_name=dataset_name,
            dataset_dir=dataset_dir,
            **kwargs,
        )
        dataset.persistent = True


class DatasetZooDeleteCommand(Command):
    """Deletes the local copy of the zoo dataset on disk.

    Examples::

        # Delete an entire zoo dataset from disk
        fiftyone zoo datasets delete <name>

        # Delete a specific split of a zoo dataset from disk
        fiftyone zoo datasets delete <name> --split <split>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset"
        )
        parser.add_argument(
            "-s", "--split", metavar="SPLIT", help="a dataset split",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        split = args.split
        fozd.delete_zoo_dataset(name, split=split)


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

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ModelZooListCommand(Command):
    """List datasets in the FiftyOne Model Zoo.

    Examples::

        # List available models
        fiftyone zoo models list

        # List available models (names only)
        fiftyone zoo models list --names-only

        # List downloaded models
        fiftyone zoo models list --downloaded-only

        # List available models with the given tag
        fiftyone zoo models list --tags <tag>
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

    @staticmethod
    def execute(parser, args):
        names_only = args.names_only
        downloaded_only = args.downloaded_only
        match_tags = args.tags

        models_manifest = fozm._load_zoo_models_manifest()
        downloaded_models = fozm.list_downloaded_zoo_models()

        _print_zoo_models_list(
            models_manifest,
            downloaded_models,
            downloaded_only=downloaded_only,
            match_tags=match_tags,
            names_only=names_only,
        )


def _print_zoo_models_list(
    models_manifest,
    downloaded_models,
    downloaded_only=False,
    match_tags=None,
    names_only=False,
):
    if match_tags is not None:
        match_tags = match_tags.split(",")

    records = []
    for model in sorted(models_manifest.models, key=lambda model: model.name):
        name = model.name

        if downloaded_only and name not in downloaded_models:
            continue

        if (match_tags is not None) and not all(
            model.has_tag(tag) for tag in match_tags
        ):
            continue

        if names_only:
            records.append(name)
            continue

        if name in downloaded_models:
            is_downloaded = "\u2713"
            model_path = downloaded_models[name][0]
        else:
            is_downloaded = ""
            model_path = ""

        tags = ",".join(model.tags or [])

        records.append((name, tags, is_downloaded, model_path))

    if names_only:
        for name in records:
            print(name)

        return

    headers = ["name", "tags", "downloaded", "model_path"]
    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


def _print_zoo_models_list_sample(models_manifest, downloaded_models):
    all_models = [model.name for model in models_manifest]

    records = []
    for name in sorted(all_models):
        if name in downloaded_models:
            is_downloaded = "\u2713"
            model_path = downloaded_models[name][0]
        else:
            is_downloaded = ""
            model_path = ""

        records.append((name, is_downloaded, model_path))

    headers = ["name", "downloaded", "model_path"]
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
        if not fozm.is_zoo_model_downloaded(name):
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
                "the error level in {0, 1, 2} to use when installing or "
                "ensuring model requirements"
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

    Examples::

        # Download the zoo model
        fiftyone zoo models download <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the zoo model"
        )
        parser.add_argument(
            "-f",
            "--force",
            action="store_true",
            help=(
                "whether to force download the model if it is already "
                "downloaded"
            ),
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        force = args.force
        fozm.download_zoo_model(name, overwrite=force)


class ModelZooApplyCommand(Command):
    """Apply zoo models to datasets.

    Examples::

        # Apply the zoo model to the dataset
        fiftyone zoo models apply <model-name> <dataset-name> <label-field>

        # Apply a zoo classifier with some customized parameters
        fiftyone zoo models apply \\
            <model-name> <dataset-name> <label-field> \\
            --confidence-thresh 0.7 \\
            --store-logits \\
            --batch-size 32
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "model_name",
            metavar="MODEL_NAME",
            help="the name of the zoo model",
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
                "the error level in {0, 1, 2} to use when installing or "
                "ensuring model requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        model = fozm.load_zoo_model(
            args.model_name,
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

    Examples::

        # Generate embeddings for the dataset with the zoo model
        fiftyone zoo models embed <model-name> <dataset-name> <embeddings-field>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "model_name",
            metavar="MODEL_NAME",
            help="the name of the zoo model",
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
                "the error level in {0, 1, 2} to use when installing or "
                "ensuring model requirements"
            ),
        )

    @staticmethod
    def execute(parser, args):
        model = fozm.load_zoo_model(
            args.model_name,
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


class MigrateCommand(Command):
    """Tools for migrating the FiftyOne database.

    Examples::

        # Print information about the current revisions of all datasets
        fiftyone migrate --info

        # Migrate the database and all datasets to the current package version
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
            fom.migrate_all(destination=args.version, verbose=args.verbose)
            return

        fom.migrate_database_if_necessary(
            destination=args.version, verbose=args.verbose
        )

        if args.dataset_name:
            for name in args.dataset_name:
                fom.migrate_dataset_if_necessary(
                    name, destination=args.version, verbose=args.verbose
                )


def _print_migration_table(db_ver, dataset_vers):
    print("FiftyOne version: %s" % foc.VERSION)
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

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        dataset.compute_metadata(overwrite=args.overwrite)


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
            help=(
                "the number of worker processes to use. The default is "
                "`multiprocessing.cpu_count()`"
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
            ext=args.ext,
            force_reencode=args.force_reencode,
            delete_originals=args.delete_originals,
            num_workers=args.num_workers,
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
            "-d",
            "--delete-originals",
            action="store_true",
            help="whether to delete the original videos after transforming",
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
            delete_originals=args.delete_originals,
            verbose=args.verbose,
        )


def _print_dict_as_json(d):
    print(json.dumps(d, indent=4))


def _print_dict_as_table(d, headers=None):
    if headers is None:
        headers = ["key", "value"]

    records = [(k, v) for k, v in d.items()]
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

    if value in {"True", "true"}:
        return True

    if value in {"False", "false"}:
        return False

    if value == "None":
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
            help="show help recurisvely and exit",
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
            help="show help recurisvely and exit",
        )

    return parser


def main():
    """Executes the `fiftyone` tool with the given command-line args."""
    parser = _register_main_command(FiftyOneCommand, version=foc.VERSION_LONG)
    args = parser.parse_args()
    args.execute(args)
