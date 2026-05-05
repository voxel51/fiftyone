"""
FiftyOne Server Mongo data adapters.

Implements ``GridDataAdapter`` and ``MetadataAdapter`` against the existing
Motor / pymongo / FiftyOne core machinery. No business logic is
re-implemented; each method is a thin delegation to the helpers used by
the resolvers today.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import typing as t

import fiftyone.core.collections as foc
import fiftyone.core.odm as foo


class MongoGridAdapter:
    """``GridDataAdapter`` backed by MongoDB / Motor."""

    async def paginate_samples(
        self,
        view: foc.SampleCollection,
        *,
        sample_filter,
        first: int,
        hint: t.Optional[str] = None,
        max_time_ms: t.Optional[int] = None,
    ) -> t.Tuple[t.List[t.Dict[str, t.Any]], bool]:
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

        more = False
        if len(samples) > first:
            samples = samples[:first]
            more = True

        return samples, more

    async def aggregate_paths(
        self,
        view: foc.SampleCollection,
        *,
        form,
    ):
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
    ) -> t.Tuple[int, t.List[t.Tuple[t.Any, int]]]:
        import fiftyone.core.aggregations as foa

        count, page = await view._async_aggregate(
            foa.CountValues(
                path,
                _first=first,
                _asc=asc,
                _sort_by=sort_by,
                _search=search,
                _selected=selected,
            ),
        )
        return count, page

    async def lightning(self, dataset, *, input):
        from fiftyone.server.lightning import (
            _do_async_pooled_queries,
            _resolve_lightning_path_queries,
        )

        collections, queries, resolvers, is_frames = zip(
            *[
                _resolve_lightning_path_queries(path, dataset)
                for path in input.paths
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

        match_filter = dict(input.match) if input.match else {}
        if dataset.group_field and input.slice:
            match_filter[f"{dataset.group_field}.name"] = input.slice
            dataset.group_slice = input.slice

        result = await _do_async_pooled_queries(
            dataset, flattened, match_filter
        )

        results = []
        offset = 0
        for length, resolve in zip(counts, resolvers):
            results.append(resolve(result[offset : length + offset]))
            offset += length

        return results

    async def estimated_sample_count(self, sample_collection_name: str) -> int:
        return await foo.get_async_db_conn()[
            sample_collection_name
        ].estimated_document_count()

    async def get_grid_field_schema(self, view: foc.SampleCollection):
        from fiftyone.core.state import serialize_fields

        return serialize_fields(view.get_field_schema(flat=True))


class MongoMetadataAdapter:
    """``MetadataAdapter`` backed by MongoDB / Motor."""

    async def find_documents(
        self,
        collection_name: str,
        filter: t.Mapping[str, t.Any],
        projection: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.List[t.Dict[str, t.Any]]:
        db = foo.get_async_db_conn()
        find_args: t.List[t.Any] = [filter]
        if projection is not None:
            find_args.append(projection)
        return [doc async for doc in db[collection_name].find(*find_args)]

    async def aggregate_collection(
        self,
        collection_name: str,
        pipelines: t.Sequence[t.Sequence[t.Mapping[str, t.Any]]],
    ) -> t.List[t.List[t.Dict[str, t.Any]]]:
        collection = foo.get_async_db_conn()[collection_name]
        return await foo.aggregate(collection, list(pipelines))
