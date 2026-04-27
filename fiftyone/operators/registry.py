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

import fiftyone as fo

# NOTE: ``fiftyone.plugins`` must be imported before
# ``fiftyone.operators.decorators`` to avoid a circular import:
# ``decorators`` pulls from ``fiftyone.plugins.core`` and
# ``fiftyone.plugins.context`` pulls from ``decorators`` -- importing plugins
# first lets that two-step cycle resolve through plugins/__init__.py
import fiftyone.plugins as fop
import fiftyone.plugins.context as fopc
from fiftyone.operators.decorators import dir_state
from fiftyone.operators.panel import Panel


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


# Sentinel so we can distinguish "use the default signature provider" from
# an explicit ``None`` (which means "do not cache, always rebuild").
_DEFAULT_SIGNATURE = object()

# Process-wide memoization of the plugin index. The index is the relatively
# expensive part of registry construction (walks ``plugins_dir`` and parses
# every plugin's ``fiftyone.yml``) but it depends only on the on-disk plugin
# layout, so it is safe to share across all registries with the same
# signature.
#
# Cache shape:
#   {"key": (enabled, signature), "value": (by_name, by_uri, listing_error)}
_INDEX_CACHE = {"key": None, "value": None}


def _default_signature(enabled):
    """Default cache signature for the plugin index.

    Uses ``dir_state(plugins_dir)`` -- a hash of plugin directory mtimes --
    which is correct on a local filesystem but can be slow when the plugins
    directory lives on networked storage. Callers (e.g. fiftyone-teams) that
    have a cheaper authoritative signature available should pass it
    explicitly via ``OperatorRegistry(index_signature=...)`` rather than
    paying for the mtime walk.
    """
    try:
        return dir_state(fo.config.plugins_dir)
    except Exception:
        return None


_signature_provider = _default_signature


def set_plugin_index_signature_provider(fn):
    """Sets the function used to compute the plugin index cache signature
    when callers don't pass one explicitly.

    The function takes ``(enabled,)`` and must return a hashable signature
    or ``None`` to disable caching for that call.

    Returns the previous provider so it can be restored.
    """
    global _signature_provider
    prev = _signature_provider
    _signature_provider = fn or _default_signature
    return prev


def reset_plugin_index_cache():
    """Clears the cached plugin index. Primarily intended for tests and for
    callers that have invalidated the underlying plugin set out-of-band.
    """
    _INDEX_CACHE["key"] = None
    _INDEX_CACHE["value"] = None


def _build_plugin_index(enabled, signature=_DEFAULT_SIGNATURE):
    """Returns the cached ``(by_name, by_uri, listing_error)`` plugin index.

    Args:
        enabled: enablement filter; mirrors :class:`OperatorRegistry`'s
            ``enabled`` argument
        signature: an opaque, hashable cache key. If omitted, the configured
            default signature provider is used. Pass ``None`` to bypass the
            cache entirely.

    Returns:
        a tuple ``(by_name, by_uri, listing_error)``
    """
    if signature is _DEFAULT_SIGNATURE:
        signature = _signature_provider(enabled)

    cache_key = (enabled, signature)
    if signature is not None and _INDEX_CACHE["key"] == cache_key:
        return _INDEX_CACHE["value"]

    by_name = {}
    by_uri = {}
    listing_error = None

    try:
        plugin_defs = fop.list_plugins(enabled=enabled, builtin="all")
    except Exception:
        listing_error = traceback.format_exc()
        plugin_defs = []

    for pd in plugin_defs:
        by_name[pd.name] = pd
        for op_name in pd.operators:
            uri = "%s/%s" % (pd.name, op_name)
            # First-declared wins; mirrors the original ordering where
            # builtin plugins are listed first
            by_uri.setdefault(uri, pd)

    value = (by_name, by_uri, listing_error)

    # Don't poison the cache with a transient listing failure -- the next
    # request should retry against disk
    if signature is not None and listing_error is None:
        _INDEX_CACHE["key"] = cache_key
        _INDEX_CACHE["value"] = value

    return value


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
    and an in-memory index of operator URIs is built, and that index is
    memoized process-wide and reused across registries with the same
    signature. Plugin Python entry points are only exec'd lazily when an
    operator from that plugin is actually requested via :meth:`get_operator`
    or :meth:`operator_exists`, or when :meth:`list_operators` is called
    (which requires all plugins).

    Args:
        enabled (True): whether to include only enabled operators (True) or
            only disabled operators (False) or all operators ("all")
        index_signature (optional): an opaque, hashable cache key for the
            plugin index. If omitted, the configured signature provider is
            used (mtime-based by default). Subclasses such as
            :class:`fiftyone.operators.permissions.PermissionedOperatorRegistry`
            in ``fiftyone-teams`` can pass a cheaper authoritative
            fingerprint (e.g. one derived from the managed-plugins API) to
            avoid the disk walk on networked storage. Pass ``None`` to
            disable caching for this construction.
    """

    def __init__(self, enabled=True, *, index_signature=_DEFAULT_SIGNATURE):
        self._enabled = enabled
        self._contexts_by_plugin = {}
        self._all_ensured = False

        by_name, by_uri, listing_error = _build_plugin_index(
            enabled, signature=index_signature
        )
        # Shallow copy so registry mutations (e.g. a future ``register``
        # override) cannot corrupt the shared cached index
        self._plugin_defs_by_name = dict(by_name)
        self._plugin_defs_by_uri = dict(by_uri)
        self._listing_errors = [listing_error] if listing_error else []

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
