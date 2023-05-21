"""
FiftyOne operator registry.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .builtin import BUILTIN_OPERATORS
from .loader import build_plugin_contexts, register_all
from .operator import Operator


def get_operator(operator_uri):
    """Gets the operator with the given URI.

    Args:
        operator_uri: the operator URI

    Returns:
        an :class:`fiftyone.operators.Operator`
    """
    plugin_contexts = build_plugin_contexts(enabled="all")
    registry = OperatorRegistry(plugin_contexts=plugin_contexts)
    operator = registry.get_operator(operator_uri)
    if operator is None:
        raise ValueError(f"Operator '{operator_uri}' not found")

    return operator


def list_operators(enabled=True):
    """Returns the definitions of downloaded plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`fiftyone.plugins.PluginDefinition` instances
    """
    plugin_contexts = build_plugin_contexts(enabled=enabled)
    registry = OperatorRegistry(plugin_contexts=plugin_contexts)
    return registry.list_operators(include_builtin=enabled != False)


class OperatorRegistry(object):
    """Operator registry."""

    def __init__(self, plugin_contexts=None):
        if plugin_contexts is None:
            plugin_contexts = register_all()

        self.plugin_contexts = plugin_contexts

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
