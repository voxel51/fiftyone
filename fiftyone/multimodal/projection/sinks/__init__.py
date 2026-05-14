"""
Projection sink interface and built-in implementations.

Sinks represent storage backends that workers write parquet output to.
DuckDB is the query engine that reads from whatever the active sink wrote —
it is not a sink itself.

Available sinks:
    :class:`~fiftyone.multimodal.projection.sinks.parquet.ParquetSink`
        Writes parquet to a local path or cloud URI (GCS, S3, Azure).
        This is the primary sink; DuckDB queries these files via a
        glob resolved from the active ``plan_id`` in MongoDB.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import abc

try:
    import pyarrow as pa
except ImportError:
    raise ImportError(
        "pyarrow is required for multimodal projections. "
        "Install it via:\n\n    pip install pyarrow\n"
    )


class ProjectionSink(abc.ABC):
    """Abstract sink that receives projected scene rows as Arrow RecordBatches."""

    @abc.abstractmethod
    def write_batch(self, batch: pa.RecordBatch) -> None:
        """Write a batch of projected scene rows."""
        raise NotImplementedError

    @abc.abstractmethod
    def finalize(self) -> None:
        """Flush and close the sink."""
        raise NotImplementedError

    def __enter__(self) -> ProjectionSink:
        return self

    def __exit__(self, *_) -> None:
        self.finalize()
