"""
Parquet sink for multimodal scene projections.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError:
    raise ImportError(
        "pyarrow is required for the Parquet projection sink. "
        "Install it via:\n\n    pip install pyarrow\n"
    )

from . import ProjectionSink


class ParquetSink(ProjectionSink):
    """Writes projected scenes to a Parquet file.

    Accepts local paths or cloud URIs (``s3://``, ``gs://``, ``az://``);
    PyArrow resolves the filesystem via ``fsspec``.

    Args:
        path: destination file path or cloud URI
        schema: Arrow schema returned by :func:`~fiftyone.multimodal.projection.schema.build_schema`
    """

    def __init__(self, path: str, schema: pa.Schema) -> None:
        self._writer = pq.ParquetWriter(path, schema)

    def write_batch(self, batch: pa.RecordBatch) -> None:
        self._writer.write_batch(batch)

    def finalize(self) -> None:
        self._writer.close()
