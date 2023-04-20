"""
FiftyOne operator execution.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .registry import list_operators, operator_exists, get_operator
from .loader import list_module_errors
import fiftyone.server.view as fosv
import fiftyone as fo
import fiftyone.operators.types as types


class InvocationRequest:
    def __init__(self, operator_name, params={}):
        self.operator_name = operator_name
        self.params = params

    def to_json(self):
        return {
            "operator_name": self.operator_name,
            "params": self.params,
        }


class Executor:
    def __init__(self, requests=None, logs=None):
        self._requests = requests or []
        self._logs = logs or []

    def trigger(self, operator_name, params={}):
        self._requests.append(InvocationRequest(operator_name, params))

    def log(self, message):
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
        the result of the operator
    """
    if operator_exists(operator_name) is False:
        raise ValueError("Operator '%s' does not exist" % operator_name)

    operator = get_operator(operator_name)
    executor = Executor()
    ctx = ExecutionContext(request_params, executor)
    inputs = operator.resolve_input(ctx)
    if not isinstance(inputs, types.Property):
        raise ValueError(
            "Operator '%s' resolve_input() does not return a valid Property()"
            % operator_name
        )

    validation_ctx = ValidationContext(ctx, inputs)
    if validation_ctx.invalid:
        return ExecutionResult(None, None, "Validation Error", validation_ctx)
    try:
        raw_result = operator.execute(ctx)
    except Exception as e:
        return ExecutionResult(None, executor, str(e))
    return ExecutionResult(raw_result, executor, None)


def resolve_type(operator_name, request_params):
    if operator_exists(operator_name) is False:
        raise ValueError("Operator '%s' does not exist" % operator_name)

    operator = get_operator(operator_name)
    ctx = ExecutionContext(request_params)
    try:
        return operator.resolve_type(ctx, request_params.get("type", "inputs"))
    except Exception as e:
        return ExecutionResult(None, None, str(e))


def resolve_placement(operator, request_params):
    ctx = ExecutionContext(request_params)
    try:
        return operator.resolve_placement(ctx)
    except Exception as e:
        return ExecutionResult(None, None, str(e))


class ExecutionContext:
    def __init__(self, execution_request_params, executor=None):
        self.request_params = execution_request_params
        self.params = execution_request_params.get("params", {})
        self.executor = executor

    @property
    def view(self):
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
        return self.request_params.get("selected", [])

    @property
    def dataset(self):
        dataset_name = self.request_params.get("dataset_name", None)
        d = fo.load_dataset(dataset_name)
        return d

    @property
    def dataset_name(self):
        return self.request_params.get("dataset_name", None)

    def trigger(self, operator_name, params={}):
        if self.executor is None:
            raise ValueError("No executor available")
        self.executor.trigger(operator_name, params)

    def log(self, message):
        self.trigger("console_log", {"message": message})


class ExecutionResult:
    def __init__(self, result, executor, error, validation_ctx=None):
        self.result = result
        self.executor = executor
        self.error = error
        self.loading_errors = list_module_errors()
        self.validation_ctx = validation_ctx

    def to_json(self):
        return {
            "result": self.result,
            "executor": self.executor.to_json() if self.executor else None,
            "error": self.error,
            "loading_errors": self.loading_errors,
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
    def __init__(self, ctx, inputs_property):
        self.ctx = ctx
        self.params = ctx["params"]
        self.inputs_property = inputs_property
        self._errors = []
        self.errors = self._validate()
        self.invalid = len(self.errors) > 0

    def to_json(self):
        return {
            "invalid": self.invalid,
            "errors": [e.to_json() for e in self.errors],
        }

    def add_error(self, error):
        self._errors.append(error)

    def _validate(self):
        params = self.params
        validation_error = self.validate_property(
            "", self.inputs_property, params
        )
        if validation_error:
            self.add_error(validation_error)
        return self._errors

    def validate_enum(self, path, property, value):
        enum = property.type
        if value not in enum.values:
            return ValidationError("Invalid enum value", property, path)

    def validate_list(self, path, property, value):
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
        if property.invalid:
            return ValidationError("Invalid property", property, path)
        elif property.required and value is None:
            return ValidationError("Required property", property, path)
        elif isinstance(property.type, types.Enum):
            return self.validate_enum(path, property, value)
        elif isinstance(property.type, types.Object):
            return self.validate_object(path, property, value)
        elif isinstance(property.type, types.List):
            return self.validate_list(path, property, value)
        else:
            return self.validate_primitive(path, property, value)

    def validate_object(self, path, property, value):
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
        type_name = property.type.__class__.__name__
        value_type = type(value)
        if type_name == "String" and value_type != str:
            return ValidationError("Invalid value type", property, path)
        if type_name == "Number" and (
            value_type != int or value_type != float
        ):
            return ValidationError("Invalid value type", property, path)
        if type_name == "Boolean" and value_type != bool:
            return ValidationError("Invalid value type", property, path)
