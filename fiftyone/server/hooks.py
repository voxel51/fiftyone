"""
FiftyOne Server request hooks.

Extension points around the App server's reads and writes. Every hook is
a no-op here; a deployment can register an implementation with
:func:`register` to apply its own access rules (for example, to keep
some fields of a dataset out of the payloads a given viewer receives).

The server calls the hooks as follows:

-   :meth:`RequestHooks.on_request` once a route or GraphQL resolver
    knows the request it serves and, usually, the dataset it targets,
    before it builds a view or touches a sample. It is the only async
    hook: an implementation does its slow work (resolving the viewer,
    loading a policy) here and keeps the result for the request.
-   :meth:`RequestHooks.transform_view` on every view
    :func:`fiftyone.server.view.get_view` returns.
-   :meth:`RequestHooks.transform_lightning_input` on the input of a
    lightning query, which reads the database directly rather than
    through a view.
-   :meth:`RequestHooks.sample_write` around a write to a sample, with
    the paths the write touches.
-   :meth:`RequestHooks.transform_sample_dict` on a serialized sample
    before it is returned in a response.

The sync hooks may run in worker threads, which copy the request's
context, so request-scoped state should live in a
:class:`contextvars.ContextVar`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import importlib

#: The optional module that registers a deployment's hooks, imported the
#: first time the hooks are requested. Absent in FiftyOne.
_OPTIONAL_HOOKS_MODULE = "fiftyone.internal.server_hooks"


class RequestHooks(object):
    """Server request hooks. Every method is a no-op; subclasses override
    the ones they need and are installed with :func:`register`.
    """

    async def on_request(self, request, params=None):
        """Called before a route or resolver reads or writes data.

        Args:
            request: the ``starlette.requests.Request``
            params (None): the request's parameters: the parsed JSON body
                or the query parameters of a route, or ``{"dataset":
                name}`` for a GraphQL resolver. Route path parameters are
                available as ``request.path_params``

        Raises:
            starlette.exceptions.HTTPException: to reject the request
        """

    def transform_view(self, view):
        """Returns the view to use in place of ``view``.

        Args:
            view: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a :class:`fiftyone.core.collections.SampleCollection`
        """
        return view

    def transform_lightning_input(self, input):
        """Returns the lightning query input to run in place of ``input``.

        Args:
            input: a :class:`fiftyone.server.lightning.LightningInput`

        Returns:
            a :class:`fiftyone.server.lightning.LightningInput`
        """
        return input

    @contextlib.contextmanager
    def sample_write(self, sample, paths):
        """Context manager around a write to ``sample``.

        Code before the ``yield`` runs before the write is applied and may
        raise ``starlette.exceptions.HTTPException`` to reject it; code
        after it runs once the write is applied in memory, before the
        sample is saved.

        Args:
            sample: the :class:`fiftyone.core.sample.Sample` being written
            paths: the paths the write touches: dotted field paths, or
                JSON Patch pointers (including the ``from`` pointer of a
                ``move`` or ``copy`` op)
        """
        yield

    def transform_sample_dict(self, sample, d):
        """Returns the serialized ``sample`` to send in a response.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            d: the serialized sample

        Returns:
            a dict
        """
        return d


_hooks = None


def register(hooks):
    """Installs the server request hooks.

    Args:
        hooks: a :class:`RequestHooks`, or ``None`` to restore the
            defaults
    """
    global _hooks
    _hooks = hooks if hooks is not None else RequestHooks()


def get():
    """Returns the installed server request hooks.

    The first call imports the deployment's optional hooks module, which
    registers its hooks when present.

    Returns:
        a :class:`RequestHooks`
    """
    global _hooks
    if _hooks is None:
        _hooks = RequestHooks()
        try:
            importlib.import_module(_OPTIONAL_HOOKS_MODULE)
        except ModuleNotFoundError as e:
            if e.name != _OPTIONAL_HOOKS_MODULE:
                raise

    return _hooks


async def on_graphql_request(info, dataset_name):
    """Calls :meth:`RequestHooks.on_request` for a GraphQL resolver that
    reads ``dataset_name``.

    Args:
        info: the resolver's ``strawberry.Info``, or ``None``
        dataset_name: the name of the dataset the resolver reads
    """
    request = getattr(getattr(info, "context", None), "request", None)
    await get().on_request(request, {"dataset": dataset_name})


def write_paths(patch_list):
    """Returns the paths a JSON Patch touches: every op's ``path``, and
    the ``from`` pointer of ``move`` and ``copy`` ops.

    Args:
        patch_list: a list of JSON Patch operations

    Returns:
        a list of JSON Patch pointers
    """
    paths = []
    for op in patch_list or []:
        if not isinstance(op, dict):
            continue

        if isinstance(op.get("path"), str):
            paths.append(op["path"])

        if op.get("op") in ("move", "copy") and isinstance(
            op.get("from"), str
        ):
            paths.append(op["from"])

    return paths
