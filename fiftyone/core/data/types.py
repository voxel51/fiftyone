"""
External data

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from dataclasses import asdict
from datetime import datetime
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
class DictDefinition:
    key: t.Union[str, int]
    value: t.Union[
        "DictDefinition", "ListDefinition", "str", "TupleDefinition", None
    ]


@gql.type
class ListDefinition:
    type: t.Union[
        "DictDefinition", "ListDefinition", "str", "TupleDefinition", None
    ]


@gql.type
class TupleDefinition:
    types: t.Union[
        t.List[
            t.Union[
                "DictDefinition", "ListDefinition", "str", "TupleDefinition"
            ]
        ],
        None,
    ]


@gql.type
class FieldDefinition:
    path: str
    type: t.Union["DictDefinition", "ListDefinition", "str", "TupleDefinition"]


@gql.type
class DocumentFieldDefinition(FieldDefinition):
    collection: str = gql.field(default_factory=lambda: str(ObjectId()))


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
class DatasetDefinition:
    name: str
    id: gql.ID = gql.field(default_factory=ObjectId)

    created_at: datetime = gql.field(default_factory=datetime.utcnow)
    last_loaded_at: datetime = gql.field(default_factory=datetime.utcnow)

    field_definitions: t.List[
        t.Union[DocumentFieldDefinition, FieldDefinition]
    ] = gql.field(default_factory=list)
    info: str = "{}"
    media_type: t.Optional[MediaType] = None
    persistent: bool = False
    root: bool = True

    classes: str = ""
    default_classes: t.List[str] = gql.field(default_factory=list)

    mask_targets: t.List[NamedTargets] = gql.field(default_factory=list)
    default_mask_targets: t.Optional[t.List[Target]] = None

    app_sidebar_groups: t.Optional[t.List[SidebarGroup]] = None
    version: str = ""

    annotations_runs: t.List[Run] = gql.field(default_factory=list)
    brain_methods: t.List[BrainRun] = gql.field(default_factory=list)
    evaluations: t.List[EvaluationRun] = gql.field(default_factory=list)

    def save(self) -> None:
        from fiftyone.core.data import get_db_conn

        db = get_db_conn()
        db.datasets.replace_one({"_id": self.id}, asdict(self), upsert=True)
