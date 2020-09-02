"""
Definition of the `fiftyone` command-line interface (CLI).

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import argparse
from collections import defaultdict
import io
import json
import os
import subprocess
import sys
import time

import argcomplete
from tabulate import tabulate

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.dataset as fod
import fiftyone.core.session as fos
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.utils.quickstart as fouq
import fiftyone.zoo as foz


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
        _register_command(subparsers, "config", ConfigCommand)
        _register_command(subparsers, "constants", ConstantsCommand)
        _register_command(subparsers, "convert", ConvertCommand)
        _register_command(subparsers, "datasets", DatasetsCommand)
        _register_command(subparsers, "app", AppCommand)
        _register_command(subparsers, "zoo", ZooCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class QuickstartCommand(Command):
    """Launch a FiftyOne quickstart.

    Examples::

        # Launch the quickstart
        fiftyone quickstart
    """

    @staticmethod
    def setup(parser):
        pass

    @staticmethod
    def execute(parser, args):
        fouq.quickstart(interactive=False)


class ConfigCommand(Command):
    """Tools for working with your FiftyOne config.

    Examples::

        # Print your entire config
        fiftyone config

        # Print a specific config field
        fiftyone config <field>

        # Print the location of your config
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
            if os.path.isfile(foc.FIFTYONE_CONFIG_PATH):
                print(foc.FIFTYONE_CONFIG_PATH)
            else:
                print(
                    "No config file found at '%s'.\n"
                    % foc.FIFTYONE_CONFIG_PATH
                )

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

        # Print information about the given dataset
        fiftyone datasets info <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset",
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        print(dataset)


class DatasetsCreateCommand(Command):
    """Tools for creating FiftyOne datasets.

    Examples::

        # Create a dataset from the given data on disk
        fiftyone datasets create \\
            --name <name> --dataset-dir <dataset-dir> --type <type>

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

    @staticmethod
    def execute(parser, args):
        name = args.name
        dataset_dir = args.dataset_dir
        json_path = args.json_path
        dataset_type = etau.get_class(args.type) if args.type else None

        if dataset_dir:
            dataset = fod.Dataset.from_dir(
                dataset_dir, dataset_type, name=name
            )
        elif json_path:
            dataset = fod.Dataset.from_json(json_path, name=name)
        else:
            raise ValueError(
                "Either `dataset_dir` or `json_path` must be provided"
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
        name = args.name

        dataset = fod.load_dataset(name)

        # @todo support Windows and other environments without `less`
        # Look at pydoc.pager() for inspiration?
        p = subprocess.Popen(
            ["less", "-F", "-R", "-S", "-X", "-K"],
            shell=True,
            stdin=subprocess.PIPE,
        )

        try:
            with io.TextIOWrapper(p.stdin, errors="backslashreplace") as pipe:
                for sample in dataset:
                    pipe.write(str(sample) + "\n")

            p.wait()
        except (KeyboardInterrupt, OSError):
            pass


class DatasetsExportCommand(Command):
    """Export FiftyOne datasets to disk in supported formats.

    Examples::

        # Export the dataset to disk in the specified format
        fiftyone datasets export <name> \\
            --export-dir <export-dir> --type <type> --label-field <label-field>

        # Export the dataset to disk in JSON format
        fiftyone datasets export <name> --json-path <json-path>
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

    @staticmethod
    def execute(parser, args):
        name = args.name
        export_dir = args.export_dir
        json_path = args.json_path
        label_field = args.label_field
        dataset_type = etau.get_class(args.type) if args.type else None

        dataset = fod.load_dataset(name)

        if export_dir:
            dataset.export(
                export_dir, label_field=label_field, dataset_type=dataset_type
            )
            print("Dataset '%s' exported to '%s'" % (name, export_dir))
        elif json_path:
            dataset.write_json(json_path)
            print("Dataset '%s' exported to '%s'" % (name, json_path))
        else:
            raise ValueError(
                "Either `export_dir` or `json_path` must be provided"
            )


class DatasetsDrawCommand(Command):
    """Writes annotated versions of samples in FiftyOne datasets to disk.

    Examples::

        # Write annotated versions of the samples in the dataset with the
        # specified labels overlaid to disk
        fiftyone datasets draw <name> \\
            --anno-dir <anno-dir> --label-fields <label-fields>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset to annotate",
        )
        parser.add_argument(
            "-d",
            "--anno-dir",
            metavar="ANNO_DIR",
            help="the directory in which to write the annotated data",
        )
        parser.add_argument(
            "-f",
            "--label-fields",
            metavar="LABEL_FIELDs",
            help="a comma-separated list of label fields to export",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        anno_dir = args.anno_dir
        label_fields = args.label_fields

        dataset = fod.load_dataset(name)

        if label_fields is not None:
            label_fields = [f.strip() for f in label_fields.split(",")]

        dataset.draw_labels(anno_dir, label_fields=label_fields)
        print("Annotations written to '%s'" % anno_dir)


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

        # Delete the dataset with the given name
        fiftyone datasets delete <name>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset",
        )

    @staticmethod
    def execute(parser, args):
        fod.delete_dataset(args.name)
        print("Dataset '%s' deleted" % args.name)


class AppCommand(Command):
    """Tools for working with the FiftyOne App."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "launch", AppLaunchCommand)
        _register_command(subparsers, "view", AppViewCommand)
        _register_command(subparsers, "connect", AppConnectCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class AppLaunchCommand(Command):
    """Launch the FiftyOne App.

    Examples::

        # Launch the app with the given dataset
        fiftyone app launch <name>

        # Launch a remote app session
        fiftyone app launch <name> --remote
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset to open",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=5151,
            type=int,
            help="the port number to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote app session",
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        session = fos.launch_app(
            dataset=dataset, port=args.port, remote=args.remote
        )

        _watch_session(session, remote=args.remote)


def _watch_session(session, remote=False):
    try:
        if remote:
            print("\nTo exit, press ctrl + c\n")
            while True:
                time.sleep(60)
        else:
            print("\nTo exit, close the app or press ctrl + c\n")
            session.wait()
    except KeyboardInterrupt:
        pass


class AppViewCommand(Command):
    """View datasets in the App without persisting them to the database.

    Examples::

        # View a dataset stored on disk in the app
        fiftyone app view --dataset-dir <dataset-dir> --type <type>

        # View a zoo dataset in the app
        fiftyone app view --zoo-dataset <name> --splits <split1> ...

        # View a directory of images in the app
        fiftyone app view --images-dir <images-dir>

        # View a glob pattern of images in the app
        fiftyone app view --images-patt <images-patt>

        # View a dataset stored in JSON format on disk in the app
        fiftyone app view --json-path <json-path>

        # View the dataset in a remote app session
        fiftyone app view ... --remote
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
            "-j",
            "--json-path",
            metavar="JSON_PATH",
            help="the path to a samples JSON file to view",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=5151,
            type=int,
            help="the port number to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote app session",
        )

    @staticmethod
    def execute(parser, args):
        if args.zoo_dataset:
            # View a zoo dataset
            name = args.zoo_dataset
            splits = args.splits
            dataset_dir = args.dataset_dir
            dataset = foz.load_zoo_dataset(
                name, splits=splits, dataset_dir=dataset_dir
            )
        elif args.dataset_dir:
            # View a dataset from a directory
            name = args.name
            dataset_dir = args.dataset_dir
            dataset_type = etau.get_class(args.type)
            dataset = fod.Dataset.from_dir(
                dataset_dir, dataset_type, name=name
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
        elif args.json_path:
            # View a dataset from a JSON file
            name = args.name
            json_path = args.json_path
            dataset = fod.Dataset.from_json(json_path, name=name)
        else:
            raise ValueError(
                "Either `zoo_dataset`, `dataset_dir`, or `json_path` must be "
                "provided"
            )

        session = fos.launch_app(
            dataset=dataset, port=args.port, remote=args.remote
        )

        _watch_session(session, remote=args.remote)


class AppConnectCommand(Command):
    """Connect to a remote FiftyOne App.

    Examples::

        # Connect to a remote app with port forwarding already configured
        fiftyone app connect

        # Connect to a remote app session
        fiftyone app connect --destination <destination> --port <port>
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
            default=5151,
            type=int,
            help="the remote port to connect to",
        )

    @staticmethod
    def execute(parser, args):
        if args.destination:
            if sys.platform.startswith("win"):
                raise RuntimeError(
                    "This command is currently not supported on Windows."
                )

            control_path = os.path.join(
                foc.FIFTYONE_CONFIG_DIR, "tmp", "ssh.sock"
            )
            etau.ensure_basedir(control_path)

            # Port forwarding
            ret = subprocess.call(
                [
                    "ssh",
                    "-f",
                    "-N",
                    "-M",
                    "-S",
                    control_path,
                    "-L",
                    "5151:127.0.0.1:%d" % args.port,
                    args.destination,
                ]
            )
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

        session = fos.launch_app()

        _watch_session(session)


class ZooCommand(Command):
    """Tools for working with the FiftyOne Dataset Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", ZooListCommand)
        _register_command(subparsers, "find", ZooFindCommand)
        _register_command(subparsers, "info", ZooInfoCommand)
        _register_command(subparsers, "download", ZooDownloadCommand)
        _register_command(subparsers, "load", ZooLoadCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ZooListCommand(Command):
    """List datasets in the FiftyOne Dataset Zoo.

    Examples::

        # List available datasets
        fiftyone zoo list

        # List available datasets, using the specified base directory to search
        # for downloaded datasets
        fiftyone zoo list --base-dir <base-dir>
    """

    @staticmethod
    def setup(parser):
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
        all_datasets = foz._get_zoo_datasets()
        all_sources, has_default = foz._get_zoo_dataset_sources()

        base_dir = args.base_dir
        downloaded_datasets = foz.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

        _print_zoo_dataset_list(
            downloaded_datasets, all_datasets, all_sources, has_default
        )


def _print_zoo_dataset_list(
    downloaded_datasets, all_datasets, all_sources, has_default
):
    available_datasets = defaultdict(dict)
    for source, datasets in all_datasets.items():
        for name, zoo_dataset_cls in datasets.items():
            available_datasets[name][source] = zoo_dataset_cls()

    records = []

    # Iterate over available datasets
    for name in sorted(available_datasets):
        dataset_sources = available_datasets[name]

        # Check for downloaded splits
        if name in downloaded_datasets:
            dataset_dir, info = downloaded_datasets[name]
        else:
            dataset_dir, info = None, None

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

            is_downloaded = "\u2713" if split_dir else ""

            records.append(
                (name, split, is_downloaded, split_dir) + tuple(srcs)
            )

    first_suffix = " (*)" if has_default else ""
    headers = (
        ["name", "split", "downloaded", "dataset_dir"]
        + ["%s%s" % (all_sources[0], first_suffix)]
        + all_sources[1:]
    )
    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class ZooFindCommand(Command):
    """Locate the downloaded zoo dataset on disk.

    Examples::

        # Print the location of the downloaded zoo dataset on disk
        fiftyone zoo find <name>

        # Print the location of a specific split of the dataset
        fiftyone zoo find <name> --split <split>
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

        dataset_dir = foz.find_zoo_dataset(name, split=split)
        print(dataset_dir)


class ZooInfoCommand(Command):
    """Print information about downloaded zoo datasets.

    Examples::

        # Print information about a downloaded zoo dataset
        fiftyone zoo info <name>

        # Print information about the zoo dataset downloaded to the specified
        # base directory
        fiftyone zoo info <name> --base-dir <base-dir>
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
        zoo_dataset = foz.get_zoo_dataset(name)
        print("***** Dataset description *****\n%s" % zoo_dataset.__doc__)

        # Check if dataset is downloaded
        base_dir = args.base_dir
        downloaded_datasets = foz.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

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


class ZooDownloadCommand(Command):
    """Download zoo datasets.

    Examples::

        # Download the entire zoo dataset
        fiftyone zoo download <name>

        # Download the specified split(s) of the zoo dataset
        fiftyone zoo download <name> --splits <split1> ...

        # Download to the zoo dataset to a custom directory
        fiftyone zoo download <name> --dataset-dir <dataset-dir>
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

    @staticmethod
    def execute(parser, args):
        name = args.name
        splits = args.splits
        dataset_dir = args.dataset_dir
        foz.download_zoo_dataset(name, splits=splits, dataset_dir=dataset_dir)


class ZooLoadCommand(Command):
    """Load zoo datasets as persistent FiftyOne datasets.

    Examples::

        # Load the zoo dataset with the given name
        fiftyone zoo load <name>

        # Load the specified split(s) of the zoo dataset
        fiftyone zoo load <name> --splits <split1> ...

        # Load the zoo dataset with a custom name
        fiftyone zoo load <name> --dataset-name <dataset-name>

        # Load the zoo dataset from a custom directory
        fiftyone zoo load <name> --dataset-dir <dataset-dir>
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

    @staticmethod
    def execute(parser, args):
        name = args.name
        splits = args.splits
        dataset_name = args.dataset_name
        dataset_dir = args.dataset_dir
        dataset = foz.load_zoo_dataset(
            name,
            splits=splits,
            dataset_name=dataset_name,
            dataset_dir=dataset_dir,
        )
        dataset.persistent = True
        print("Dataset '%s' created" % dataset.name)


def _print_dict_as_json(d):
    print(json.dumps(d, indent=4))


def _print_dict_as_table(d):
    records = [(k, v) for k, v in d.items()]
    table_str = tabulate(
        records, headers=["key", "value"], tablefmt=_TABLE_FORMAT
    )
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
