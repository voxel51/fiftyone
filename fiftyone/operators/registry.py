"""
FiftyOne operator registry.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .builtin import BUILTIN_OPERATORS
import fiftyone.plugins.context as fopc


def get_operator(operator_uri, enabled=True):
    """Gets the operator with the given URI.

    Args:
        operator_uri: the operator URI
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")

    Returns:
        an :class:`fiftyone.operators.Operator`

    Raises:
        ValueError: if the operator is not found
    """
    registry = OperatorRegistry(enabled=enabled)
    operator = registry.get_operator(operator_uri)
    if operator is None:
        raise ValueError(f"Operator '{operator_uri}' not found")

    return operator


def list_operators(enabled=True):
    """Returns all available operators.

    Args:
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")

    Returns:
        a list of :class:`fiftyone.operators.Operator` instances
    """
    registry = OperatorRegistry(enabled=enabled)
    return registry.list_operators(include_builtin=enabled != False)


def operator_exists(operator_uri, enabled=True):
    """Checks if the given operator exists.

    Args:
        operator_uri: the operator URI
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")

    Returns:
        True/False
    """
    registry = OperatorRegistry(enabled=enabled)
    return registry.operator_exists(operator_uri)


class OperatorRegistry(object):
    """Operator registry.

    enabled (True): whether to include only enabled operators (True) or
        only disabled operators (False) or all operators ("all")
    """

    def __init__(self, enabled=True):
        self.plugin_contexts = fopc.build_plugin_contexts(enabled=enabled)

    def list_operators(self, include_builtin=True):
        """Lists the available FiftyOne operators.

        Args:
            include_builtin (True): whether to include builtin operators

        Returns:
            a list of :class:`fiftyone.operators.Operator` instances
        """
        operators = []
        for pctx in self.plugin_contexts:
            operators.extend(pctx.instances)

        if include_builtin:
            operators.extend(BUILTIN_OPERATORS)

        return operators

    def list_errors(self):
        """Lists the errors that occurred during operator loading.

        Returns:
            a list of errors
        """
        errors = []
        for plugin_context in self.plugin_contexts:
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

    def can_execute(self, operator_uri):
        """Whether the operator can be executed.

        Args:
            operator_uri: the URI of the operator

        Returns:
            True/False
        """
        return self.operator_exists(operator_uri)

    def get_operator(self, operator_uri):
        """Retrieves an operator by its URI.

        Args:
            operator_uri: the URI of an operator

        Returns:
            an :class:`fiftyone.operators.Operator`, or None
        """
        for operator in self.list_operators():
            if operator_uri == operator.uri:
                return operator

        return None
