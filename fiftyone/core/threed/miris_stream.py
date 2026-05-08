"""
Miris stream definitions for 3D visualization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .object_3d import Object3D
from .transformation import Quaternion, Vec3UnionType


class MirisStream(Object3D):
    """Represents a Miris stream rendered via the ``@miris-inc/three`` SDK.

    Args:
        name (str): the name of the stream
        asset_uuid (str): the Miris asset UUID identifying the stream
        viewer_key (str, optional): the Miris viewer key used to authorize
            playback. If ``None``, the App must supply a viewer key by
            another means (e.g. ``dataset.info["miris_viewer_key"]``)
        visible (True): default visibility of the stream in the scene
        position (None): the position of the stream in object space
        quaternion (None): the quaternion of the stream in object space
        scale (None): the scale of the stream in object space
    """

    def __init__(
        self,
        name: str,
        asset_uuid: str,
        viewer_key: Optional[str] = None,
        visible: bool = True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not asset_uuid:
            raise ValueError("MirisStream requires an asset_uuid")

        self.asset_uuid = asset_uuid
        self.viewer_key = viewer_key

    def _to_dict_extra(self):
        return {
            "assetUuid": self.asset_uuid,
            "viewerKey": self.viewer_key,
        }
