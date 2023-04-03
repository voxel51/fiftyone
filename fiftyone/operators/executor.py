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
    def __init__(self, requests=[], logs=[]):
        self._requests = requests
        self._logs = []

    def trigger(self, operator_name, params={}):
        self._requests.append(InvocationRequest(operator_name, params))

    def log(self, message):
        self._logs.append(message)

    def to_json(self):
        return {
            **super().to_json(),
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
    try:
        raw_result = operator.execute(ctx, executor)
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
        print(d)
        return d

    @property
    def dataset_name(self):
        return self.request_params.get("dataset_name", None)

    def trigger(self, operator_name, params={}):
        if self.executor is None:
            raise ValueError("No executor available")
        self.executor.trigger(operator_name, params)

    def log(self, message):
        if self.executor is None:
            raise ValueError("No executor available")
        self.executor.log(message)


class ExecutionResult:
    def __init__(self, result, executor, error):
        self.result = result
        self.schedule = schedule
        self.error = error
        self.loading_errors = list_module_errors()

    def to_json(self):
        return {
            "result": self.result,
            "executor": self.executor.to_json() if self.executor else None,
            "error": self.error,
            "loading_errors": self.loading_errors,
        }
