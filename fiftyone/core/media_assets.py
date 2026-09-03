"""
Private media-reference asset planning and materialization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from collections import OrderedDict
from collections.abc import Mapping
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
import hashlib
import os
import posixpath

import fiftyone.core.media as fom
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.multimodal.media import (
    LEROBOT_EPISODE_KIND,
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    MediaAssetRole,
    MediaAssetSelector,
    MediaReferenceError,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    _export_media_reference_bindings,
    _get_media_reference_kind,
    _get_media_resolver,
    _get_shared_media_asset_key,
    _hydrate_media_reference_binding,
    _select_media_reference_bindings,
    _serialize_media_reference,
    _validate_media_reference_descriptor,
    _validate_media_source,
)

_MEDIA_SOURCE_MANIFEST_FILENAME = "media_sources.json"


@dataclass(frozen=True)
class _MediaSourceDescriptor:
    """A portable, non-secret identity for one bindable media source."""

    kind: str
    source_identity: str
    source_fingerprint: str

    def __post_init__(self):
        for name, value in (
            ("kind", self.kind),
            ("source_identity", self.source_identity),
            ("source_fingerprint", self.source_fingerprint),
        ):
            if not isinstance(value, str) or not value:
                raise TypeError("%s must be a non-empty string" % name)

    @property
    def key(self):
        value = "%s\0%s\0%s" % (
            self.kind,
            self.source_identity,
            self.source_fingerprint,
        )
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def to_dict(self):
        return {
            "kind": self.kind,
            "source_identity": self.source_identity,
            "source_fingerprint": self.source_fingerprint,
        }


@dataclass(frozen=True)
class _PlannedReferenceAsset:
    """One unique physical asset required by selected references."""

    key: str
    reference_kind: str
    source: _MediaSourceDescriptor
    location: str
    path: str = None
    size_bytes: int = None
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
    """One unique hydrated reference and its described assets."""

    reference: object
    source: _MediaSourceDescriptor
    descriptions: tuple


@dataclass(frozen=True)
class _ReferenceAssetPlan:
    """A private deduplicated plan for selected media references."""

    assets: tuple
    usages: tuple
    sources: tuple
    resolved: bool = False
    bindings: tuple = ()
    occurrences: tuple = ()
    references: tuple = ()


class _ReferenceAssetPlanBuilder:
    """Builds one operation-scoped media-reference plan from occurrences."""

    def __init__(self):
        self._descriptors = OrderedDict()
        self._occurrences = []
        self._media_mode = None
        self._media_reference_kind = None

    @property
    def descriptors(self):
        return tuple(self._descriptors.values())

    @property
    def media_mode(self):
        return self._media_mode

    @property
    def media_reference_kind(self):
        return self._media_reference_kind

    def observe(self, sample_or_dict, group_slice=None):
        """Observes one selected sample without hydrating its reference."""
        if isinstance(sample_or_dict, Mapping):
            filepath = sample_or_dict.get("filepath")
            reference = sample_or_dict.get("media_reference")
            sample_id = sample_or_dict.get("_id", sample_or_dict.get("id"))
        else:
            filepath = sample_or_dict._doc.get_field("filepath")
            reference = sample_or_dict._doc.get_field("media_reference")
            sample_id = sample_or_dict.id

        _validate_media_source(filepath, reference)
        mode = "reference" if reference is not None else "filepath"
        if self._media_mode is not None and self._media_mode != mode:
            raise ValueError(
                "A dataset cannot mix filepath-backed and "
                "media-reference-backed samples"
            )

        self._media_mode = mode
        if reference is None:
            return

        if not isinstance(reference, Mapping):
            reference = _serialize_media_reference(reference)

        _validate_media_reference_descriptor(reference)
        descriptor = dict(reference)
        if (
            self._media_reference_kind is not None
            and self._media_reference_kind != descriptor["kind"]
        ):
            raise ValueError(
                "A media-reference dataset cannot contain multiple reference "
                "kinds"
            )

        self._media_reference_kind = descriptor["kind"]
        identity = (descriptor["kind"], descriptor["key"])
        existing = self._descriptors.setdefault(identity, descriptor)
        if existing != descriptor:
            raise MediaReferenceError(
                "Conflicting public media-reference descriptors"
            )

        self._occurrences.append((str(sample_id), identity, group_slice))

    def finalize(
        self,
        *,
        resolve=False,
        bindings=None,
        allow_unsupported=False,
    ):
        """Loads each binding and describes each unique reference once."""
        descriptors = self.descriptors
        if bindings is None:
            selected_bindings = _export_media_reference_bindings(descriptors)
        else:
            selected_bindings = _select_media_reference_bindings(
                bindings, descriptors
            )

        if len(selected_bindings) != len(descriptors):
            raise MediaReferenceError(
                "Selected media-reference bindings do not match their "
                "descriptors"
            )

        assets = OrderedDict()
        sources = OrderedDict()
        assets_by_reference = {}
        planned_references = []
        with ExitStack() as resolver_contexts:
            if resolve:
                kinds = OrderedDict.fromkeys(
                    descriptor["kind"] for descriptor in descriptors
                )
                for kind in kinds:
                    resolver_contexts.enter_context(
                        _get_media_resolver(kind).operation_context()
                    )

            for descriptor, binding in zip(descriptors, selected_bindings):
                identity = (descriptor["kind"], descriptor["key"])
                reference = _hydrate_media_reference_binding(
                    descriptor, binding
                )
                try:
                    (
                        assets_by_reference[identity],
                        planned_reference,
                    ) = _plan_reference_assets(
                        reference, assets, sources, resolve
                    )
                    planned_references.append(planned_reference)
                except UnsupportedMediaReferenceOperation:
                    if not allow_unsupported:
                        raise

                    assets_by_reference[identity] = ()

        usages = []
        usage_keys = set()
        occurrences = []
        for sample_id, identity, group_slice in self._occurrences:
            reference_assets = assets_by_reference[identity]
            asset_keys = []
            for asset_key, description in reference_assets:
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
                            logical_media_identity=identity[1],
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
                    logical_media_identity=identity[1],
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
            bindings=tuple(selected_bindings),
            occurrences=tuple(occurrences),
            references=tuple(planned_references),
        )


class _ReferenceAssetMaterializer(ABC):
    """Private materialization and binding adapter for a reference kind."""

    @abstractmethod
    def describe_source(self, reference):
        """Returns the portable, non-secret source descriptor."""

    @abstractmethod
    def is_source_bound(self, source):
        """Whether the source has a live binding in this environment."""

    @abstractmethod
    def bind_source(self, source, root):
        """Binds a materialized source root in the current environment."""

    @contextmanager
    def source_binding_context(self, source, root):
        """Binds a source and rolls it back if a later binding fails."""
        self.bind_source(source, root)
        yield

    @abstractmethod
    def get_destination_location(self, reference, asset):
        """Returns the source-relative destination for a described asset."""


_MATERIALIZERS_BY_KIND = {}


def _register_reference_asset_materializer(kind, materializer):
    if not isinstance(materializer, _ReferenceAssetMaterializer):
        raise TypeError("materializer must be a _ReferenceAssetMaterializer")

    if kind in _MATERIALIZERS_BY_KIND:
        raise ValueError(
            "Media asset materializer for '%s' is already registered" % kind
        )

    _MATERIALIZERS_BY_KIND[kind] = materializer


def _get_reference_asset_materializer(reference_or_kind):
    if isinstance(reference_or_kind, str):
        kind = reference_or_kind
    else:
        kind = _get_media_reference_kind(reference_or_kind)

    if kind == LEROBOT_EPISODE_KIND:
        __import__("fiftyone.utils.lerobot")

    materializer = _MATERIALIZERS_BY_KIND.get(kind)
    if materializer is None:
        raise UnsupportedMediaReferenceOperation(
            "No asset materializer is registered for media-reference kind "
            "'%s'" % kind
        )

    return materializer


def _build_reference_asset_plan(
    sample_collection, resolve=False, progress=None
):
    """Builds a private asset plan for references in a collection or view."""
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
                document,
                group_slice=_get_group_slice(document, group_field),
            )

    return builder.finalize(resolve=resolve, allow_unsupported=not resolve)


def _materialize_reference_assets(
    plan, export_root, media_exporter=None, progress=None
):
    """Materializes a resolved reference plan into a portable source bundle."""
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
        source.key: posixpath.join("media_sources", source.key)
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

                relative_root = source_roots[asset.source.key]
                source_root = fos.join(export_root, *relative_root.split("/"))
                destination = fos.join(source_root, *asset.location.split("/"))
                media_exporter.export_reference_asset(asset, destination)
    finally:
        if owns_exporter:
            media_exporter.close()

    return source_roots


def _write_media_source_manifest(plan, path, materialized_roots=None):
    """Writes the sources-only portable binding manifest."""
    if materialized_roots is None:
        materialized_roots = {}

    value = {
        "version": "1",
        "sources": [
            {
                **source.to_dict(),
                "relative_root": materialized_roots.get(source.key),
                "binding_required": source.key not in materialized_roots,
            }
            for source in plan.sources
        ],
    }
    fos.write_json(value, path)


def _load_media_source_manifest(path):
    """Loads and validates a native sources-only binding manifest."""
    value = fos.read_json(path)
    if not isinstance(value, dict) or set(value) != {"version", "sources"}:
        raise ValueError("Malformed media-source manifest")

    if value["version"] != "1":
        raise ValueError("Unsupported media-source manifest")

    sources = value["sources"]
    if not isinstance(sources, list):
        raise ValueError("Media-source manifest sources must be a list")

    parsed = []
    for source in sources:
        if not isinstance(source, dict) or set(source) != {
            "kind",
            "source_identity",
            "source_fingerprint",
            "relative_root",
            "binding_required",
        }:
            raise ValueError("Malformed media-source descriptor")

        relative_root = source["relative_root"]
        if relative_root is not None:
            relative_root = _validate_relative_root(relative_root)

        binding_required = source["binding_required"]
        if not isinstance(binding_required, bool) or binding_required != (
            relative_root is None
        ):
            raise ValueError("Media-source binding state is inconsistent")

        parsed.append(
            (
                _MediaSourceDescriptor(
                    kind=source["kind"],
                    source_identity=source["source_identity"],
                    source_fingerprint=source["source_fingerprint"],
                ),
                relative_root,
                binding_required,
            )
        )

    source_keys = [source.key for source, _, _ in parsed]
    if len(set(source_keys)) != len(source_keys):
        raise ValueError("Media-source manifest contains duplicate sources")

    return tuple(parsed)


def _validate_media_source_manifest(plan, manifest_sources):
    """Validates that a native manifest describes imported references."""
    expected_keys = {source.key for source in plan.sources}
    actual_keys = {source.key for source, _, _ in manifest_sources}
    if actual_keys != expected_keys:
        raise ValueError(
            "Media-source manifest does not match the imported samples"
        )


def _bind_materialized_media_sources(manifest_sources, dataset_dir):
    """Binds materialized sources from a native dataset import."""
    binding_required = []
    with ExitStack() as binding_contexts:
        for source, root, required in _validate_materialized_media_sources(
            manifest_sources, dataset_dir
        ):
            if root is None:
                if required:
                    binding_required.append(source)
                continue

            materializer = _get_reference_asset_materializer(source.kind)
            binding_contexts.enter_context(
                materializer.source_binding_context(source, root)
            )

    return tuple(binding_required)


def _validate_materialized_media_sources(manifest_sources, dataset_dir):
    """Validates materialized source roots without changing bindings."""
    validated = []
    dataset_root = fos.realpath(dataset_dir)
    for source, relative_root, required in manifest_sources:
        if relative_root is None:
            validated.append((source, None, required))
            continue

        root = fos.realpath(fos.join(dataset_root, *relative_root.split("/")))
        if fos.commonpath((dataset_root, root)) != dataset_root:
            raise ValueError("Materialized media source escapes the dataset")

        _get_reference_asset_materializer(source.kind)
        validated.append((source, root, required))

    return tuple(validated)


def _validate_materialized_reference_assets(
    plan, manifest_sources, dataset_dir
):
    """Validates the asset locations a bundled dataset declares.

    Locations are checked as paths, not as storage: importing a dataset writes
    metadata, and no other importer reads the media it names either. A missing
    or replaced asset is reported by the first resolution that needs it, which
    reads it anyway.
    """
    validated_sources = _validate_materialized_media_sources(
        manifest_sources, dataset_dir
    )
    roots = {
        source.key: root
        for source, root, _ in validated_sources
        if root is not None
    }
    for asset in plan.assets:
        root = roots.get(asset.source.key)
        if root is None:
            continue

        path = fos.realpath(fos.join(root, *asset.location.split("/")))
        if fos.commonpath((root, path)) != root:
            raise InvalidMediaLocationError(
                "Materialized media asset escapes its portable source root"
            )

    return validated_sources


def _plan_reference_assets(reference, assets, sources, resolve):
    kind = _get_media_reference_kind(reference)
    materializer = _get_reference_asset_materializer(kind)
    source = materializer.describe_source(reference)
    existing_source = sources.setdefault(source.key, source)
    if existing_source != source:
        raise ValueError("Conflicting definitions for shared media source")

    descriptions = tuple(reference.describe_assets())
    resolved = None
    if resolve:
        manifest = _get_media_resolver(reference).resolve_described_assets(
            reference, descriptions
        )
        resolved = {asset.description: asset for asset in manifest.assets}
        if len(resolved) != len(manifest.assets) or set(resolved) != set(
            descriptions
        ):
            raise MediaReferenceError(
                "Resolved media assets do not match their descriptions"
            )

    reference_assets = []
    for description in descriptions:
        key = _get_shared_media_asset_key(reference, description)
        resolved_asset = None if resolved is None else resolved[description]
        location = DatasetRelativeLocation(
            materializer.get_destination_location(reference, description)
        ).path
        if (
            resolved_asset is not None
            and resolved_asset.shared_resource_key != key
        ):
            raise StaleMediaReferenceError(
                "Resolved media asset identity does not match its description"
            )

        planned = _PlannedReferenceAsset(
            key=key,
            reference_kind=kind,
            source=source,
            location=location,
            path=None if resolved_asset is None else resolved_asset.path,
            size_bytes=(
                None if resolved_asset is None else resolved_asset.size_bytes
            ),
            media_type=(
                description.media_type
                if resolved_asset is None
                else resolved_asset.media_type
            ),
        )
        existing = assets.setdefault(key, planned)
        if (
            existing.source != planned.source
            or existing.location != planned.location
            or existing.path != planned.path
            or existing.size_bytes != planned.size_bytes
            or existing.media_type != planned.media_type
        ):
            raise ValueError("Conflicting resolutions for shared media asset")

        reference_assets.append((key, description))

    planned_reference = _PlannedReference(
        reference=reference,
        source=source,
        descriptions=descriptions,
    )
    return tuple(reference_assets), planned_reference


def _get_reference_asset_paths(plan, flat=True):
    """Projects a resolved private plan into stable physical path lists."""
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


def _validate_relative_root(relative_root):
    try:
        return DatasetRelativeLocation(relative_root).path
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Materialized source root must be a canonical POSIX path"
        ) from exc
