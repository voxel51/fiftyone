"""
Sample-scoped media-reference asset routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import errno
import importlib
import os
from secrets import token_hex
import stat
from urllib.parse import quote

import anyio
from mongoengine.errors import InvalidDocumentError
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fiftyone.multimodal.media import (
    MalformedMediaSourceError,
    MediaReferenceError,
    MediaSourceAuthorizationError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceOperation,
    UnsupportedLeRobotVersionError,
    _get_media_resolver,
)
from fiftyone.server import decorators
from fiftyone.server.routes.media import MediaFileResponse, _media_headers
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset


class MediaAssetManifestRoute(HTTPEndpoint):
    """Resolves a stored media reference into a public asset manifest."""

    @decorators.route
    async def get(self, request: Request):
        dataset, sample, manifest = await anyio.to_thread.run_sync(
            _resolve_manifest, request
        )
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
        _, _, manifest = await anyio.to_thread.run_sync(
            _resolve_manifest, request
        )
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

        try:
            stat_result = await anyio.to_thread.run_sync(
                _stat_asset, asset.path
            )
        except (FileNotFoundError, NotADirectoryError):
            _raise_asset_error(
                404,
                "missing-media-asset",
                "The resolved media asset is no longer available",
            )
        except PermissionError:
            _raise_asset_error(
                403,
                "media-source-authorization",
                "The resolved media asset is not readable",
            )
        except OSError as exc:
            if exc.errno in {errno.ENAMETOOLONG, errno.ELOOP}:
                _raise_asset_error(
                    404,
                    "missing-media-asset",
                    "The resolved media asset is no longer available",
                )
            _raise_asset_error(
                409,
                "stale-media-asset",
                "The resolved media asset could not be opened safely",
            )

        if not stat.S_ISREG(stat_result.st_mode):
            _raise_asset_error(
                404,
                "missing-media-asset",
                "The resolved media asset is not a regular file",
            )

        try:
            descriptor = await anyio.to_thread.run_sync(
                os.open, asset.path, os.O_RDONLY
            )
        except (FileNotFoundError, NotADirectoryError):
            _raise_asset_error(
                404,
                "missing-media-asset",
                "The resolved media asset is no longer available",
            )
        except PermissionError:
            _raise_asset_error(
                403,
                "media-source-authorization",
                "The resolved media asset is not readable",
            )
        except OSError:
            _raise_asset_error(
                409,
                "stale-media-asset",
                "The resolved media asset could not be opened safely",
            )

        try:
            opened_stat = os.fstat(descriptor)
        except OSError:
            os.close(descriptor)
            _raise_asset_error(
                409,
                "stale-media-asset",
                "The resolved media asset could not be opened safely",
            )

        if not stat.S_ISREG(opened_stat.st_mode):
            os.close(descriptor)
            _raise_asset_error(
                404,
                "missing-media-asset",
                "The resolved media asset is not a regular file",
            )

        return _OpenedMediaFileResponse(
            asset.path,
            descriptor=descriptor,
            stat_result=opened_stat,
            media_type=asset.media_type,
            headers=_media_headers(),
        )


def _resolve_manifest(request):
    dataset = get_dataset(request.path_params["dataset_id"])
    try:
        sample = get_sample_from_dataset(
            dataset, request.path_params["sample_id"]
        )
        reference = sample.media_reference
    except MediaReferenceError as exc:
        _raise_resolution_error(422, "malformed-media-reference", exc)
    except (InvalidDocumentError, TypeError, ValueError) as exc:
        _raise_resolution_error(422, "malformed-media-reference", exc)

    if reference is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "missing-media-reference: The requested sample is "
                "filepath-backed"
            ),
            headers={"X-FiftyOne-Error-Kind": "missing-media-reference"},
        )

    # Resolver implementations are deliberately external to domain values and
    # are registered only when asset resolution is requested.
    importlib.import_module("fiftyone.utils.lerobot")
    try:
        assets = reference.describe_assets()
        resolver = _get_media_resolver(reference)
        manifest = resolver.resolve_assets(reference, assets)
    except MissingMediaRootError as exc:
        _raise_resolution_error(404, "missing-media-root", exc)
    except MediaSourceAuthorizationError as exc:
        _raise_resolution_error(403, "media-source-authorization", exc)
    except MovedMediaRootError as exc:
        _raise_resolution_error(409, "moved-media-root", exc)
    except StaleMediaReferenceError as exc:
        _raise_resolution_error(409, "stale-media-reference", exc)
    except UnsupportedLeRobotVersionError as exc:
        _raise_resolution_error(415, "unsupported-source-version", exc)
    except UnfinalizedMediaSourceError as exc:
        _raise_resolution_error(422, "unfinalized-media-source", exc)
    except MalformedMediaSourceError as exc:
        _raise_resolution_error(422, "malformed-media-source", exc)
    except UnsupportedMediaReferenceOperation as exc:
        _raise_resolution_error(415, "unsupported-media-reference", exc)
    except MediaReferenceError as exc:
        _raise_resolution_error(422, "malformed-media-reference", exc)
    except OSError as exc:
        _raise_resolution_error(409, "stale-media-reference", exc)

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
        "malformed-media-reference": (
            "The stored media reference is malformed; re-import the sample"
        ),
    }
    raise HTTPException(
        status_code=status_code,
        detail="%s: %s" % (kind, public_messages[kind]),
        headers={"X-FiftyOne-Error-Kind": kind},
    ) from error


def _raise_asset_error(status_code, kind, message):
    raise HTTPException(
        status_code=status_code,
        detail="%s: %s" % (kind, message),
        headers={"X-FiftyOne-Error-Kind": kind},
    )


def _stat_asset(path):
    result = os.stat(path)
    if stat.S_ISREG(result.st_mode):
        descriptor = os.open(path, os.O_RDONLY)
        os.close(descriptor)

    return result


class _OpenedMediaFileResponse(MediaFileResponse):
    def __init__(self, *args, descriptor, **kwargs):
        super().__init__(*args, **kwargs)
        self._descriptor = descriptor

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            os.close(self._descriptor)

    def _open_file(self):
        file = os.fdopen(os.dup(self._descriptor), "rb")
        return anyio.wrap_file(file)

    async def _handle_simple(
        self, send, send_header_only, send_pathsend=False
    ):
        await send(
            {
                "type": "http.response.start",
                "status": self.status_code,
                "headers": self.raw_headers,
            }
        )
        if send_header_only:
            await send(
                {"type": "http.response.body", "body": b"", "more_body": False}
            )
            return

        async with self._open_file() as file:
            more_body = True
            while more_body:
                chunk = await file.read(self.chunk_size)
                more_body = len(chunk) == self.chunk_size
                await send(
                    {
                        "type": "http.response.body",
                        "body": chunk,
                        "more_body": more_body,
                    }
                )

    async def _handle_single_range(
        self, send, start, end, file_size, send_header_only
    ):
        self.headers["content-range"] = "bytes %d-%d/%d" % (
            start,
            end - 1,
            file_size,
        )
        self.headers["content-length"] = str(end - start)
        await send(
            {
                "type": "http.response.start",
                "status": 206,
                "headers": self.raw_headers,
            }
        )
        if send_header_only:
            await send(
                {"type": "http.response.body", "body": b"", "more_body": False}
            )
            return

        async with self._open_file() as file:
            await file.seek(start)
            more_body = True
            while more_body:
                chunk = await file.read(min(self.chunk_size, end - start))
                start += len(chunk)
                more_body = len(chunk) == self.chunk_size and start < end
                await send(
                    {
                        "type": "http.response.body",
                        "body": chunk,
                        "more_body": more_body,
                    }
                )

    async def _handle_multiple_ranges(
        self, send, ranges, file_size, send_header_only
    ):
        boundary = token_hex(13)
        content_length, header_generator = self.generate_multipart(
            ranges, boundary, file_size, self.headers["content-type"]
        )
        self.headers["content-range"] = (
            "multipart/byteranges; boundary=%s" % boundary
        )
        self.headers["content-length"] = str(content_length)
        await send(
            {
                "type": "http.response.start",
                "status": 206,
                "headers": self.raw_headers,
            }
        )
        if send_header_only:
            await send(
                {"type": "http.response.body", "body": b"", "more_body": False}
            )
            return

        async with self._open_file() as file:
            for start, end in ranges:
                await send(
                    {
                        "type": "http.response.body",
                        "body": header_generator(start, end),
                        "more_body": True,
                    }
                )
                await file.seek(start)
                while start < end:
                    chunk = await file.read(min(self.chunk_size, end - start))
                    if not chunk:
                        break

                    start += len(chunk)
                    await send(
                        {
                            "type": "http.response.body",
                            "body": chunk,
                            "more_body": True,
                        }
                    )
                await send(
                    {
                        "type": "http.response.body",
                        "body": b"\n",
                        "more_body": True,
                    }
                )

            await send(
                {
                    "type": "http.response.body",
                    "body": ("\n--%s--\n" % boundary).encode("latin-1"),
                    "more_body": False,
                }
            )


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
