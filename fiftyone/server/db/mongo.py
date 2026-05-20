"""
FiftyOne Server Mongo grid-data adapter.

Implements :class:`GridDataAdapter` against MongoDB / Motor by delegating
to the FiftyOne core machinery (``SampleCollection._async_aggregate``,
``foo.aggregate``, the lightning Mongo pipeline builders).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import typing as t

import fiftyone.core.collections as foc
import fiftyone.core.odm as foo

from fiftyone.server.db._mongo_lightning import (
    do_async_pooled_queries,
    resolve_lightning_path_queries,
)
from fiftyone.server.db.interface import SamplesPage, ValuePickerResult


class MongoGridAdapter:
    """``GridDataAdapter`` backed by MongoDB / Motor."""

    async def paginate_samples(
        self,
        view: foc.SampleCollection,
        *,
        sample_filter,
        first: int,
        filters: t.Optional[t.Mapping[str, t.Any]] = None,
        hint: t.Optional[str] = None,
        max_time_ms: t.Optional[int] = None,
    ) -> SamplesPage:
        # ``filters`` is intentionally unused — the equivalent filters are
        # already baked into ``view`` as view stages by the resolver.
        del filters

        # Imported lazily to avoid module-load cycles between the server
        # package and the db package.
        from fiftyone.server.samples import get_samples_pipeline

        pipeline = await get_samples_pipeline(view, sample_filter)
        samples = await foo.aggregate(
            foo.get_async_db_conn()[view._dataset._sample_collection_name],
            pipeline,
            hint,
            maxTimeMS=max_time_ms,
        ).to_list(first + 1)

        has_more = False
        if len(samples) > first:
            samples = samples[:first]
            has_more = True

        return SamplesPage(samples=samples, has_more=has_more)

    async def aggregate_paths(
        self,
        view: foc.SampleCollection,
        *,
        form,
    ):
        if not form.paths:
            return []

        from pymongo.errors import ExecutionTimeout

        from fiftyone.server.aggregations import _resolve_path_aggregation
        from fiftyone.server.exceptions import AggregationQueryTimeout

        aggregations, deserializers = zip(
            *[
                _resolve_path_aggregation(
                    path, view, form.query_performance, form.hint
                )
                for path in form.paths
            ]
        )
        counts = [len(a) for a in aggregations]
        flattened = [item for sublist in aggregations for item in sublist]

        max_time_ms = (
            form.max_query_time * 1000 if form.max_query_time else None
        )
        try:
            result = await view._async_aggregate(
                flattened, maxTimeMS=max_time_ms
            )
        except ExecutionTimeout:
            return [
                AggregationQueryTimeout(
                    path=path, query_time=form.max_query_time
                )
                for path in form.paths
            ]

        results = []
        offset = 0
        for length, deserialize in zip(counts, deserializers):
            results.append(deserialize(result[offset : length + offset]))
            offset += length

        return results

    async def count_field_values(
        self,
        view: foc.SampleCollection,
        *,
        path: str,
        first: int,
        asc: bool,
        sort_by: str,
        search: t.Optional[str],
        selected: t.Optional[t.List[t.Any]],
        filters: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> ValuePickerResult:
        # ``filters`` is intentionally unused — the equivalent filters are
        # already baked into ``view`` as view stages by the resolver.
        del filters

        import fiftyone.core.aggregations as foa

        total, page = await view._async_aggregate(
            foa.CountValues(
                path,
                _first=first,
                _asc=asc,
                _sort_by=sort_by,
                _search=search,
                _selected=selected,
            ),
        )
        return ValuePickerResult(total=total, page=list(page))

    async def lightning(self, dataset, *, request):
        if not request.paths:
            return []

        collections, queries, resolvers, is_frames = zip(
            *[
                resolve_lightning_path_queries(path, dataset)
                for path in request.paths
            ]
        )
        counts = [len(a) for a in queries]
        flattened = [
            (collection, item, frame_flag)
            for collection, sublist, frame_flag in zip(
                collections, queries, is_frames
            )
            for item in sublist
        ]

        match_filter = dict(request.match) if request.match else {}
        if dataset.group_field and request.slice:
            match_filter[f"{dataset.group_field}.name"] = request.slice
            dataset.group_slice = request.slice

        result = await do_async_pooled_queries(
            dataset, flattened, match_filter
        )

        results = []
        offset = 0
        for length, resolve in zip(counts, resolvers):
            results.append(resolve(result[offset : length + offset]))
            offset += length

        return results

    async def get_grid_field_schema(self, view: foc.SampleCollection):
        from fiftyone.core.state import serialize_fields

        return serialize_fields(view.get_field_schema(flat=True))
