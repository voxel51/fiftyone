"""
FiftyOne operator execution.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .registry import list_operators, operator_exists, get_operator

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
    raw_result = operator.execute(ctx)
    return ExecutionResult(ctx, raw_result)


class ExecutionContext:
    def __init__(self, execution_request_params):
        self.request_params = execution_request_params
        self.params = execution_request_params.get("params", {})

    @property
    def view(self):
        stages = self.request_params.get("stages", None)
        extended = self.request_params.get("extended_stages", None)
        dataset_name = self.request_params.get("dataset_name", None)
        return fosv.get_view(
            dataset_name,
            stages=stages,
            extended_stages=extended,
        )

    @property
    def dataset(self):
        dataset_name = self.request_params.get("dataset_name", None)
        return fo.load_dataset(dataset_name)


class ExecutionResult:
    def __init__(self, ctx, result):
        self.ctx = ctx
        self.result = result

    def to_json(self):
        return self.result
