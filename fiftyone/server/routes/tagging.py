"""
FiftyOne Server /tagging route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import time

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
from fiftyone.server.decorators import route
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.tags as fost

logger = logging.getLogger(__name__)

SAMPLES_PER_SLICE = 10_000
MAX_SLICES = 8


class Tagging(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        target_labels = data.get("target_labels", False)
        label_fields = data.get("label_fields", [])
        hidden_labels = data.get("hidden_labels", None)
        extended = data.get("extended", None)
        slices = data.get("slices", None)
        group_id = data.get("group_id", None)
        slice = data.get("slice", None)
        view = await fost.get_tag_view(
            dataset,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            label_fields=label_fields,
            labels=labels,
            hidden_labels=hidden_labels,
            sample_filter=SampleFilter(
                group=(
                    GroupElementFilter(slice=slice, id=group_id, slices=slices)
                    if not sample_ids
                    else None
                )
            ),
            sample_ids=sample_ids,
            target_labels=target_labels,
        )

        is_filtered = bool(
            stages
            or filters
            or extended
            or sample_ids
            or labels
            or hidden_labels
        )

        t0 = time.perf_counter()

        if target_labels:
            count, tags = await _aggregate_label_tags(view)
            items = None
        else:
            tags, items = await view._async_aggregate(
                [foa.CountValues("tags"), foa.Count()]
            )
            count = sum([v for k, v in tags.items() if k is not None])

        t1 = time.perf_counter()
        logger.warning(
            "[tagging] view agg took %.3fs (target_labels=%s, is_filtered=%s, dataset=%s)",
            t1 - t0,
            target_labels,
            is_filtered,
            dataset,
        )

        if is_filtered:
            all_tags = await _get_all_dataset_tags(dataset, target_labels)
            t2 = time.perf_counter()
            logger.warning(
                "[tagging] all_tags (dataset scan) took %.3fs",
                t2 - t1,
            )
        else:
            all_tags = sorted(t for t in tags.keys() if t is not None)

        return {
            "count": count,
            "tags": tags,
            "items": items,
            "all_tags": all_tags,
        }


def _build_label_tag_facet(sample_collection):
    """Builds a single $facet stage with per-field count and tag branches."""
    facet_stages = {}

    for path, field in foc._iter_label_fields(sample_collection):
        label_type = field.document_type
        safe_name = path.replace("-", "_").replace(".", "__")

        if issubclass(label_type, fol._HasLabelList):
            list_path = path + "." + label_type._LABEL_LIST_FIELD
            facet_stages[f"{safe_name}__count"] = [
                {"$unwind": f"${list_path}"},
                {"$count": "count"},
            ]
            facet_stages[f"{safe_name}__tags"] = [
                {"$unwind": f"${list_path}"},
                {"$unwind": f"${list_path}.tags"},
                {
                    "$group": {
                        "_id": f"${list_path}.tags",
                        "count": {"$sum": 1},
                    }
                },
            ]
        else:
            facet_stages[f"{safe_name}__count"] = [
                {"$match": {path: {"$ne": None}}},
                {"$count": "count"},
            ]
            facet_stages[f"{safe_name}__tags"] = [
                {"$match": {path: {"$ne": None}}},
                {"$unwind": f"${path}.tags"},
                {
                    "$group": {
                        "_id": f"${path}.tags",
                        "count": {"$sum": 1},
                    }
                },
            ]

    return facet_stages


async def _get_id_boundaries(collection, n_splits):
    """Gets _id boundaries for splitting a collection into parallel slices.

    Uses $bucketAuto on the _id index for evenly distributed splits.
    """
    pipeline = [
        {"$project": {"_id": 1}},
        {"$bucketAuto": {"groupBy": "$_id", "buckets": n_splits}},
    ]
    cursor = collection.aggregate(pipeline, hint={"_id": 1})
    buckets = [doc async for doc in cursor]
    return [b["_id"]["min"] for b in buckets[1:]]


def _merge_facet_results(all_results):
    """Merges results from parallel $facet pipeline runs."""
    count = 0
    tags = {}
    for doc in all_results:
        for key, value in doc.items():
            if key.endswith("__count"):
                count += value[0]["count"] if value else 0
            elif key.endswith("__tags"):
                for entry in value:
                    tag = entry["_id"]
                    if tag is not None:
                        tags[tag] = tags.get(tag, 0) + entry["count"]
    return count, tags


async def _aggregate_label_tags(view):
    """Computes label count and tag value counts using parallel pipelines.

    Splits the collection into slices by _id range and runs a $facet pipeline
    on each slice concurrently, then merges the results. This parallelizes
    across MongoDB's single-threaded aggregation limitation.
    """
    facet_stages = _build_label_tag_facet(view)

    if not facet_stages:
        return 0, {}

    view_pipeline = view._pipeline()
    coll_name = view._dataset._sample_collection_name
    collection = foo.get_async_db_conn()[coll_name]
    estimated = await collection.estimated_document_count()
    n_slices = min(max(1, estimated // SAMPLES_PER_SLICE), MAX_SLICES)

    if n_slices <= 1:
        cursor = collection.aggregate(
            view_pipeline + [{"$facet": facet_stages}],
            allowDiskUse=True,
        )
        result = await cursor.to_list(length=1)
        return _merge_facet_results([result[0]] if result else [])

    boundaries = await _get_id_boundaries(collection, n_slices)

    # Build _id range match stages
    all_bounds = [None] + boundaries + [None]
    range_matches = []
    for i in range(len(all_bounds) - 1):
        id_filter = {}
        if all_bounds[i] is not None:
            id_filter["$gte"] = all_bounds[i]
        if all_bounds[i + 1] is not None:
            id_filter["$lt"] = all_bounds[i + 1]
        range_matches.append(
            {"$match": {"_id": id_filter}} if id_filter else {"$match": {}}
        )

    async def run_slice(match_stage):
        pipeline = view_pipeline + [match_stage, {"$facet": facet_stages}]
        cursor = collection.aggregate(
            pipeline, allowDiskUse=True, hint={"_id": 1}
        )
        result = await cursor.to_list(length=1)
        return result[0] if result else {}

    results = await asyncio.gather(*[run_slice(m) for m in range_matches])

    return _merge_facet_results(results)


async def _get_all_dataset_tags(dataset_name, target_labels):
    """Returns all distinct tag names from the unfiltered dataset.

    This allows the frontend to display 0-count tags (tags that exist in the
    dataset but not in the current view) without triggering expensive GraphQL
    aggregation queries.

    Uses parallel _id-range slices for large collections.
    """
    ds = fod.load_dataset(dataset_name, reload=False)
    coll_name = ds._sample_collection_name
    collection = foo.get_async_db_conn()[coll_name]

    if target_labels:
        facet_stages = _build_label_tag_facet(ds)
        tag_facets = {
            k: v for k, v in facet_stages.items() if k.endswith("__tags")
        }

        if not tag_facets:
            return []

        estimated = await collection.estimated_document_count()
        n_slices = min(max(1, estimated // SAMPLES_PER_SLICE), MAX_SLICES)

        if n_slices <= 1:
            cursor = collection.aggregate(
                [{"$facet": tag_facets}], allowDiskUse=True
            )
            result = await cursor.to_list(length=1)
            results = [result[0]] if result else []
        else:
            boundaries = await _get_id_boundaries(collection, n_slices)
            all_bounds = [None] + boundaries + [None]

            async def run_slice(lo, hi):
                id_filter = {}
                if lo is not None:
                    id_filter["$gte"] = lo
                if hi is not None:
                    id_filter["$lt"] = hi
                match = (
                    {"$match": {"_id": id_filter}}
                    if id_filter
                    else {"$match": {}}
                )
                pipeline = [match, {"$facet": tag_facets}]
                cursor = collection.aggregate(
                    pipeline, allowDiskUse=True, hint={"_id": 1}
                )
                result = await cursor.to_list(length=1)
                return result[0] if result else {}

            results = await asyncio.gather(
                *[
                    run_slice(all_bounds[i], all_bounds[i + 1])
                    for i in range(len(all_bounds) - 1)
                ]
            )

        all_tags = set()
        for doc in results:
            for key, value in doc.items():
                for entry in value:
                    if entry["_id"] is not None:
                        all_tags.add(entry["_id"])

        return sorted(all_tags)
    else:
        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": None, "tags": {"$addToSet": "$tags"}}},
        ]
        cursor = collection.aggregate(pipeline)
        result = await cursor.to_list(length=1)

        if not result:
            return []

        all_tags = result[0].get("tags", [])
        return sorted(t for t in all_tags if t is not None)
