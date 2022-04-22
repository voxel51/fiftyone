"""
External data

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from datetime import date, datetime
from enum import Enum
import numpy as np
import typing as t

import eta.core.utils as etau
import strawberry as gql

from .exceptions import FiftyOneDataError

PRIMITIVES = {bool, bytes, date, datetime, int, float, np.ndarray, str}
CONTAINERS: t.Set[t.Type] = {dict, list, tuple}

gql.scalar(
    gql.ID,
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)


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
class MediaType(str, Enum):
    image = "image"
    video = "video"


@gql.type
class TargetDefinition:
    target: int
    value: str


@gql.type
class NamedTargetsDefinition:
    name: str
    targets: t.List[TargetDefinition]


@gql.type
class SampleFieldDefinition:
    ftype: str
    path: str
    subfield: t.Optional[str]
    embedded_doc_type: t.Optional[str]
    db_field: t.Optional[str]


@gql.interface
class RunConfigDefinition:
    cls: str


@gql.interface
class RunDefinition:
    config: RunConfigDefinition
    key: str
    results: gql.ID
    timestamp: datetime
    version: str
    view_stages: t.List[str]


@gql.type
class BrainRunConfig(RunConfigDefinition):
    embeddings_field: t.Optional[str]
    method: str
    patches_field: t.Optional[str]


@gql.type
class BrainRun(RunDefinition):
    config: BrainRunConfig


@gql.type
class EvaluationRunConfigDefinition(RunConfigDefinition):
    classwise: bool
    error_level: int
    gt_field: str
    pred_field: str
    method: str


@gql.type
class EvaluationRunDefinition(RunDefinition):
    config: EvaluationRunConfigDefinition


@gql.type
class SidebarGroupDefinition:
    name: str
    paths: t.List[str]


@gql.type
class DatasetDefinition:
    name: str
    _id: gql.ID = gql.field(default_factory=lambda: ObjectId())

    created_at: datetime = gql.field(default_factory=datetime.utcnow)
    last_loaded_at: datetime = gql.field(default_factory=datetime.utcnow)

    fields: t.List[
        t.Union[DocumentFieldDefinition, FieldDefinition]
    ] = gql.field(default_factory=list)
    info: str = "{}"
    media_type: t.Optional[MediaType] = None
    persistent: bool = False
    root: bool = True

    classes: str = ""
    default_classes: t.List[str] = gql.field(default_factory=list)

    mask_targets: t.List[NamedTargetsDefinition] = gql.field(
        default_factory=list
    )
    default_mask_targets: t.Optional[t.List[TargetDefinition]] = None

    app_sidebar_groups: t.Optional[t.List[SidebarGroupDefinition]] = None
    version: str = ""

    annotations_runs: t.List[RunDefinition] = gql.field(default_factory=list)
    brain_methods: t.List[BrainRun] = gql.field(default_factory=list)
    evaluations: t.List[EvaluationRunDefinition] = gql.field(
        default_factory=list
    )


def get_type_definition(
    type: t.Type,
) -> t.Union[DictDefinition, ListDefinition, TupleDefinition, str]:
    if type is None or isinstance(type, t.TypeVar):
        return t.Any

    if type == list or getattr(type, "__origin__", None) == list:
        return ListDefinition(
            type=get_type_definition(getattr(type, "__args__", (None,))[0])
        )

    if type == dict or getattr(type, "__origin__", None) == dict:
        (key, value) = getattr(type, "__args__", ("str", None))
        if key not in (int, str):
            raise FiftyOneDataError("invalid key type for dict field")

        return DictDefinition(key=key, value=get_type_definition(value))

    if type == tuple or getattr(type, "__origin__", None) == tuple:
        args = getattr(type, "__args__", None)
        if not args or any(a not in PRIMITIVES for a in args):
            raise FiftyOneDataError("invalid tuple type for field")

        return TupleDefinition(types=[get_type_definition(a) for a in args])

    return etau.get_class_name(type)


def get_type(
    definition: t.Union[DictDefinition, ListDefinition, TupleDefinition, str]
) -> t.Type:
    if isinstance(definition, DictDefinition):
        return t.Dict[
            etau.get_class(definition.key),
            get_type(definition.value) if definition.value else t.Any,
        ]

    if isinstance(definition, ListDefinition):
        return t.List[get_type(definition.type)] if definition.type else t.List

    if isinstance(definition, TupleDefinition):
        return (
            t.Tuple[tuple(get_type(a) for a in definition.types)]
            if definition.types
            else t.Tuple
        )

    return etau.get_class(definition)
