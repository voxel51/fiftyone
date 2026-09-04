"""
Sample-scoped media-reference asset routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
from contextlib import contextmanager
from dataclasses import dataclass, replace
import errno
import functools
import importlib
import logging
import os
import re
from secrets import token_hex
import stat
from typing import NoReturn
from urllib.parse import quote

import anyio
import cachetools
import eta.core.utils as etau
from mongoengine.errors import InvalidDocumentError
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import (
    RedirectResponse,
    Response,
    StreamingResponse,
)

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.storage as fos
from fiftyone.multimodal.media import (
    hydrate_media_references,
    publish_media_assets,
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

logger = logging.getLogger(__name__)

_PROXY_CHUNK_BYTES = 256 * 1024

#: Enough for a grid page; a larger request is a client bug, not a big page
_MANIFEST_PAGE_LIMIT = 512

#: How long a browser may reuse one authorized redirect. Short, because it is
#: also how long a reader whose access was revoked can still fetch bytes
_MAX_REDIRECT_AGE_SECONDS = 300

#: How far a resolved location must outlive a redirect that points at it
_LOCATION_MARGIN_SECONDS = 60

#: How long a browser may hold one manifest, at most. This is also how long a
#: replaced source can go unnoticed, so it bounds a manifest independently of
#: whatever is signed inside it
_MAX_MANIFEST_AGE_SECONDS = 300

#: The asset a byte range names, remembered between the ranges of one read:
#: a manifest is per sample, a read is per range. Short enough that a
#: replaced source is picked up within one interaction
_RESOLVED_ASSET_CACHE = cachetools.TTLCache(maxsize=4096, ttl=30.0)
_RANGE_PATTERN = re.compile(
    r"bytes=(?P<first>\d*)-(?P<last>\d*)", re.IGNORECASE
)
#: Sentinel for a syntactically valid range this resource cannot satisfy.
_UNSATISFIABLE_RANGE = object()


class MediaAssetManifestRoute(HTTPEndpoint):
    """Resolves a stored media reference into a public asset manifest."""

    @decorators.route
    async def get(self, request: Request):
        return await anyio.to_thread.run_sync(
            _resolve_public_manifest, request
        )


class MediaAssetManifestPageRoute(HTTPEndpoint):
    """Builds the manifests for a page of samples in one request."""

    @decorators.route
    async def post(self, request: Request, data: dict):
        sample_ids = data.get("sample_ids") if isinstance(data, dict) else None
        if not isinstance(sample_ids, list) or not all(
            isinstance(sample_id, str) and sample_id
            for sample_id in sample_ids
        ):
            _raise_manifest_request_error(
                "'sample_ids' must be a list of sample ids"
            )

        if len(sample_ids) > _MANIFEST_PAGE_LIMIT:
            _raise_manifest_request_error(
                "at most %d samples may be resolved at once"
                % _MANIFEST_PAGE_LIMIT
            )

        unique_ids = list(dict.fromkeys(sample_ids))
        if not unique_ids:
            return {"manifests": {}, "errors": {}}

        dataset_id = request.path_params["dataset_id"]
        return await anyio.to_thread.run_sync(
            functools.partial(_page_manifests, dataset_id, unique_ids)
        )


def _raise_manifest_request_error(detail) -> NoReturn:
    raise HTTPException(
        status_code=400,
        detail="malformed-manifest-request: %s" % detail,
        headers={"X-FiftyOne-Error-Kind": "malformed-manifest-request"},
    )


def _page_manifests(dataset_id, sample_ids):
    """Derives a page of manifests, loading each shared fact once.

    The dataset, and the source binding behind each reference, are the same
    for every tile that shares them, so a page loads them once instead of once
    per tile. Every sample still carries its own outcome: one broken episode
    does not deny the rest of the page.
    """
    dataset = get_dataset(dataset_id)
    importlib.import_module("fiftyone.utils.lerobot")

    descriptors, episodes, errors = _page_descriptors(dataset, sample_ids)
    references, failures = hydrate_media_references(descriptors)
    for sample_id, failure in failures.items():
        errors[sample_id] = {
            "kind": "malformed-media-reference",
            "detail": str(failure),
            "status": 422,
        }

    bindings = _load_source_bindings(references.values())
    manifests = {}
    for sample_id, reference in references.items():
        try:
            manifests[sample_id] = _public_manifest(
                dataset_id,
                sample_id,
                _reference_assets(
                    reference,
                    binding=bindings.get(reference.source_identity),
                ),
                _episode_description(episodes[sample_id], reference),
                reference=reference,
                source=_source_info(bindings.get(reference.source_identity)),
            )
        except HTTPException as exc:
            errors[sample_id] = _manifest_error(exc)

    return {"manifests": manifests, "errors": errors}


#: What an episode is, as import recorded it on the sample. A reader given
#: these does not have to open the source's metadata to rediscover them.
_EPISODE_FIELDS = (
    "episode_index",
    "fps",
    "length",
    "duration",
    "robot_type",
    "task",
    "tasks",
)


def _episode_description(document, reference=None):
    """The episode facts a reader would otherwise parse out of the source.

    Most are on the sample, written at import from the same metadata row a
    reader would go back and read. The row bounds come from the locator,
    which records where this episode sits in its data shard, so a reader can
    check the rows it selected without first fetching the row that says how
    many to expect.
    """
    described = {
        field: document[field]
        for field in _EPISODE_FIELDS
        if document.get(field) is not None
    }
    rows = getattr(
        getattr(reference, "locator", None), "global_dataset_rows", None
    )
    if rows is not None:
        described["dataset_from_index"] = rows.start
        described["dataset_to_index"] = rows.end

    return described or None


def _page_descriptors(dataset, sample_ids):
    """Reads a page's stored media-reference descriptors in one query."""
    from bson import ObjectId
    from bson.errors import InvalidId

    wanted = {}
    errors = {}
    for sample_id in sample_ids:
        try:
            wanted[ObjectId(sample_id)] = sample_id
        except (InvalidId, TypeError):
            errors[sample_id] = {
                "kind": "malformed-media-reference",
                "detail": "Malformed sample id '%s'" % sample_id,
                "status": 422,
            }

    descriptors = {}
    episodes = {}
    if wanted:
        documents = dataset._sample_collection.find(
            {"_id": {"$in": list(wanted)}},
            {"media_reference": 1, **{f: 1 for f in _EPISODE_FIELDS}},
        )
        for document in documents:
            sample_id = wanted.pop(document["_id"], None)
            episodes[sample_id] = document
            descriptor = document.get("media_reference")
            if descriptor is None:
                errors[sample_id] = {
                    "kind": "missing-media-reference",
                    "detail": "The requested sample is filepath-backed",
                    "status": 400,
                }
                continue

            descriptors[sample_id] = descriptor

    for sample_id in wanted.values():
        errors[sample_id] = {
            "kind": "missing-media-reference",
            "detail": "Sample '%s' not found in dataset '%s'"
            % (sample_id, dataset.name),
            "status": 404,
        }

    return descriptors, episodes, errors


def _load_source_bindings(references):
    """Loads the source bindings a page's references share, in one query."""
    import fiftyone.utils.lerobot as foul

    identities = [
        reference.source_identity
        for reference in references
        if getattr(reference, "source_identity", None)
    ]
    if not identities:
        return {}

    try:
        return foul._get_source_bindings(identities)
    except MediaReferenceError:
        # A malformed binding is reported per sample by the derive that needs
        # it, not by failing the page
        return {}


def _manifest_error(exc):
    """Renders one sample's failure without failing its whole page."""
    detail = exc.detail
    kind = (exc.headers or {}).get("X-FiftyOne-Error-Kind")
    if kind is None and isinstance(detail, str) and ": " in detail:
        kind = detail.split(": ", 1)[0]

    return {
        "kind": kind or "malformed-media-reference",
        "detail": detail,
        "status": exc.status_code,
    }


class MediaObjectBytes(HTTPEndpoint):
    """Range-serves one physical object named by a content-addressed URL.

    Resolution is one indexed lookup of the source binding. Nothing about the
    sample that led here is read, so many episodes sharing an object share
    both this URL and whatever a cache already holds for it.
    """

    @decorators.route
    async def get(self, request: Request):
        asset = await anyio.to_thread.run_sync(_resolve_object, request)
        return await _serve_asset_bytes(request, asset)


class MediaAssetBytes(HTTPEndpoint):
    """Range-serves one asset selected from a stored sample manifest.

    The URL of this route is the stable, sample-scoped handle the browser
    holds. Where an asset's storage can serve the browser directly, each
    request is answered with a freshly authorized redirect rather than with a
    URL baked into the manifest, so a retry always has a valid target.
    """

    @decorators.route
    async def get(self, request: Request):
        asset = await anyio.to_thread.run_sync(_resolve_asset, request)
        return await _serve_asset_bytes(request, asset)


async def _serve_asset_bytes(request, asset):
    """Serves one located object, however the caller located it."""
    if not fos.is_local(asset.path):
        if request.method == "HEAD":
            # Providers commonly reject a HEAD against a URL signed for
            # GET, so answer it from the asset's own metadata.
            described = await anyio.to_thread.run_sync(_describe_asset, asset)
            return _metadata_response(described)

        url = await anyio.to_thread.run_sync(_asset_location, asset.path)
        if url is not None:
            return _redirect_response(url, _asset_location_max_age(asset.path))

        # Signing is unavailable here, so the bytes come through this
        # server rather than not at all.
        described = await anyio.to_thread.run_sync(_describe_asset, asset)
        return await _proxy_response(request, described)

    try:
        descriptor = await anyio.to_thread.run_sync(_open_asset, asset.path)
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


def _resolve_public_manifest(request):
    """Builds one sample's manifest for the browser."""
    dataset_id = request.path_params["dataset_id"]
    sample_id = request.path_params["sample_id"]
    dataset = get_dataset(dataset_id)
    sample = _get_sample(dataset, sample_id)
    reference = _require_media_reference(sample)
    binding = _load_source_bindings([reference]).get(
        getattr(reference, "source_identity", None)
    )
    return _public_manifest(
        dataset_id,
        sample_id,
        _reference_assets(reference, binding=binding),
        _episode_description(sample.to_mongo_dict(), reference),
        reference=reference,
        source=_source_info(binding),
    )


def _reference_assets(reference, binding=None):
    """Locates one reference's assets, as cheaply as its kind allows.

    Derived from what import recorded wherever the reference kind can, which
    costs one binding lookup and no storage round trips. Only a kind that
    cannot answer from its own record falls back to reading the source.
    """
    # Resolver implementations are deliberately external to domain values and
    # are registered only when asset resolution is requested.
    importlib.import_module("fiftyone.utils.lerobot")
    with _typed_resolution_errors():
        derived = _get_media_resolver(reference).derive_assets(
            reference, binding=binding
        )

    if derived is not None:
        return derived

    return _resolve_reference_assets(reference).assets


def _source_info(binding):
    """What the whole source declares, from the binding a page already read.

    A source's ``meta/info.json`` is one file shared by every episode in it,
    so a reader is handed what it says instead of fetching that file once per
    tile. None for a source bound before this was recorded, which leaves a
    reader to read it as before.
    """
    info = getattr(binding, "source_info", None)
    return info if isinstance(info, dict) and info else None


def _public_manifest(
    dataset_id, sample_id, assets, episode=None, reference=None, source=None
):
    """Publishes a sample's assets and what import recorded about them.

    Between the episode description and the source facts, a reader needs no
    storage round trip to open an episode: both are things it would otherwise
    rediscover from the source's own metadata - ``info.json`` and a row of the
    episode metadata shard - per tile, for facts already recorded at import.
    """
    base_url = "/dataset/%s" % quote(str(dataset_id), safe="")
    manifest = publish_media_assets(
        assets,
        functools.partial(_asset_url, base_url, sample_id, reference),
    )
    # How long this may be reused. A reader that held it longer would keep
    # fetching with URLs whose authorization has lapsed.
    manifest["max_age_seconds"] = _manifest_max_age()
    if episode:
        manifest["episode"] = episode

    if source:
        manifest["source"] = source

    return manifest


@dataclass(frozen=True)
class _ObjectAsset:
    """One physical object, located from a URL rather than from a sample."""

    path: str
    media_type: str
    size_bytes: int = None
    etag: str = None


def _encode_object_ref(source_identity, content_id, location_path):
    """Packs what locating one object needs into a single URL segment.

    Every part is a property of the object, not of the episode selecting it,
    so two episodes sharing a file are handed the same URL. `content_id`
    changes when the contents do, which is what lets the response be cached
    for a long time without going stale.

    Encoded rather than sealed: this is compact and slash-free, not secret.
    Whether it should be encrypted is an open design question - see the
    read-path design doc.
    """
    payload = "\0".join((source_identity, content_id, location_path))
    encoded = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def _decode_object_ref(encoded):
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        payload = base64.urlsafe_b64decode(padded.encode("ascii")).decode(
            "utf-8"
        )
        source_identity, content_id, location_path = payload.split("\0")
    except (ValueError, UnicodeDecodeError, base64.binascii.Error):
        _raise_asset_error(
            400,
            "malformed-media-asset",
            "The requested object reference is malformed",
        )

    if not source_identity or not location_path:
        _raise_asset_error(
            400,
            "malformed-media-asset",
            "The requested object reference is incomplete",
        )

    return source_identity, content_id, location_path


def _resolve_object(request):
    """Locates one object from its URL, with a single database lookup.

    The URL names the source and the object within it, so nothing about the
    sample that led here is consulted: no dataset, no sample document, no
    media-reference binding, and no asset derivation. That is the whole point
    - a byte read should not pay to rediscover which object it is reading.
    """
    import fiftyone.utils.lerobot as foul

    source_identity, _, location_path = _decode_object_ref(
        request.path_params["object_ref"]
    )
    importlib.import_module("fiftyone.utils.lerobot")
    with _typed_resolution_errors():
        binding = foul._get_source_binding(source_identity)
        if binding is None:
            raise MissingMediaRootError(
                "No authorized source binding exists for this object"
            )

        # Confines the path to the bound root, so a crafted reference cannot
        # reach an object outside the source it names.
        path = foul._resolve_under_root(binding.root, location_path)

    return _ObjectAsset(
        path=path,
        media_type=etau.guess_mime_type(location_path)
        or "application/octet-stream",
    )


def _asset_url(base_url, sample_id, reference, asset):
    """Where the browser reads one asset's bytes.

    Addresses the object rather than this episode's slice of it, so every
    episode sharing a file is handed one URL - and it is a handle, not a
    signature, because signatures differ per pod and per minting.
    """
    source_identity = getattr(reference, "source_identity", None)
    location = getattr(getattr(asset, "description", None), "location", None)
    content_id = getattr(asset, "content_id", None)
    if source_identity and location and content_id:
        return "%s/multimodal/object/%s" % (
            base_url,
            _encode_object_ref(source_identity, content_id, location.path),
        )

    # A reference kind that exposes no source identity keeps the sample-scoped
    # handle, which needs the sample to resolve but always works.
    return "%s/sample/%s/multimodal/assets/%s" % (
        base_url,
        quote(str(sample_id), safe=""),
        quote(asset.asset_id, safe=""),
    )


#: A dataset's samples live in a collection named after it. Snapshots keep the
#: same shape behind their own prefix, so both are derivable without asking.
_SAMPLE_COLLECTION_FORMATS = ("samples.%s", "snapshot.samples.%s")


def _read_media_reference(dataset_id, sample_id):
    """Hydrates one sample's media reference and nothing else about it.

    The collection name is derived rather than looked up: a read path that
    asks the database where to look pays a round trip to learn a convention.
    """
    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        query = {"_id": ObjectId(sample_id)}
    except (InvalidId, TypeError):
        _raise_resolution_error(
            422,
            "malformed-media-reference",
            "Malformed sample id '%s'" % sample_id,
        )

    db = foo.get_db_conn()
    document = None
    for collection_format in _SAMPLE_COLLECTION_FORMATS:
        document = db[collection_format % dataset_id].find_one(
            query, {"media_reference": 1}
        )
        if document is not None:
            break

    if document is None:
        _raise_asset_error(
            404,
            "missing-media-asset",
            "The requested sample is not part of this dataset",
        )

    descriptor = document.get("media_reference")
    if descriptor is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "missing-media-reference: The requested sample is "
                "filepath-backed"
            ),
            headers={"X-FiftyOne-Error-Kind": "missing-media-reference"},
        )

    references, failures = hydrate_media_references({sample_id: descriptor})
    reference = references.get(sample_id)
    if reference is None:
        _raise_resolution_error(
            422,
            "malformed-media-reference",
            failures.get(sample_id) or "The stored media reference is invalid",
        )

    return reference


def _resolve_asset(request):
    """Locates the one asset a request names, or raises a typed error.

    A browser reads one asset over many byte ranges, and each range arrives as
    its own request. Locating the sample's assets for every one of them would
    put a lookup in front of each read, so the asset a request names is
    remembered briefly. Signing still happens per request, under the caller's
    own credentials.
    """
    requested_asset_id = request.path_params["asset_id"]
    dataset_id = request.path_params["dataset_id"]
    sample_id = request.path_params["sample_id"]
    cache_key = (dataset_id, sample_id, requested_asset_id)
    cached = _RESOLVED_ASSET_CACHE.get(cache_key)
    if cached is not None:
        return cached

    reference = _read_media_reference(dataset_id, sample_id)
    asset = next(
        (
            candidate
            for candidate in _reference_assets(reference)
            if candidate.asset_id == requested_asset_id
        ),
        None,
    )
    if asset is None:
        _raise_asset_error(
            404,
            "missing-media-asset",
            "The requested asset is not part of this sample",
        )

    _RESOLVED_ASSET_CACHE[cache_key] = asset
    return asset


def _describe_asset(asset):
    """Fills in the facts about an asset that only its storage can answer.

    A derived asset carries no size or validator, because import records
    neither. A redirected read needs neither either - the store answers with
    both - so this is paid only by the responses this server writes itself.
    """
    if asset.size_bytes is not None:
        return asset

    metadata = fos.get_file_metadata(asset.path)
    if metadata is None:
        _raise_asset_error(
            404,
            "missing-media-asset",
            "The resolved media asset is no longer available",
        )

    return replace(
        asset,
        size_bytes=metadata["size"],
        etag=metadata.get("etag"),
    )


def _asset_location(path):
    """A URL a reader can fetch an asset's bytes from without this server.

    None where this server is the only way to reach them, which is the whole
    answer for a file on its own disk. Resolved per request rather than kept
    in a manifest, because an authorization is minted for a moment.
    """
    try:
        return fos.resolve_location(path)
    except Exception:  # pylint: disable=broad-except
        logger.warning(
            "Cannot resolve a readable location for a media-reference asset, "
            "so its bytes are being streamed through this server",
            exc_info=True,
        )
        return None


def _asset_location_max_age(path):
    """How long a browser may reuse a redirect to one asset's location.

    Bounded by the life of the location it points at, so every retry gets a
    freshly authorized one, and short regardless because it is also how long
    a reader whose access was revoked can still fetch bytes.
    """
    # pylint: disable-next=assignment-from-none
    lifetime = fos.location_max_age()
    if lifetime is None:
        # Nothing about the location expires, so only revocation bounds this
        return _MAX_REDIRECT_AGE_SECONDS

    return max(
        0,
        min(_MAX_REDIRECT_AGE_SECONDS, lifetime - _LOCATION_MARGIN_SECONDS),
    )


def _manifest_max_age():
    """How long a browser may reuse one manifest.

    The URLs inside a manifest are handles rather than locations, so nothing
    in it expires and re-fetching buys only a fresher view of a replaced
    source. Staleness is the single bound; a location's lifetime would strand
    reads it no longer covers, and does not apply to a handle.
    """
    return _MAX_MANIFEST_AGE_SECONDS


def _redirect_response(url, max_age):
    headers = _media_headers()
    headers["Cache-Control"] = "private, max-age=%d" % max_age
    return RedirectResponse(url, status_code=307, headers=headers)


def _metadata_response(asset, status_code=200, extra_headers=None):
    headers = _media_headers(_asset_headers(asset))
    headers["Content-Length"] = str(asset.size_bytes)
    if extra_headers:
        headers.update(extra_headers)

    return Response(status_code=status_code, headers=headers)


def _asset_headers(asset):
    headers = {"Accept-Ranges": "bytes"}
    if asset.media_type:
        headers["Content-Type"] = asset.media_type

    # The store's own validator, never the revision: a browser compares what
    # this route sends with what the store sends on the redirected read, and
    # discards its cached ranges when the two disagree.
    if asset.etag:
        headers["ETag"] = '"%s"' % asset.etag.replace('"', "").replace(
            "\\", ""
        )

    return headers


async def _proxy_response(request, asset):
    """Streams one remote asset through this server in bounded chunks."""
    requested = _parse_single_range(
        request.headers.get("range"), asset.size_bytes
    )
    if requested is _UNSATISFIABLE_RANGE:
        return _metadata_response(
            asset,
            status_code=416,
            extra_headers={
                "Content-Range": "bytes */%d" % asset.size_bytes,
                "Content-Length": "0",
            },
        )

    if requested is None:
        start, end = 0, asset.size_bytes - 1
        status_code = 200
        extra = {}
    else:
        start, end = requested
        status_code = 206
        extra = {
            "Content-Range": "bytes %d-%d/%d" % (start, end, asset.size_bytes)
        }

    headers = _media_headers(_asset_headers(asset))
    headers.update(extra)
    if asset.size_bytes == 0:
        headers["Content-Length"] = "0"
        return Response(status_code=status_code, headers=headers)

    headers["Content-Length"] = str(end - start + 1)
    async def stream():
        position = start
        while position <= end:
            chunk_end = min(end, position + _PROXY_CHUNK_BYTES - 1)
            chunk = await anyio.to_thread.run_sync(
                functools.partial(
                    fos.read_range, asset.path, position, chunk_end
                )
            )
            if not chunk:
                break

            position += len(chunk)
            yield chunk

    return StreamingResponse(
        stream(), status_code=status_code, headers=headers
    )


def _parse_single_range(header, size_bytes):
    """Parses one HTTP byte range, or returns None to ignore the header."""
    if not header:
        return None

    match = _RANGE_PATTERN.fullmatch(header.strip())
    if match is None:
        # A range this server cannot serve is ignored, as HTTP allows
        return None

    first, last = match.group("first"), match.group("last")
    if not first:
        if not last:
            return None

        suffix_length = int(last)
        if suffix_length == 0:
            return _UNSATISFIABLE_RANGE

        start = max(0, size_bytes - suffix_length)
        end = size_bytes - 1
    else:
        start = int(first)
        end = size_bytes - 1 if not last else min(int(last), size_bytes - 1)

    if size_bytes == 0 or start >= size_bytes or start > end:
        return _UNSATISFIABLE_RANGE

    return start, end


def _get_sample(dataset, sample_id):
    """Loads one sample, or raises the error its caller reports."""
    try:
        return get_sample_from_dataset(dataset, sample_id)
    except MediaReferenceError as exc:
        _raise_resolution_error(422, "malformed-media-reference", exc)
    except (InvalidDocumentError, TypeError, ValueError) as exc:
        _raise_resolution_error(422, "malformed-media-reference", exc)


def _require_media_reference(sample):
    """Returns this sample's media reference, or reports that it has none."""
    try:
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

    return reference


def _resolve_reference_assets(reference):
    """Reads the source to resolve one reference's assets."""
    with _typed_resolution_errors():
        assets = reference.describe_assets()
        resolver = _get_media_resolver(reference)
        return resolver.resolve_assets(reference, assets)


@contextmanager
def _typed_resolution_errors():
    """Reports a resolution failure as the public error kind it belongs to."""
    try:
        yield
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


def _raise_resolution_error(status_code, kind, error) -> NoReturn:
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


def _raise_asset_error(status_code, kind, message) -> NoReturn:
    raise HTTPException(
        status_code=status_code,
        detail="%s: %s" % (kind, message),
        headers={"X-FiftyOne-Error-Kind": kind},
    )


def _open_asset(path):
    if (
        os.name != "posix"
        or not hasattr(os, "O_NOFOLLOW")
        or os.open not in os.supports_dir_fd
    ):
        return os.open(path, os.O_RDONLY)

    path = os.path.normpath(path)
    if not os.path.isabs(path):
        raise OSError(errno.EINVAL, "media asset path must be absolute")

    flags = os.O_RDONLY | os.O_NOFOLLOW
    directory_flags = flags | os.O_DIRECTORY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
        directory_flags |= os.O_CLOEXEC

    descriptor = os.open(os.path.sep, directory_flags)
    try:
        components = [part for part in path.split(os.path.sep) if part]
        for index, component in enumerate(components):
            component_flags = (
                flags if index == len(components) - 1 else directory_flags
            )
            next_descriptor = os.open(
                component, component_flags, dir_fd=descriptor
            )
            os.close(descriptor)
            descriptor = next_descriptor

        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


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
        self.headers["content-type"] = (
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
        "/dataset/{dataset_id}/multimodal/manifests",
        MediaAssetManifestPageRoute,
    ),
    (
        "/dataset/{dataset_id}/multimodal/object/{object_ref}",
        MediaObjectBytes,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/assets/{asset_id}",
        MediaAssetBytes,
    ),
]
