"""
FiftyOne Server data adapter Protocols.

Two interfaces:

* ``GridDataAdapter`` — the swappable surface. Methods cover grid sample
  pagination, sidebar aggregations, the value picker, lightning fast paths,
  and sample counts. A non-Mongo (SQL/BigQuery) implementation will replace
  this surface.

* ``MetadataAdapter`` — the always-Mongo surface. Methods cover Strawberry
  DataLoader-style key lookups and Connection-style paginators over the
  ``datasets`` / ``workspaces`` / saved-view / etc. metadata collections.
  Defined as a Protocol so the seam is consistent, but only ever implemented
  by Mongo.

Both Protocols are async-only.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import typing as t

import fiftyone.core.collections as foc

if t.TYPE_CHECKING:  # avoid runtime import cycles
    import fiftyone.core.dataset as fod
    from fiftyone.core.state import SampleField
    from fiftyone.server.aggregations import (
        AggregateResult,
        AggregationForm,
    )
    from fiftyone.server.exceptions import AggregationQueryTimeout
    from fiftyone.server.filters import SampleFilter
    from fiftyone.server.lightning import (
        LightningInput,
        LightningResults,
    )


@t.runtime_checkable
class GridDataAdapter(t.Protocol):
    """Backend interface for grid / sidebar / lightning sample reads.

    Implementations receive an already-built FiftyOne ``SampleCollection``
    (with any client view stages baked in) plus raw sidebar inputs; they
    are not expected to introspect view stages or FiftyOne aggregation /
    expression objects in this iteration.
    """

    async def paginate_samples(
        self,
        view: foc.SampleCollection,
        *,
        sample_filter: t.Optional["SampleFilter"],
        first: int,
        filters: t.Optional[t.Mapping[str, t.Any]] = None,
        hint: t.Optional[str] = None,
        max_time_ms: t.Optional[int] = None,
    ) -> t.Tuple[t.List[t.Dict[str, t.Any]], bool]:
        """Return up to ``first`` raw sample documents for the grid plus a
        ``has_more`` flag.

        ``filters`` is the raw client-supplied sidebar filter dict (the
        same shape passed to ``fosv.get_view``). The Mongo implementation
        ignores it because the equivalent filters are already baked into
        ``view`` as view stages; non-Mongo implementations consume it
        directly to translate into their native query language.

        The caller (resolver) is responsible for any cursor / skip handling
        before invocation and for post-processing the returned documents
        into GraphQL ``SampleItem`` types.
        """
        ...

    async def aggregate_paths(
        self,
        view: foc.SampleCollection,
        *,
        form: "AggregationForm",
    ) -> t.List[t.Union["AggregateResult", "AggregationQueryTimeout"]]:
        """Resolve the sidebar aggregations described by ``form`` against
        ``view``.

        The caller has already built the view, applied any
        ``select(sample_ids)`` and ``exclude_labels(hidden_labels)``
        adjustments, and is responsible for any "slice" augmentation that
        depends on a separately-built mixed-mode view.
        """
        ...

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
    ) -> t.Tuple[int, t.List[t.Tuple[t.Any, int]]]:
        """Power the sidebar value picker.

        ``filters`` is the raw sidebar filter dict, with the same Mongo-
        ignored / non-Mongo-consumed semantics as in
        :meth:`paginate_samples`.

        Returns ``(total_distinct_count, page)`` where ``page`` is a list of
        ``(value, count)`` tuples truncated to ``first`` entries.
        """
        ...

    async def lightning(
        self,
        dataset: "fod.Dataset",
        *,
        input: "LightningInput",
    ) -> t.List["LightningResults"]:
        """Resolve a list of "lightning" sidebar fast-path queries against
        ``dataset``. Each implementation chooses its own optimization
        strategy; the Mongo implementation runs Mongo-specific minimal
        pipelines, while a SQL implementation may collapse all paths to a
        single straightforward query.
        """
        ...

    async def estimated_sample_count(self, sample_collection_name: str) -> int:
        """Return an estimated document count for the named sample
        collection. Used by the grid size badge.
        """
        ...

    async def get_grid_field_schema(
        self, view: foc.SampleCollection
    ) -> t.List["SampleField"]:
        """Return the flat list of fields the sidebar should expose for
        ``view``.

        The Mongo implementation derives this from the FiftyOne field
        schema attached to the dataset / view; a SQL/BigQuery
        implementation would consult its own schema source (e.g. a
        ``multimodal_fields`` declaration on the dataset doc, populated
        by ingestion). Returning a list of ``SampleField`` keeps the
        sidebar resolver dialect-agnostic.
        """
        ...


@t.runtime_checkable
class MetadataAdapter(t.Protocol):
    """Backend interface for always-Mongo metadata reads.

    These methods read collections that hold dataset metadata, workspaces,
    saved views, and similar — *not* sample/scene data. They are only ever
    implemented by Mongo.
    """

    async def find_documents(
        self,
        collection_name: str,
        filter: t.Mapping[str, t.Any],
        projection: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.List[t.Dict[str, t.Any]]:
        """Return all documents in ``collection_name`` matching ``filter``.

        Used by the Strawberry DataLoader factory in ``dataloader.py``.
        """
        ...

    async def aggregate_collection(
        self,
        collection_name: str,
        pipelines: t.Sequence[t.Sequence[t.Mapping[str, t.Any]]],
    ) -> t.List[t.List[t.Dict[str, t.Any]]]:
        """Run one or more aggregation pipelines against ``collection_name``
        and return their results.

        Used by the Connection-style paginator in ``paginator.py``.
        """
        ...
