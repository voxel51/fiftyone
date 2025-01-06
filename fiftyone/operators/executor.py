"""
FiftyOne operator execution.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import collections
import inspect
import logging
import os
import traceback

from typing import Optional

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.media as fom
import fiftyone.core.odm.utils as focu
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
from fiftyone.operators.decorators import coroutine_timeout
from fiftyone.operators.message import GeneratedMessage, MessageType
from fiftyone.operators.operations import Operations
from fiftyone.operators.panel import PanelRef
from fiftyone.operators.registry import OperatorRegistry
from fiftyone.operators.store import ExecutionStore
import fiftyone.operators.types as types
from fiftyone.plugins.secrets import PluginSecretsResolver, SecretsDictionary
import fiftyone.server.view as fosv


logger = logging.getLogger(__name__)


class ExecutionRunState(object):
    """Enumeration of the available operator run states."""

    SCHEDULED = "scheduled"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class InvocationRequest(object):
    """Represents a request to invoke an operator.

    Args:
        operator_uri: the URI of the operator to invoke
        params (None): an optional dictionary of parameters
    """

    def __init__(self, operator_uri, params=None):
        self.operator_uri = operator_uri
        self.params = params or {}

    def to_json(self):
        return {
            "operator_uri": self.operator_uri,
            "params": self.params,
        }


class ExecutionProgress(object):
    """Represents the status of an operator execution.

    Args:
        progress (None): an optional float between 0 and 1 (0% to 100%)
        label (None): an optional label to display
    """

    def __init__(self, progress=None, label=None):
        self.progress = progress
        self.label = label
        self.updated_at = None


class Executor(object):
    """Handles the execution phase of the operator lifecycle.

    Args:
        requests (None): an optional list of InvocationRequest objects
        logs (None): an optional list of log messages
    """

    def __init__(self, requests=None, logs=None):
        self._requests = requests or []
        self._logs = logs or []

    def trigger(self, operator_name, params=None):
        """Triggers an invocation of the operator with the given name.

        Args:
            operator_name: the name of the operator
            params (None): a dictionary of parameters for the operator

        Returns:
            a :class:`fiftyone.operators.message.GeneratedMessage` containing
            instructions for the FiftyOne App to invoke the operator
        """
        inv_req = InvocationRequest(operator_name, params=params)
        self._requests.append(inv_req)
        return GeneratedMessage(
            MessageType.SUCCESS, cls=InvocationRequest, body=inv_req
        )

    def log(self, message):
        """Logs a message."""
        self._logs.append(message)

    def to_json(self):
        return {
            "requests": [t.to_json() for t in self._requests],
            "logs": self._logs,
        }


def execute_operator(operator_uri, ctx=None, **kwargs):
    """Executes the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        ctx (None): a dictionary of parameters defining the execution context.
            The supported keys are:

            -   ``dataset``: a :class:`fiftyone.core.dataset.Dataset` or the
                name of a dataset to process. This is required unless a
                ``view`` is provided
            -   ``view`` (None): an optional
                :class:`fiftyone.core.view.DatasetView` to process
            -   ``selected`` ([]): an optional list of selected sample IDs
            -   ``selected_labels`` ([]): an optional list of selected labels
                in the format returned by
                :attr:`fiftyone.core.session.Session.selected_labels`
            -   ``current_sample`` (None): an optional ID of the current sample
                being processed
            -   ``params``: a dictionary of parameters for the operator.
                Consult the operator's documentation for details
            -   ``request_delegation`` (False): whether to request delegated
                execution, if supported by the operator
            -   ``delegation_target`` (None): an optional orchestrator on which
                to schedule the operation, if it is delegated
        **kwargs: you can optionally provide any of the supported ``ctx`` keys
            as keyword arguments rather than including them in ``ctx``

    Returns:
        an :class:`ExecutionResult`, or an ``asyncio.Task`` if you run this
        method in a notebook context

    Raises:
        ExecutionError: if an error occurred while immediately executing an
            operation or scheduling a delegated operation
    """
    request_params = _parse_ctx(ctx=ctx, **kwargs)
    coroutine = execute_or_delegate_operator(
        operator_uri, request_params, exhaust=True
    )

    try:
        # Some contexts like notebooks already have event loops running, so we
        # must use the existing loop
        loop = asyncio.get_running_loop()
    except:
        loop = None

    if loop is not None:
        # @todo is it possible to await result here?
        # Sadly, run_until_complete() is not allowed in Jupyter notebooks
        # https://nocomplexity.com/documents/jupyterlab/tip-asyncio.html
        result = loop.create_task(coroutine)
    else:
        result = asyncio.run(coroutine)
        result.raise_exceptions()

    return result


def _parse_ctx(ctx=None, **kwargs):
    if ctx is None:
        ctx = {}

    ctx = {**ctx, **kwargs}  # don't modify input `ctx` in-place
    dataset = ctx.pop("dataset", None)
    view = ctx.pop("view", None)

    if dataset is None and isinstance(view, fov.DatasetView):
        dataset = view._root_dataset

    if view is None:
        if isinstance(dataset, str):
            dataset = fod.load_dataset(dataset)

        if dataset is not None:
            view = dataset.view()

    if view is not None:
        view = view._serialize()

    if isinstance(dataset, fod.Dataset):
        dataset_name = dataset.name
    else:
        dataset_name = dataset

    return dict(dataset_name=dataset_name, view=view, **ctx)


@coroutine_timeout(seconds=fo.config.operator_timeout)
async def execute_or_delegate_operator(
    operator_uri, request_params, exhaust=False
):
    """Executes the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        request_params: a dictionary of parameters for the operator
        exhaust (False): whether to immediately exhaust generator operators

    Returns:
        an :class:`ExecutionResult`
    """
    prepared = await prepare_operator_executor(operator_uri, request_params)
    if isinstance(prepared, ExecutionResult):
        raise prepared.to_exception()
    else:
        operator, executor, ctx, inputs = prepared

    execution_options = operator.resolve_execution_options(ctx)
    if (
        not execution_options.allow_immediate_execution
        and not execution_options.allow_delegated_execution
    ):
        raise RuntimeError(
            "This operation does not support immediate OR delegated execution"
        )

    should_delegate = (
        operator.resolve_delegation(ctx) or ctx.requesting_delegated_execution
    )
    if should_delegate:
        if not execution_options.allow_delegated_execution:
            logger.warning(
                "This operation does not support delegated "
                "execution; it will be executed immediately"
            )
            should_delegate = False
    else:
        if not execution_options.allow_immediate_execution:
            logger.warning(
                "This operation does not support immediate "
                "execution; it will be delegated"
            )
            should_delegate = True

    if should_delegate:
        try:
            from .delegated import DelegatedOperationService

            ctx.request_params["delegated"] = True
            metadata = {"inputs_schema": None, "outputs_schema": None}

            if inputs is not None:
                try:
                    metadata["inputs_schema"] = inputs.to_json()
                except Exception as e:
                    logger.warning(
                        f"Failed to resolve inputs schema for the operation: {str(e)}"
                    )

            op = DelegatedOperationService().queue_operation(
                operator=operator.uri,
                context=ctx.serialize(),
                delegation_target=ctx.delegation_target,
                label=operator.name,
                metadata=metadata,
            )

            execution = ExecutionResult(
                op.__dict__, executor, None, delegated=True
            )
            execution.result["context"] = (
                execution.result["context"].serialize()
                if execution.result["context"]
                else None
            )
            return execution
        except Exception as error:
            return ExecutionResult(
                executor=executor,
                error=traceback.format_exc(),
                error_message=str(error),
            )
    else:
        try:
            result = await do_execute_operator(operator, ctx, exhaust=exhaust)
        except Exception as error:
            return ExecutionResult(
                executor=executor,
                error=traceback.format_exc(),
                error_message=str(error),
            )

        return ExecutionResult(result=result, executor=executor)


async def prepare_operator_executor(
    operator_uri,
    request_params,
    set_progress=None,
    delegated_operation_id=None,
):
    registry = OperatorRegistry()
    if registry.operator_exists(operator_uri) is False:
        raise ValueError("Operator '%s' does not exist" % operator_uri)

    operator = registry.get_operator(operator_uri)
    executor = Executor()
    ctx = ExecutionContext(
        request_params=request_params,
        executor=executor,
        set_progress=set_progress,
        delegated_operation_id=delegated_operation_id,
        operator_uri=operator_uri,
        required_secrets=operator._plugin_secrets,
    )

    await ctx.resolve_secret_values(operator._plugin_secrets)
    inputs = operator.resolve_input(ctx)
    validation_ctx = ValidationContext(ctx, inputs, operator)
    if validation_ctx.invalid:
        return ExecutionResult(
            error="Validation error", validation_ctx=validation_ctx
        )

    return operator, executor, ctx, inputs


async def do_execute_operator(operator, ctx, exhaust=False):
    result = await (
        operator.execute(ctx)
        if asyncio.iscoroutinefunction(operator.execute)
        else fou.run_sync_task(operator.execute, ctx)
    )

    if not exhaust:
        return result

    if inspect.isgenerator(result):
        # Fastest way to exhaust sync generator, re: itertools consume()
        #   https://docs.python.org/3/library/itertools.html
        collections.deque(result, maxlen=0)
    elif inspect.isasyncgen(result):
        async for _ in result:
            pass
    else:
        return result


async def resolve_type(registry, operator_uri, request_params):
    """Resolves the inputs property type of the operator with the given name.

    Args:
        registry: an :class:`fiftyone.operators.registry.OperatorRegistry`
        operator_uri: the URI of the operator
        request_params: a dictionary of request parameters

    Returns:
        the type of the inputs :class:`fiftyone.operators.types.Property` of
        the operator, or None
    """
    if registry.operator_exists(operator_uri) is False:
        raise ValueError("Operator '%s' does not exist" % operator_uri)

    operator = registry.get_operator(operator_uri)
    ctx = ExecutionContext(
        request_params,
        operator_uri=operator_uri,
        required_secrets=operator._plugin_secrets,
    )
    await ctx.resolve_secret_values(operator._plugin_secrets)

    return await resolve_type_with_context(operator, ctx)


async def resolve_type_with_context(operator, context):
    """Resolves the "inputs" or "outputs" schema of an operator with the given
    context.

    Args:
        operator: the :class:`fiftyone.operators.Operator`
        context: the :class:`ExecutionContext` of an operator

    Returns:
        the "inputs" or "outputs" schema
        :class:`fiftyone.operators.types.Property` of an operator, or None
    """
    try:
        return operator.resolve_type(
            context, context.request_params.get("target", "inputs")
        )
    except Exception as e:
        return ExecutionResult(error=traceback.format_exc())


async def resolve_execution_options(registry, operator_uri, request_params):
    """Resolves the execution options of the operator with the given name.

    Args:
        registry: an :class:`fiftyone.operators.registry.OperatorRegistry`
        operator_uri: the URI of the operator
        request_params: a dictionary of request parameters

    Returns:
        a :class:`fiftyone.operators.executor.ExecutionOptions` or None
    """
    if registry.operator_exists(operator_uri) is False:
        raise ValueError("Operator '%s' does not exist" % operator_uri)

    operator = registry.get_operator(operator_uri)
    ctx = ExecutionContext(
        request_params,
        operator_uri=operator_uri,
        required_secrets=operator._plugin_secrets,
    )
    await ctx.resolve_secret_values(operator._plugin_secrets)
    try:
        return operator.resolve_execution_options(ctx)
    except Exception as e:
        return ExecutionResult(error=traceback.format_exc())


def resolve_placement(operator, request_params):
    """Resolves the placement of the operator with the given name.

    Args:
        operator: the :class:`fiftyone.operators.operator.Operator`
        request_params: a dictionary of request parameters

    Returns:
        the placement of the operator or ``None``
    """
    ctx = ExecutionContext(
        request_params,
        operator_uri=operator.uri,
        required_secrets=operator._plugin_secrets,
    )
    try:
        return operator.resolve_placement(ctx)
    except Exception as e:
        return ExecutionResult(error=str(e))


class ExecutionContext(object):
    """Represents the execution context of an operator.

    Operators can use the execution context to access the view, dataset, and
    selected samples, as well as to trigger other operators.

    Args:
        request_params (None): a optional dictionary of request parameters
        executor (None): an optional :class:`Executor` instance
        set_progress (None): an optional function to set the progress of the
            current operation
        delegated_operation_id (None): an optional ID of the delegated
            operation
        operator_uri (None): the unique id of the operator
        required_secrets (None): the list of required secrets from the
            plugin's definition
    """

    def __init__(
        self,
        request_params=None,
        executor=None,
        set_progress=None,
        delegated_operation_id=None,
        operator_uri=None,
        required_secrets=None,
    ):
        self.request_params = request_params or {}
        self.params = self.request_params.get("params", {})
        self.executor = executor
        self.user = None

        self._dataset = None
        self._view = None
        self._ops = Operations(self)

        self._set_progress = set_progress
        self._delegated_operation_id = delegated_operation_id
        self._operator_uri = operator_uri
        self._secrets = {}
        self._secrets_client = PluginSecretsResolver()
        self._required_secret_keys = required_secrets
        if self._required_secret_keys:
            self._secrets_client.register_operator(
                operator_uri=self._operator_uri,
                required_secrets=self._required_secret_keys,
            )
        if self.panel_id:
            self._panel_state = self.params.get("panel_state", {})
            self._panel = PanelRef(self)

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` being operated on."""
        if self._dataset is not None:
            return self._dataset

        # Since dataset may have been renamed, always resolve the dataset by
        # id if it is available
        uid = self.request_params.get("dataset_id", None)
        if uid:
            self._dataset = focu.load_dataset(id=uid)

            # Set the dataset_name using the dataset object in case the dataset
            # has been renamed or changed since the context was created
            self.request_params["dataset_name"] = self._dataset.name
        else:
            uid = self.request_params.get("dataset_name", None)
            if uid:
                self._dataset = focu.load_dataset(name=uid)

        # TODO: refactor so that this additional reload post-load is not
        #  required
        if self._dataset is not None:
            self._dataset.reload()

        if (
            self.group_slice is not None
            and self._dataset.media_type == fom.GROUP
        ):
            self._dataset.group_slice = self.group_slice

        return self._dataset

    @property
    def dataset_name(self):
        """The name of the :class:`fiftyone.core.dataset.Dataset` being
        operated on.
        """
        return self.request_params.get("dataset_name", None)

    @property
    def dataset_id(self):
        """The ID of the :class:`fiftyone.core.dataset.Dataset` being operated
        on.
        """
        return self.request_params.get("dataset_id", None)

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` being operated on."""
        if self._view is not None:
            return self._view

        # Always derive the view from the context's dataset
        dataset = self.dataset
        view_name = self.request_params.get("view_name", None)
        stages = self.request_params.get("view", None)
        filters = self.request_params.get("filters", None)
        extended = self.request_params.get("extended", None)

        if dataset is None:
            return None

        if view_name is None:
            self._view = fosv.get_view(
                dataset,
                stages=stages,
                filters=filters,
                extended_stages=extended,
                reload=False,
            )
        else:
            self._view = dataset.load_saved_view(view_name)

        return self._view

    def target_view(self, param_name="view_target"):
        """The target :class:`fiftyone.core.view.DatasetView` for the operator
        being executed.

        Args:
            param_name ("view_target"): the name of the enum parameter defining
                the target view choice

        Returns:
            a :class:`fiftyone.core.collections.SampleCollection`
        """
        target = self.params.get(param_name, None)
        if target == "SELECTED_SAMPLES":
            return self.view.select(self.selected)
        if target == "DATASET":
            return self.dataset
        return self.view

    @property
    def has_custom_view(self):
        """Whether the operator has a custom view."""
        stages = self.request_params.get("view", None)
        filters = self.request_params.get("filters", None)
        extended = self.request_params.get("extended", None)
        has_stages = stages is not None and stages != [] and stages != {}
        has_filters = filters is not None and filters != [] and filters != {}
        has_extended = (
            extended is not None and extended != [] and extended != {}
        )
        return has_stages or has_filters or has_extended

    @property
    def spaces(self):
        """The current spaces layout in the FiftyOne App."""
        workspace_name = self.request_params.get("workspace_name", None)
        if workspace_name is not None:
            return self.dataset.load_workspace(workspace_name)

        spaces_dict = self.request_params.get("spaces", None)
        if spaces_dict is not None:
            return fo.Space.from_dict(spaces_dict)

        return None

    @property
    def selected(self):
        """The list of selected sample IDs (if any)."""
        return self.request_params.get("selected", [])

    @property
    def selected_labels(self):
        """A list of selected labels (if any).

        Items are dictionaries with the following keys:

        -   ``label_id``: the ID of the label
        -   ``sample_id``: the ID of the sample containing the label
        -   ``field``: the field name containing the label
        -   ``frame_number``: the frame number containing the label (only
            applicable to video samples)
        """
        return self.request_params.get("selected_labels", [])

    @property
    def extended_selection(self):
        """The extended selection of the view (if any)."""
        return self.request_params.get("extended_selection", None)

    @property
    def current_sample(self):
        """The ID of the current sample being processed (if any).

        When executed via the FiftyOne App, this is set when the user opens a
        sample in the modal.
        """
        return self.request_params.get("current_sample", None)

    @property
    def user_id(self):
        """The ID of the user executing the operation, if known."""
        return self.user.id if self.user else None

    @property
    def user_request_token(self):
        """The request token authenticating the user executing the operation,
        if known.
        """
        return self.user._request_token if self.user else None

    @property
    def panel_id(self):
        """The ID of the panel that invoked the operator, if any."""
        # @todo: move panel_id to top level param
        return self.params.get("panel_id", None)

    @property
    def panel_state(self):
        """The current panel state.

        Only available when the operator is invoked from a panel.
        """
        return self._panel_state

    @property
    def panel(self):
        """A :class:`fiftyone.operators.panel.PanelRef` instance that you can
        use to read and write the state and data of the current panel.

        Only available when the operator is invoked from a panel.
        """
        return self._panel

    @property
    def delegated(self):
        """Whether the operation was delegated."""
        return self.request_params.get("delegated", False)

    @property
    def requesting_delegated_execution(self):
        """Whether delegated execution was requested for the operation."""
        return self.request_params.get("request_delegation", False)

    @property
    def delegation_target(self):
        """The orchestrator to which the operation was delegated (if any)."""
        return self.request_params.get("delegation_target", None)

    @property
    def results(self):
        """A ``dict`` of results for the current operation."""
        return self.request_params.get("results", {})

    @property
    def secrets(self):
        """A read-only mapping of keys to their resolved values."""
        return SecretsDictionary(
            self._secrets,
            operator_uri=self._operator_uri,
            resolver_fn=self._secrets_client.get_secret_sync,
            required_keys=self._required_secret_keys,
        )

    @property
    def ops(self):
        """A :class:`fiftyone.operators.operations.Operations` instance that
        you can use to trigger builtin operations on the current context.
        """
        return self._ops

    @property
    def group_slice(self):
        """The current group slice of the view (if any)."""
        return self.request_params.get("group_slice", None)

    @property
    def query_performance(self):
        """Whether query performance is enabled."""
        return self.request_params.get("query_performance", None)

    def prompt(
        self,
        operator_uri,
        params=None,
        on_success=None,
        on_error=None,
        skip_prompt=False,
    ):
        """Prompts the user to execute the operator with the given URI.

        Args:
            operator_uri: the URI of the operator
            params (None): a dictionary of parameters for the operator
            on_success (None): a callback to invoke if the user successfully
                executes the operator
            on_error (None): a callback to invoke if the execution fails
            skip_prompt (False): whether to skip the prompt

        Returns:
            a :class:`fiftyone.operators.message.GeneratedMessage` containing
            instructions for the FiftyOne App to prompt the user
        """
        return self.trigger(
            "prompt_user_for_operation",
            params=_convert_callables_to_operator_uris(
                {
                    "operator_uri": operator_uri,
                    "panel_id": self.panel_id,
                    "params": params,
                    "on_success": on_success,
                    "on_error": on_error,
                    "skip_prompt": skip_prompt,
                }
            ),
        )

    def secret(self, key):
        """Retrieves the secret with the given key.

        Args:
            key: a secret key

        Returns:
            the secret value
        """
        if key not in self._secrets:
            try:
                secret = self._secrets_client.get_secret_sync(
                    key, self._operator_uri
                )
                if secret:
                    self._secrets[secret.key] = secret.value

            except KeyError:
                logging.debug(f"Failed to resolve value for secret `{key}`")
        return self._secrets.get(key, None)

    async def resolve_secret_values(self, keys, **kwargs):
        """Resolves the values of the given secrets keys.

        Args:
            keys: a list of secret keys
            **kwargs: additional keyword arguments to pass to the secrets
                client for authentication if required
        """
        if None in (self._secrets_client, keys):
            return None

        for key in keys:
            secret = await self._secrets_client.get_secret(
                key, self._operator_uri, **kwargs
            )
            if secret:
                self._secrets[secret.key] = secret.value

    def trigger(self, operator_name, params=None):
        """Triggers an invocation of the operator with the given name.

        This method is only available when the operator is invoked via the
        FiftyOne App. You can check this via ``ctx.executor``.

        Example::

            def execute(self, ctx):
                # Trigger the `reload_dataset` operator after this operator
                # finishes executing
                ctx.trigger("reload_dataset")

                # Immediately trigger the `reload_dataset` operator while a
                # generator operator is executing
                yield ctx.trigger("reload_dataset")

        Args:
            operator_name: the name of the operator
            params (None): a dictionary of parameters for the operator

        Returns:
            a :class:`fiftyone.operators.message.GeneratedMessage` containing
            instructions for the FiftyOne App to invoke the operator
        """
        if self.executor is None:
            raise ValueError("No executor available")

        return self.executor.trigger(operator_name, params)

    def log(self, message):
        """Logs a message to the browser console.

        .. note::

            This method is only available to non-delegated operators. You can
            only use this method during the execution of an operator.

        Args:
            message: a message to log

        Returns:
            a :class:`fiftyone.operators.message.GeneratedMessage` containing
            instructions for the FiftyOne App to invoke the operator
        """
        return self.trigger("console_log", {"message": message})

    def set_progress(self, progress=None, label=None):
        """Sets the progress of the current operation.

        Args:
            progress (None): an optional float between 0 and 1 (0% to 100%)
            label (None): an optional label to display
        """
        if self._set_progress:
            self._set_progress(
                self._delegated_operation_id,
                ExecutionProgress(progress, label),
            )
        else:
            self.log(f"Progress: {progress} - {label}")

    def store(self, store_name):
        """Retrieves the execution store with the given name.

        The store is automatically created if necessary.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.operators.store.ExecutionStore`
        """
        dataset_id = self.dataset._doc.id
        return ExecutionStore.create(store_name, dataset_id)

    def _get_serialized_request_params(self):
        request_params_copy = self.request_params.copy()
        request_params_copy.get("params", {}).pop("panel_state", None)
        return request_params_copy

    def serialize(self):
        """Serializes the execution context.

        Returns:
            a JSON dict
        """
        return {
            "request_params": self.request_params,
            "params": self.params,
        }

    def to_dict(self):
        """Returns the properties of the execution context as a dict."""
        return {
            k: v for k, v in self.__dict__.items() if not k.startswith("_")
        }


class ExecutionResult(object):
    """Represents the result of an operator execution.

    Args:
        result (None): the execution result
        executor (None): an :class:`Executor`
        error (None): an error traceback, if an error occurred
        error_message (None): an error message, if an error occurred
        validation_ctx (None): a :class:`ValidationContext`
        delegated (False): whether execution was delegated
        outputs_schema (None): a JSON dict representing the output schema of
            the operator
    """

    def __init__(
        self,
        result=None,
        executor=None,
        error=None,
        error_message=None,
        validation_ctx=None,
        delegated=False,
        outputs_schema=None,
    ):
        self.result = result
        self.executor = executor
        self.error = error
        self.error_message = error_message
        self.validation_ctx = validation_ctx
        self.delegated = delegated
        self.outputs_schema = outputs_schema

    @property
    def is_generator(self):
        """Whether the result is a generator or an async generator."""
        return inspect.isgenerator(self.result) or inspect.isasyncgen(
            self.result
        )

    def raise_exceptions(self):
        """Raises an :class:`ExecutionError` (only) if the operation failed."""
        exception = self.to_exception()
        if exception is not None:
            raise exception

    def to_exception(self):
        """Returns an :class:`ExecutionError` representing a failed execution
        result.

        Returns:
            a :class:`ExecutionError`, or None if the execution did not fail
        """
        if not self.error:
            return None

        msg = self.error

        if self.validation_ctx and self.validation_ctx.invalid:
            val_error = self.validation_ctx.errors[0]
            path = val_error.path.lstrip(".")
            reason = val_error.reason
            msg += f". Path: {path}. Reason: {reason}"

        return ExecutionError(msg)

    def to_json(self):
        """Returns a JSON dict representation of the result.

        Returns:
            a JSON dict
        """
        return {
            "result": self.result,
            "executor": self.executor.to_json() if self.executor else None,
            "error": self.error,
            "error_message": self.error_message,
            "delegated": self.delegated,
            "validation_ctx": (
                self.validation_ctx.to_json() if self.validation_ctx else None
            ),
            "outputs_schema": self.outputs_schema,
        }


class ExecutionError(Exception):
    """An error that occurs while executing an operator."""


class ValidationError(object):
    """A validation error.

    Args:
        reason: the reason
        property: the property
        path: the path
    """

    def __init__(self, reason, property, path, custom=False):
        self.reason = reason
        self.error_message = property.error_message
        self.path = path
        self.custom = custom

    def to_json(self):
        """Returns a JSON dict representation of the error.

        Returns:
            a JSON dict
        """
        return {
            "reason": self.reason,
            "error_message": self.error_message,
            "path": self.path,
            "custom": self.custom,
        }


class ValidationContext(object):
    """Represents the validation context of an operator.

    Args:
        ctx: the :class:`ExecutionContext`
        inputs_property: the :class:`fiftyone.operators.types.Property` of the
            operator inputs
        operator: the :class:`fiftyone.operators.operator.Operator`
    """

    def __init__(self, ctx, inputs_property, operator):
        self.ctx = ctx
        self.params = ctx.params
        self.inputs_property = inputs_property
        self.errors = []
        self.disable_schema_validation = (
            operator.config.disable_schema_validation
        )
        if self.inputs_property is None:
            self.invalid = False
        else:
            self.errors = self._validate()
            self.invalid = len(self.errors) > 0

    def to_json(self):
        """Returns a JSON dict representation of the context.

        Returns:
            a JSON dict
        """
        return {
            "invalid": self.invalid,
            "errors": [e.to_json() for e in self.errors],
        }

    def add_error(self, error):
        """Adds a validation error.

        Args:
            error: a :class:`ValidationError`
        """
        if self.disable_schema_validation and error.custom != True:
            return
        self.errors.append(error)

    def _validate(self):
        params = self.params
        validation_error = self.validate_property(
            "", self.inputs_property, params
        )
        if validation_error:
            self.add_error(validation_error)

        return self.errors

    def validate_enum(self, path, property, value):
        """Validates an enum value.

        Args:
            path: the path to the property
            property: the :class:`fiftyone.operators.types.Property`
            value: the value to validate

        Returns:
            a :class:`ValidationError`, if the value is invalid
        """
        enum = property.type
        if value not in enum.values:
            return ValidationError("Invalid enum value", property, path)

    def validate_list(self, path, property, value):
        """Validates a list value.

        Args:
            path: the path to the property
            property: the :class:`fiftyone.operators.types.Property`
            value: the value to validate

        Returns:
            a :class:`ValidationError`, if the value is invalid
        """
        if not isinstance(value, list):
            return ValidationError("Invalid list", property, path)

        element_type = property.type.element_type

        for i in range(len(value)):
            item = value[i]
            item_path = f"{path}[{i}]"
            item_property = types.Property(element_type)
            validation_error = self.validate_property(
                item_path, item_property, item
            )
            if validation_error is not None:
                self.add_error(validation_error)

    def validate_property(self, path, property, value):
        """Validates a property value.

        Args:
            path: the path to the property
            property: the :class:`fiftyone.operators.types.Property`
            value: the value to validate

        Returns:
            a :class:`ValidationError`, if the value is invalid
        """
        if property.invalid:
            return ValidationError(
                property.error_message, property, path, True
            )

        if not self.exists_or_non_required(property, value):
            return ValidationError("Required property", property, path)

        if value is not None:
            if isinstance(property.type, types.Enum):
                return self.validate_enum(path, property, value)

            if isinstance(property.type, types.Object):
                return self.validate_object(path, property, value)

            if isinstance(property.type, types.List):
                return self.validate_list(path, property, value)

            return self.validate_primitive(path, property, value)

    def validate_object(self, path, property, value):
        """Validates an object value.

        Args:
            path: the path to the property
            property: the :class:`fiftyone.operators.types.Property`
            value: the value to validate

        Returns:
            a :class:`ValidationError`, if the value is invalid
        """
        propertyType = property.type
        if value is None:
            return ValidationError("Invalid object", property, path)

        for name, property in propertyType.properties.items():
            propertyValue = value.get(name, None)
            validation_error = self.validate_property(
                path + "." + name, property, propertyValue
            )
            if validation_error is not None:
                self.add_error(validation_error)

    def validate_primitive(self, path, property, value):
        """Validates a primitive value.

        Args:
            path: the path to the property
            property: the :class:`fiftyone.operators.types.Property`
            value: the value to validate

        Returns:
            a :class:`ValidationError`, if the value is invalid
        """
        type_name = property.type.__class__.__name__
        value_type = type(value)
        if type_name == "String" and value_type != str:
            return ValidationError("Invalid value type", property, path)

        if type_name == "Number":
            min = property.type.min
            min_type = type(min)
            max = property.type.max
            max_type = type(max)
            if value_type != int and value_type != float:
                return ValidationError("Invalid value type", property, path)
            if (min_type == int or min_type == float) and value < min:
                return ValidationError(
                    f"Value must be greater than {min}", property, path
                )
            if (max_type == int or max_type == float) and value > max:
                return ValidationError(
                    f"Value must be less than {max}", property, path
                )

        if type_name == "Boolean" and value_type != bool:
            return ValidationError("Invalid value type", property, path)

    def exists_or_non_required(self, property, value):
        if not property.required:
            return True

        type_name = property.type.__class__.__name__

        if type_name == "String":
            allow_empty = property.type.allow_empty
            if not allow_empty and value == "":
                return False

        return value is not None


# TODO: move to utils
def _convert_callables_to_operator_uris(d):
    updated = {**d}
    for key, value in updated.items():
        if callable(value):
            updated[key] = f"{value.__self__.uri}#{value.__name__}"
    return updated


class ExecutionOptions(object):
    """Represents the execution options of an operation.

    Args:
        allow_immediate_execution (True): whether the operation can be executed
            immediately
        allow_delegated_execution (False): whether the operation can be
            delegated to an orchestrator
        default_choice_to_delegated (False): whether to default to delegated
            execution, if allowed
    """

    def __init__(
        self,
        allow_immediate_execution=True,
        allow_delegated_execution=False,
        default_choice_to_delegated=False,
    ):
        self._allow_immediate_execution = allow_immediate_execution
        self._allow_delegated_execution = allow_delegated_execution
        self._default_choice_to_delegated = default_choice_to_delegated
        self._available_orchestrators = []

        if not allow_delegated_execution and not allow_immediate_execution:
            self._allow_immediate_execution = True

    @property
    def allow_immediate_execution(self):
        return self._allow_immediate_execution

    @property
    def allow_delegated_execution(self):
        return self._allow_delegated_execution

    @property
    def default_choice_to_delegated(self):
        return self._default_choice_to_delegated

    @property
    def available_orchestrators(self):
        return self._available_orchestrators or []

    @property
    def orchestrator_registration_enabled(self):
        return not fo.config.allow_legacy_orchestrators

    def update(self, available_orchestrators=None):
        self._available_orchestrators = available_orchestrators

    def to_dict(self):
        return {
            "allow_immediate_execution": self._allow_immediate_execution,
            "allow_delegated_execution": self._allow_delegated_execution,
            "default_choice_to_delegated": self._default_choice_to_delegated,
            "orchestrator_registration_enabled": self.orchestrator_registration_enabled,
            "available_orchestrators": [
                x.__dict__ for x in self.available_orchestrators
            ],
        }
