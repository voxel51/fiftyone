"""
FiftyOne operator registry.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import traceback
from contextvars import ContextVar

import eta.core.utils as etau

from fiftyone.operators.panel import Panel
import fiftyone.plugins as fop
import fiftyone.plugins.context as fopc


# A context-bound registry shared by callers within the same async task /
# HTTP request. Construction of an :class:`OperatorRegistry` is cheap (no
# plugin Python is exec'd), but binding one per request lets all endpoints
# in that request share the same lazily-populated plugin contexts so an
# operator's plugin only registers once even across many calls.
_current_registry: ContextVar = ContextVar(
    "fiftyone_current_operator_registry", default=None
)


def get_current_registry(factory=None):
    """Returns the :class:`OperatorRegistry` bound to the current execution
    context, or constructs a new one if none is bound.

    Args:
        factory (None): optional zero-arg callable used to construct a new
            registry when none is bound. Defaults to :class:`OperatorRegistry`.

    Returns:
        an :class:`OperatorRegistry` (or subclass)
    """
    registry = _current_registry.get()
    if registry is not None:
        return registry

    if factory is None:
        factory = OperatorRegistry

    return factory()


def set_current_registry(registry):
    """Binds ``registry`` as the current registry for the active execution
    context.

    Args:
        registry: an :class:`OperatorRegistry` (or subclass)

    Returns:
        a token that can be passed to :func:`reset_current_registry` to
        restore the prior binding
    """
    return _current_registry.set(registry)


def reset_current_registry(token):
    """Restores the current registry binding to its prior value."""
    _current_registry.reset(token)


@contextlib.contextmanager
def use_registry(registry):
    """Context manager that binds ``registry`` as the current registry for
    the duration of the ``with`` block.

    Args:
        registry: an :class:`OperatorRegistry` (or subclass)
    """
    token = set_current_registry(registry)
    try:
        yield registry
    finally:
        reset_current_registry(token)


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


def list_operators(enabled=True, builtin="all", type=None):
    """Returns all available operators.

    Args:
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")
        builtin ("all"): whether to include only builtin operators (True) or
            only non-builtin operators (False) or all operators ("all")
        type (None): whether to include only ``"panel"`` or ``"operator"`` type
            operators, or a specific :class:`fiftyone.operators.Operator`
            subclass to restrict to

    Returns:
        a list of :class:`fiftyone.operators.Operator` instances
    """
    if builtin == "all":
        builtin = None

    registry = OperatorRegistry(enabled=enabled)
    return registry.list_operators(builtin=builtin, type=type)


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

    Construction is cheap: only plugin metadata (``fiftyone.yml``) is read
    and an in-memory index of operator URIs is built. Plugin Python entry
    points are only exec'd lazily when an operator from that plugin is
    actually requested via :meth:`get_operator` or :meth:`operator_exists`,
    or when :meth:`list_operators` is called (which requires all plugins).

    Args:
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")
    """

    def __init__(self, enabled=True):
        self._enabled = enabled
        self._plugin_defs_by_name = {}
        self._plugin_defs_by_uri = {}
        self._contexts_by_plugin = {}
        self._listing_errors = []
        self._all_ensured = False

        try:
            plugin_defs = fop.list_plugins(enabled=enabled, builtin="all")
        except Exception:
            self._listing_errors.append(traceback.format_exc())
            plugin_defs = []

        for pd in plugin_defs:
            self._plugin_defs_by_name[pd.name] = pd
            for op_name in pd.operators:
                uri = "%s/%s" % (pd.name, op_name)
                # First-declared wins; mirrors the original ordering where
                # builtin plugins are listed first
                self._plugin_defs_by_uri.setdefault(uri, pd)

    @property
    def plugin_contexts(self):
        """The list of :class:`PluginContext` instances for this registry.

        Accessing this property triggers eager registration of all plugins
        for backward compatibility with code that introspected this list
        directly.
        """
        self._ensure_all()
        return [
            self._contexts_by_plugin[name]
            for name in self._plugin_defs_by_name
        ]

    def _ensure_plugin(self, plugin_def):
        """Ensures the given plugin's operators are registered, returning
        its :class:`PluginContext`.
        """
        pctx = self._contexts_by_plugin.get(plugin_def.name)
        if pctx is not None:
            return pctx

        pctx = fopc.get_plugin_context(plugin_def.name)
        if pctx is None:
            # Couldn't load the plugin definition by name; build directly
            # from the index entry as a fallback
            pctx = fopc.PluginContext(plugin_def)
            pctx.register_all()

        self._contexts_by_plugin[plugin_def.name] = pctx
        return pctx

    def _ensure_all(self):
        if self._all_ensured:
            return

        for plugin_def in self._plugin_defs_by_name.values():
            self._ensure_plugin(plugin_def)

        self._all_ensured = True

    def list_operators(self, builtin=None, type=None):
        """Lists the available FiftyOne operators.

        Args:
            builtin (None): whether to include only builtin operators (True) or
                only non-builtin operators (False)
            type (None): whether to include only ``"panel"`` or ``"operator"``
                type operators, or a specific
                :class:`fiftyone.operators.Operator` subclass to restrict to

        Returns:
            a list of :class:`fiftyone.operators.Operator` instances
        """
        self._ensure_all()

        operators = []
        for plugin_name in self._plugin_defs_by_name:
            pctx = self._contexts_by_plugin.get(plugin_name)
            if pctx is not None:
                operators.extend(pctx.instances)

        if builtin is True:
            operators = [op for op in operators if op._builtin is True]
        elif builtin is False:
            operators = [op for op in operators if op._builtin is False]

        if type == "panel":
            operators = [op for op in operators if isinstance(op, Panel)]
        elif type == "operator":
            operators = [op for op in operators if not isinstance(op, Panel)]
        elif type is not None:
            if etau.is_str(type):
                type = etau.get_class(type)

            operators = [op for op in operators if isinstance(op, type)]

        return operators

    def list_errors(self):
        """Lists the errors that occurred during operator loading.

        Returns:
            a list of errors
        """
        errors = list(self._listing_errors)
        for pctx in self._contexts_by_plugin.values():
            errors.extend(pctx.errors)

        return errors

    def operator_exists(self, operator_uri):
        """Checks if the operator exists.

        Args:
            operator_uri: the URI of the operator

        Returns:
            True/False
        """
        plugin_def = self._plugin_defs_by_uri.get(operator_uri)
        if plugin_def is None:
            return False

        # Confirm the operator successfully registered (a yml-declared
        # operator may fail to register if the plugin's Python errors out)
        pctx = self._ensure_plugin(plugin_def)
        return any(inst.uri == operator_uri for inst in pctx.instances)

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
        plugin_def = self._plugin_defs_by_uri.get(operator_uri)
        if plugin_def is None:
            return None

        pctx = self._ensure_plugin(plugin_def)
        for instance in pctx.instances:
            if instance.uri == operator_uri:
                return instance

        return None
