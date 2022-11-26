"""
FiftyOne Server queries

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t
from dataclasses import asdict
from datetime import date, datetime
from enum import Enum
import os

import asyncio
import eta.core.serial as etas
import eta.core.utils as etau
import strawberry as gql
from bson import ObjectId
from dacite import Config, from_dict


import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.context as focx
import fiftyone.core.media as fom
from fiftyone.core.state import SampleField, serialize_fields
import fiftyone.core.uid as fou
import fiftyone.core.view as fov

import fiftyone.server.aggregate as fosa
from fiftyone.server.aggregations import aggregate_resolver
from fiftyone.server.data import Info
from fiftyone.server.dataloader import get_dataloader_resolver
import fiftyone.server.events as fose
from fiftyone.server.metadata import MediaType
from fiftyone.server.paginator import Connection, get_paginator_resolver
from fiftyone.server.samples import (
    SampleFilter,
    SampleItem,
    paginate_samples,
)
from fiftyone.server.scalars import BSONArray, JSON


ID = gql.scalar(
    t.NewType("ID", str),
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)
DATASET_FILTER = [{"sample_collection_name": {"$regex": "^samples\\."}}]
DATASET_FILTER_STAGE = [{"$match": DATASET_FILTER[0]}]


@gql.type
class Group:
    name: str
    media_type: MediaType


@gql.type
class Target:
    target: int
    value: str


@gql.type
class NamedTargets:
    name: str
    targets: t.List[Target]


@gql.interface
class RunConfig:
    cls: str


@gql.interface
class Run:
    key: str
    version: t.Optional[str]
    timestamp: t.Optional[datetime]
    config: t.Optional[RunConfig]
    view_stages: t.Optional[t.List[str]]


@gql.type
class BrainRunConfig(RunConfig):
    embeddings_field: t.Optional[str]
    method: t.Optional[str]
    patches_field: t.Optional[str]


@gql.type
class BrainRun(Run):
    config: t.Optional[BrainRunConfig]


@gql.type
class EvaluationRunConfig(RunConfig):
    gt_field: t.Optional[str]
    pred_field: t.Optional[str]
    method: t.Optional[str]


@gql.type
class EvaluationRun(Run):
    config: t.Optional[EvaluationRunConfig]


@gql.type
class SidebarGroup:
    name: str
    paths: t.Optional[t.List[str]]
    expanded: t.Optional[bool] = True


@gql.type
class KeypointSkeleton:
    labels: t.Optional[t.List[str]]
    edges: t.List[t.List[int]]


@gql.type
class NamedKeypointSkeleton(KeypointSkeleton):
    name: str


@gql.enum
class SidebarMode(Enum):
    all = "all"
    best = "best"
    fast = "fast"


@gql.type
class DatasetAppConfig:
    media_fields: t.Optional[t.List[str]]
    plugins: t.Optional[JSON]
    sidebar_groups: t.Optional[t.List[SidebarGroup]]
    sidebar_mode: t.Optional[SidebarMode]
    modal_media_field: t.Optional[str] = gql.field(default="filepath")
    grid_media_field: t.Optional[str] = "filepath"


@gql.type
class Dataset:
    id: gql.ID
    name: str
    created_at: t.Optional[date]
    last_loaded_at: t.Optional[datetime]
    persistent: bool
    group_media_types: t.Optional[t.List[Group]]
    group_field: t.Optional[str]
    group_slice: t.Optional[str]
    default_group_slice: t.Optional[str]
    media_type: t.Optional[MediaType]
    mask_targets: t.List[NamedTargets]
    default_mask_targets: t.Optional[t.List[Target]]
    sample_fields: t.List[SampleField]
    frame_fields: t.Optional[t.List[SampleField]]
    brain_methods: t.List[BrainRun]
    evaluations: t.List[EvaluationRun]
    version: t.Optional[str]
    view_cls: t.Optional[str]
    default_skeleton: t.Optional[KeypointSkeleton]
    skeletons: t.List[NamedKeypointSkeleton]
    app_config: t.Optional[DatasetAppConfig]
    info: t.Optional[JSON]

    @staticmethod
    def modifier(doc: dict) -> dict:
        doc["id"] = doc.pop("_id")
        doc["default_mask_targets"] = _convert_targets(
            doc.get("default_mask_targets", {})
        )
        doc["mask_targets"] = [
            NamedTargets(name=name, targets=_convert_targets(targets))
            for name, targets in doc.get("mask_targets", {}).items()
        ]
        doc["sample_fields"] = _flatten_fields([], doc["sample_fields"])
        doc["frame_fields"] = _flatten_fields([], doc.get("frame_fields", []))
        doc["brain_methods"] = list(doc.get("brain_methods", {}).values())
        doc["evaluations"] = list(doc.get("evaluations", {}).values())
        doc["skeletons"] = list(
            dict(name=name, **data)
            for name, data in doc.get("skeletons", {}).items()
        )
        doc["group_media_types"] = [
            Group(name=name, media_type=media_type)
            for name, media_type in doc.get("group_media_types", {}).items()
        ]
        doc["default_skeletons"] = doc.get("default_skeletons", None)
        return doc

    @classmethod
    async def resolver(
        cls, name: str, view: t.Optional[BSONArray], info: Info
    ) -> t.Optional["Dataset"]:
        return await serialize_dataset(name, view)


dataset_dataloader = get_dataloader_resolver(
    Dataset, "datasets", "name", DATASET_FILTER
)


@gql.enum
class ColorBy(Enum):
    field = "field"
    instance = "instance"
    label = "label"


@gql.enum
class Theme(Enum):
    browser = "browser"
    dark = "dark"
    light = "light"


@gql.type
class AppConfig:
    color_by: ColorBy
    color_pool: t.List[str]
    colorscale: str
    grid_zoom: int
    loop_videos: bool
    notebook_height: int
    plugins: t.Optional[JSON]
    show_confidence: bool
    show_index: bool
    show_label: bool
    show_skeletons: bool
    show_tooltip: bool
    sidebar_mode: SidebarMode
    theme: Theme
    timezone: t.Optional[str]
    use_frame_number: bool


@gql.type
class Query(fosa.AggregateQuery):

    aggregations = gql.field(resolver=aggregate_resolver)

    @gql.field
    def colorscale(self) -> t.Optional[t.List[t.List[int]]]:
        if fo.app_config.colorscale:
            return fo.app_config.get_colormap()

        return None

    @gql.field
    def config(self) -> AppConfig:
        config = fose.get_state().config
        d = config.serialize()
        d["timezone"] = fo.config.timezone
        return from_dict(AppConfig, d, config=Config(check_types=False))

    @gql.field
    def context(self) -> str:
        return focx._get_context()

    @gql.field
    def dev(self) -> bool:
        return foc.DEV_INSTALL or foc.RC_INSTALL

    @gql.field
    def do_not_track(self) -> bool:
        return fo.config.do_not_track

    dataset = gql.field(resolver=Dataset.resolver)
    datasets: Connection[Dataset, str] = gql.field(
        resolver=get_paginator_resolver(
            Dataset, "created_at", DATASET_FILTER_STAGE, "datasets"
        )
    )

    @gql.field
    async def samples(
        self,
        dataset: str,
        view: BSONArray,
        first: t.Optional[int] = 20,
        after: t.Optional[str] = None,
        filter: t.Optional[SampleFilter] = None,
    ) -> Connection[SampleItem, str]:
        return await paginate_samples(
            dataset, view, None, first, after, sample_filter=filter
        )

    @gql.field
    async def sample(
        self, dataset: str, view: BSONArray, filter: SampleFilter
    ) -> t.Optional[SampleItem]:
        samples = await paginate_samples(
            dataset, view, None, 1, sample_filter=filter
        )
        if samples.edges:
            return samples.edges[0].node

        return None

    @gql.field
    def teams_submission(self) -> bool:
        isfile = os.path.isfile(foc.TEAMS_PATH)
        if isfile:
            submitted = etas.load_json(foc.TEAMS_PATH)["submitted"]
        else:
            submitted = False

        return submitted

    @gql.field
    def uid(self) -> str:
        uid, _ = fou.get_user_id()
        return uid

    @gql.field
    def version(self) -> str:
        return foc.VERSION


def _flatten_fields(
    path: t.List[str], fields: t.List[t.Dict]
) -> t.List[t.Dict]:
    result = []
    for field in fields:
        key = field.pop("name")
        field_path = path + [key]
        field["path"] = ".".join(field_path)
        result.append(field)

        fields = field.pop("fields", None)
        if fields:
            result = result + _flatten_fields(field_path, fields)

    return result


def _convert_targets(targets: t.Dict[str, str]) -> Target:
    return [Target(target=int(k), value=v) for k, v in targets.items()]


async def serialize_dataset(name: str, serialized_view: BSONArray) -> Dataset:
    def run():
        dataset = fo.load_dataset(name)
        dataset.reload()
        view = fov.DatasetView._build(dataset, serialized_view or [])

        doc = dataset._doc.to_dict()
        Dataset.modifier(doc)
        data = from_dict(Dataset, doc, config=Config(check_types=False))
        data.view_cls = None

        collection = dataset.view()
        if view is not None:
            if view._dataset != dataset:
                d = view._dataset._serialize()
                data.media_type = d["media_type"]

                data.id = view._dataset._doc.id

                data.view_cls = etau.get_class_name(view)

            if view.media_type != data.media_type:
                data.id = ObjectId()
                data.media_type = view.media_type

            collection = view

        data.sample_fields = serialize_fields(
            collection.get_field_schema(flat=True)
        )
        data.frame_fields = serialize_fields(
            collection.get_frame_field_schema(flat=True)
        )

        if dataset.media_type == fom.GROUP:
            data.group_slice = collection.group_slice

        return data

    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, run)
