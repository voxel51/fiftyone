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
import json

import argcomplete
from tabulate import tabulate

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.constants as foc


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
        fiftyone config --print

        # Print a specific config field
        fiftyone config --print <field>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "field", nargs="?", metavar="FIELD", help="a config field"
        )
        parser.add_argument(
            "-p",
            "--print",
            action="store_true",
            help="print your FiftyOne config",
        )

    @staticmethod
    def execute(parser, args):
        if args.print:
            if args.field:
                field = getattr(fo.config, args.field)
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

    @staticmethod
    def execute(parser, args):
        parser.print_help()


class ZooListCommand(Command):
    """Tools for listing datasets in the FiftyOne Dataset Zoo.

    Examples:
        # List the available datasets in the zoo
        fiftyone zoo list

        # List the downloaded zoo datasets
        fiftyone zoo list --downloaded-only

        # List the downloaded zoo datasets in the specified base directory
        fiftyone zoo list --downloaded-only <base-dir>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "-d",
            "--downloaded-only",
            action="store_true",
            help="only list downloaded datasets",
        )
        parser.add_argument(
            "base_dir",
            nargs="?",
            metavar="BASE_DIR",
            help=(
                "a custom base directory in which to search for downloaded "
                "datasets"
            ),
        )

    @staticmethod
    def execute(parser, args):
        import fiftyone.zoo as foz

        if args.downloaded_only:
            base_dir = args.base_dir
            dd = foz.list_downloaded_zoo_datasets(base_dir=base_dir)
            for name in dd:
                print(name)
        else:
            for name in foz.list_zoo_datasets():
                print(name)


class ZooInfoCommand(Command):
    """Tools for printing info about downloaded zoo datasets.

    Examples:
        # Print information about a downloaded zoo dataset
        fiftyone zoo info <name>

        # Print information about all downloaded zoo datasets
        fiftyone zoo info --all

        # Print information about the zoo dataset downloaded to the specified
        # custom directory
        fiftyone zoo info <name> --base-dir <base-dir>
    """

    @staticmethod
    def setup(parser):
        parser.add_argument(
            "name", metavar="NAME", nargs="?", help="the name of the dataset"
        )
        parser.add_argument(
            "-a",
            "--all",
            action="store_true",
            help="print info about all downloaded zoo datasets",
        )
        parser.add_argument(
            "-b",
            "--base-dir",
            metavar="BASE_DIR",
            help="a custom base directory in which to search for datasets",
        )

    @staticmethod
    def execute(parser, args):
        import fiftyone.zoo as foz

        name = args.name
        base_dir = args.base_dir or None
        downloaded_datasets = foz.list_downloaded_zoo_datasets(
            base_dir=base_dir
        )

        if args.all:
            for name in sorted(downloaded_datasets):
                val = downloaded_datasets[name]
                if isinstance(val, dict):
                    for dataset_dir, info in itervalues(val):
                        _print_zoo_dataset_info(dataset_dir, info)
                else:
                    _print_zoo_dataset_info(dataset_dir, info)

            return

        if name not in downloaded_datasets:
            if name not in foz.list_zoo_datasets():
                print("Dataset '%s' not found in the zoo" % name)
            else:
                print("Zoo dataset '%s' is not downloaded" % name)

            return

        dataset_dir, info = downloaded_datasets[name]
        _print_zoo_dataset_info(dataset_dir, info)


def _print_zoo_dataset_info(dataset_dir, info):
    d = info.serialize()
    d["dataset_dir"] = dataset_dir
    _print_dict_as_json(d)
    print("")


def _has_subparsers(parser):
    for action in parser._actions:
        if isinstance(action, argparse._SubParsersAction):
            return True

    return False


def _print_dict_as_json(d):
    s = json.dumps(d, indent=4)
    print(s)


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
