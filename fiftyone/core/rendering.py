"""
Rendering plans stored in dataset samples.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
from fiftyone.core.odm import DynamicEmbeddedDocument


class RenderingPlan(DynamicEmbeddedDocument):
    """Base class for storing sample rendering plans."""

    media_field = fof.StringField()
    scene_id = fof.StringField()


class SyncConfig(DynamicEmbeddedDocument):
    """Synchronization defaults for a multimodal rendering plan."""

    timestamp_source = fof.StringField()
    fallback = fof.StringField()
    mode = fof.StringField()


class PanelFrameConfig(DynamicEmbeddedDocument):
    """Frame-related defaults for one multimodal workspace panel."""

    fixed_frame_id = fof.StringField(null=True)
    display_frame_id = fof.StringField(null=True)
    follow_mode = fof.StringField(default="off")
    location_stream_id = fof.StringField(null=True)
    enu_frame_id = fof.StringField(null=True)


class PanelSceneConfig(DynamicEmbeddedDocument):
    """Scene-related defaults for one multimodal workspace panel."""

    up_axis = fof.StringField(default="z")
    background_color = fof.StringField(default="#10151d")
    show_grid = fof.BooleanField(default=True)


class PanelLayout(DynamicEmbeddedDocument):
    """Default grid placement for one multimodal workspace panel."""

    x = fof.IntField(default=0)
    y = fof.IntField(default=0)
    w = fof.IntField(default=4)
    h = fof.IntField(default=1)


class PanelPlan(DynamicEmbeddedDocument):
    """Default panel state for one multimodal workspace panel."""

    panel_id = fof.StringField()
    archetype = fof.StringField()
    title = fof.StringField()
    render_stream_id = fof.StringField(null=True)
    visible_stream_ids = fof.ListField(fof.StringField())
    frame_config = fof.EmbeddedDocumentField(PanelFrameConfig)
    scene_config = fof.EmbeddedDocumentField(PanelSceneConfig)
    layout = fof.EmbeddedDocumentField(PanelLayout, null=True)


class MultimodalRenderingPlan(RenderingPlan):
    """Rendering plan for a multimodal-backed sample."""

    source_kind = fof.StringField(default="mcap")
    sync = fof.EmbeddedDocumentField(SyncConfig)
    panels = fof.ListField(fof.EmbeddedDocumentField(PanelPlan))
    sidebar_width = fof.IntField(default=208)
    layout_tree = fof.DictField(null=True)
