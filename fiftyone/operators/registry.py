"""
FiftyOne operator registry.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .operator import Operator
from .loader import load_from_dir

OPERATOR_DICT = {}


def list_operators():
    """Lists the available FiftyOne operators.

    Returns:
        a list of operators
    """
    load_from_dir()
    return OPERATOR_DICT.values()


def operator_exists(name):
    """Checks if the operator exists.

    Args:
        name: the name of the operator

    Returns:
        True/False
    """
    load_from_dir()
    return OPERATOR_DICT.get(name, None) is not None


def register_operator(operator):
    OPERATOR_DICT[operator.name] = operator


def register_failed_operator(name, errors):
    FAILED_OPERATORS[name] = errors


def get_operator(name):
    load_from_dir()
    return OPERATOR_DICT[name]
