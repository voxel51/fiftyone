"""
FiftyOne Server ``/resolve-fo3d`` route.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
import posixpath

import aiohttp
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.storage as fos
import fiftyone.core.threed as fo3d
from fiftyone.core.cache import media_cache
from fiftyone.server.decorators import route


def get_resolved_asset_path(asset_path: str, root: str = None):
    # Asset path is local and absolute
    #   - short circuit and don't change asset_path
    if asset_path is None or os.path.isabs(asset_path):
        return asset_path

    # If asset file system is non-local, we always need a URL
    needs_url = True
    if (
        root is not None
        and fos.get_file_system(asset_path) == fos.FileSystem.LOCAL
    ):
        # invariant from above - asset_path is relative and root is not None
        # If root fs is local then we don't need URL
        root_file_system = fos.get_file_system(root)
        if root_file_system == fos.FileSystem.LOCAL:
            needs_url = False
        else:
            #   We need URL, and we'll join relative asset path to non-local root
            asset_path = posixpath.join(root, asset_path)

    if needs_url:
        asset_path = media_cache.get_url(asset_path, method="GET", hours=24)

    return asset_path


def resolve_urls_for_scene(scene: fo3d.Scene, root: str = None):
    for node in scene.traverse():
        # Resolve any asset paths contained within nodes
        for path_attribute in fo3d.fo3d_path_attributes:
            path_value = getattr(node, path_attribute, None)

            if path_value is not None:
                resolved_path = get_resolved_asset_path(path_value, root)
                if resolved_path != path_value:
                    # keep original path_attribute as is
                    setattr(
                        node,
                        f"_pre_transformed_{path_attribute}",
                        resolved_path,
                    )

    if scene.background is not None and scene.background.image is not None:
        scene.background.image = get_resolved_asset_path(
            scene.background.image, root
        )

    if scene.background is not None and scene.background.cube is not None:
        scene.background.cube = [
            get_resolved_asset_path(face_path, root)
            for face_path in scene.background.cube
        ]


class ResolveFo3d(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        fo3d_url = request.query_params.get("url")
        root = request.query_params.get("root")

        if not fo3d_url:
            raise ValueError("url is required")

        cookies = request.cookies
        async with aiohttp.ClientSession(cookies=cookies) as session:
            async with session.get(fo3d_url) as response:
                if response.headers.get("Content-Type") != "application/json":
                    # parse json from text
                    scene_content = await response.read()
                    scene_dict = json.loads(scene_content.decode("utf-8"))
                else:
                    scene_dict = await response.json()

        # validate it's a fo3d scene
        if fo3d.FO3D_VERSION_KEY not in scene_dict:
            raise ValueError(
                f"Invalid fo3d scene for url {fo3d_url}, {scene_dict}"
            )

        scene = fo3d.Scene._from_fo3d_dict(scene_dict)

        if scene:
            resolve_urls_for_scene(scene, root)
            pass

        return Response(
            content=json.dumps(scene.as_dict()),
            media_type="application/json",
            headers={"Cache-Control": "max-age=86400"},  # 24 hours
        )
