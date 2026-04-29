from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
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

class PlaybackSyncMode(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLAYBACK_SYNC_MODE_UNSPECIFIED: _ClassVar[PlaybackSyncMode]
    PLAYBACK_SYNC_MODE_NEAREST: _ClassVar[PlaybackSyncMode]
    PLAYBACK_SYNC_MODE_STRICT: _ClassVar[PlaybackSyncMode]
    PLAYBACK_SYNC_MODE_LATEST: _ClassVar[PlaybackSyncMode]

class PanelKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PANEL_KIND_UNSPECIFIED: _ClassVar[PanelKind]
    PANEL_KIND_IMAGE: _ClassVar[PanelKind]
    PANEL_KIND_THREE_D: _ClassVar[PanelKind]
    PANEL_KIND_TIMESERIES: _ClassVar[PanelKind]
    PANEL_KIND_MAP: _ClassVar[PanelKind]
    PANEL_KIND_TABLE: _ClassVar[PanelKind]
    PANEL_KIND_RAW_RECORDS: _ClassVar[PanelKind]

class PanelStreamRole(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PANEL_STREAM_ROLE_UNSPECIFIED: _ClassVar[PanelStreamRole]
    PANEL_STREAM_ROLE_PRIMARY: _ClassVar[PanelStreamRole]
    PANEL_STREAM_ROLE_SUPPORT: _ClassVar[PanelStreamRole]
    PANEL_STREAM_ROLE_OVERLAY: _ClassVar[PanelStreamRole]
    PANEL_STREAM_ROLE_TRANSFORM: _ClassVar[PanelStreamRole]
    PANEL_STREAM_ROLE_CALIBRATION: _ClassVar[PanelStreamRole]

class LayoutContainerKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    LAYOUT_CONTAINER_KIND_UNSPECIFIED: _ClassVar[LayoutContainerKind]
    LAYOUT_CONTAINER_KIND_GRID: _ClassVar[LayoutContainerKind]
    LAYOUT_CONTAINER_KIND_HORIZONTAL: _ClassVar[LayoutContainerKind]
    LAYOUT_CONTAINER_KIND_VERTICAL: _ClassVar[LayoutContainerKind]
    LAYOUT_CONTAINER_KIND_TABS: _ClassVar[LayoutContainerKind]
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
PLAYBACK_SYNC_MODE_UNSPECIFIED: PlaybackSyncMode
PLAYBACK_SYNC_MODE_NEAREST: PlaybackSyncMode
PLAYBACK_SYNC_MODE_STRICT: PlaybackSyncMode
PLAYBACK_SYNC_MODE_LATEST: PlaybackSyncMode
PANEL_KIND_UNSPECIFIED: PanelKind
PANEL_KIND_IMAGE: PanelKind
PANEL_KIND_THREE_D: PanelKind
PANEL_KIND_TIMESERIES: PanelKind
PANEL_KIND_MAP: PanelKind
PANEL_KIND_TABLE: PanelKind
PANEL_KIND_RAW_RECORDS: PanelKind
PANEL_STREAM_ROLE_UNSPECIFIED: PanelStreamRole
PANEL_STREAM_ROLE_PRIMARY: PanelStreamRole
PANEL_STREAM_ROLE_SUPPORT: PanelStreamRole
PANEL_STREAM_ROLE_OVERLAY: PanelStreamRole
PANEL_STREAM_ROLE_TRANSFORM: PanelStreamRole
PANEL_STREAM_ROLE_CALIBRATION: PanelStreamRole
LAYOUT_CONTAINER_KIND_UNSPECIFIED: LayoutContainerKind
LAYOUT_CONTAINER_KIND_GRID: LayoutContainerKind
LAYOUT_CONTAINER_KIND_HORIZONTAL: LayoutContainerKind
LAYOUT_CONTAINER_KIND_VERTICAL: LayoutContainerKind
LAYOUT_CONTAINER_KIND_TABS: LayoutContainerKind

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

class PlaybackClock(_message.Message):
    __slots__ = ("time_track_ids", "default_time_track_id", "value_range", "start_value", "playback_rate", "sync_mode", "loop")
    TIME_TRACK_IDS_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_TIME_TRACK_ID_FIELD_NUMBER: _ClassVar[int]
    VALUE_RANGE_FIELD_NUMBER: _ClassVar[int]
    START_VALUE_FIELD_NUMBER: _ClassVar[int]
    PLAYBACK_RATE_FIELD_NUMBER: _ClassVar[int]
    SYNC_MODE_FIELD_NUMBER: _ClassVar[int]
    LOOP_FIELD_NUMBER: _ClassVar[int]
    time_track_ids: _containers.RepeatedScalarFieldContainer[str]
    default_time_track_id: str
    value_range: TimeValueRange
    start_value: int
    playback_rate: float
    sync_mode: PlaybackSyncMode
    loop: bool
    def __init__(self, time_track_ids: _Optional[_Iterable[str]] = ..., default_time_track_id: _Optional[str] = ..., value_range: _Optional[_Union[TimeValueRange, _Mapping]] = ..., start_value: _Optional[int] = ..., playback_rate: _Optional[float] = ..., sync_mode: _Optional[_Union[PlaybackSyncMode, str]] = ..., loop: _Optional[bool] = ...) -> None: ...

class StreamPlaybackSpec(_message.Message):
    __slots__ = ("stream_id", "decoder_id", "time_track_ids", "default_time_track_id", "metadata")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    STREAM_ID_FIELD_NUMBER: _ClassVar[int]
    DECODER_ID_FIELD_NUMBER: _ClassVar[int]
    TIME_TRACK_IDS_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_TIME_TRACK_ID_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    stream_id: str
    decoder_id: str
    time_track_ids: _containers.RepeatedScalarFieldContainer[str]
    default_time_track_id: str
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, stream_id: _Optional[str] = ..., decoder_id: _Optional[str] = ..., time_track_ids: _Optional[_Iterable[str]] = ..., default_time_track_id: _Optional[str] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

class PanelStreamBinding(_message.Message):
    __slots__ = ("stream_id", "role", "display_name", "coordinate_frame_id", "field_path")
    STREAM_ID_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    COORDINATE_FRAME_ID_FIELD_NUMBER: _ClassVar[int]
    FIELD_PATH_FIELD_NUMBER: _ClassVar[int]
    stream_id: str
    role: PanelStreamRole
    display_name: str
    coordinate_frame_id: str
    field_path: str
    def __init__(self, stream_id: _Optional[str] = ..., role: _Optional[_Union[PanelStreamRole, str]] = ..., display_name: _Optional[str] = ..., coordinate_frame_id: _Optional[str] = ..., field_path: _Optional[str] = ...) -> None: ...

class ImagePanelSettings(_message.Message):
    __slots__ = ("fit_mode", "enabled_overlay_stream_ids")
    FIT_MODE_FIELD_NUMBER: _ClassVar[int]
    ENABLED_OVERLAY_STREAM_IDS_FIELD_NUMBER: _ClassVar[int]
    fit_mode: str
    enabled_overlay_stream_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, fit_mode: _Optional[str] = ..., enabled_overlay_stream_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class ThreeDPanelSettings(_message.Message):
    __slots__ = ("camera_preset", "color_by_field")
    CAMERA_PRESET_FIELD_NUMBER: _ClassVar[int]
    COLOR_BY_FIELD_FIELD_NUMBER: _ClassVar[int]
    camera_preset: str
    color_by_field: str
    def __init__(self, camera_preset: _Optional[str] = ..., color_by_field: _Optional[str] = ...) -> None: ...

class TimeseriesPanelSettings(_message.Message):
    __slots__ = ("x_time_track_id", "y_field_paths")
    X_TIME_TRACK_ID_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_PATHS_FIELD_NUMBER: _ClassVar[int]
    x_time_track_id: str
    y_field_paths: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, x_time_track_id: _Optional[str] = ..., y_field_paths: _Optional[_Iterable[str]] = ...) -> None: ...

class MapPanelSettings(_message.Message):
    __slots__ = ("base_layer",)
    BASE_LAYER_FIELD_NUMBER: _ClassVar[int]
    base_layer: str
    def __init__(self, base_layer: _Optional[str] = ...) -> None: ...

class TablePanelSettings(_message.Message):
    __slots__ = ("column_paths",)
    COLUMN_PATHS_FIELD_NUMBER: _ClassVar[int]
    column_paths: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, column_paths: _Optional[_Iterable[str]] = ...) -> None: ...

class RawRecordsPanelSettings(_message.Message):
    __slots__ = ("show_payload_preview",)
    SHOW_PAYLOAD_PREVIEW_FIELD_NUMBER: _ClassVar[int]
    show_payload_preview: bool
    def __init__(self, show_payload_preview: _Optional[bool] = ...) -> None: ...

class PanelSettings(_message.Message):
    __slots__ = ("image", "three_d", "timeseries", "map", "table", "raw_records", "renderer_extension")
    IMAGE_FIELD_NUMBER: _ClassVar[int]
    THREE_D_FIELD_NUMBER: _ClassVar[int]
    TIMESERIES_FIELD_NUMBER: _ClassVar[int]
    MAP_FIELD_NUMBER: _ClassVar[int]
    TABLE_FIELD_NUMBER: _ClassVar[int]
    RAW_RECORDS_FIELD_NUMBER: _ClassVar[int]
    RENDERER_EXTENSION_FIELD_NUMBER: _ClassVar[int]
    image: ImagePanelSettings
    three_d: ThreeDPanelSettings
    timeseries: TimeseriesPanelSettings
    map: MapPanelSettings
    table: TablePanelSettings
    raw_records: RawRecordsPanelSettings
    renderer_extension: _struct_pb2.Struct
    def __init__(self, image: _Optional[_Union[ImagePanelSettings, _Mapping]] = ..., three_d: _Optional[_Union[ThreeDPanelSettings, _Mapping]] = ..., timeseries: _Optional[_Union[TimeseriesPanelSettings, _Mapping]] = ..., map: _Optional[_Union[MapPanelSettings, _Mapping]] = ..., table: _Optional[_Union[TablePanelSettings, _Mapping]] = ..., raw_records: _Optional[_Union[RawRecordsPanelSettings, _Mapping]] = ..., renderer_extension: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class PanelSpec(_message.Message):
    __slots__ = ("panel_id", "kind", "title", "streams", "settings")
    PANEL_ID_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    STREAMS_FIELD_NUMBER: _ClassVar[int]
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    panel_id: str
    kind: PanelKind
    title: str
    streams: _containers.RepeatedCompositeFieldContainer[PanelStreamBinding]
    settings: PanelSettings
    def __init__(self, panel_id: _Optional[str] = ..., kind: _Optional[_Union[PanelKind, str]] = ..., title: _Optional[str] = ..., streams: _Optional[_Iterable[_Union[PanelStreamBinding, _Mapping]]] = ..., settings: _Optional[_Union[PanelSettings, _Mapping]] = ...) -> None: ...

class PanelLayout(_message.Message):
    __slots__ = ("panel_id",)
    PANEL_ID_FIELD_NUMBER: _ClassVar[int]
    panel_id: str
    def __init__(self, panel_id: _Optional[str] = ...) -> None: ...

class ContainerLayout(_message.Message):
    __slots__ = ("kind", "children", "child_weights", "active_child_node_id")
    KIND_FIELD_NUMBER: _ClassVar[int]
    CHILDREN_FIELD_NUMBER: _ClassVar[int]
    CHILD_WEIGHTS_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_CHILD_NODE_ID_FIELD_NUMBER: _ClassVar[int]
    kind: LayoutContainerKind
    children: _containers.RepeatedCompositeFieldContainer[LayoutNode]
    child_weights: _containers.RepeatedScalarFieldContainer[float]
    active_child_node_id: str
    def __init__(self, kind: _Optional[_Union[LayoutContainerKind, str]] = ..., children: _Optional[_Iterable[_Union[LayoutNode, _Mapping]]] = ..., child_weights: _Optional[_Iterable[float]] = ..., active_child_node_id: _Optional[str] = ...) -> None: ...

class LayoutNode(_message.Message):
    __slots__ = ("node_id", "title", "visible", "panel", "container")
    NODE_ID_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    VISIBLE_FIELD_NUMBER: _ClassVar[int]
    PANEL_FIELD_NUMBER: _ClassVar[int]
    CONTAINER_FIELD_NUMBER: _ClassVar[int]
    node_id: str
    title: str
    visible: bool
    panel: PanelLayout
    container: ContainerLayout
    def __init__(self, node_id: _Optional[str] = ..., title: _Optional[str] = ..., visible: _Optional[bool] = ..., panel: _Optional[_Union[PanelLayout, _Mapping]] = ..., container: _Optional[_Union[ContainerLayout, _Mapping]] = ...) -> None: ...

class PlaybackPlan(_message.Message):
    __slots__ = ("plan_id", "scene_id", "plan_version", "clock", "time_tracks", "streams", "panels", "root_layout", "produced_at", "produced_by")
    PLAN_ID_FIELD_NUMBER: _ClassVar[int]
    SCENE_ID_FIELD_NUMBER: _ClassVar[int]
    PLAN_VERSION_FIELD_NUMBER: _ClassVar[int]
    CLOCK_FIELD_NUMBER: _ClassVar[int]
    TIME_TRACKS_FIELD_NUMBER: _ClassVar[int]
    STREAMS_FIELD_NUMBER: _ClassVar[int]
    PANELS_FIELD_NUMBER: _ClassVar[int]
    ROOT_LAYOUT_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_AT_FIELD_NUMBER: _ClassVar[int]
    PRODUCED_BY_FIELD_NUMBER: _ClassVar[int]
    plan_id: str
    scene_id: str
    plan_version: str
    clock: PlaybackClock
    time_tracks: _containers.RepeatedCompositeFieldContainer[TimeTrack]
    streams: _containers.RepeatedCompositeFieldContainer[StreamPlaybackSpec]
    panels: _containers.RepeatedCompositeFieldContainer[PanelSpec]
    root_layout: LayoutNode
    produced_at: str
    produced_by: str
    def __init__(self, plan_id: _Optional[str] = ..., scene_id: _Optional[str] = ..., plan_version: _Optional[str] = ..., clock: _Optional[_Union[PlaybackClock, _Mapping]] = ..., time_tracks: _Optional[_Iterable[_Union[TimeTrack, _Mapping]]] = ..., streams: _Optional[_Iterable[_Union[StreamPlaybackSpec, _Mapping]]] = ..., panels: _Optional[_Iterable[_Union[PanelSpec, _Mapping]]] = ..., root_layout: _Optional[_Union[LayoutNode, _Mapping]] = ..., produced_at: _Optional[str] = ..., produced_by: _Optional[str] = ...) -> None: ...

class PlaybackWorkspaceState(_message.Message):
    __slots__ = ("scene_id", "base_plan_id", "clock", "panels", "root_layout", "updated_at", "updated_by")
    SCENE_ID_FIELD_NUMBER: _ClassVar[int]
    BASE_PLAN_ID_FIELD_NUMBER: _ClassVar[int]
    CLOCK_FIELD_NUMBER: _ClassVar[int]
    PANELS_FIELD_NUMBER: _ClassVar[int]
    ROOT_LAYOUT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_BY_FIELD_NUMBER: _ClassVar[int]
    scene_id: str
    base_plan_id: str
    clock: PlaybackClock
    panels: _containers.RepeatedCompositeFieldContainer[PanelSpec]
    root_layout: LayoutNode
    updated_at: str
    updated_by: str
    def __init__(self, scene_id: _Optional[str] = ..., base_plan_id: _Optional[str] = ..., clock: _Optional[_Union[PlaybackClock, _Mapping]] = ..., panels: _Optional[_Iterable[_Union[PanelSpec, _Mapping]]] = ..., root_layout: _Optional[_Union[LayoutNode, _Mapping]] = ..., updated_at: _Optional[str] = ..., updated_by: _Optional[str] = ...) -> None: ...
