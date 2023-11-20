"""
FiftyOne operator execution.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import asyncio
import collections
import inspect
import logging
import os
import traceback
import types as python_types
import typing

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.core.view as fov
import fiftyone.server.view as fosv
import fiftyone.operators.types as types
from fiftyone.plugins.secrets import PluginSecretsResolver, SecretsDictionary

from fiftyone.operators.decorators import coroutine_timeout
from fiftyone.operators.registry import OperatorRegistry
from fiftyone.operators.message import GeneratedMessage, MessageType


class ExecutionRunState(object):
    """Enumeration of the available operator run states."""

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


class ExecutionProgress:
    """Represents the status of an operator execution.

    at least one of progress or label must be provided
    Args:
        progress (None): an optional float between 0 and 1 (0% to 100%)
        label (None): an optional label to display
    """

    def __init__(self, progress: float = None, label: str = None):
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
            the result of the invocation
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


# TODO: add request_delegation and delegation_target
def execute_operator(operator_uri, ctx, params=None):
    """Executes the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        ctx: a dictionary of parameters defining the execution context. The
            supported keys are:

            -   ``dataset``: a :class:`fiftyone.core.dataset.Dataset` or the
                name of a dataset to process. This is required unless a
                ``view`` is provided
            -   ``view``: an optional :class:`fiftyone.core.view.DatasetView`
                to process
            -   ``selected``: an optional list of selected sample IDs
            -   ``selected_labels``: an optional list of selected labels in the
                format returned by
                :attr:`fiftyone.core.session.Session.selected_labels`
            -   ``params``: a dictionary of parameters for the operator.
                Consult the operator's documentation for details
        params (None): you can optionally provide the ``ctx.params`` dict as
            a separate argument

    Returns:
        an :class:`ExecutionResult`
    """
    dataset_name, view_stages, selected, selected_labels, params = _parse_ctx(
        ctx, params=params
    )

    request_params = dict(
        operator_uri=operator_uri,
        dataset_name=dataset_name,
        view=view_stages,
        selected=selected,
        selected_labels=selected_labels,
        params=params,
    )

    return asyncio.run(
        execute_or_delegate_operator(
            operator_uri, request_params, exhaust=True
        )
    )


def _parse_ctx(ctx, params=None):
    dataset = ctx.get("dataset", None)
    view = ctx.get("view", None)
    selected = ctx.get("selected", None)
    selected_labels = ctx.get("selected_labels", None)

    if params is None:
        params = ctx.get("params", {})

    if dataset is None and isinstance(view, fov.DatasetView):
        dataset = view._root_dataset

    if view is None:
        if isinstance(dataset, str):
            dataset = fod.load_dataset(dataset)

        view = dataset.view()

    view_stages = view._serialize()

    if isinstance(dataset, fod.Dataset):
        dataset_name = dataset.name
    else:
        dataset_name = dataset

    return dataset_name, view_stages, selected, selected_labels, params


# request token and user are teams-only
@coroutine_timeout(seconds=fo.config.operator_timeout)
async def execute_or_delegate_operator(
    operator_uri, request_params, request_token=None, user=None, exhaust=False
):
    """Executes the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        request_params: a dictionary of parameters for the operator
        request_token (None): the authentication token from the request
        user (None): the user executing the operator
        exhaust (False): whether to immediately exhaust generator operators

    Returns:
        an :class:`ExecutionResult`
    """
    prepared = await prepare_operator_executor(
        operator_uri, request_params, request_token=request_token, user=user
    )

    if isinstance(prepared, ExecutionResult):
        raise prepared.to_exception()
    else:
        operator, executor, ctx = prepared

    execution_options = operator.resolve_execution_options(ctx)
    resolved_delegation = operator.resolve_delegation(ctx)
    should_delegate = (
        ctx.requesting_delegated_execution or resolved_delegation
    ) and execution_options.allow_delegated_execution
    if should_delegate:
        try:
            from .delegated import DelegatedOperationService

            op = DelegatedOperationService().queue_operation(
                operator=operator.uri,
                context=ctx.serialize(),
                delegation_target=ctx.delegation_target,
                label=operator.name,
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
        except Exception as e:
            return ExecutionResult(
                executor=executor, error=traceback.format_exc()
            )
    else:
        try:
            result = await do_execute_operator(operator, ctx, exhaust=exhaust)
        except Exception as e:
            return ExecutionResult(
                executor=executor, error=traceback.format_exc()
            )

        return ExecutionResult(result=result, executor=executor)


async def prepare_operator_executor(
    operator_uri,
    request_params,
    set_progress=None,
    delegated_operation_id=None,
    request_token=None,
    user=None,
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
        user=user,
        delegation_target=request_params.get("delegation_target", None),
        request_delegation=request_params.get("request_delegation", False),
    )

    await ctx.resolve_secret_values(
        operator._plugin_secrets, request_token=request_token
    )
    inputs = operator.resolve_input(ctx)
    validation_ctx = ValidationContext(ctx, inputs, operator)
    if validation_ctx.invalid:
        return ExecutionResult(
            error="Validation error", validation_ctx=validation_ctx
        )

    return operator, executor, ctx


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


def resolve_type(registry, operator_uri, request_params):
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
    try:
        return operator.resolve_type(
            ctx, request_params.get("target", "inputs")
        )
    except Exception as e:
        return ExecutionResult(error=traceback.format_exc())


def resolve_execution_options(registry, operator_uri, request_params):
    """Resolves the execution options of the operator with the given name.

    Args:
        registry: an :class:`fiftyone.operators.registry.OperatorRegistry`
        operator_uri: the URI of the operator
        request_params: a dictionary of request parameters

    Returns:
        the type of the inputs :class:`fiftyone.operators.executor.ExecutionOptions` of
        the operator, or None
    """
    from fiftyone.operators.orchestrator import OrchestratorService

    if registry.operator_exists(operator_uri) is False:
        raise ValueError("Operator '%s' does not exist" % operator_uri)

    operator = registry.get_operator(operator_uri)
    ctx = ExecutionContext(
        request_params,
        operator_uri=operator_uri,
        required_secrets=operator._plugin_secrets,
    )
    orc_svc = OrchestratorService()
    try:
        search_params = {}
        search_params[operator.uri] = ["available_operators"]
        matching_orcs = orc_svc.list(search=search_params)
        execution_options = operator.resolve_execution_options(ctx)
        execution_options.update(available_orchestrators=matching_orcs)
        return execution_options

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
        user=None,
        operator_uri=None,
        required_secrets: typing.List[str] = None,
        delegation_target=None,
        request_delegation=False,
    ):
        self.request_params = request_params or {}
        self.params = self.request_params.get("params", {})
        self.executor = executor

        self._dataset = None
        self._view = None
        self.user = user

        self._set_progress = set_progress
        self._delegated_operation_id = delegated_operation_id
        self._operator_uri = operator_uri

        self._secrets = {}
        self._secrets_client = PluginSecretsResolver()
        if required_secrets:
            self._secrets_client.register_operator(
                operator_uri=self._operator_uri,
                required_secrets=required_secrets,
            )
        self._delegation_target = delegation_target
        self._request_delegation = request_delegation

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` being operated on."""
        if self._dataset is not None:
            return self._dataset

        dataset_name = self.request_params.get("dataset_name", None)

        self._dataset = fod.load_dataset(dataset_name)
        self._dataset.reload()

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
    def delegation_target(self):
        """The ID of the Orchestrator being used to delegate the operation."""
        return self.request_params.get(
            "delegation_target", self._delegation_target
        )

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` being operated on."""
        if self._view is not None:
            return self._view

        # Forces a dataset reload if necessary
        _ = self.dataset

        dataset_name = self.request_params.get("dataset_name", None)
        stages = self.request_params.get("view", None)
        filters = self.request_params.get("filters", None)
        extended = self.request_params.get("extended", None)

        self._view = fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            reload=False,
        )

        return self._view

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
    def current_sample(self):
        """The ID of the current sample being processed (if any).

        When executed via the FiftyOne App, this is set when the user opens a
        sample in the modal.
        """
        return self.request_params.get("current_sample", None)

    @property
    def delegated(self):
        """Whether the operation's execution was delegated to an orchestrator.

        This property is only available for methods that are invoked after an
        operator is executed, e.g. :meth:`resolve_output`.
        """
        return self.request_params.get("delegated", False)

    @property
    def results(self):
        """A ``dict`` of results for the current operation.

        This property is only available for methods that are invoked after an
        operator is executed, e.g. :meth:`resolve_output`.
        """
        return self.request_params.get("results", {})

    @property
    def secrets(self) -> SecretsDictionary:
        """A read-only mapping of keys to their resolved values."""
        return SecretsDictionary(
            self._secrets,
            operator_uri=self._operator_uri,
            resolver_fn=self._secrets_client.get_secret_sync,
        )

    @property
    def requesting_delegated_execution(self):
        """Whether the invocation requested delegated execution."""
        return self._request_delegation

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

        Args:
            operator_name: the name of the operator
            params (None): a dictionary of parameters for the operator

        Returns:
            a :class:`fiftyone.operators.message.GeneratedMessage` containing
            the result of the invocation
        """
        if self.executor is None:
            raise ValueError("No executor available")

        return self.executor.trigger(operator_name, params)

    def log(self, message):
        """Logs a message to the browser console.

        Args:
            message: a message to log
        """
        self.trigger("console_log", {"message": message})

    def serialize(self):
        """Serializes the execution context.

        Returns:
            a JSON dict
        """
        return {
            "request_params": self.request_params,
            "params": self.params,
            "user": self.user,
        }

    def to_dict(self):
        """Returns the properties of the execution context as a dict."""
        return {
            k: v for k, v in self.__dict__.items() if not k.startswith("_")
        }

    def set_progress(self, progress: float = None, label: str = None):
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
            self.log(f"Progress: {progress.progress} - {progress.label}")


class ExecutionResult(object):
    """Represents the result of an operator execution.

    Args:
        result (None): the execution result
        executor (None): an :class:`Executor`
        error (None): an error message
        validation_ctx (None): a :class:`ValidationContext`
    """

    def __init__(
        self,
        result=None,
        executor=None,
        error=None,
        validation_ctx=None,
        delegated=False,
    ):
        self.result = result
        self.executor = executor
        self.error = error
        self.validation_ctx = validation_ctx
        self.delegated = delegated

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
            "delegated": self.delegated,
            "validation_ctx": self.validation_ctx.to_json()
            if self.validation_ctx
            else None,
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


class ExecutionOptions(object):
    """Represents the execution options of an operator.

    Args:
        allow_immediate_execution (True): whether the operator can be executed
            immediately
        allow_delegated_execution (True): whether the operator can be delegated
            to an orchestrator
        default_choice_to_delegated (True): when True the default option is to delegate
    """

    def __init__(
        self,
        allow_immediate_execution=True,
        allow_delegated_execution=True,
        default_choice_to_delegated=True,
    ):
        self._allow_immediate_execution = allow_immediate_execution
        self._allow_delegated_execution = allow_delegated_execution
        self._available_orchestrators = []
        self._default_choice_to_delegated = default_choice_to_delegated
        if not allow_delegated_execution and not allow_immediate_execution:
            self._allow_immediate_execution = True

    @property
    def allow_delegated_execution(self):
        return self._allow_delegated_execution

    @property
    def allow_immediate_execution(self):
        return self._allow_immediate_execution

    @property
    def available_orchestrators(self):
        return self._available_orchestrators or []

    @property
    def orchestrator_registration_enabled(self):
        return bool(
            os.environ.get("FIFTYONE_ENABLE_ORCHESTRATOR_REGISTRATION", False)
        )

    @property
    def default_choice_to_delegated(self):
        return self._default_choice_to_delegated

    def update(self, available_orchestrators=None):
        self._available_orchestrators = available_orchestrators

    def to_dict(self):
        return {
            "allow_immediate_execution": self._allow_immediate_execution,
            "allow_delegated_execution": self._allow_delegated_execution,
            "orchestrator_registration_enabled": self.orchestrator_registration_enabled,
            "available_orchestrators": [
                x.__dict__ for x in self.available_orchestrators
            ],
            "default_choice_to_delegated": self._default_choice_to_delegated,
        }
