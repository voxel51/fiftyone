"""
Sample-scoped media-reference asset routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import os
from urllib.parse import quote

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fiftyone.multimodal.media import (
    MalformedMediaSourceError,
    MediaSourceAuthorizationError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceOperation,
    UnsupportedMediaReferenceVersionError,
    get_media_resolver,
    hydrate_media_reference,
)
from fiftyone.server import decorators
from fiftyone.server.routes.media import MediaFileResponse, _media_headers
from fiftyone.server.utils.datasets import (
    get_dataset,
    get_sample_from_dataset,
)


class MediaAssetManifestRoute(HTTPEndpoint):
    """Resolves a stored media reference into a public asset manifest."""

    @decorators.route
    async def get(self, request: Request):
        dataset, sample, manifest = _resolve_manifest(request)
        public = manifest.to_dict()
        dataset_id = quote(str(dataset._doc.id), safe="")
        sample_id = quote(str(sample.id), safe="")
        base_url = "/dataset/%s/sample/%s/multimodal/assets" % (
            dataset_id,
            sample_id,
        )
        for asset in public["assets"]:
            asset["url"] = "%s/%s" % (base_url, asset["asset_id"])

        return public


class MediaAssetBytes(HTTPEndpoint):
    """Range-serves one asset selected from a stored sample manifest."""

    @decorators.route
    async def get(self, request: Request):
        _, _, manifest = _resolve_manifest(request)
        requested_asset_id = request.path_params["asset_id"]
        asset = next(
            (
                candidate
                for candidate in manifest.assets
                if candidate.asset_id == requested_asset_id
            ),
            None,
        )
        if asset is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "missing-media-asset: The requested asset is not part "
                    "of this sample"
                ),
                headers={"X-FiftyOne-Error-Kind": "missing-media-asset"},
            )

        stat_result = os.stat(asset.path)
        return MediaFileResponse(
            asset.path,
            stat_result=stat_result,
            media_type=asset.media_type,
            headers=_media_headers(),
        )


def _resolve_manifest(request):
    dataset = get_dataset(request.path_params["dataset_id"])
    sample = get_sample_from_dataset(dataset, request.path_params["sample_id"])
    envelope = sample._doc.get_field("_media_reference")
    if envelope is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "missing-media-reference: The requested sample is "
                "filepath-backed"
            ),
            headers={"X-FiftyOne-Error-Kind": "missing-media-reference"},
        )

    try:
        # Resolver implementations are deliberately external to domain values
        # and are registered only when asset resolution is requested.
        importlib.import_module("fiftyone.utils.lerobot")
        reference = hydrate_media_reference(envelope)
        assets = reference.describe_assets()
        resolver = get_media_resolver(reference)
        manifest = resolver.resolve_assets(reference, assets)
    except MissingMediaRootError as exc:
        _raise_resolution_error(404, "missing-media-root", exc)
    except MediaSourceAuthorizationError as exc:
        _raise_resolution_error(403, "media-source-authorization", exc)
    except MovedMediaRootError as exc:
        _raise_resolution_error(409, "moved-media-root", exc)
    except StaleMediaReferenceError as exc:
        _raise_resolution_error(409, "stale-media-reference", exc)
    except UnsupportedMediaReferenceVersionError as exc:
        _raise_resolution_error(415, "unsupported-source-version", exc)
    except UnfinalizedMediaSourceError as exc:
        _raise_resolution_error(422, "unfinalized-media-source", exc)
    except MalformedMediaSourceError as exc:
        _raise_resolution_error(422, "malformed-media-source", exc)
    except UnsupportedMediaReferenceOperation as exc:
        _raise_resolution_error(415, "unsupported-media-reference", exc)

    return dataset, sample, manifest


def _raise_resolution_error(status_code, kind, error):
    public_messages = {
        "missing-media-root": (
            "The configured LeRobot source root is unavailable; restore or "
            "relocate it before retrying"
        ),
        "moved-media-root": (
            "The LeRobot source root appears to have moved; relocate the "
            "server-side source binding before retrying"
        ),
        "media-source-authorization": (
            "The current user is not authorized to access the configured "
            "media source"
        ),
        "stale-media-reference": (
            "The LeRobot source changed since import; re-import the dataset "
            "to refresh its episode references"
        ),
        "unsupported-source-version": (
            "The stored source version is unsupported; import a finalized "
            "LeRobotDataset v3 source"
        ),
        "unfinalized-media-source": (
            "The LeRobot source contains an unreadable Parquet footer; "
            "finalize or repair the recording"
        ),
        "malformed-media-source": (
            "The LeRobot source is malformed; repair it and re-import the "
            "dataset"
        ),
        "unsupported-media-reference": (
            "No server-side asset resolver supports this media-reference kind"
        ),
    }
    raise HTTPException(
        status_code=status_code,
        detail="%s: %s" % (kind, public_messages[kind]),
        headers={"X-FiftyOne-Error-Kind": kind},
    ) from error


MediaReferenceRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/manifest",
        MediaAssetManifestRoute,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/assets/{asset_id}",
        MediaAssetBytes,
    ),
]
