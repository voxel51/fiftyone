"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import binascii
import datetime

from .base import MultimodalAdapter
from .formats import SceneFormat
from fiftyone.core import storage
from fiftyone.multimodal.schemas.v1.__generated__.common_pb2 import (
    PayloadDescriptor,
    SourceFingerprint,
    TimeTrack,
    TimeValueRange,
)
from fiftyone.multimodal.schemas.v1.__generated__.inventory_pb2 import (
    SceneInventory,
    StreamInventory,
)

try:
    from mcap.reader import make_reader
    from mcap.summary import Summary
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
            summary = reader.get_summary()
            chunk_indices = sorted(
                summary.chunk_indexes,
                key=lambda ci: ci.chunk_start_offset,
            )
            return cls._read_scene_inventory(
                summary=summary,
                scene_id=filepath,
                size=storage.get_file_size(filepath),
                first_chunk_crc=chunk_crc(f, chunk_indices[0]),
                last_chunk_crc=chunk_crc(f, chunk_indices[-1]),
            )

    @classmethod
    def _read_scene_inventory(
        cls,
        *,
        summary: Summary,
        scene_id: str,
        size: int,
        first_chunk_crc: int = None,
        last_chunk_crc: int = None,
    ) -> SceneInventory:
        stats = summary.statistics

        return SceneInventory(
            scene_id=scene_id,
            source_format=SceneFormat.MCAP,
            source_fingerprint=SourceFingerprint(
                size_bytes=size,
                first_chunk_crc=first_chunk_crc,
                last_chunk_crc=last_chunk_crc,
            ),
            inventory_version="1.0",
            time_tracks=(
                [
                    TimeTrack(
                        value_range=TimeValueRange(
                            start=stats.message_start_time,
                            end=stats.message_end_time,
                        )
                    )
                ]
                if stats
                else []
            ),
            streams=[
                StreamInventory(
                    stream_id=str(cid),
                    display_name=channel.topic,
                    payload=(
                        PayloadDescriptor(
                            encoding=channel.message_encoding,
                            schema=summary.schemas[channel.schema_id].name,
                            schema_encoding=summary.schemas[
                                channel.schema_id
                            ].encoding,
                        )
                        if channel.schema_id != 0
                        else PayloadDescriptor(
                            encoding=channel.message_encoding
                        )
                    ),
                    record_count=(
                        stats.channel_message_counts.get(cid, 0)
                        if stats
                        else 0
                    ),
                    metadata=channel.metadata,
                )
                for cid, channel in summary.channels.items()
            ],
            static_coordinate_frame_edges=[],
            produced_at=datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat(),
            produced_by="McapAdapter 1.0",
        )
