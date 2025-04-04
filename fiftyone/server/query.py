"""
FiftyOne Server queries.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
from datetime import date, datetime
from enum import Enum
import logging
import typing as t

import eta.core.utils as etau
import strawberry as gql
from bson import ObjectId, json_util

import fiftyone as fo
import fiftyone.brain as fob  # pylint: disable=import-error,no-name-in-module
import fiftyone.constants as foc
import fiftyone.core.context as focx
import fiftyone.core.dataset as fod
import fiftyone.core.media as fom
from fiftyone.core.odm import SavedViewDocument
import fiftyone.core.stages as fosg
from fiftyone.core.state import SampleField, serialize_fields
import fiftyone.core.uid as fou
from fiftyone.core.utils import run_sync_task
import fiftyone.core.view as fov

import fiftyone.server.aggregate as fosa
from fiftyone.server.aggregations import aggregate_resolver
from fiftyone.server.color import ColorBy, ColorScheme
from fiftyone.server.data import Info
from fiftyone.server.dataloader import get_dataloader_resolver
from fiftyone.server.events import get_state
from fiftyone.server.indexes import Index, from_dict as indexes_from_dict
from fiftyone.server.lightning import lightning_resolver
from fiftyone.server.metadata import MediaType
from fiftyone.server.paginator import Connection, get_paginator_resolver
from fiftyone.server.samples import (
    SampleFilter,
    SampleItem,
    paginate_samples,
)
from fiftyone.server.scalars import BSON, BSONArray, JSON
from fiftyone.server.stage_definitions import stage_definitions
from fiftyone.server.utils import from_dict
from fiftyone.server.workspace import Workspace


ID = gql.scalar(
    t.NewType("ID", str),
    serialize=lambda v: str(v),
    parse_value=lambda v: ObjectId(v),
)
DATASET_FILTER = [{"sample_collection_name": {"$regex": "^samples\\."}}]
DATASET_FILTER_STAGE = [{"$match": DATASET_FILTER[0]}]


@gql.type
class ActiveFields:
    exclude: t.Optional[bool]
    paths: t.Optional[t.List[str]]


@gql.type
class Group:
    name: str
    media_type: MediaType


@gql.type
class Target:
    target: str
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


@gql.enum
class BrainRunType(Enum):
    similarity = "similarity"
    visualization = "visualization"


@gql.type
class BrainRunConfig(RunConfig):
    embeddings_field: t.Optional[str]
    method: t.Optional[str]
    patches_field: t.Optional[str]
    supports_prompts: t.Optional[bool]

    @gql.field
    def type(self) -> t.Optional[BrainRunType]:
        try:
            if issubclass(fob.SimilarityConfig, etau.get_class(self.cls)):
                return BrainRunType.similarity

            if issubclass(fob.VisualizationConfig, etau.get_class(self.cls)):
                return BrainRunType.visualization
        except:
            pass

        return None

    @gql.field
    def max_k(self) -> t.Optional[int]:
        config = self._create_config()
        return getattr(config, "max_k", None)

    @gql.field
    def supports_least_similarity(self) -> t.Optional[bool]:
        config = self._create_config()
        return getattr(config, "supports_least_similarity", None)

    def _create_config(self):
        try:
            cls = etau.get_class(self.cls)
            return cls(
                embeddings_field=self.embeddings_field,
                patches_field=self.patches_field,
            )
        except:
            return None


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
class SavedView:
    id: t.Optional[str]
    dataset_id: t.Optional[str]
    name: t.Optional[str]
    description: t.Optional[str]
    color: t.Optional[str]
    slug: t.Optional[str]
    view_stages: t.Optional[t.List[str]]
    created_at: t.Optional[datetime]
    last_modified_at: t.Optional[datetime]
    last_loaded_at: t.Optional[datetime]

    @gql.field
    def view_name(self) -> t.Optional[str]:
        if isinstance(self, ObjectId):
            return None
        return self.name

    @gql.field
    def stage_dicts(self) -> t.Optional[BSONArray]:
        return [json_util.loads(x) for x in self.view_stages]

    @classmethod
    def from_doc(cls, doc: SavedViewDocument):
        stage_dicts = [json_util.loads(x) for x in doc.view_stages]
        data = doc.to_dict()
        data["id"] = str(data.pop("_id"))
        data["dataset_id"] = str(data.pop("_dataset_id"))
        saved_view = from_dict(data_class=cls, data=data)
        saved_view.stage_dicts = stage_dicts
        return saved_view


@gql.type
class SidebarGroup:
    name: str
    paths: t.Optional[t.List[str]]
    expanded: t.Optional[bool] = None


@gql.type
class KeypointSkeleton:
    labels: t.Optional[t.List[str]]
    edges: t.List[t.List[int]]


@gql.type
class NamedKeypointSkeleton(KeypointSkeleton):
    name: str


@gql.type
class DatasetAppConfig:
    active_fields: t.Optional[ActiveFields]
    color_scheme: t.Optional[ColorScheme]
    disable_frame_filtering: t.Optional[bool] = None
    dynamic_groups_target_frame_rate: int = 30
    grid_media_field: str = "filepath"
    media_fields: t.Optional[t.List[str]]
    modal_media_field: str = "filepath"
    media_fallback: bool = False
    plugins: t.Optional[JSON]
    sidebar_groups: t.Optional[t.List[SidebarGroup]]
    spaces: t.Optional[JSON]


@gql.type
class Dataset:
    id: gql.ID
    dataset_id: gql.ID
    name: str
    created_at: t.Optional[date]
    last_loaded_at: t.Optional[datetime]
    persistent: bool
    group_media_types: t.Optional[t.List[Group]]
    group_field: t.Optional[str]
    default_group_slice: t.Optional[str]
    media_type: t.Optional[MediaType]
    parent_media_type: t.Optional[MediaType]
    mask_targets: t.List[NamedTargets]
    default_mask_targets: t.Optional[t.List[Target]]
    sample_fields: t.List[SampleField]
    frame_fields: t.Optional[t.List[SampleField]]
    brain_methods: t.Optional[t.List[BrainRun]]
    evaluations: t.Optional[t.List[EvaluationRun]]
    saved_view_slug: t.Optional[str]
    saved_views: t.Optional[t.List[SavedView]]
    version: t.Optional[str]
    view_cls: t.Optional[str]
    view_name: t.Optional[str]
    default_skeleton: t.Optional[KeypointSkeleton]
    skeletons: t.List[NamedKeypointSkeleton]
    app_config: t.Optional[DatasetAppConfig]
    info: t.Optional[JSON]

    estimated_frame_count: t.Optional[int]
    estimated_sample_count: int
    frame_indexes: t.Optional[t.List[Index]]
    sample_indexes: t.Optional[t.List[Index]]

    frame_collection_name: gql.Private[t.Optional[str]]
    sample_collection_name: gql.Private[t.Optional[str]]

    @gql.field
    def stages(
        self, slug: t.Optional[str] = None, view: t.Optional[BSONArray] = None
    ) -> t.Optional[BSONArray]:
        if slug:
            for view in self.saved_views:
                if view.slug == slug:
                    return view.stage_dicts()

        return view or []

    @gql.field
    async def estimated_sample_count(self, info: Info = None) -> int:
        return await info.context.db[
            self.sample_collection_name
        ].estimated_document_count()

    @gql.field
    async def estimated_frame_count(
        self, info: Info = None
    ) -> t.Optional[int]:
        if self.frame_collection_name:
            return await info.context.db[
                self.frame_collection_name
            ].estimated_document_count()

    @gql.field
    async def workspace(
        self, slug: t.Optional[str], info: Info
    ) -> t.Optional[Workspace]:
        if slug:
            doc = await info.context.db["workspaces"].find_one({"slug": slug})

            if doc:
                doc["id"] = doc.pop("_id")
                doc["dataset_id"] = doc.pop("_dataset_id")
                return from_dict(Workspace, doc)

        return None

    @staticmethod
    def modifier(doc: dict) -> dict:
        doc["id"] = doc.pop("_id")
        doc["dataset_id"] = doc["id"]
        doc["default_mask_targets"] = _convert_targets(
            doc.get("default_mask_targets", {})
        )
        doc["mask_targets"] = [
            NamedTargets(name=name, targets=_convert_targets(targets))
            for name, targets in doc.get("mask_targets", {}).items()
        ]
        flat = _flatten_fields([], doc.get("sample_fields", []))
        doc["sample_fields"] = flat

        doc["frame_fields"] = _flatten_fields([], doc.get("frame_fields", []))
        doc["brain_methods"] = list(doc.get("brain_methods", {}).values())
        doc["evaluations"] = list(doc.get("evaluations", {}).values())
        doc["saved_views"] = doc.get("saved_views", [])
        doc["skeletons"] = list(
            dict(name=name, **data)
            for name, data in doc.get("skeletons", {}).items()
        )
        doc["group_media_types"] = []
        doc["default_skeletons"] = doc.get("default_skeletons", None)

        # gql private fields must always be present
        doc.setdefault("frame_collection_name", None)

        return doc

    @classmethod
    async def resolver(
        cls,
        name: str,
        info: Info = None,
        saved_view_slug: t.Optional[str] = gql.UNSET,
        view: t.Optional[BSONArray] = None,
    ) -> t.Optional["Dataset"]:
        return await serialize_dataset(
            dataset_name=name,
            serialized_view=view,
            saved_view_slug=saved_view_slug,
            dicts=False,
            update_last_loaded_at=True,
        )


dataset_dataloader = get_dataloader_resolver(
    Dataset, "datasets", "name", DATASET_FILTER
)


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
    enable_query_performance: bool
    default_query_performance: bool
    loop_videos: bool
    multicolor_keypoints: bool
    notebook_height: int
    plugins: t.Optional[JSON]
    show_confidence: bool
    show_index: bool
    show_label: bool
    show_skeletons: bool
    show_tooltip: bool
    theme: Theme
    timezone: t.Optional[str]
    use_frame_number: bool
    spaces: t.Optional[JSON]
    disable_frame_filtering: bool = False
    media_fallback: bool = False


@gql.type
class SchemaResult:
    field_schema: t.List[SampleField]
    frame_field_schema: t.List[SampleField]


@gql.type
class Query(fosa.AggregateQuery):
    aggregations = gql.field(resolver=aggregate_resolver)
    lightning = gql.field(resolver=lightning_resolver)

    @gql.field
    def colorscale(self) -> t.Optional[t.List[t.List[int]]]:
        if fo.app_config.colorscale:
            return fo.app_config.get_colormap()

        return None

    @gql.field
    def config(self) -> AppConfig:
        config = get_state().config
        d = config.serialize()
        d["timezone"] = fo.config.timezone
        return from_dict(AppConfig, d)

    @gql.field
    def context(self) -> str:
        return focx._get_context()

    @gql.field
    def dev(self) -> bool:
        return foc.DEV_INSTALL or foc.RC_INSTALL

    @gql.field
    def do_not_track(self) -> bool:
        return fo.config.do_not_track

    @gql.field
    async def estimated_dataset_count(self, info: Info = None) -> int:
        return await info.context.db.datasets.estimated_document_count()

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
        filters: t.Optional[BSON] = None,
        extended_stages: t.Optional[BSON] = None,
        pagination_data: t.Optional[bool] = True,
    ) -> Connection[SampleItem, str]:
        return await paginate_samples(
            dataset,
            view,
            filters,
            first,
            after,
            sample_filter=filter,
            extended_stages=extended_stages,
            pagination_data=pagination_data,
        )

    @gql.field
    async def sample(
        self,
        dataset: str,
        view: BSONArray,
        filter: SampleFilter,
        filters: t.Optional[JSON] = None,
    ) -> t.Optional[SampleItem]:
        samples = await paginate_samples(
            dataset,
            view,
            filters,
            1,
            sample_filter=filter,
            pagination_data=False,
        )
        if samples.edges:
            return samples.edges[0].node

        return None

    stage_definitions = gql.field(stage_definitions)

    @gql.field
    def uid(self) -> str:
        return fou.get_user_id()

    @gql.field
    def version(self) -> str:
        return foc.VERSION

    @gql.field
    def saved_views(self, dataset_name: str) -> t.Optional[t.List[SavedView]]:
        try:
            ds = fod.load_dataset(dataset_name)
            return [
                SavedView.from_doc(view_doc)
                for view_doc in ds._doc.saved_views
            ]
        except:
            return None

    @gql.field
    def schema_for_view_stages(
        self,
        dataset_name: str,
        view_stages: BSONArray,
    ) -> SchemaResult:
        try:
            ds = fod.load_dataset(dataset_name)
            if view_stages:
                view = fov.DatasetView._build(ds, view_stages or [])

                if ds.media_type == fom.VIDEO:
                    frame_schema = serialize_fields(
                        view.get_frame_field_schema(flat=True)
                    )
                    field_schema = serialize_fields(
                        view.get_field_schema(flat=True)
                    )
                    return SchemaResult(
                        field_schema=field_schema,
                        frame_field_schema=frame_schema,
                    )

                return SchemaResult(
                    field_schema=serialize_fields(
                        view.get_field_schema(flat=True)
                    ),
                    frame_field_schema=[],
                )
            if ds.media_type == fom.VIDEO:
                frames_field_schema = serialize_fields(
                    ds.get_frame_field_schema(flat=True)
                )
                field_schema = serialize_fields(ds.get_field_schema(flat=True))
                return SchemaResult(
                    field_schema=field_schema,
                    frame_field_schema=frames_field_schema,
                )

            return SchemaResult(
                field_schema=serialize_fields(ds.get_field_schema(flat=True)),
                frame_field_schema=[],
            )
        except Exception as e:
            return SchemaResult(
                field_schema=[],
                frame_field_schema=[],
            )


def _flatten_fields(
    path: t.List[str], fields: t.List[t.Dict]
) -> t.List[t.Dict]:
    result = []
    for field in fields:
        key = field.pop("name", None)
        if key is None:
            # Issues with concurrency can cause this to happen.
            # Until it's fixed, just ignore these fields to avoid throwing hard
            # errors when loading in the app.
            logging.debug("Skipping field with no name: %s", field)
            continue
        field_path = path + [key]
        field["path"] = ".".join(field_path)
        result.append(field)

        fields = field.pop("fields", None)
        if fields:
            result = result + _flatten_fields(field_path, fields)

    return result


def _convert_targets(targets: t.Dict[str, str]) -> t.List[Target]:
    return [Target(target=k, value=v) for k, v in targets.items()]


async def serialize_dataset(
    dataset_name: str,
    serialized_view: BSONArray,
    saved_view_slug: t.Optional[str] = None,
    dicts=True,
    update_last_loaded_at=False,
) -> Dataset:
    def run():
        if not fod.dataset_exists(dataset_name):
            return None

        dataset = fo.Dataset(dataset_name, _create=False, _force_load=True)
        dataset.reload()
        view_name = None
        try:
            doc = dataset._get_saved_view_doc(saved_view_slug, slug=True)
            view = dataset.load_saved_view(doc.name)
            view_name = view.name
            if serialized_view:
                for stage in serialized_view:
                    view = view.add_stage(fosg.ViewStage._from_dict(stage))
        except:
            view: fov.DatasetView = fov.DatasetView._build(
                dataset, serialized_view or []
            )

        doc = dataset._doc.to_dict(no_dereference=True)
        Dataset.modifier(doc)
        data = from_dict(Dataset, doc)
        data.view_cls = None
        data.view_name = view_name
        data.saved_view_slug = saved_view_slug

        group_media_types = view._get_group_media_types() or {}
        data.group_media_types = [
            Group(name=name, media_type=media_type)
            for name, media_type in group_media_types.items()
        ]

        collection = dataset.view()
        if view is not None:
            # unique id for for the relay global store
            #
            # until a schema is with respect to a view and not a dataset this
            # is required
            data.id = ObjectId()
            if view._dataset != dataset:
                d = view._dataset._serialize()
                data.media_type = d["media_type"]
                data.view_cls = etau.get_class_name(view)

            data.parent_media_type = view._parent_media_type
            data.media_type = view.media_type

            collection = view

        data.sample_fields = serialize_fields(
            collection.get_field_schema(flat=True)
        )

        data.frame_fields = serialize_fields(
            collection.get_frame_field_schema(flat=True)
        )

        if dicts:
            saved_views = []
            for view in data.saved_views:
                view_dict = asdict(view)
                view_dict["view_name"] = view.view_name()
                view_dict["stage_dicts"] = view.stage_dicts()
                saved_views.append(view_dict)

            data.saved_views = saved_views

        for brain_method in data.brain_methods:
            try:
                type = brain_method.config.type().value
            except:
                type = None

            try:
                max_k = brain_method.config.max_k()
            except:
                max_k = None

            try:
                supports_least_similarity = (
                    brain_method.config.supports_least_similarity()
                )
            except:
                supports_least_similarity = None

            setattr(brain_method.config, "type", type)
            setattr(brain_method.config, "max_k", max_k)
            setattr(
                brain_method.config,
                "supports_least_similarity",
                supports_least_similarity,
            )

        _assign_estimated_counts(data, dataset)
        _assign_lightning_info(data, dataset)

        return data

    return await run_sync_task(run)


def _assign_estimated_counts(dataset: Dataset, fo_dataset: fo.Dataset):
    setattr(
        dataset,
        "estimated_sample_count",
        fo_dataset._sample_collection.estimated_document_count(),
    )
    setattr(
        dataset,
        "estimated_frame_count",
        (
            fo_dataset._frame_collection.estimated_document_count()
            if fo_dataset._frame_collection_name
            else None
        ),
    )


def _assign_lightning_info(dataset: Dataset, fo_dataset: fo.Dataset):
    dataset.sample_indexes, dataset.frame_indexes = indexes_from_dict(
        fo_dataset.get_index_information(include_stats=True)
    )
