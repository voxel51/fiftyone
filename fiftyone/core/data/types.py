"""
External data

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
from enum import Enum
import typing as t

import strawberry as gql


@gql.type
class DatabaseConfig:
    """Backing document for the database config."""

    __fiftyone_collection__: t.ClassVar[str] = "config"

    version = str


@gql.type
class RunData:
    """Description of a run on a dataset."""

    key: str
    version: str
    timestamp: datetime
    config: str
    view_stage: t.List[str]
    results: gql.ID


@gql.type
class Field:
    path: str
    cls: str
    collection: str


@gql.enum
class MediaType(Enum):
    image = "image"
    video = "video"


@gql.type
class Target:
    target: int
    value: str


@gql.type
class NamedTargets:
    name: str
    targets: t.List[Target]


@gql.type
class SampleField:
    ftype: str
    path: str
    subfield: t.Optional[str]
    embedded_doc_type: t.Optional[str]
    db_field: t.Optional[str]


@gql.interface
class RunConfig:
    cls: str


@gql.interface
class Run:
    key: str
    version: str
    timestamp: datetime
    config: RunConfig
    view_stages: t.List[str]


@gql.type
class BrainRunConfig(RunConfig):
    embeddings_field: t.Optional[str]
    method: str
    patches_field: t.Optional[str]


@gql.type
class BrainRun(Run):
    config: BrainRunConfig


@gql.type
class EvaluationRunConfig(RunConfig):
    classwise: bool
    error_level: int
    gt_field: str
    pred_field: str
    method: str


@gql.type
class EvaluationRun(Run):
    config: EvaluationRunConfig


@gql.type
class SidebarGroup:
    name: str
    paths: t.List[str]


@gql.type
class Dataset:
    id: gql.ID
    name: str
    created_at: date
    last_loaded_at: datetime
    persistent: bool
    media_type: t.Optional[MediaType]
    fields: t.List[Field]
    info: str

    classes: str
    default_classes: t.List[str]

    mask_targets: t.List[NamedTargets]
    default_mask_targets: t.Optional[t.List[Target]]

    app_sidebar_groups: t.Optional[t.List[SidebarGroup]]
    version: str

    annotations_runs: t.List[Run]
    brain_methods: t.List[BrainRun]
    evaluations: t.List[EvaluationRun]
