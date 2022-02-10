"""
FiftyOne Teams queries.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
from enum import Enum
import typing as t
from xmlrpc.client import boolean

from bson import ObjectId
from dacite import Config, from_dict
import motor
import strawberry as gql
from fiftyone.labs.dataloader import get_dataloader_resolver

from fiftyone.labs.paginator import Connection, get_paginator_resolver

from .interfaces import Stage
from .mixins import HasCollection
from .paginator import Connection
from .utils import Info


ID = gql.scalar(
    t.NewType("ID", str),
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)


class MediaType(Enum):
    IMAGE = "image"
    VIDEO = "video"


@gql.type
class Targets:
    target: int
    value: str


@gql.type
class NamedTargets:
    name: str
    targets: Targets


@gql.type
class SampleField:
    name: str
    ftype: str
    subfield: t.Optional[str]
    embedded_doc_type: t.Optional[str]
    db_field: t.Optional[str]
    fields: t.Optional[t.List["SampleField"]]


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
    classwise: boolean
    error_level: int
    gt_field: str
    pred_field: str
    method: str


@gql.type
class EvaluationRun(Run):
    config: EvaluationRunConfig


class SidebarGroup:
    name: str
    paths: t.List[str]


@gql.type
class Dataset(HasCollection):
    id: gql.ID
    name: str
    created_at: date
    last_loaded_at: datetime
    persistent: bool
    media_type: MediaType
    mask_targets: t.List[NamedTargets]
    default_mask_targets: Targets
    sample_fields: t.List[SampleField]
    frame_fields: t.List[SampleField]
    brain_methods: t.List[BrainRun]
    evaluations: t.List[EvaluationRun]
    app_sidebar_groups: t.List[SidebarGroup]

    @staticmethod
    def get_collection_name():
        return "datasets"


dataset_dataloader = get_dataloader_resolver(Dataset, "name")


async def dataset_resolver(name: str, info: Info) -> Dataset:
    return await dataset_dataloader(name, info)


@gql.type
class SelectedLabelData:
    id: str
    sample_id: str
    field: str
    frame_number: t.Optional[int]


@gql.type
class Session:
    dataset: t.Optional[str]
    view: t.Optional[t.List[Stage]]
    selected: t.Optional[t.List[str]]
    selected_labels: t.Optional[t.List[SelectedLabelData]]
    user_id: gql.ID


@gql.type
class User(HasCollection):
    id: gql.ID
    datasets: Connection[Dataset] = gql.field(
        resolver=get_paginator_resolver(Dataset)
    )
    email: str
    family_name: str
    given_name: str

    @staticmethod
    def get_collection_name():
        return "users"


@gql.type
class Query:
    users: Connection[User] = gql.field(resolver=get_paginator_resolver(User))

    dataset: Dataset = gql.field(resolver=dataset_resolver)
    datasets: Connection[Dataset] = gql.field(
        resolver=get_paginator_resolver(Dataset)
    )

    @gql.field
    async def viewer(self, info: Info) -> User:
        db = info.context.db
        users: motor.MotorCollection = db.users
        user = await users.find_one({"sub": info.context.sub})
        user["id"] = user.pop("_id")
        return from_dict(User, user, config=Config(check_types=False))
