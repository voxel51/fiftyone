from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class TimeTrackType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TIME_TRACK_TYPE_UNSPECIFIED: _ClassVar[TimeTrackType]
    TIME_TRACK_TYPE_SEQUENCE: _ClassVar[TimeTrackType]
    TIME_TRACK_TYPE_DURATION_NS: _ClassVar[TimeTrackType]
    TIME_TRACK_TYPE_TIMESTAMP_NS: _ClassVar[TimeTrackType]

class TimeTrackRole(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TIME_TRACK_ROLE_UNSPECIFIED: _ClassVar[TimeTrackRole]
    TIME_TRACK_ROLE_LOG_TIME: _ClassVar[TimeTrackRole]
    TIME_TRACK_ROLE_PUBLISH_TIME: _ClassVar[TimeTrackRole]
    TIME_TRACK_ROLE_CAPTURE_TIME: _ClassVar[TimeTrackRole]
    TIME_TRACK_ROLE_SAMPLE_INDEX: _ClassVar[TimeTrackRole]

class TimeSortOrder(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TIME_SORT_ORDER_UNSPECIFIED: _ClassVar[TimeSortOrder]
    TIME_SORT_ORDER_UNKNOWN: _ClassVar[TimeSortOrder]
    TIME_SORT_ORDER_MONOTONIC: _ClassVar[TimeSortOrder]
    TIME_SORT_ORDER_UNSORTED: _ClassVar[TimeSortOrder]

class TimeSortScope(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TIME_SORT_SCOPE_UNSPECIFIED: _ClassVar[TimeSortScope]
    TIME_SORT_SCOPE_SCENE: _ClassVar[TimeSortScope]
    TIME_SORT_SCOPE_STREAM: _ClassVar[TimeSortScope]
    TIME_SORT_SCOPE_SEGMENT: _ClassVar[TimeSortScope]
TIME_TRACK_TYPE_UNSPECIFIED: TimeTrackType
TIME_TRACK_TYPE_SEQUENCE: TimeTrackType
TIME_TRACK_TYPE_DURATION_NS: TimeTrackType
TIME_TRACK_TYPE_TIMESTAMP_NS: TimeTrackType
TIME_TRACK_ROLE_UNSPECIFIED: TimeTrackRole
TIME_TRACK_ROLE_LOG_TIME: TimeTrackRole
TIME_TRACK_ROLE_PUBLISH_TIME: TimeTrackRole
TIME_TRACK_ROLE_CAPTURE_TIME: TimeTrackRole
TIME_TRACK_ROLE_SAMPLE_INDEX: TimeTrackRole
TIME_SORT_ORDER_UNSPECIFIED: TimeSortOrder
TIME_SORT_ORDER_UNKNOWN: TimeSortOrder
TIME_SORT_ORDER_MONOTONIC: TimeSortOrder
TIME_SORT_ORDER_UNSORTED: TimeSortOrder
TIME_SORT_SCOPE_UNSPECIFIED: TimeSortScope
TIME_SORT_SCOPE_SCENE: TimeSortScope
TIME_SORT_SCOPE_STREAM: TimeSortScope
TIME_SORT_SCOPE_SEGMENT: TimeSortScope

class PayloadDescriptor(_message.Message):
    __slots__ = ("encoding", "schema", "schema_encoding")
    ENCODING_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_ENCODING_FIELD_NUMBER: _ClassVar[int]
    encoding: str
    schema: str
    schema_encoding: str
    def __init__(self, encoding: _Optional[str] = ..., schema: _Optional[str] = ..., schema_encoding: _Optional[str] = ...) -> None: ...

class TimeValueRange(_message.Message):
    __slots__ = ("start", "end")
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    start: int
    end: int
    def __init__(self, start: _Optional[int] = ..., end: _Optional[int] = ...) -> None: ...

class TimeTrack(_message.Message):
    __slots__ = ("time_track_id", "type", "role", "display_name", "source_path", "stream_id", "value_range", "sort_order", "sort_scope", "metadata")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    TIME_TRACK_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    SOURCE_PATH_FIELD_NUMBER: _ClassVar[int]
    STREAM_ID_FIELD_NUMBER: _ClassVar[int]
    VALUE_RANGE_FIELD_NUMBER: _ClassVar[int]
    SORT_ORDER_FIELD_NUMBER: _ClassVar[int]
    SORT_SCOPE_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    time_track_id: str
    type: TimeTrackType
    role: TimeTrackRole
    display_name: str
    source_path: str
    stream_id: str
    value_range: TimeValueRange
    sort_order: TimeSortOrder
    sort_scope: TimeSortScope
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, time_track_id: _Optional[str] = ..., type: _Optional[_Union[TimeTrackType, str]] = ..., role: _Optional[_Union[TimeTrackRole, str]] = ..., display_name: _Optional[str] = ..., source_path: _Optional[str] = ..., stream_id: _Optional[str] = ..., value_range: _Optional[_Union[TimeValueRange, _Mapping]] = ..., sort_order: _Optional[_Union[TimeSortOrder, str]] = ..., sort_scope: _Optional[_Union[TimeSortScope, str]] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

class SourceFingerprint(_message.Message):
    __slots__ = ("size_bytes", "first_chunk_crc", "last_chunk_crc")
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    FIRST_CHUNK_CRC_FIELD_NUMBER: _ClassVar[int]
    LAST_CHUNK_CRC_FIELD_NUMBER: _ClassVar[int]
    size_bytes: int
    first_chunk_crc: int
    last_chunk_crc: int
    def __init__(self, size_bytes: _Optional[int] = ..., first_chunk_crc: _Optional[int] = ..., last_chunk_crc: _Optional[int] = ...) -> None: ...
