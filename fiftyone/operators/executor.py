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
    ctx = ExecutionContext(request_params)
    try:
        raw_result = operator.execute(ctx)
    except Exception as e:
        return ExecutionResult(ctx, None, str(e))
    return ExecutionResult(ctx, raw_result, None)


class ExecutionContext:
    def __init__(self, execution_request_params):
        self.request_params = execution_request_params
        self.params = execution_request_params.get("params", {})

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
    def dataset(self):
        dataset_name = self.request_params.get("dataset_name", None)
        return fo.load_dataset(dataset_name)

    @property
    def dataset_name(self):
        return self.request_params.get("dataset_name", None)


class ExecutionResult:
    def __init__(self, ctx, result, error):
        self.ctx = ctx
        self.result = result
        self.error = error
        self.loading_errors = list_module_errors()

    def to_json(self):
        return {
            "result": self.result,
            "error": self.error,
            "loading_errors": self.loading_errors,
        }
