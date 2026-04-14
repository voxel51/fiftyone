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


class McapSyncConfig(DynamicEmbeddedDocument):
    """Synchronization defaults for an MCAP rendering plan."""

    timestamp_source = fof.StringField()
    fallback = fof.StringField()
    mode = fof.StringField()


class McapPanelPlan(DynamicEmbeddedDocument):
    """Panel assignment for a supported MCAP stream."""

    panel_id = fof.StringField()
    panel_type = fof.StringField()
    content_type = fof.StringField()
    stream_id = fof.StringField()


class McapSidebarConfig(DynamicEmbeddedDocument):
    """Sidebar defaults for an MCAP rendering plan."""

    left = fof.StringField()
    right = fof.StringField()


class McapRenderingPlan(RenderingPlan):
    """Rendering plan for an MCAP-backed sample."""

    sync = fof.EmbeddedDocumentField(McapSyncConfig)
    panels = fof.ListField(fof.EmbeddedDocumentField(McapPanelPlan))
    sidebars = fof.EmbeddedDocumentField(McapSidebarConfig)
