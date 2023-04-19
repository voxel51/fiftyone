"""
FiftyOne operator registry.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .operator import Operator
from .loader import load_from_dir

OPERATOR_DICT = {}

class OperatorRegistration:
    def __init__(self, operator_name, operator=None, failed=False, errors=None):
        self.operator_name = operator_name
        self.operator = operator
        self.failed = failed
        self.errors = errors

def list_registrations():
    load_from_dir()
    all_registrations = OPERATOR_DICT.values()
    return [r for r in all_registrations if r.failed is False]

def list_operators():
    """Lists the available FiftyOne operators.

    Returns:
        a list of operators
    """
    registrations = list_registrations()
    return [r.operator for r in registrations]

def operator_exists(name):
    """Checks if the operator exists.

    Args:
        name: the name of the operator

    Returns:
        True/False
    """
    registrations = list_registrations()
    return name in [r.operator_name for r in registrations]

def register_operator(operator):
    OPERATOR_DICT[operator.name] = OperatorRegistration(operator.name, operator=operator)

def unregister_operator(operator):
    name = operator.name if operator is not None else None
    if name:
        remove_from_dict(OPERATOR_DICT, operator.name)

def register_failed_operator(name, errors):
    OPERATOR_DICT[name] = OperatorRegistration(name, failed=True, errors=errors)

def get_operator(name):
    load_from_dir()
    registration = OPERATOR_DICT[name]
    if registration.failed:
        raise ValueError("Operator '%s' failed to load" % name)
    return registration.operator

def remove_from_dict(d, key):
    if d is not None and key in d:
        del d[key]
