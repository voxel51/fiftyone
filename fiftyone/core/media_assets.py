"""
Private media-reference asset planning and materialization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass
import hashlib
import os
import posixpath
import shutil
import uuid

import eta.core.serial as etas

import fiftyone.core.media as fom
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.multimodal.media import (
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LEROBOT_EPISODE_KIND,
    MediaAssetRole,
    MediaAssetSelector,
    MediaReferenceError,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    _get_media_reference_kind,
    _get_media_resolver,
    _get_shared_media_asset_key,
    get_logical_media_identity,
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
class _ReferenceAssetPlan:
    """A private deduplicated plan for selected media references."""

    assets: tuple
    usages: tuple
    sources: tuple
    resolved: bool = False


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

    @abstractmethod
    def get_destination_location(self, reference, asset):
        """Returns the source-relative destination for a described asset."""

    @abstractmethod
    def materialize_asset(self, asset, destination, usages):
        """Materializes a resolved physical asset at ``destination``."""


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
    assets = OrderedDict()
    usages = []
    sources = OrderedDict()

    if sample_collection.media_type == fom.GROUP:
        samples = sample_collection.select_group_slices(_allow_mixed=True)
        group_field = sample_collection.group_field
    else:
        samples = sample_collection
        group_field = None

    for sample in samples.iter_samples(progress=progress):
        if sample.filepath is not None:
            continue

        _add_reference_assets(
            assets,
            usages,
            sources,
            sample,
            _get_group_slice(sample, group_field),
            resolve,
        )

    return _ReferenceAssetPlan(
        assets=tuple(assets.values()),
        usages=tuple(usages),
        sources=tuple(sources.values()),
        resolved=resolve,
    )


def _materialize_reference_assets(plan, export_root, progress=None):
    """Materializes a resolved reference plan into a portable source bundle."""
    if not plan.resolved:
        raise ValueError("A resolved media-reference asset plan is required")

    source_roots = {
        source.key: posixpath.join("media_sources", source.key)
        for source in plan.sources
    }
    for relative_root in source_roots.values():
        os.makedirs(
            os.path.join(export_root, *relative_root.split("/")),
            exist_ok=True,
        )

    usages_by_asset = {}
    for usage in plan.usages:
        usages_by_asset.setdefault(usage.asset_key, []).append(usage)

    with fou.ProgressBar(
        total=len(plan.assets), progress=progress
    ) as progress_bar:
        for asset in progress_bar(plan.assets):
            if asset.path is None:
                raise ValueError(
                    "Resolved reference assets require source paths"
                )

            relative_root = source_roots[asset.source.key]
            source_root = os.path.realpath(
                os.path.join(export_root, *relative_root.split("/"))
            )
            destination = os.path.realpath(
                os.path.join(source_root, *asset.location.split("/"))
            )
            if os.path.commonpath((source_root, destination)) != source_root:
                raise InvalidMediaLocationError(
                    "Materialized media asset escapes its portable source root"
                )

            fos.ensure_basedir(destination)
            materializer = _get_reference_asset_materializer(
                asset.reference_kind
            )
            materializer.materialize_asset(
                asset,
                destination,
                tuple(usages_by_asset.get(asset.key, ())),
            )

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
    etas.write_json(value, path)


def _load_media_source_manifest(path):
    """Loads and validates a native sources-only binding manifest."""
    value = etas.read_json(path)
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


def _validate_media_source_manifest(sample_collection, manifest_sources):
    """Validates that a native manifest describes imported references."""
    try:
        plan = _build_reference_asset_plan(sample_collection, resolve=False)
    except UnsupportedMediaReferenceOperation:
        if manifest_sources:
            raise

        return

    expected_keys = {source.key for source in plan.sources}
    actual_keys = {source.key for source, _, _ in manifest_sources}
    if actual_keys != expected_keys:
        raise ValueError(
            "Media-source manifest does not match the imported samples"
        )


def _bind_materialized_media_sources(manifest_sources, dataset_dir):
    """Binds materialized sources from a native dataset import."""
    binding_required = []
    dataset_root = os.path.realpath(dataset_dir)
    for source, relative_root, required in manifest_sources:
        if relative_root is None:
            if required:
                binding_required.append(source)
            continue

        root = os.path.realpath(
            os.path.join(dataset_root, *relative_root.split("/"))
        )
        if os.path.commonpath((dataset_root, root)) != dataset_root:
            raise ValueError("Materialized media source escapes the dataset")

        if not os.path.isdir(root):
            raise ValueError(
                "Materialized media source '%s' is missing" % relative_root
            )

        materializer = _get_reference_asset_materializer(source.kind)
        if not materializer.is_source_bound(source):
            materializer.bind_source(source, root)

    return tuple(binding_required)


def _add_reference_assets(
    assets, usages, sources, sample, group_slice, resolve
):
    reference = sample.media_reference
    kind = _get_media_reference_kind(reference)
    materializer = _get_reference_asset_materializer(kind)
    source = materializer.describe_source(reference)
    sources.setdefault(source.key, source)
    descriptions = tuple(reference.describe_assets())
    resolved = None
    if resolve:
        manifest = _get_media_resolver(reference).resolve_assets(
            reference, descriptions
        )
        resolved = {asset.description: asset for asset in manifest.assets}
        if len(resolved) != len(manifest.assets) or set(resolved) != set(
            descriptions
        ):
            raise MediaReferenceError(
                "Resolved media assets do not match their descriptions"
            )

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
        ):
            raise ValueError("Conflicting resolutions for shared media asset")

        usages.append(
            _ReferenceAssetUsage(
                sample_id=str(sample.id),
                logical_media_identity=get_logical_media_identity(sample),
                asset_key=key,
                role=description.role,
                selector=description.selector,
                group_slice=group_slice,
                feature_name=description.feature_name,
            )
        )


def _get_group_slice(sample, group_field):
    if group_field is None:
        return None

    group = sample.get_field(group_field)
    return None if group is None else group.name


def _validate_relative_root(relative_root):
    try:
        return DatasetRelativeLocation(relative_root).path
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Materialized source root must be a canonical POSIX path"
        ) from exc


def _validate_publish_destination(output_dir, overwrite):
    if not os.path.exists(output_dir):
        return

    if os.path.isdir(output_dir) and not os.listdir(output_dir):
        return

    if not overwrite:
        raise FileExistsError(
            "Native media-reference export requires an empty destination or "
            "overwrite=True: '%s'" % output_dir
        )


def _publish_staging_dir(staging_dir, output_dir):
    if not os.path.exists(output_dir):
        os.replace(staging_dir, output_dir)
        return

    if os.path.isdir(output_dir) and not os.listdir(output_dir):
        os.rmdir(output_dir)
        os.replace(staging_dir, output_dir)
        return

    backup_dir = output_dir + ".fiftyone-backup-" + uuid.uuid4().hex
    os.replace(output_dir, backup_dir)
    try:
        os.replace(staging_dir, output_dir)
    except BaseException:
        os.replace(backup_dir, output_dir)
        raise
    else:
        if os.path.isdir(backup_dir):
            shutil.rmtree(backup_dir)
        else:
            os.remove(backup_dir)
