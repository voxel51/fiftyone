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

import argcomplete
from tabulate import tabulate

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
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
        _register_command(subparsers, "zoo", ZooCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ConfigCommand(Command):
    """Tools for working with your FiftyOne config.

    Examples:
        # Print your entire config
        fiftyone config

        # Print a specific config field
        fiftyone config <field>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field", nargs="?", metavar="FIELD", help="a config field"
        )

    @staticmethod
    def execute(parser, args):
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

    Examples:
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


class ZooCommand(Command):
    """Tools for working with the FiftyOne Dataset Zoo."""

    @staticmethod
    def setup(parser):
        subparsers = parser.add_subparsers(title="available commands")
        _register_command(subparsers, "list", ZooListCommand)
        _register_command(subparsers, "info", ZooInfoCommand)
        _register_command(subparsers, "download", ZooDownloadCommand)

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ZooListCommand(Command):
    """Tools for listing datasets in the FiftyOne Dataset Zoo.

    Examples:
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

    Examples:
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

    Examples:
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
