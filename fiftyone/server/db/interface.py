"""
FiftyOne Server grid-data adapter Protocol.

Defines :class:`GridDataAdapter`: the async adapter-pattern interface for
sample / grid / sidebar reads, plus the result dataclasses its methods
return.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True)
class SamplesPage:
    """A page of grid samples returned by :meth:`GridDataAdapter.paginate_samples`.

    Attributes:
        samples: Raw sample documents to render in the grid.
        has_more: ``True`` when more samples follow this page.
    """

    samples: t.List[t.Dict[str, t.Any]]
    has_more: bool


@dataclass(frozen=True)
class ValuePickerResult:
    """A page of sidebar value-picker results returned by
    :meth:`GridDataAdapter.count_field_values`.

    Attributes:
        total: Total number of distinct values for the path.
        page: ``(value, count)`` pairs truncated to the requested page size.
    """

    total: int
    page: t.List[t.Tuple[t.Any, int]]


@t.runtime_checkable
class GridDataAdapter(t.Protocol):
    """Backend interface for grid / sidebar / lightning sample reads.

    Implementations receive an already-built FiftyOne ``SampleCollection``
    (with any client view stages baked in) plus raw sidebar inputs.
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
    ) -> SamplesPage:
        """Return a page of grid samples.

        Args:
            view: The sample collection (with any client view stages baked
                in by the resolver) to paginate over.
            sample_filter: Optional :class:`SampleFilter` carrying group /
                slice scoping; ``None`` for non-grouped datasets.
            first: Maximum number of samples to return in this page.
            filters: Raw client-supplied sidebar filter dict (the same
                shape passed to ``fosv.get_view``). Implementations may
                consume this directly to translate into their native query
                language.
            hint: Backend-specific index hint, or ``None``.
            max_time_ms: Per-query timeout in milliseconds, or ``None``.

        Returns:
            A :class:`SamplesPage` containing the sample documents and a
            ``has_more`` flag.
        """
        ...

    async def aggregate_paths(
        self,
        view: foc.SampleCollection,
        *,
        form: "AggregationForm",
    ) -> t.List[t.Union["AggregateResult", "AggregationQueryTimeout"]]:
        """Resolve the sidebar aggregations described by ``form``.

        Args:
            view: The sample collection. The caller has already applied
                ``select(sample_ids)`` and ``exclude_labels(hidden_labels)``
                adjustments and is responsible for any "slice" augmentation
                that depends on a separately-built mixed-mode view.
            form: Aggregation request carrying paths, filters, query
                performance options, and timeouts.

        Returns:
            One result per path in ``form.paths``, in order. Each entry is
            either an :class:`AggregateResult` (success) or an
            :class:`AggregationQueryTimeout` (per-path timeout).
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
    ) -> ValuePickerResult:
        """Power the sidebar value picker for a single path.

        Args:
            view: The sample collection.
            path: The field path whose distinct values are requested.
            first: Maximum number of values to return on the page.
            asc: Sort direction.
            sort_by: Sort key — typically ``"count"`` or ``"_id"``.
            search: Optional regex / substring to filter the values, or
                ``None``.
            selected: Optional list of already-picked values to exclude
                from the result, or ``None``.
            filters: Raw client-supplied sidebar filter dict, with the same
                semantics as in :meth:`paginate_samples`.

        Returns:
            A :class:`ValuePickerResult` with the total distinct-value count
            and the requested page of ``(value, count)`` pairs.
        """
        ...

    async def lightning(
        self,
        dataset: "fod.Dataset",
        *,
        input: "LightningInput",
    ) -> t.List["LightningResults"]:
        """Resolve a batch of "lightning" sidebar fast-path queries.

        Args:
            dataset: The dataset.
            input: The lightning request describing paths and per-path
                options.

        Returns:
            One :class:`LightningResults` per path in ``input.paths``, in
            order.
        """
        ...

    async def get_grid_field_schema(
        self, view: foc.SampleCollection
    ) -> t.List["SampleField"]:
        """Return the flat list of fields the sidebar should expose.

        Args:
            view: The sample collection.

        Returns:
            A list of :class:`SampleField` entries that the App will render
            as sidebar paths.
        """
        ...
