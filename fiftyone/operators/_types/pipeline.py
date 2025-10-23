"""
FiftyOne pipeline operator types.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from typing import Any, List, Mapping, Optional


@dataclasses.dataclass
class PipelineStage:
    """A stage in a FiftyOne pipeline.

    Args:
        operator_uri: the URI of the operator to use for the stage
        name: the name of the stage
        num_distributed_tasks: the number of distributed tasks to use
            for the stage, optional
        params: optional parameters to pass to the operator
    """

    # Required
    operator_uri: str

    # Optional
    always_run: bool = False
    name: Optional[str] = None
    num_distributed_tasks: Optional[int] = None
    params: Optional[Mapping[str, Any]] = None

    # ADD A CUSTOM __init__ METHOD TO ACCEPT AND DISCARD UNUSED KWARGS
    def __init__(
        self,
        operator_uri: str,
        always_run: bool = False,
        name: Optional[str] = None,
        num_distributed_tasks: Optional[int] = None,
        params: Optional[Mapping[str, Any]] = None,
        **_,
    ):
        # Call the default dataclass initialization for the defined fields
        self.operator_uri = operator_uri
        self.always_run = always_run
        self.name = name
        self.num_distributed_tasks = num_distributed_tasks
        self.params = params
        self.__post_init__()

    def __post_init__(self):
        if not self.operator_uri:
            raise ValueError("operator_uri must be a non-empty string")

        self.num_distributed_tasks = (
            int(self.num_distributed_tasks)
            if self.num_distributed_tasks is not None
            else None
        )
        if (
            self.num_distributed_tasks is not None
            and self.num_distributed_tasks < 1
        ):
            self.num_distributed_tasks = None

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

    # ADD A CUSTOM __init__ METHOD TO ACCEPT AND DISCARD UNUSED KWARGS
    def __init__(self, stages: Optional[list[PipelineStage]] = None, **kwargs):
        # Call the default dataclass initialization for the defined fields
        self.stages = stages if stages is not None else []
        # kwargs are implicitly discarded

    def stage(
        self,
        operator_uri,
        always_run=False,
        name=None,
        num_distributed_tasks=None,
        params=None,
        # kwargs accepted for forward compatibility
        **kwargs,
    ):
        """Adds a stage to the end of the pipeline.

        Args:
            operator_uri: the URI of the operator to use for the stage
            always_run: if True, this stage runs even when the pipeline
                is inactive (e.g., after a failure), enabling
                cleanup/finalization stages
            name: the name of the stage
            num_distributed_tasks: the number of distributed tasks to use
                for the stage, optional
            params: optional parameters to pass to the operator
            **kwargs: reserved for future use

        Returns:
            a :class:`PipelineStage`
        """
        stage = PipelineStage(
            operator_uri=operator_uri,
            always_run=always_run,
            name=name,
            num_distributed_tasks=num_distributed_tasks,
            params=params,
            **kwargs,
        )
        self.stages.append(stage)
        return stage

    @classmethod
    def from_json(cls, json_dict):
        """Loads the pipeline from a JSON/python dict.

        Ex., {
            "stages": [
                {"operator_uri": "@voxel51/test/blah", "name": "my_stage"},
                ...,
            ]
        }

        Args:
            json_dict: a JSON / python dict representation of the pipeline
        """
        if json_dict is None:
            return None

        if isinstance(json_dict, list):
            json_dict = {"stages": json_dict}
        stages = [
            PipelineStage(**stage) for stage in json_dict.get("stages") or []
        ]
        return cls(stages=stages)

    def to_json(self):
        """Converts this pipeline to JSON/python dict representation

        Ex., {
            "stages": [
                {"operator_uri": "@voxel51/test/blah", "name": "my_stage"},
                ...,
            ]
        }

        Returns:
            JSON / python dict representation of the pipeline
        """
        return dataclasses.asdict(self)


@dataclasses.dataclass
class PipelineRunInfo:
    """Information about a pipeline run.

    Unlike the pipeline definition, this class is considered mutable.
    """

    active: bool = True
    expected_children: Optional[List[int]] = None
    stage_index: int = 0

    @classmethod
    def from_json(cls, doc: dict):
        if doc is None:
            return None
        return cls(**doc)

    def to_json(self):
        return dataclasses.asdict(self)
