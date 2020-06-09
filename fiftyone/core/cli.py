"""
Definition of the `fiftyone` command-line interface (CLI).

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import argparse
from collections import defaultdict
import json
import os
import signal
import subprocess

import argcomplete
from tabulate import tabulate

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.dataset as fod
import fiftyone.core.session as fos
import fiftyone.core.utils as fou
import fiftyone.types as fot
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
    """FiftyOne command-line interface."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "config", ConfigCommand)
        _register_command(subparsers, "constants", ConstantsCommand)
        _register_command(subparsers, "datasets", DatasetsCommand)
        _register_command(subparsers, "dashboard", DashboardCommand)
        _register_command(subparsers, "zoo", ZooCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ConfigCommand(Command):
    """Tools for working with your FiftyOne config.

    Examples::

        # Print your entire config
        fiftyone config

        # Print a specific config field
        fiftyone config <field>

        # Print the location of your config
        fiftyone config --locate

        # Save your current config to disk
        fiftyone config --save
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field", nargs="?", metavar="FIELD", help="a config field"
        )
        parser.add_argument(
            "-l",
            "--locate",
            action="store_true",
            help="print the location of your config on disk",
        )
        parser.add_argument(
            "-s",
            "--save",
            action="store_true",
            help="save your current config to disk",
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
                print(
                    "To save your current config (which may differ from the "
                    "default config if you\n"
                    "have any `FIFTYONE_XXX` environment variables set), run:"
                    "\n\n"
                    "fiftyone config --save"
                    "\n"
                )

            return

        if args.save:
            fo.config.write_json(foc.FIFTYONE_CONFIG_PATH, pretty_print=True)
            print("Config written to '%s'" % foc.FIFTYONE_CONFIG_PATH)
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
                for k, v in iteritems(vars(foc))
                if not k.startswith("_") and k == k.upper()
            }
        )


def _print_constants_table(d):
    contents = sorted(
        ((k, _render_constant_value(v)) for k, v in iteritems(d)),
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


class DatasetsCommand(Command):
    """Tools for working with FiftyOne datasets."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", DatasetsListCommand)
        _register_command(subparsers, "info", DatasetsInfoCommand)
        _register_command(subparsers, "create", DatasetsCreateCommand)
        _register_command(subparsers, "delete", DatasetsDeleteCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DatasetsListCommand(Command):
    """Tools for listing FiftyOne datasets.

    Examples::

        # List available datasets
        fiftyone datasets list
    """

    @staticmethod
    def setup(parser):
        pass

    @staticmethod
    def execute(parser, args):
        datasets = fod.list_dataset_names()

        if datasets:
            for dataset in sorted(datasets):
                print(dataset)
        else:
            print("No datasets found")


class DatasetsInfoCommand(Command):
    """Tools for listing information about FiftyOne datasets.

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
        # Creates a persistent dataset from the given data on disk
        fiftyone datasets create \\
            --name <name> --type <type> --dataset-dir <dataset-dir>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-n", "--name", metavar="NAME", help="a name for the dataset",
        )
        parser.add_argument(
            "-t",
            "--type",
            required=True,
            metavar="TYPE",
            help="the `fiftyone.types.Dataset` type of the dataset",
        )
        parser.add_argument(
            "-d",
            "--dataset-dir",
            required=True,
            metavar="DATASET_DIR",
            help="the directory containing the dataset files",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        dataset_type = etau.get_class(args.type)
        dataset_dir = args.dataset_dir

        if isinstance(dataset_type, fot.ImageClassificationDataset):
            dataset = fod.Dataset.from_image_classification_dataset(
                dataset_dir, name=name
            )
        elif isinstance(dataset_type, fot.ImageDetectionDataset):
            dataset = fod.Dataset.from_image_detection_dataset(
                dataset_dir, name=name
            )
        elif isinstance(dataset_type, fot.ImageLabelsDataset):
            dataset = fod.Dataset.from_image_labels_dataset(
                dataset_dir, name=name
            )
        else:
            raise ValueError("Unsupported dataset type %s" % args.type)

        dataset.persistent = True


class DatasetsDeleteCommand(Command):
    """Tools for deleting FiftyOne datasets.

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


class DashboardCommand(Command):
    """Tools for working with the FiftyOne Dashboard."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "launch", DashboardLaunchCommand)
        _register_command(subparsers, "connect", DashboardConnectCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class DashboardLaunchCommand(Command):
    """Tools for launching the FiftyOne Dashboard.

    Examples::

        # Launches the dashboard with the given dataset
        fiftyone dashboard launch <name>

        # Launches the dashboard with a custom port
        fiftyone dashboard launch <name> --port <port>

        # Launches the dashboard as a remote session
        fiftyone dashboard launch <name> --remote
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", help="the name of the dataset",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=5151,
            help="the port number to use",
        )
        parser.add_argument(
            "-r",
            "--remote",
            action="store_true",
            help="whether to launch a remote dashboard session",
        )

    @staticmethod
    def execute(parser, args):
        dataset = fod.load_dataset(args.name)
        session = fos.launch_dashboard(
            dataset=dataset, port=args.port, remote=args.remote
        )

        print("\nTo exit, close the dashboard or enter ctrl + c\n")
        signal.pause()


class DashboardConnectCommand(Command):
    """Tools for connecting to a remote FiftyOne Dashboard.

    Examples::

        # Connect to a remote dashboard with port forwarding already configured
        fiftyone dashboard connect

        # Connects to a remote dashboard session
        fiftyone dashboard connect --destination <destination> --port <port>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-d",
            "--destination",
            metavar="DESTINATION",
            help="the destination to connect to, e.g., [username@]hostname",
        )
        parser.add_argument(
            "-p",
            "--port",
            metavar="PORT",
            default=5151,
            help="the remote port to connect to",
        )

    @staticmethod
    def execute(parser, args):
        if args.destination:
            # Port forwarding
            p = subprocess.Popen(
                [
                    "ssh",
                    "-N",
                    "-L",
                    "%d:127.0.0.1:5151" % args.port,
                    "%s" % args.destination,
                ]
            )
            _terminate_subprocess_on_exit(p)

        session = fos.launch_dashboard()

        print("\nTo exit, close the dashboard or enter ctrl + c\n")
        signal.pause()


def _terminate_subprocess_on_exit(p):
    def handle_exit(*args):
        try:
            p.terminate()
        except:
            pass

    fou.call_on_exit(handle_exit)


class ZooCommand(Command):
    """Tools for working with the FiftyOne Dataset Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", ZooListCommand)
        _register_command(subparsers, "info", ZooInfoCommand)
        _register_command(subparsers, "download", ZooDownloadCommand)
        _register_command(subparsers, "load", ZooLoadCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ZooListCommand(Command):
    """Tools for listing datasets in the FiftyOne Dataset Zoo.

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
        all_sources = foz._get_zoo_dataset_sources()

        base_dir = args.base_dir
        downloaded_datasets = foz.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

        _print_zoo_dataset_list(all_datasets, all_sources, downloaded_datasets)


def _print_zoo_dataset_list(all_datasets, all_sources, downloaded_datasets):
    available_datasets = defaultdict(dict)
    for source, datasets in iteritems(all_datasets):
        for name, zoo_dataset_cls in iteritems(datasets):
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
        for zoo_dataset in itervalues(dataset_sources):
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

    headers = (
        ["name", "split", "downloaded", "dataset_dir"]
        + ["%s (*)" % all_sources[0]]
        + all_sources[1:]
    )
    table_str = tabulate(records, headers=headers, tablefmt=_TABLE_FORMAT)
    print(table_str)


class ZooInfoCommand(Command):
    """Tools for printing info about downloaded zoo datasets.

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
            "name", metavar="NAME", nargs="?", help="the name of the dataset"
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
        base_dir = args.base_dir or None
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
            _print_dict_as_json(info.serialize())


class ZooDownloadCommand(Command):
    """Tools for downloading zoo datasets.

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
        splits = args.splits or None
        dataset_dir = args.dataset_dir or None
        foz.download_zoo_dataset(name, splits=splits, dataset_dir=dataset_dir)


class ZooLoadCommand(Command):
    """Tools for loading zoo datasets as persistent FiftyOne datasets.

    Examples::

        # Load the zoo dataset with the given name
        fiftyone zoo load <name>

        # Load the specified split(s) of the zoo dataset
        fiftyone zoo load <name> --splits <split1> ...

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
            "-d",
            "--dataset-dir",
            metavar="DATASET_DIR",
            help="a custom directory in which the dataset is downloaded",
        )

    @staticmethod
    def execute(parser, args):
        name = args.name
        splits = args.splits or None
        dataset_dir = args.dataset_dir or None
        foz.load_zoo_dataset(
            name, splits=splits, dataset_dir=dataset_dir, persistent=True
        )


def _print_dict_as_json(d):
    print(json.dumps(d, indent=4))


def _print_dict_as_table(d):
    records = [(k, v) for k, v in iteritems(d)]
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
            for subparser in itervalues(action.choices):
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
