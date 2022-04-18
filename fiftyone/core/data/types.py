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

from fiftyone.core.expressions import ObjectId


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
    type: str


@gql.type
class DocumentField(Field):
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
class Dataset:
    id: gql.ID
    name: str
    created_at: date
    last_loaded_at: datetime
    persistent: bool
    media_type: t.Optional[MediaType]
    schema: t.List[t.Union[DocumentField, Field]]
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


class Types(Enum):
    DOUBLE = "double"
    STRING = "string"
    OBJECT = "object"
    ARRAY = "array"
    BINARY = "binData"
    OBJECT_ID = "objectId"
    BOOL = "bool"
    DATE = "date"
    INT = "int"
    TIMESTAMP = "timestamp"
    LONG = "long"
    DECIMAL = "decimal"


@gql.interface
class JSONSchemaProperty:
    description: t.Optional[str]
    title: t.Optional[str]


@gql.type
class JSONSchemaIntProperty(JSONSchemaProperty):
    maximum: t.Optional[int]
    minimum: t.Optional[int]
    multiple_of: t.Optional[int]


@gql.type
class JSONSchemaDoubleProperty(JSONSchemaProperty):
    maximum: t.Optional[float]
    minimum: t.Optional[float]
    multiple_of: t.Optional[float]


@gql.type
class JSONSchemaLongProperty(JSONSchemaProperty):
    maximum: t.Optional[int]
    minimum: t.Optional[int]
    multiple_of: t.Optional[int]


@gql.type
class JSONSchemaDecimalProperty(JSONSchemaProperty):
    maximum: t.Optional[float]
    minimum: t.Optional[float]
    multiple_of: t.Optional[float]


@gql.type
class JSONSchemaStringProperty(JSONSchemaProperty):
    bson_type: t.Literal[Types.STRING]
    max_length: t.Optional[int]
    min_length: t.Optional[int]
    pattern: t.Optional[str]


@gql.type
class JSONSchemaEnumProperty(JSONSchemaProperty):
    bson_type: t.Literal[Types.STRING]
    enum: t.List[str]


@gql.type
class JSONSchemaObjectProperty(JSONSchemaProperty):
    bson_type: t.Literal[Types.OBJECT]
    max_properties: t.Optional[int]
    min_properties: t.Optional[int]
    properties: t.Dict[str, "JSONSchemaProperty"]
    required: t.Optional[t.List[str]]
    additional_properties: t.Literal[True] = True


JSONSchemaProperties = t.Union[
    JSONSchemaIntProperty,
    JSONSchemaDoubleProperty,
    JSONSchemaLongProperty,
    JSONSchemaDecimalProperty,
    JSONSchemaStringProperty,
    JSONSchemaEnumProperty,
    JSONSchemaObjectProperty,
    "JSONSchemaArrayProperty",
]


@gql.type
class JSONSchemaArrayProperty(JSONSchemaProperty):
    items: t.Union[t.List[JSONSchemaProperties], JSONSchemaProperties]
    maxItems: t.Optional[int]
    minItems: t.Optional[int]
    uniqueItems: t.Optional[bool]
