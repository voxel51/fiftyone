"""
What a dataset stores about its media sources, one entry each, and the
registries a reference kind plugs into to turn a sample's reference into
located assets. What a sample stores is in
:mod:`fiftyone.core.media_reference`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
import logging
import posixpath
import re
from typing import (
    Any,
    ClassVar,
    Dict,
    FrozenSet,
    Iterable,
    Mapping,
    Optional,
    Tuple,
    Union,
)

from bson import ObjectId

from fiftyone.core.media_reference import MediaReference

#: Written into an export bundle's source manifest. A bundle travels without
#: the dataset document that would otherwise date it, so it carries its own
INGEST_VERSION = "v0.1"

logger = logging.getLogger(__name__)

_DRIVE_PREFIX_PATTERN = re.compile(r"^[A-Za-z]:")
_ROW_COORDINATE_SYSTEMS = {
    "lerobot-v3-global-dataset-row",
    "parquet-file-row",
}


class MediaReferenceError(ValueError):
    """Base error for invalid or unusable media references."""


class MissingMediaRootError(MediaReferenceError):
    """The dataset does not record where a referenced source is."""


class MovedMediaRootError(MediaReferenceError):
    """A recorded source location no longer exists."""


class StaleMediaReferenceError(MediaReferenceError):
    """The source no longer holds what a reference points at."""


class MalformedMediaSourceError(MediaReferenceError):
    """The referenced media source is malformed."""


class UnfinalizedMediaSourceError(MalformedMediaSourceError):
    """The referenced media source is still being written."""


class InvalidMediaLocationError(MalformedMediaSourceError):
    """A path within a source is not a canonical relative POSIX path."""


class MediaSourceAuthorizationError(MediaReferenceError):
    """The caller may not read the referenced media source."""


class UnsupportedMediaReferenceOperation(MediaReferenceError):
    """The operation is not supported for media-reference-backed samples."""


class MediaAssetRole(Enum):
    """What one asset of a reference is for."""

    DATASET_INFO = "dataset-info"
    DATASET_STATISTICS = "dataset-statistics"
    TASKS_METADATA = "tasks-metadata"
    EPISODE_METADATA = "episode-metadata"
    TABULAR_FRAME_DATA = "tabular-frame-data"
    IMAGE_PAYLOAD = "image-payload"
    VIDEO_STREAM = "video-stream"


@dataclass(frozen=True)
class WholeFile:
    """Selects an entire media asset."""

    kind: ClassVar[str] = "whole-file"


@dataclass(frozen=True)
class RowInterval:
    """Selects a half-open row interval in a named coordinate system."""

    kind: ClassVar[str] = "row-interval"

    coordinate_system: str
    start: int
    end: int


@dataclass(frozen=True)
class VideoTimestampInterval:
    """Selects a time window of a video, in seconds."""

    kind: ClassVar[str] = "video-timestamp-interval"

    from_timestamp: float
    to_timestamp: float


MediaAssetSelector = Union[WholeFile, RowInterval, VideoTimestampInterval]


def _asset_selector(selector: "MediaAssetSelector") -> dict:
    """One asset's selector, as the browser's closed selector vocabulary."""
    if isinstance(selector, RowInterval):
        return {
            "coordinateSystem": selector.coordinate_system,
            "end": selector.end,
            "kind": selector.kind,
            "start": selector.start,
        }

    if isinstance(selector, VideoTimestampInterval):
        return {
            "fromTimestamp": selector.from_timestamp,
            "kind": selector.kind,
            "toTimestamp": selector.to_timestamp,
        }

    return {"kind": selector.kind}


@dataclass(frozen=True)
class MediaAsset:
    """One asset a reference selects: a path within its source and the part
    of that file the reference uses."""

    role: MediaAssetRole
    path: str
    selector: MediaAssetSelector
    media_type: Optional[str] = None
    feature_name: Optional[str] = None


def _media_reference_dict(reference) -> Mapping[str, Any]:
    """A reference as the resolvers read it. A sample read from the database
    carries the document; one read through an aggregation carries its
    stored form."""
    if isinstance(reference, Mapping):
        return reference

    return reference.to_mongo()


def _media_reference_source(reference: Mapping[str, Any]) -> str:
    """The source a stored reference's key names."""
    return MediaReference.source_of(reference["key"])


def _media_source(
    kind: str, source_id: str, loc: str, **media_source_fields
) -> dict:
    """One of a dataset's media sources: what every episode of it shares,
    and where it is.

    ``loc`` is the source's directory. Recording splits it into the root the
    dataset files sources under and this source's directory within it, so
    moving a whole tree is one edit and no source's identity depends on
    where it currently sits.
    """
    media_source = {"id": source_id, "kind": kind, "loc": loc}
    media_source.update(media_source_fields)
    return media_source


def _new_media_source_id() -> str:
    """An opaque source id. Never derived from a location, so relocating a
    source cannot mint a second identity for it."""
    return str(ObjectId())


def _split_source_location(loc: str) -> Tuple[str, str]:
    """A source directory as ``(the root it sits under, its own name)``.

    Normalized the way a sample's filepath is, so a source cannot name a
    location a filepath could not: the browser is handed a composed location
    verbatim when it is one it can fetch.
    """
    import fiftyone.core.storage as fos

    normalized = fos.normalize_path(loc).replace("\\", "/").rstrip("/")
    root, _, name = normalized.rpartition("/")
    return root, name


def _media_roots_by_id(dataset) -> Dict[str, str]:
    """Where each of the dataset's roots points, by root id."""
    return {root["id"]: root["loc"] for root in dataset._doc._media_roots}


def _intern(table: list, value: dict) -> str:
    """The id ``value`` is filed under in ``table``, filing it if new. What
    every source of a kind shares is stored once and named, so recording a
    hundred sources of one layout stores that layout once."""
    for entry in table:
        if {key: item for key, item in entry.items() if key != "id"} == value:
            return entry["id"]

    entry = {"id": str(ObjectId()), **value}
    table.append(entry)
    return entry["id"]


def _intern_media_sources(doc, entries: Iterable[dict]) -> list:
    """Files source entries under a document's tables of roots and layouts.

    An entry names where its source is and how the source is read; both are
    shared by every source recorded the same way, so each is interned and the
    entry keeps only what is its own.
    """
    interned = []
    for entry in entries:
        entry = dict(entry)
        if "layout" in entry:
            # a reader hands back one self-contained description; filing a
            # stored entry again would file its layout id as a layout
            raise MalformedMediaSourceError(
                "Media source '%s' is already filed under a layout; record "
                "what a reader returns, not what is stored" % entry.get("id")
            )

        # the kind registers which fields are a source's own, so it has to
        # be loaded before the rest are filed away as shared layout
        _ensure_builtin_media_reference_kind(entry.get("kind"))
        source_fields = _SOURCE_FIELDS_BY_KIND.get(entry.get("kind"), ())
        layout = {
            key: entry.pop(key)
            for key in list(entry)
            if key not in ("id", "loc", "root", "dir", "layout")
            and key not in source_fields
        }
        if "loc" in entry:
            root, name = _split_source_location(entry.pop("loc"))
            entry["root"] = _intern(doc._media_roots, {"loc": root})
            entry["dir"] = name

        if layout:
            entry["layout"] = _intern(doc._media_source_layouts, layout)

        interned.append(entry)

    return interned


def _sweep_media_tables(doc) -> None:
    """Drops roots and layouts no source names any more, which a re-import
    that repoints a source can leave behind."""
    roots = {entry.get("root") for entry in doc._media_sources}
    layouts = {entry.get("layout") for entry in doc._media_sources}
    doc._media_roots = [e for e in doc._media_roots if e["id"] in roots]
    doc._media_source_layouts = [
        e for e in doc._media_source_layouts if e["id"] in layouts
    ]


def _media_source_ids(sample_collection) -> list:
    """The distinct source ids a collection's samples name, in one
    aggregation. Grouped in Mongo, so the result is one row per source
    rather than one per sample."""
    return [
        doc["source_id"]
        for doc in sample_collection._aggregate(
            post_pipeline=[
                {"$match": {"media_reference.key": {"$ne": None}}},
                {
                    "$group": {
                        "_id": {
                            "$arrayElemAt": [
                                {"$split": ["$media_reference.key", "/"]},
                                0,
                            ]
                        }
                    }
                },
                {"$project": {"_id": 0, "source_id": "$_id"}},
            ]
        )
    ]


def _located_media_sources(doc) -> list:
    """A dataset document's source entries, each naming where its source is
    and how it is read, rather than the ids the document files those under."""
    _load_media_tables(doc)
    roots = {root["id"]: root["loc"] for root in doc._media_roots}
    layouts = {entry["id"]: entry for entry in doc._media_source_layouts}
    located = []
    for media_source in doc._media_sources:
        entry = _with_layout(dict(media_source), layouts)
        # a bundle's document travels without the table of roots a stored
        # entry's location is composed from, so it names each outright
        if "loc" not in entry:
            root = roots.get(entry.pop("root", None))
            if root is None:
                continue

            entry["loc"] = "%s/%s" % (root, entry.pop("dir"))

        located.append(entry)

    return located


def _with_layout(entry: dict, layouts: Mapping[str, dict]) -> dict:
    """A source entry with the layout it names folded back in, so every
    caller reads one self-contained description."""
    layout = layouts.get(entry.pop("layout", None))
    if layout is None:
        return entry

    return {
        **{key: item for key, item in layout.items() if key != "id"},
        **entry,
    }


def _load_media_tables(doc) -> None:
    """Reads the source tables a dataset load leaves behind.

    A dataset document is read on nearly every request, so what only media
    resolution needs is fetched when something asks for it. The roots table
    stays with the document and says whether there is anything to fetch: a
    source is only ever recorded by interning the root it sits under.

    Takes the document rather than the dataset, so a caller holding only one
    -- a merge reading the sources it is adopting -- can load them too.
    """
    if doc._media_sources or not doc._media_roots:
        return

    import fiftyone.core.odm as foo

    stored = (
        foo.get_db_conn().datasets.find_one(
            {"_id": doc.id},
            {"_media_sources": 1, "_media_source_layouts": 1},
        )
        or {}
    )
    doc._media_sources = stored.get("_media_sources") or []
    doc._media_source_layouts = stored.get("_media_source_layouts") or []

    # read back from the database, so not a change this document should write
    for field in ("_media_sources", "_media_source_layouts"):
        while field in doc._changed_fields:
            doc._changed_fields.remove(field)


def _recorded_media_source_ids(dataset) -> FrozenSet[str]:
    """The ids of the sources the dataset records. Reads the ids alone, so a
    membership check does not resolve every source's location."""
    _load_media_tables(dataset._doc)
    return frozenset(source["id"] for source in dataset._doc._media_sources)


def _media_sources_by_id(dataset) -> Dict[str, dict]:
    """The dataset's source entries keyed by source id, each with the
    directory its assets are read from. One read of a document every caller
    already holds; the location is composed here so nothing stored has to
    repeat it."""
    _load_media_tables(dataset._doc)
    roots = _media_roots_by_id(dataset)
    layouts = {
        entry["id"]: entry for entry in dataset._doc._media_source_layouts
    }
    entries = {}
    for media_source in dataset._doc._media_sources:
        entry = _with_layout(dict(media_source), layouts)
        root = roots.get(entry.get("root"))
        if root is None:
            raise MissingMediaRootError(
                "Dataset '%s' does not record media root '%s' for source "
                "'%s'" % (dataset.name, entry.get("root"), entry["id"])
            )

        entry["loc"] = "%s/%s" % (root, entry["dir"])
        entries[entry["id"]] = entry

    return entries


@dataclass(frozen=True)
class _ResolvedMediaAsset:
    """One asset located under its source, addressed by the keyed path
    ``<source id>/<path within the source>`` every consumer reads it by."""

    description: MediaAsset
    asset_id: str
    path: str
    media_type: str


@dataclass(frozen=True)
class _ResolvedMediaReference:
    """One reference's located assets and its episode's stored fields."""

    reference: Mapping[str, Any]
    assets: Tuple[_ResolvedMediaAsset, ...]
    episode: Mapping[str, Any]


class _MediaResolver(ABC):
    """Turns a source's references into located assets. Reads nothing: a
    reference carries its own coordinates and the source carries the layout
    they are formatted into."""

    @abstractmethod
    def resolve(
        self,
        media_source: Mapping[str, Any],
        references: Mapping[str, Mapping[str, Any]],
    ) -> Dict[str, _ResolvedMediaReference]:
        """Resolves references that all belong to the source ``media_source``
        describes, keyed the way ``references`` is."""


#: The resolver each kind of media source is read with
_RESOLVERS_BY_KIND: Dict[str, "_MediaResolver"] = {}

#: The fields each kind stores per source. Everything else a kind records is
#: the same for every source read the same way, so it is stored once
_SOURCE_FIELDS_BY_KIND: Dict[str, Tuple[str, ...]] = {}

#: The planner each kind is exported to each destination format with
_EXPORT_PLANNERS_BY_KIND_AND_FORMAT: Dict[Tuple[str, str], Any] = {}


def _register_media_resolver(
    kind: str, resolver: _MediaResolver, source_fields: Iterable[str] = ()
) -> None:
    """Registers how a kind is read, and which of its recorded fields belong
    to one source rather than to every source read the same way."""
    if not isinstance(resolver, _MediaResolver):
        raise TypeError("resolver must be a _MediaResolver")

    if kind in _RESOLVERS_BY_KIND:
        raise ValueError(
            "Media resolver for '%s' is already registered" % kind
        )

    _RESOLVERS_BY_KIND[kind] = resolver
    _SOURCE_FIELDS_BY_KIND[kind] = tuple(source_fields)


def _get_media_resolver(kind: str) -> _MediaResolver:
    _ensure_builtin_media_reference_kind(kind)
    resolver = _RESOLVERS_BY_KIND.get(kind)
    if resolver is None:
        raise UnsupportedMediaReferenceOperation(
            "No resolver is registered for media-reference kind '%s'" % kind
        )

    return resolver


def _resolve_media_references(
    dataset, references: Mapping[str, Mapping[str, Any]]
) -> Dict[str, _ResolvedMediaReference]:
    """Resolves references of any kinds through the dataset's sources: one
    resolver call per source, each reading only what its references carry."""
    by_source: Dict[str, dict] = {}
    for key, reference in references.items():
        by_source.setdefault(_media_reference_source(reference), {})[
            key
        ] = reference

    entries = _media_sources_by_id(dataset)
    resolved = {}
    for source_id, source_references in by_source.items():
        media_source = entries.get(source_id)
        if media_source is None:
            raise MissingMediaRootError(
                "Dataset '%s' does not record media source '%s'"
                % (dataset.name, source_id)
            )

        resolver = _get_media_resolver(media_source["kind"])
        resolved.update(resolver.resolve(media_source, source_references))

    return resolved


def addressable_media_sources(dataset) -> Dict[str, str]:
    """Where each of the dataset's sources is, for the sources whose objects
    the browser can address by path.

    Named once per dataset rather than once per object on every page that
    touches the source, since a page repeats the sources its samples share.
    A source whose objects carry a location of their own is absent: nothing
    about them is composed from where the source is.
    """
    import fiftyone.core.storage as fos

    if not dataset._contains_media_references():
        return {}

    return {
        source_id: entry["loc"]
        for source_id, entry in _media_sources_by_id(dataset).items()
        if fos.get_file_system(entry["loc"]) is fos.FileSystem.LOCAL
    }


def _media_asset_entry(asset: _ResolvedMediaAsset) -> dict:
    """One asset as the browser reads it: what it is and which part of it the
    sample uses. Where its bytes are is delivered once per page, since one
    object serves however many samples select it."""
    entry = {
        "id": asset.asset_id,
        "mediaType": asset.media_type,
        "role": asset.description.role.value,
        "selector": _asset_selector(asset.description.selector),
    }
    if asset.description.feature_name:
        entry["featureName"] = asset.description.feature_name

    return entry


@dataclass(frozen=True)
class ResolvedSampleMedia:
    """What one reference-backed sample's media is made of: every asset it
    selects, and the one its tile plays."""

    assets: Tuple[dict, ...]
    poster_id: Optional[str]


async def resolve_sample_media(
    view, nodes
) -> Tuple[Dict[str, ResolvedSampleMedia], Dict[str, str]]:
    """Resolves the media of every reference-backed sample in ``nodes``.

    Each sample carries its own reference, so nothing is read here: the page
    is grouped by source and resolved with one call per source. Nothing is
    looked up per sample, and nothing here knows what kind of source the
    samples name.

    A sample's whole asset list is resolved, not just the object its tile
    plays, so that opening the sample asks the server for nothing it was
    already given.

    Args:
        view: the sample collection the samples were read from
        nodes: the sample items to resolve, each holding a ``sample`` dict

    Returns:
        a ``(media, located)`` tuple: :class:`ResolvedSampleMedia` by sample
        id, and where each distinct object's bytes are, by asset id
    """
    if not nodes or not view._contains_media_references():
        return {}, {}

    references = {}
    for node in nodes:
        reference = node.sample.get("media_reference")
        if reference is not None:
            references[str(node.sample["_id"])] = reference

    if not references:
        return {}, {}

    media_sources = _media_sources_by_id(view._root_dataset)
    by_source: Dict[str, dict] = {}
    for sample_id, reference in references.items():
        by_source.setdefault(_media_reference_source(reference), {})[
            sample_id
        ] = reference

    resolved = {}
    for source_id, source_references in by_source.items():
        media_source = media_sources.get(source_id)
        if media_source is None:
            # The rest of the page still renders; a sample whose source the
            # dataset no longer records is left without media
            logger.warning(
                "Dataset '%s' does not record media source '%s'",
                view._root_dataset.name,
                source_id,
            )
            continue

        resolved.update(
            _get_media_resolver(media_source["kind"]).resolve(
                media_source, source_references
            )
        )

    media = {}
    located = {}
    for sample_id, entry in resolved.items():
        poster = next(
            (
                asset
                for asset in entry.assets
                if asset.description.role is MediaAssetRole.VIDEO_STREAM
            ),
            None,
        )
        for asset in entry.assets:
            # Each distinct object is located once, however many samples and
            # roles select it
            located.setdefault(asset.asset_id, asset.path)

        media[sample_id] = ResolvedSampleMedia(
            assets=tuple(_media_asset_entry(asset) for asset in entry.assets),
            poster_id=poster.asset_id if poster else None,
        )

    return media, located


def _validate_asset_path(path: Any) -> str:
    """Rejects a path within a source that is absolute, non-POSIX or
    non-canonical, and returns it."""
    if not isinstance(path, str) or not path:
        raise InvalidMediaLocationError(
            "Asset paths within a source must be non-empty strings"
        )

    if (
        path.startswith("/")
        or path.startswith("\\")
        or _DRIVE_PREFIX_PATTERN.match(path)
    ):
        raise InvalidMediaLocationError(
            "Asset paths within a source cannot be absolute"
        )

    if "\\" in path or "\x00" in path:
        raise InvalidMediaLocationError(
            "Asset paths within a source must be POSIX paths"
        )

    if any(component in ("", ".", "..") for component in path.split("/")):
        raise InvalidMediaLocationError(
            "Asset paths within a source cannot contain empty, '.' or '..' "
            "components"
        )

    if posixpath.normpath(path) != path:
        raise InvalidMediaLocationError(
            "Asset paths within a source must be canonical"
        )

    return path


def _resolve_under_root(root: str, path: str) -> str:
    """Joins a path within a source onto the source's location.

    A local location additionally has to stay under itself once symlinks are
    followed, since whatever this returns gets opened.
    """
    import os

    import fiftyone.core.storage as fos

    try:
        _validate_asset_path(path)
    except InvalidMediaLocationError as exc:
        raise MalformedMediaSourceError(
            "Asset paths must be canonical POSIX paths within the source"
        ) from exc

    if not fos.is_local(root):
        return fos.join(root, *path.split("/"))

    root = os.path.realpath(root)
    located = os.path.realpath(os.path.join(root, *path.split("/")))
    if os.path.commonpath((root, located)) != root:
        raise MalformedMediaSourceError(
            "Asset path escapes the source root: '%s'" % path
        )

    return located


def _register_media_export_planner(kind, destination_format, planner):
    """Registers a private export planner for a reference kind."""
    key = (kind, destination_format)
    if key in _EXPORT_PLANNERS_BY_KIND_AND_FORMAT:
        raise ValueError(
            "Media export planner for %s is already registered" % (key,)
        )

    if not callable(planner):
        raise TypeError("Media export planner must be callable")

    _EXPORT_PLANNERS_BY_KIND_AND_FORMAT[key] = planner


def _get_media_export_planner(kind, destination_format):
    """Gets the private export planner for a kind and destination."""
    _ensure_builtin_media_reference_kind(kind, load_exporters=True)
    key = (kind, destination_format)
    planner = _EXPORT_PLANNERS_BY_KIND_AND_FORMAT.get(key)
    if planner is None:
        raise UnsupportedMediaReferenceOperation(
            "No export planner supports media-reference kind '%s' as '%s'"
            % key
        )

    return planner


_BUILTIN_KIND_MODULES = {
    "lerobot-episode": (
        "fiftyone.utils.lerobot",
        "fiftyone.utils.lerobot_export",
    ),
}


def _ensure_builtin_media_reference_kind(kind, load_exporters=False):
    modules = _BUILTIN_KIND_MODULES.get(kind)
    if modules is None:
        return

    __import__(modules[0])
    if load_exporters:
        __import__(modules[1])
