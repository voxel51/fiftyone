"""
Asset planning for media-reference datasets: which files a set of samples
needs, deduplicated by content, for export and for importing an exported
bundle. Nothing here is stored; every plan is derived from the samples'
keys and the sources they name, read once per operation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import OrderedDict
from collections.abc import Mapping
from dataclasses import dataclass
import posixpath

import fiftyone.core.media as fom
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from .field_model import (
    INGEST_VERSION,
    _media_reference_dict,
    _media_reference_source,
    MediaAssetRole,
    MediaAssetSelector,
    MissingMediaRootError,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    _media_sources_by_id,
    _resolve_media_references,
    _validate_asset_path,
)

_MEDIA_SOURCE_MANIFEST_FILENAME = "media_sources.json"
_MEDIA_SOURCES_DIRNAME = "media_sources"


@dataclass(frozen=True)
class _MediaSourceDescriptor:
    """A portable, non-secret identity for one media source: its kind and
    the id its dataset files it under."""

    kind: str
    id: str

    def __post_init__(self):
        for name, value in (("kind", self.kind), ("id", self.id)):
            if not isinstance(value, str) or not value:
                raise TypeError("%s must be a non-empty string" % name)

    def to_dict(self):
        return {"kind": self.kind, "id": self.id}


@dataclass(frozen=True)
class _PlannedReferenceAsset:
    """One unique physical asset required by selected references."""

    key: str
    reference_kind: str
    source: _MediaSourceDescriptor
    location: str
    path: str = None
    media_type: str = None


@dataclass(frozen=True)
class _ReferenceAssetUsage:
    """One selected reference's use of a planned physical asset."""

    sample_id: str
    logical_media_identity: str
    asset_key: str
    role: MediaAssetRole
    selector: MediaAssetSelector
    group_slice: str = None
    feature_name: str = None


@dataclass(frozen=True)
class _ReferenceOccurrence:
    """One selected sample occurrence and its deduplicated physical assets."""

    sample_id: str
    logical_media_identity: str
    reference_identity: tuple
    asset_keys: tuple
    group_slice: str = None


@dataclass(frozen=True)
class _PlannedReference:
    """One unique reference and its described assets."""

    reference: object
    source: _MediaSourceDescriptor
    descriptions: tuple


@dataclass(frozen=True)
class _ReferenceAssetPlan:
    """A deduplicated plan for selected media references."""

    assets: tuple
    usages: tuple
    sources: tuple
    resolved: bool = False
    occurrences: tuple = ()
    references: tuple = ()


class _ReferenceAssetPlanBuilder:
    """Builds one operation-scoped plan from sample occurrences."""

    def __init__(self):
        self._keys = OrderedDict()
        self._occurrences = []
        self._media_mode = None

    @property
    def keys(self):
        return list(self._keys)

    @property
    def media_mode(self):
        return self._media_mode

    def observe(self, sample_or_dict, group_slice=None):
        """Observes one selected sample: its reference and nothing else."""
        if isinstance(sample_or_dict, Mapping):
            reference = sample_or_dict.get("media_reference")
            sample_id = sample_or_dict.get("_id", sample_or_dict.get("id"))
        else:
            reference = sample_or_dict._doc.get_field("media_reference")
            sample_id = sample_or_dict.id

        mode = "reference" if reference is not None else "filepath"
        if self._media_mode is not None and self._media_mode != mode:
            raise ValueError(
                "A dataset cannot mix filepath-backed and "
                "media-reference-backed samples"
            )

        self._media_mode = mode
        if reference is None:
            return

        reference = _media_reference_dict(reference)
        key = reference["key"]
        self._keys.setdefault(key, reference)
        self._occurrences.append((str(sample_id), key, group_slice))

    def finalize(self, *, dataset, resolve=False, allow_unsupported=False):
        """Describes each unique reference once through the dataset's
        sources. Resolving reads each source's metadata once per shard
        touched; a thin plan reads nothing."""
        media_sources = _media_sources_by_id(dataset)
        references = dict(self._keys)
        sources = OrderedDict()
        for reference in references.values():
            source_id = _media_reference_source(reference)
            media_source = media_sources.get(source_id)
            if media_source is None:
                raise MissingMediaRootError(
                    "Dataset '%s' does not record media source '%s'"
                    % (dataset.name, source_id)
                )

            sources.setdefault(
                source_id,
                _MediaSourceDescriptor(media_source["kind"], source_id),
            )

        assets = OrderedDict()
        assets_by_key = {}
        planned_references = []
        resolved = {}
        if resolve and references:
            try:
                resolved = _resolve_media_references(dataset, references)
            except UnsupportedMediaReferenceOperation:
                if not allow_unsupported:
                    raise

        for key, reference in references.items():
            source = sources[_media_reference_source(reference)]
            described = resolved.get(key)
            reference_assets = []
            descriptions = []
            if described is not None:
                for asset in described.assets:
                    planned = _PlannedReferenceAsset(
                        key=asset.asset_id,
                        reference_kind=source.kind,
                        source=source,
                        location=asset.description.path,
                        path=asset.path,
                        media_type=asset.media_type,
                    )
                    existing = assets.setdefault(asset.asset_id, planned)
                    if existing != planned:
                        raise ValueError(
                            "Conflicting resolutions for shared media asset"
                        )

                    reference_assets.append(
                        (asset.asset_id, asset.description)
                    )
                    descriptions.append(asset.description)

            assets_by_key[key] = tuple(reference_assets)
            planned_references.append(
                _PlannedReference(
                    reference=reference,
                    source=source,
                    descriptions=tuple(descriptions),
                )
            )

        usages = []
        usage_keys = set()
        occurrences = []
        for sample_id, key, group_slice in self._occurrences:
            source_id = _media_reference_source(references[key])
            identity = (sources[source_id].kind, key)
            asset_keys = []
            for asset_key, description in assets_by_key[key]:
                asset_keys.append(asset_key)
                usage_key = (
                    identity,
                    asset_key,
                    description.role,
                    description.selector,
                    description.feature_name,
                )
                if usage_key not in usage_keys:
                    usage_keys.add(usage_key)
                    usages.append(
                        _ReferenceAssetUsage(
                            sample_id=sample_id,
                            logical_media_identity=key,
                            asset_key=asset_key,
                            role=description.role,
                            selector=description.selector,
                            group_slice=group_slice,
                            feature_name=description.feature_name,
                        )
                    )

            occurrences.append(
                _ReferenceOccurrence(
                    sample_id=sample_id,
                    logical_media_identity=key,
                    reference_identity=identity,
                    asset_keys=tuple(asset_keys),
                    group_slice=group_slice,
                )
            )

        return _ReferenceAssetPlan(
            assets=tuple(assets.values()),
            usages=tuple(usages),
            sources=tuple(sources.values()),
            resolved=resolve,
            occurrences=tuple(occurrences),
            references=tuple(planned_references),
        )


def _build_reference_asset_plan(
    sample_collection, resolve=False, progress=None
):
    """Builds an asset plan for the references in a collection or view."""
    import fiftyone.core.dataset as fod
    import fiftyone.core.odm as foo

    if sample_collection.media_type == fom.GROUP:
        samples = sample_collection.select_group_slices(_allow_mixed=True)
        group_field = sample_collection.group_field
    else:
        samples = sample_collection
        group_field = None

    coll, pipeline = fod._get_samples_pipeline(samples)
    fields = {"_id": True, "filepath": True, "media_reference": True}
    if group_field is not None:
        fields[group_field] = True

    pipeline.append({"$project": fields})
    builder = _ReferenceAssetPlanBuilder()
    documents = foo.aggregate(coll, pipeline)
    with fou.ProgressBar(progress=progress) as progress_bar:
        for document in progress_bar(documents):
            builder.observe(
                document, group_slice=_get_group_slice(document, group_field)
            )

    return builder.finalize(
        dataset=sample_collection._root_dataset,
        resolve=resolve,
        allow_unsupported=not resolve,
    )


def _materialize_reference_assets(
    plan, export_root, media_exporter=None, progress=None
):
    """Copies every unique asset of a resolved plan into a portable bundle,
    under ``media_sources/<source key>/<path within the source>``."""
    if not plan.resolved:
        raise ValueError("A resolved media-reference asset plan is required")

    owns_exporter = media_exporter is None
    if owns_exporter:
        from fiftyone.utils.data.exporters import MediaExporter

        media_exporter = MediaExporter(
            True,
            export_path=export_root,
            supported_modes=(True,),
        )
        media_exporter.setup()

    source_roots = {
        source.id: posixpath.join(_MEDIA_SOURCES_DIRNAME, source.id)
        for source in plan.sources
    }
    try:
        with fou.ProgressBar(
            total=len(plan.assets), progress=progress
        ) as progress_bar:
            for asset in progress_bar(plan.assets):
                if asset.path is None:
                    raise ValueError(
                        "Resolved reference assets require source paths"
                    )

                destination = fos.join(
                    export_root,
                    _MEDIA_SOURCES_DIRNAME,
                    asset.source.id,
                    *asset.location.split("/"),
                )
                media_exporter.export_reference_asset(asset, destination)
    finally:
        if owns_exporter:
            media_exporter.close()

    return source_roots


def _write_media_source_manifest(plan, path, materialized_roots=None):
    """Writes the sources a bundle covers and, for each the bundle copied,
    where within the bundle it was copied to. A source the bundle did not
    copy carries no location: the importing dataset keeps the one it already
    records for it."""
    if materialized_roots is None:
        materialized_roots = {}

    value = {
        "versions": {"ingest": INGEST_VERSION},
        "sources": [
            {
                **source.to_dict(),
                "relative_root": materialized_roots.get(source.id),
            }
            for source in plan.sources
        ],
    }
    fos.write_json(value, path)


def _load_media_source_manifest(path):
    """Loads and validates a bundle's sources manifest."""
    value = fos.read_json(path)
    if not isinstance(value, dict) or set(value) != {"versions", "sources"}:
        raise ValueError("Malformed media-source manifest")

    sources = value["sources"]
    if not isinstance(sources, list):
        raise ValueError("Media-source manifest sources must be a list")

    parsed = []
    for source in sources:
        if not isinstance(source, dict) or set(source) != {
            "kind",
            "id",
            "relative_root",
        }:
            raise ValueError("Malformed media-source descriptor")

        relative_root = source["relative_root"]
        if relative_root is not None:
            relative_root = _validate_relative_root(relative_root)

        try:
            descriptor = _MediaSourceDescriptor(
                kind=source["kind"], id=source["id"]
            )
        except TypeError as exc:
            raise ValueError("Malformed media-source descriptor") from exc

        parsed.append((descriptor, relative_root))

    source_ids = [source.id for source, *_ in parsed]
    if len(set(source_ids)) != len(source_ids):
        raise ValueError("Media-source manifest contains duplicate sources")

    return tuple(parsed)


def _record_bundled_media_sources(
    manifest_sources, dataset_dir, dataset, preexisting
):
    """Points the sources this import created at the copies the bundle
    carries.

    A source the dataset held before this import keeps the location it has:
    that location covers every one of its samples, while a bundle's copy
    covers only the samples that bundle carried. Returns the sources the
    dataset can resolve through neither.
    """
    recorded = _media_sources_by_id(dataset)
    unresolved = []
    entries = []
    for source, root in _validate_bundled_media_sources(
        manifest_sources, dataset_dir
    ):
        if source.id in preexisting:
            continue

        if root is None:
            if source.id not in recorded:
                unresolved.append(source)

            continue

        entry = dict(recorded.get(source.id) or {})
        entry.update({"id": source.id, "kind": source.kind, "loc": root})
        entry.pop("root", None)
        entry.pop("dir", None)
        entries.append(entry)

    if entries:
        dataset._record_media_sources(entries)

    return tuple(unresolved)


def _validate_bundled_media_sources(manifest_sources, dataset_dir):
    """Locates each source a bundle copied, without changing anything: it is
    where the manifest says, and inside the bundle."""
    validated = []
    dataset_root = fos.realpath(dataset_dir)
    for source, relative_root in manifest_sources:
        if relative_root is None:
            validated.append((source, None))
            continue

        root = fos.realpath(fos.join(dataset_root, *relative_root.split("/")))
        if fos.commonpath((dataset_root, root)) != dataset_root:
            raise ValueError("Materialized media source escapes the dataset")

        if not fos.isdir(root):
            raise ValueError(
                "Materialized media source '%s' is missing" % relative_root
            )

        validated.append((source, root))

    return tuple(validated)


def _validate_relative_root(relative_root):
    try:
        return _validate_asset_path(relative_root)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Materialized source root must be a canonical POSIX path"
        ) from exc


def _get_reference_asset_paths(plan, flat=True):
    """Projects a resolved plan into stable physical path lists."""
    if not plan.resolved:
        raise ValueError("A resolved media-reference asset plan is required")

    paths_by_key = {asset.key: asset.path for asset in plan.assets}
    if flat:
        return [asset.path for asset in plan.assets if asset.path is not None]

    paths = []
    for occurrence in plan.occurrences:
        sample_paths = []
        seen = set()
        for asset_key in occurrence.asset_keys:
            path = paths_by_key.get(asset_key)
            if path is not None and path not in seen:
                sample_paths.append(path)
                seen.add(path)

        paths.append(sample_paths)

    return paths


def _get_group_slice(sample, group_field):
    if group_field is None:
        return None

    if isinstance(sample, Mapping):
        group = sample.get(group_field)
        return None if group is None else group.get("name")

    group = sample.get_field(group_field)
    return None if group is None else group.name
