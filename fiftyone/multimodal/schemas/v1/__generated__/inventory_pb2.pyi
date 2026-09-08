from . import common_pb2 as _common_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class StreamInventory(_message.Message):
    __slots__ = ("stream_id", "payload", "record_count", "display_name", "metadata")
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
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    stream_id: str
    payload: _common_pb2.PayloadDescriptor
    record_count: int
    display_name: str
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, stream_id: _Optional[str] = ..., payload: _Optional[_Union[_common_pb2.PayloadDescriptor, _Mapping]] = ..., record_count: _Optional[int] = ..., display_name: _Optional[str] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

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
    __slots__ = ("inventory_id", "scene_id", "source_format", "source_fingerprint", "inventory_version", "time_tracks", "streams", "static_coordinate_frame_edges", "metadata", "produced_at", "produced_by")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    INVENTORY_ID_FIELD_NUMBER: _ClassVar[int]
    SCENE_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FORMAT_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FINGERPRINT_FIELD_NUMBER: _ClassVar[int]
    INVENTORY_VERSION_FIELD_NUMBER: _ClassVar[int]
    TIME_TRACKS_FIELD_NUMBER: _ClassVar[int]
    STREAMS_FIELD_NUMBER: _ClassVar[int]
    STATIC_COORDINATE_FRAME_EDGES_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_AT_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_BY_FIELD_NUMBER: _ClassVar[int]
    inventory_id: str
    scene_id: str
    source_format: str
    source_fingerprint: _common_pb2.SourceFingerprint
    inventory_version: str
    time_tracks: _containers.RepeatedCompositeFieldContainer[_common_pb2.TimeTrack]
    streams: _containers.RepeatedCompositeFieldContainer[StreamInventory]
    static_coordinate_frame_edges: _containers.RepeatedCompositeFieldContainer[StaticCoordinateFrameEdge]
    metadata: _containers.ScalarMap[str, str]
    produced_at: str
    produced_by: str
    def __init__(self, inventory_id: _Optional[str] = ..., scene_id: _Optional[str] = ..., source_format: _Optional[str] = ..., source_fingerprint: _Optional[_Union[_common_pb2.SourceFingerprint, _Mapping]] = ..., inventory_version: _Optional[str] = ..., time_tracks: _Optional[_Iterable[_Union[_common_pb2.TimeTrack, _Mapping]]] = ..., streams: _Optional[_Iterable[_Union[StreamInventory, _Mapping]]] = ..., static_coordinate_frame_edges: _Optional[_Iterable[_Union[StaticCoordinateFrameEdge, _Mapping]]] = ..., metadata: _Optional[_Mapping[str, str]] = ..., produced_at: _Optional[str] = ..., produced_by: _Optional[str] = ...) -> None: ...
