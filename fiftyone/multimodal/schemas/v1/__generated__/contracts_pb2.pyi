from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PayloadDescriptor(_message.Message):
    __slots__ = ("encoding", "schema", "schema_encoding")
    ENCODING_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_ENCODING_FIELD_NUMBER: _ClassVar[int]
    encoding: str
    schema: str
    schema_encoding: str
    def __init__(self, encoding: _Optional[str] = ..., schema: _Optional[str] = ..., schema_encoding: _Optional[str] = ...) -> None: ...

class TimeRange(_message.Message):
    __slots__ = ("start_ns", "end_ns")
    START_NS_FIELD_NUMBER: _ClassVar[int]
    END_NS_FIELD_NUMBER: _ClassVar[int]
    start_ns: int
    end_ns: int
    def __init__(self, start_ns: _Optional[int] = ..., end_ns: _Optional[int] = ...) -> None: ...

class SourceFingerprint(_message.Message):
    __slots__ = ("size_bytes", "first_chunk_crc", "last_chunk_crc")
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    FIRST_CHUNK_CRC_FIELD_NUMBER: _ClassVar[int]
    LAST_CHUNK_CRC_FIELD_NUMBER: _ClassVar[int]
    size_bytes: int
    first_chunk_crc: int
    last_chunk_crc: int
    def __init__(self, size_bytes: _Optional[int] = ..., first_chunk_crc: _Optional[int] = ..., last_chunk_crc: _Optional[int] = ...) -> None: ...

class StreamInventory(_message.Message):
    __slots__ = ("stream_id", "payload", "record_count", "time_range", "metadata")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    STREAM_ID_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    RECORD_COUNT_FIELD_NUMBER: _ClassVar[int]
    TIME_RANGE_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    stream_id: str
    payload: PayloadDescriptor
    record_count: int
    time_range: TimeRange
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, stream_id: _Optional[str] = ..., payload: _Optional[_Union[PayloadDescriptor, _Mapping]] = ..., record_count: _Optional[int] = ..., time_range: _Optional[_Union[TimeRange, _Mapping]] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

class StaticCoordinateFrameEdge(_message.Message):
    __slots__ = ("parent_frame_id", "child_frame_id", "source_stream_id")
    PARENT_FRAME_ID_FIELD_NUMBER: _ClassVar[int]
    CHILD_FRAME_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_STREAM_ID_FIELD_NUMBER: _ClassVar[int]
    parent_frame_id: str
    child_frame_id: str
    source_stream_id: str
    def __init__(self, parent_frame_id: _Optional[str] = ..., child_frame_id: _Optional[str] = ..., source_stream_id: _Optional[str] = ...) -> None: ...

class SceneInventory(_message.Message):
    __slots__ = ("scene_id", "source_format", "source_fingerprint", "inventory_version", "time_range", "streams", "static_coordinate_frame_edges", "produced_at", "produced_by")
    SCENE_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FORMAT_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FINGERPRINT_FIELD_NUMBER: _ClassVar[int]
    INVENTORY_VERSION_FIELD_NUMBER: _ClassVar[int]
    TIME_RANGE_FIELD_NUMBER: _ClassVar[int]
    STREAMS_FIELD_NUMBER: _ClassVar[int]
    STATIC_COORDINATE_FRAME_EDGES_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_AT_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_BY_FIELD_NUMBER: _ClassVar[int]
    scene_id: str
    source_format: str
    source_fingerprint: SourceFingerprint
    inventory_version: str
    time_range: TimeRange
    streams: _containers.RepeatedCompositeFieldContainer[StreamInventory]
    static_coordinate_frame_edges: _containers.RepeatedCompositeFieldContainer[StaticCoordinateFrameEdge]
    produced_at: str
    produced_by: str
    def __init__(self, scene_id: _Optional[str] = ..., source_format: _Optional[str] = ..., source_fingerprint: _Optional[_Union[SourceFingerprint, _Mapping]] = ..., inventory_version: _Optional[str] = ..., time_range: _Optional[_Union[TimeRange, _Mapping]] = ..., streams: _Optional[_Iterable[_Union[StreamInventory, _Mapping]]] = ..., static_coordinate_frame_edges: _Optional[_Iterable[_Union[StaticCoordinateFrameEdge, _Mapping]]] = ..., produced_at: _Optional[str] = ..., produced_by: _Optional[str] = ...) -> None: ...

class PlaybackPlan(_message.Message):
    __slots__ = ("scene_id",)
    SCENE_ID_FIELD_NUMBER: _ClassVar[int]
    scene_id: str
    def __init__(self, scene_id: _Optional[str] = ...) -> None: ...
