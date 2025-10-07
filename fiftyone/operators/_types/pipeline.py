"""
FiftyOne pipeline operator types.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from typing import Any, Mapping, Optional


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
    params: Optional[Mapping[str, Any]] = None

    def __post_init__(self):
        if not self.operator_uri:
            raise ValueError("operator_uri must be a non-empty string")

        if self.num_distributed_tasks is not None:
            self.num_distributed_tasks = int(self.num_distributed_tasks)
        if (
            self.num_distributed_tasks is not None
            and self.num_distributed_tasks < 1
        ):
            raise ValueError("num_distributed_tasks must be >= 1")

    def to_json(self):
        """Converts the object definition to JSON / python dict.

        Returns:
            a JSON / python dict
        """
        return dataclasses.asdict(self)


@dataclasses.dataclass
class Pipeline:
    """A FiftyOne operator pipeline.

    A pipeline consists of one or more stages, each of which is an operator.

    Args:
        stages: a list of :class:`PipelineStage` instances
    """

    stages: list[PipelineStage] = dataclasses.field(default_factory=list)

    def stage(
        self,
        operator_uri,
        name=None,
        num_distributed_tasks=None,
        params=None,
        # kwargs accepted for forward compatibility
        **kwargs  # pylint: disable=unused-argument
    ):
        """Adds a stage to the end of the pipeline.

        Args:
            operator_uri: the URI of the operator to use for the stage
            name: the name of the stage
            num_distributed_tasks: the number of distributed tasks to use
                for the stage, optional
            params: optional parameters to pass to the operator, overwriting
                any existing parameters

        Returns:
            a :class:`PipelineStage`
        """
        stage = PipelineStage(
            operator_uri=operator_uri,
            name=name,
            num_distributed_tasks=num_distributed_tasks,
            params=params,
        )
        self.stages.append(stage)
        return stage

    @classmethod
    def from_json(cls, json_list):
        """Loads the pipeline from a list of JSON/python dicts.

        Ex., [
            {"operator_uri": "@voxel51/test/blah", "name": "my_stage", ...},
            ...,
        ]

        Args:
            json_list: a list of JSON / python dicts
        """
        stages = [PipelineStage(**stage) for stage in json_list]
        return cls(stages=stages)

    def to_json(self):
        """Converts the pipeline to list of JSON/python dicts.

        Ex., [
            {"operator_uri": "@voxel51/test/blah", "name": "my_stage", ...},
            ...,
        ]
        Returns:
            list of JSON / python dicts
        """
        return [stage.to_json() for stage in self.stages]
