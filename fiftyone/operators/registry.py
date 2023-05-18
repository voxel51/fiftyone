"""
FiftyOne operator registry.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .builtin import BUILTIN_OPERATORS
from .loader import load_from_dir
from .operator import Operator


def register_operator(operator):
    """Registers a builtin operator. For internal use only.

    Args:
        operator: the operator to register
    """
    if operator.name in BUILTIN_OPERATORS:
        raise ValueError("Operator '%s' already exists" % operator.name)

    BUILTIN_OPERATORS[operator.name] = operator


class OperatorRegistry(object):
    """Operator registry."""

    def __init__(self):
        self.plugin_contexts = load_from_dir()

    def list_operators(self):
        """Lists the available FiftyOne operators.

        Returns:
            a list of operators
        """
        plugin_contexts = self.plugin_contexts
        operators = []
        for plugin_context in plugin_contexts:
            for operator in plugin_context.instances:
                if isinstance(operator, Operator):
                    operators.append(operator)

        return operators + BUILTIN_OPERATORS

    def list_errors(self):
        """Lists the errors that occurred during operator loading.

        Returns:
            a list of errors
        """
        plugin_contexts = self.plugin_contexts
        errors = []
        for plugin_context in plugin_contexts:
            errors.extend(plugin_context.errors)

        return errors

    def operator_exists(self, operator_uri):
        """Checks if the operator exists.

        Args:
            operator_uri: the URI of the operator

        Returns:
            True/False
        """
        for operator in self.list_operators():
            if operator_uri == operator.uri:
                return True

        return False

    def get_operator(self, operator_uri):
        """Retrieves an :class:`Operator` by its URI.

        Args:
            operator_uri: the URI of an operator

        Returns:
            an :class:`Operator`, or None
        """
        operators = self.list_operators()
        for operator in operators:
            if operator_uri == operator.uri:
                return operator
