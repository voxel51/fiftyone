"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime

from google.protobuf.json_format import MessageToDict

import fiftyone as fo
import fiftyone.core.fields as fof
from fiftyone.multimodal.schemas.v1 import SceneInventory


class MultimodalMetadata(fo.Metadata):
    """Class for storing metadata about multimodal scenes.

    Args:
        scene_id: the unique identifier of the scene
        source_format: the format of the source data for the scene
        source_fingerprint: a dictionary containing information about the source
            data for the scene, such as file paths and checksums
        inventory_version: the version of the scene inventory schema used to
            generate this metadata
        streams: a list of dictionaries containing information about each stream
            in the scene, such as stream type and modality
        produced_at: the datetime when this metadata was produced
        produced_by: the name of the software that produced this metadata
    """

    scene_id = fof.StringField()
    source_format = fof.StringField()
    source_fingerprint = fof.DictField()
    inventory_version = fof.StringField()
    streams = fof.ListField(fof.DictField())
    produced_at = fof.DateTimeField()
    produced_by = fof.StringField()

    @classmethod
    def build_for(cls, scene_inventory: SceneInventory):
        """Builds an :class:`MultimodalMetadata` object for the given scene
        inventory.

        Args:
            path_or_url: the path to a multimodal scene on disk or at a URL

        Returns:
            a :class:`MultimodalMetadata`
        """
        return cls(
            scene_id=scene_inventory.scene_id,
            source_format=scene_inventory.source_format,
            source_fingerprint=MessageToDict(
                scene_inventory.source_fingerprint,
                preserving_proto_field_name=True,
            ),
            inventory_version=scene_inventory.inventory_version,
            streams=[
                MessageToDict(stream, preserving_proto_field_name=True)
                for stream in scene_inventory.streams
            ],
            produced_by=scene_inventory.produced_by,
            produced_at=datetime.datetime.fromisoformat(
                scene_inventory.produced_at
            ),
        )
