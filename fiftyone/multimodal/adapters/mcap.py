"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import binascii
import datetime
import io

from .base import MultimodalAdapter
from .formats import SceneFormat
from fiftyone.core import storage
from fiftyone.multimodal.schemas.v1.__generated__.contracts_pb2 import (
    PayloadDescriptor,
    SceneInventory,
    SourceFingerprint,
    StreamInventory,
    TimeRange,
)

try:
    from mcap.reader import SeekingReader, make_reader
except ImportError:
    raise ImportError(
        "The mcap package is required to use the McapAdapter. Please install it via:\n\n"
        "    pip install mcap\n"
    )


def chunk_crc(file, chunk):
    file.seek(chunk.chunk_start_offset)
    return binascii.crc32(file.read(chunk.chunk_length)) & 0xFFFFFFFF


class McapAdapter(MultimodalAdapter):
    """Adapter for loading multimodal scenes from MCAP files."""

    @classmethod
    def can_read(cls, filepath: str) -> bool:
        """
        Returns True if this adapter can read the scene data at the given filepath.

        Args:
            filepath: the path of the scene file to check

        Returns:
            True if this adapter can read the scene data at the given filepath, else
            False
        """
        return filepath.lower().endswith(".mcap")

    @classmethod
    def get_scene_inventory(cls, filepath: str):
        """
        Returns the scene inventory for the MCAP file at the given filepath.

        Args:
            filepath: the path of the MCAP file to load

        Returns:
            a :class:`fiftyone.core.multimodal.SceneInventory`
        """
        with storage.open_file(filepath, "rb") as f:
            reader = make_reader(f)
            return cls._read_scene_inventory(reader, filepath=filepath, file=f)

    @classmethod
    def _read_scene_inventory(
        cls,
        reader: SeekingReader,
        *,
        filepath: str,
        file: io.FileIO,
    ) -> SceneInventory:
        summary = reader.get_summary()
        stats = summary.statistics
        streams = summary.channels
        chunk_indices = sorted(
            summary.chunk_indexes, key=lambda ci: ci.chunk_start_offset
        )

        return SceneInventory(
            scene_id=filepath,
            source_format=SceneFormat.MCAP,
            source_fingerprint=SourceFingerprint(
                size_bytes=storage.get_file_size(filepath),
                first_chunk_crc=chunk_crc(file, chunk_indices[0]),
                last_chunk_crc=chunk_crc(file, chunk_indices[-1]),
            ),
            inventory_version="1.0",
            time_range=TimeRange(
                start_ns=stats.message_start_time,
                end_ns=stats.message_end_time,
            ),
            streams=[
                StreamInventory(
                    stream_id=str(cid),
                    payload=PayloadDescriptor(
                        encoding=summary.schemas[channel.schema_id].encoding,
                        schema=summary.schemas[channel.schema_id].name,
                        schema_encoding=None,
                    ),
                    record_count=stats.channel_message_counts.get(cid, 0),
                    time_range=None,  # not in summary, have to read chunks, so skip it for now
                    metadata=channel.metadata,
                )
                for cid, channel in streams.items()
            ],
            static_coordinate_frame_edges=[],
            produced_at=datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat(),
            produced_by="McapAdapter 1.0",
        )
