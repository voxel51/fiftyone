"""
FiftyOne pipeline operator.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from typing import Optional

from .operator import Operator


@dataclasses.dataclass
class PipelineStage:
    """A stage in a FiftyOne pipeline.

    Args:
        operator_uri: the URI of the operator to use for the stage
        name: the name of the stage
        num_distributed_tasks: the number of distributed tasks to use
            for the stage, optional
        params: optional parameters to pass to the operator, overwriting
            any existing parameters
    """

    # Required
    operator_uri: str

    # Optional
    name: Optional[str] = None
    num_distributed_tasks: Optional[int] = None
    params: Optional[dict[str]] = None


class PipelineOperator(Operator):
    def resolve_pipeline(self, ctx):
        """Returns the resolved pipeline of the operator.

        Subclasses can implement this method to define the pipeline of the
        operator.

        Args:
            ctx: the :class:`fiftyone.operators.executor.ExecutionContext`

        Returns:
            a list of :class:`fiftyone.operators.types.PipelineStage`,
        """
        raise NotImplementedError("subclass must implement resolve_pipeline")

    def execute(self, ctx):
        """Not used for pipeline operators."""
        raise NotImplementedError(
            "execute() not implemented for PipelineOperators"
        )
