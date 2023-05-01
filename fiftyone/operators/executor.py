"""
FiftyOne operator execution.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .registry import OperatorRegistry
import fiftyone.server.view as fosv
import fiftyone as fo
import fiftyone.operators.types as types
from .message import GeneratedMessage, MessageType
import types as python_types
import traceback


class InvocationRequest:
    """Represents a request to invoke an operator.
    Args:
        operator_uri: the URI of the operator to invoke
        params: a dictionary of parameters
    """

    def __init__(self, operator_uri, params={}):
        self.operator_uri = operator_uri
        self.params = params

    def to_json(self):
        return {
            "operator_uri": self.operator_uri,
            "params": self.params,
        }


class Executor:
    """Handles the execution phase of the operator lifecycle.
    Args:
        requests: an optional list of InvocationRequest objects
        logs: an optional list of log messages
    """

    def __init__(self, requests=None, logs=None):
        self._requests = requests or []
        self._logs = logs or []

    def trigger(self, operator_name, params={}):
        """Triggers an invocation of the operator with the given name.

        Args:
            operator_name: the name of the operator
            params: a dictionary of parameters for the operator

        Returns:
            a :class:`GeneratedMessage` containing the result of the invocation
        """
        inv_req = InvocationRequest(operator_name, params)
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


def execute_operator(operator_name, request_params):
    """Executes the operator with the given name.
    Args:
        operator_name: the name of the operator
        params: a dictionary of parameters for the operator
    Returns:
        the result of the operator as a dictionary or ``None``
    """
    registry = OperatorRegistry()
    if registry.operator_exists(operator_name) is False:
        raise ValueError("Operator '%s' does not exist" % operator_name)

    operator = registry.get_operator(operator_name)
    executor = Executor()
    ctx = ExecutionContext(request_params, executor)
    inputs = operator.resolve_input(ctx)

    validation_ctx = ValidationContext(ctx, inputs)
    if validation_ctx.invalid:
        return ExecutionResult(None, None, "Validation Error", validation_ctx)
    try:
        raw_result = operator.execute(ctx)
    except Exception as e:
        return ExecutionResult(None, executor, str(e))
    return ExecutionResult(raw_result, executor, None)


def _is_generator(value):
    """
    Returns True if the given value is a generator or an async generator, False otherwise.
    """
    return isinstance(value, python_types.GeneratorType) or isinstance(
        value, python_types.AsyncGeneratorType
    )


def resolve_type(registry, operator_uri, request_params):
    """Resolves the inputs property type of the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        request_params: a dictionary of request parameters
    Returns:
        the type of the inputs :class:`Property` of the operator or ``None``
    """
    if registry.operator_exists(operator_uri) is False:
        raise ValueError("Operator '%s' does not exist" % operator_uri)

    operator = registry.get_operator(operator_uri)
    ctx = ExecutionContext(request_params)
    try:
        return operator.resolve_type(
            ctx, request_params.get("target", "inputs")
        )
    except Exception as e:
        return ExecutionResult(None, None, traceback.format_exc())


def resolve_placement(operator, request_params):
    """Resolves the placement of the operator with the given name.

    Args:
        operator_uri: the URI of the operator
        request_params: a dictionary of request parameters
    Returns:
        the placement of the operator or ``None``
    """
    ctx = ExecutionContext(request_params)
    try:
        return operator.resolve_placement(ctx)
    except Exception as e:
        return ExecutionResult(None, None, str(e))


class ExecutionContext:
    """Represents the execution context of an operator.

    Operators can use the execution context to access the view, dataset, and
    selected samples, as well as to trigger other operators.

    Args:
        request_params: a dictionary of request parameters
        executor: an optional :class:`Executor` instance
    """

    def __init__(self, execution_request_params={}, executor=None):
        self.request_params = execution_request_params
        self.params = execution_request_params.get("params", {})
        self.executor = executor

    @property
    def view(self):
        """The :class:`fiftyone.core.view.DatasetView` to operate on.

        This property is only available when the operator is invoked via the FiftyOne App
        and the user has defined a view.
        """
        stages = self.request_params.get("view", None)
        extended = self.request_params.get("extended", None)
        dataset_name = self.request_params.get("dataset_name", None)
        filters = self.request_params.get("filters", None)
        return fosv.get_view(
            dataset_name,
            stages=stages,
            extended_stages=extended,
            filters=filters,
        )

    @property
    def selected(self):
        """The list of selected sample IDs or an empty list."""
        return self.request_params.get("selected", [])

    @property
    def dataset(self):
        """The :class:`fiftyone.core.dataset.Dataset` to operate on."""
        dataset_name = self.request_params.get("dataset_name", None)
        d = fo.load_dataset(dataset_name)
        return d

    @property
    def dataset_name(self):
        """The name of the :class:`fiftyone.core.dataset.Dataset` to operate on."""
        return self.request_params.get("dataset_name", None)

    def trigger(self, operator_name, params={}):
        """Triggers an invocation of the operator with the given name.

        Note:

            This method is only available when the operator is invoked via the FiftyOne App.
            You can check this via: ``if ctx.executor:``.

        Args:
            operator_name: the name of the operator
            params: a dictionary of parameters for the operator
        """
        if self.executor is None:
            raise ValueError("No executor available")
        return self.executor.trigger(operator_name, params)

    def log(self, message):
        """Logs a message to the browser console."""
        self.trigger("console_log", {"message": message})


class ExecutionResult:
    """Represents the result of an operator execution.

    Args:
        result: the result of the operator
        executor: an optional :class:`Executor` instance
        error: an optional error message
        validation_ctx: an optional :class:`ValidationContext` instance

    Attributes:
        result: the result of the operator
        executor: an optional :class:`Executor` instance
        error: an optional error message
        validation_ctx: an optional :class:`ValidationContext` instance
    """

    def __init__(self, result, executor, error, validation_ctx=None):
        self.result = result
        self.executor = executor
        self.error = error
        self.validation_ctx = validation_ctx

    @property
    def is_generator(self):
        """Whether the result is a generator or an async generator."""
        return _is_generator(self.result)

    def to_json(self):
        return {
            "result": self.result,
            "executor": self.executor.to_json() if self.executor else None,
            "error": self.error,
            "validation_ctx": self.validation_ctx.to_json()
            if self.validation_ctx
            else None,
        }


class ValidationError:
    def __init__(self, reason, property, path):
        self.reason = reason
        self.error_message = property.error_message
        self.path = path

    def to_json(self):
        return {
            "reason": self.reason,
            "error_message": self.error_message,
            "path": self.path,
        }


class ValidationContext:
    """Represents the validation context of an operator.

    Args:
        ctx: the :class:`ExecutionContext` instance
        inputs_property: the :class:`Property` of the operator inputs
    """

    def __init__(self, ctx, inputs_property):
        self.ctx = ctx
        self.params = ctx.params
        self.inputs_property = inputs_property
        self._errors = []
        if self.inputs_property is None:
            self.invalid = False
            self.errors = []
        else:
            self.errors = self._validate()
            self.invalid = len(self.errors) > 0

    def to_json(self):
        return {
            "invalid": self.invalid,
            "errors": [e.to_json() for e in self.errors],
        }

    def add_error(self, error):
        """Adds a validation error.

        Args:
            error: a :class:`ValidationError` instance
        """
        self._errors.append(error)

    def _validate(self):
        """Validates the operator inputs."""
        params = self.params
        validation_error = self.validate_property(
            "", self.inputs_property, params
        )
        if validation_error:
            self.add_error(validation_error)
        return self._errors

    def validate_enum(self, path, property, value):
        """Validates an enum value.

        Args:
            path: the path to the property
            property: the :class:`Property` instance
            value: the value to validate

        Returns:
            a :class:`ValidationError` instance, if the value is invalid
        """
        enum = property.type
        if value not in enum.values:
            return ValidationError("Invalid enum value", property, path)

    def validate_list(self, path, property, value):
        """Validates a list value.

        Args:
            path: the path to the property
            property: the :class:`Property` instance
            value: the value to validate

        Returns:
            a :class:`ValidationError` instance, if the value is invalid
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
            property: the :class:`Property` instance
            value: the value to validate

        Returns:
            a :class:`ValidationError` instance, if the value is invalid
        """
        if property.invalid:
            return ValidationError("Invalid property", property, path)
        elif property.required and value is None:
            return ValidationError("Required property", property, path)
        elif value is not None:
            if isinstance(property.type, types.Enum):
                return self.validate_enum(path, property, value)
            elif isinstance(property.type, types.Object):
                return self.validate_object(path, property, value)
            elif isinstance(property.type, types.List):
                return self.validate_list(path, property, value)
            else:
                return self.validate_primitive(path, property, value)

    def validate_object(self, path, property, value):
        """Validates an object value.

        Args:
            path: the path to the property
            property: the :class:`Property` instance
            value: the value to validate

        Returns:
            a :class:`ValidationError` instance, if the value is invalid
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
            property: the :class:`Property` instance
            value: the value to validate

        Returns:
            a :class:`ValidationError` instance, if the value is invalid
        """
        type_name = property.type.__class__.__name__
        value_type = type(value)
        if type_name == "String" and value_type != str:
            return ValidationError("Invalid value type", property, path)
        if type_name == "Number" and (
            value_type != int and value_type != float
        ):
            return ValidationError("Invalid value type", property, path)
        if type_name == "Boolean" and value_type != bool:
            return ValidationError("Invalid value type", property, path)
