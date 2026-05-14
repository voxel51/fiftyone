"""
Parquet sink for multimodal scene projections.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

try:
    import pyarrow as pa
    import pyarrow.fs as pafs
    import pyarrow.parquet as pq
except ImportError:
    raise ImportError(
        "pyarrow is required for the Parquet projection sink. "
        "Install it via:\n\n    pip install pyarrow\n"
    )

import fiftyone.core.storage as fos

from . import ProjectionSink


class ParquetSink(ProjectionSink):
    """Writes projected scenes to a Parquet file.

    Accepts local paths or cloud URIs (``gs://``, ``s3://``, ``az://``).
    The filesystem is resolved via :func:`pyarrow.fs.FileSystem.from_uri` so
    no manual cloud-vs-local branching is needed at the call site.  For local
    paths the parent directory is created via :func:`fiftyone.core.storage.ensure_basedir`.

    Args:
        path: destination file path or cloud URI
        schema: Arrow schema for the output table
    """

    def __init__(self, path: str, schema: pa.Schema) -> None:
        fs, fs_path = pafs.FileSystem.from_uri(path)
        if isinstance(fs, pafs.LocalFileSystem):
            fos.ensure_basedir(path)
        self._writer = pq.ParquetWriter(fs_path, schema, filesystem=fs)

    def write_batch(self, batch: pa.RecordBatch) -> None:
        self._writer.write_batch(batch)

    def finalize(self) -> None:
        self._writer.close()
