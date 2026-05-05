"""
FiftyOne Server SQL grid adapter stub.

This module exists to validate that ``GridDataAdapter`` is implementable
from a non-Mongo perspective. Every method raises ``NotImplementedError``;
the real SQL/BigQuery body will land in the next "Pieces of Work" bullet
of FOEPD-3760.

There is no SQL counterpart for ``MetadataAdapter`` because the metadata
collections (datasets, workspaces, saved views, ...) are always served
from MongoDB even when grid data is served from SQL.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import typing as t

import fiftyone.core.collections as foc


def _not_implemented(method: str) -> "t.NoReturn":
    raise NotImplementedError(
        f"SQLGridAdapter.{method} is not implemented yet — "
        "see FOEPD-3760 piece-of-work #2"
    )


class SQLGridAdapter:
    """Stub ``GridDataAdapter``. All methods raise ``NotImplementedError``.

    Selected when ``FIFTYONE_GRID_BACKEND=sql``; intended for offline
    interface-conformance validation, not runtime use.
    """

    async def paginate_samples(
        self,
        view: foc.SampleCollection,
        *,
        sample_filter,
        first: int,
        hint: t.Optional[str] = None,
        max_time_ms: t.Optional[int] = None,
    ) -> t.Tuple[t.List[t.Dict[str, t.Any]], bool]:
        _not_implemented("paginate_samples")

    async def aggregate_paths(
        self,
        view: foc.SampleCollection,
        *,
        form,
    ):
        _not_implemented("aggregate_paths")

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
        _not_implemented("count_field_values")

    async def lightning(self, dataset, *, input):
        _not_implemented("lightning")

    async def estimated_sample_count(self, sample_collection_name: str) -> int:
        _not_implemented("estimated_sample_count")

    async def get_grid_field_schema(self, view: foc.SampleCollection):
        _not_implemented("get_grid_field_schema")
