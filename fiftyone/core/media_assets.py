"""
Collection media-asset planning and materialization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import OrderedDict
import hashlib
import os
import posixpath
import shutil
import tempfile
import uuid

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.media as fom
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.multimodal.media import (
    DatasetRelativeLocation,
    MediaAssetCapabilities,
    MediaAssetPlan,
    MediaAssetRole,
    MediaAssetUsage,
    MediaReferenceError,
    MediaSourceDescriptor,
    PlannedMediaAsset,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    WholeFile,
    get_logical_media_identity,
    get_media_asset_materializer,
    get_media_reference_kind,
    get_media_resolver,
    get_shared_media_asset_key,
    list_media_export_formats,
)
import fiftyone.utils.utils3d as fou3d

MEDIA_ASSET_MANIFEST_FILENAME = "media_assets.json"


def build_media_asset_plan(
    sample_collection,
    resolve=False,
    group_slices=None,
    include_scene_assets=True,
    progress=None,
):
    """Builds the structured asset plan for a collection or selected view."""
    assets = OrderedDict()
    usages = []
    sources = OrderedDict()
    scene_usages = []

    if sample_collection.media_type == fom.GROUP:
        samples = sample_collection.select_group_slices(
            slices=group_slices, _allow_mixed=True
        )
        group_field = sample_collection.group_field
    else:
        samples = sample_collection
        group_field = None

    for sample in samples.iter_samples(progress=progress):
        group_slice = _get_group_slice(sample, group_field)
        logical_identity = get_logical_media_identity(sample)
        if sample.filepath is not None:
            _add_filepath_asset(
                assets,
                usages,
                scene_usages,
                sample,
                logical_identity,
                group_slice,
            )
            continue

        _add_reference_assets(
            assets,
            usages,
            sources,
            sample,
            logical_identity,
            group_slice,
            resolve,
        )

    if include_scene_assets:
        _add_scene_assets(assets, usages, scene_usages)

    return MediaAssetPlan(
        assets=tuple(assets.values()),
        usages=tuple(usages),
        sources=tuple(sources.values()),
        resolved=resolve,
    )


def build_media_asset_capabilities(sample_collection, group_slices=None):
    """Builds the public media lifecycle capabilities for a collection."""
    try:
        plan = build_media_asset_plan(
            sample_collection,
            group_slices=group_slices,
            include_scene_assets=False,
        )
        supports_enumeration = True
    except UnsupportedMediaReferenceOperation:
        plan = None
        supports_enumeration = False

    if plan is None:
        source_modes, reference_kinds, sources = _scan_media_sources(
            sample_collection, group_slices=group_slices
        )
    else:
        source_modes = {asset.source_mode for asset in plan.assets}
        reference_kinds = {
            asset.reference_kind
            for asset in plan.assets
            if asset.reference_kind is not None
        }
        sources = plan.sources

    if (
        not source_modes
        and sample_collection._dataset._doc.media_reference_kind
    ):
        source_modes.add("reference")
        reference_kinds.add(
            sample_collection._dataset._doc.media_reference_kind
        )

    modes = {True, "move", "symlink", "manifest"}
    exporters = {"fiftyone-dataset-thin"}
    if source_modes <= {"filepath"}:
        exporters.add("fiftyone-dataset-materialized")
    binding_required = []
    mixed_source_modes = len(source_modes) > 1
    if mixed_source_modes:
        modes.clear()
        exporters.clear()

    if reference_kinds:
        kind_exporters = None
        for kind in reference_kinds:
            try:
                materializer = get_media_asset_materializer(kind)
            except UnsupportedMediaReferenceOperation:
                modes.clear()
                continue

            modes.intersection_update(materializer.supported_modes)
            formats = set(list_media_export_formats(kind))
            if kind_exporters is None:
                kind_exporters = formats
            else:
                kind_exporters.intersection_update(formats)

        if modes:
            exporters.add("fiftyone-dataset-materialized")

        if source_modes == {"reference"} and kind_exporters:
            exporters.update(kind_exporters)

        for source in sources:
            try:
                materializer = get_media_asset_materializer(source.kind)
                is_bound = materializer.is_source_bound(source)
            except UnsupportedMediaReferenceOperation:
                is_bound = False

            if not is_bound:
                binding_required.append(source)

    return MediaAssetCapabilities(
        source_modes=tuple(sorted(source_modes)),
        reference_kinds=tuple(sorted(reference_kinds)),
        supports_asset_enumeration=supports_enumeration,
        supports_thin_serialization=not mixed_source_modes,
        materialization_modes=tuple(
            mode
            for mode in (True, "move", "symlink", "manifest")
            if mode in modes
        ),
        supported_exporters=tuple(sorted(exporters)),
        binding_required_sources=tuple(binding_required),
    )


def materialize_collection_media_assets(
    sample_collection,
    output_dir,
    group_slices=None,
    include_scene_assets=True,
    overwrite=False,
    progress=None,
):
    """Atomically materializes a collection's planned physical assets."""
    plan = build_media_asset_plan(
        sample_collection,
        resolve=True,
        group_slices=group_slices,
        include_scene_assets=include_scene_assets,
    )
    output_dir = fos.normalize_path(output_dir)
    _validate_publish_destination(output_dir, overwrite)

    parent = os.path.dirname(os.path.abspath(output_dir))
    etau.ensure_dir(parent)
    staging_dir = tempfile.mkdtemp(
        prefix=".fiftyone-media-assets-", dir=parent
    )
    published = False
    try:
        reference_assets = tuple(
            asset for asset in plan.assets if asset.source_mode == "reference"
        )
        filepath_assets = tuple(
            asset for asset in plan.assets if asset.source_mode == "filepath"
        )
        materialized_roots = {}
        if reference_assets:
            reference_keys = {asset.key for asset in reference_assets}
            reference_plan = MediaAssetPlan(
                assets=reference_assets,
                usages=tuple(
                    usage
                    for usage in plan.usages
                    if usage.asset_key in reference_keys
                ),
                sources=plan.sources,
                resolved=True,
            )
            materialized_roots = materialize_reference_asset_plan(
                reference_plan, staging_dir, progress=progress
            )

        materialized_assets = _materialize_filepath_assets(
            plan, filepath_assets, staging_dir
        )
        write_media_asset_manifest(
            plan,
            os.path.join(staging_dir, MEDIA_ASSET_MANIFEST_FILENAME),
            materialized_roots=materialized_roots,
            materialized_assets=materialized_assets,
        )
        _publish_staging_dir(staging_dir, output_dir)
        published = True
    finally:
        if not published and os.path.isdir(staging_dir):
            shutil.rmtree(staging_dir)

    return plan


def write_media_asset_manifest(
    plan,
    path,
    materialized_roots=None,
    materialized_assets=None,
):
    """Writes a portable asset manifest without bound source roots."""
    if materialized_roots is None:
        materialized_roots = {}
    if materialized_assets is None:
        materialized_assets = {}

    value = plan.to_dict()
    for asset in value["assets"]:
        asset["materialized_path"] = materialized_assets.get(asset["key"])

    value["sources"] = [
        {
            **source.to_dict(),
            "relative_root": materialized_roots.get(source.key),
            "binding_required": source.key not in materialized_roots,
        }
        for source in plan.sources
    ]
    etas.write_json(value, path)


def materialize_reference_asset_plan(plan, export_root, progress=None):
    """Materializes a resolved reference plan into a portable source bundle."""
    if not plan.resolved:
        raise ValueError("A resolved media-asset plan is required")

    if any(asset.source_mode != "reference" for asset in plan.assets):
        raise UnsupportedMediaReferenceOperation(
            "Reference asset materialization cannot consume filepath assets"
        )

    source_roots = {
        source.key: posixpath.join("media_sources", source.key)
        for source in plan.sources
    }
    usages_by_asset = {}
    for usage in plan.usages:
        usages_by_asset.setdefault(usage.asset_key, []).append(usage)

    with fou.ProgressBar(
        total=len(plan.assets), progress=progress
    ) as progress_bar:
        for asset in progress_bar(plan.assets):
            if asset.source is None or asset.path is None:
                raise ValueError(
                    "Resolved reference assets require source paths"
                )

            relative_root = source_roots[asset.source.key]
            destination = os.path.join(
                export_root,
                relative_root,
                os.path.join(*asset.location.split("/")),
            )
            fos.ensure_basedir(destination)
            materializer = get_media_asset_materializer(asset.reference_kind)
            materializer.materialize_asset(
                asset,
                destination,
                tuple(usages_by_asset.get(asset.key, ())),
            )

    return source_roots


def load_media_asset_manifest(path):
    """Loads and validates a native media-asset manifest."""
    value = etas.read_json(path)
    if not isinstance(value, dict) or value.get("version") != "1":
        raise ValueError("Unsupported media-asset manifest")

    sources = value.get("sources")
    if not isinstance(sources, list):
        raise ValueError("Media-asset manifest sources must be a list")

    parsed = []
    for source in sources:
        if not isinstance(source, dict) or set(source) != {
            "kind",
            "source_identity",
            "source_fingerprint",
            "relative_root",
            "binding_required",
        }:
            raise ValueError("Malformed media-asset source descriptor")

        relative_root = source["relative_root"]
        if relative_root is not None:
            relative_root = _validate_relative_root(relative_root)

        binding_required = source["binding_required"]
        if not isinstance(binding_required, bool) or binding_required != (
            relative_root is None
        ):
            raise ValueError(
                "Media-asset source binding state is inconsistent"
            )

        parsed.append(
            (
                MediaSourceDescriptor(
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
        raise ValueError("Media-asset manifest contains duplicate sources")

    return tuple(parsed)


def validate_media_asset_manifest_sources(sample_collection, manifest_sources):
    """Validates that a native manifest describes the imported references."""
    plan = build_media_asset_plan(
        sample_collection,
        resolve=False,
        include_scene_assets=False,
    )
    expected_keys = {source.key for source in plan.sources}
    actual_keys = {source.key for source, _, _ in manifest_sources}
    if actual_keys != expected_keys:
        raise ValueError(
            "Media-asset manifest sources do not match the imported samples"
        )


def bind_materialized_media_sources(manifest_sources, dataset_dir):
    """Binds materialized sources from a native dataset import."""
    binding_required = []
    for source, relative_root, required in manifest_sources:
        if relative_root is None:
            if required:
                binding_required.append(source)
            continue

        root = os.path.realpath(
            os.path.join(dataset_dir, *relative_root.split("/"))
        )
        if os.path.commonpath(
            (os.path.realpath(dataset_dir), root)
        ) != os.path.realpath(dataset_dir):
            raise ValueError("Materialized media source escapes the dataset")

        if not os.path.isdir(root):
            raise ValueError(
                "Materialized media source '%s' is missing" % relative_root
            )

        materializer = get_media_asset_materializer(source.kind)
        if not materializer.is_source_bound(source):
            materializer.bind_source(source, root)

    return tuple(binding_required)


def _add_filepath_asset(
    assets,
    usages,
    scene_usages,
    sample,
    logical_identity,
    group_slice,
):
    path = fos.normalize_path(sample.filepath)
    key = _filepath_asset_key(path)
    assets.setdefault(
        key,
        PlannedMediaAsset(
            key=key,
            source_mode="filepath",
            location=path,
            path=path,
        ),
    )
    usage = MediaAssetUsage(
        sample_id=str(sample.id),
        logical_media_identity=logical_identity,
        asset_key=key,
        role=MediaAssetRole.PRIMARY_MEDIA,
        selector=WholeFile(),
        group_slice=group_slice,
    )
    usages.append(usage)
    if path.lower().endswith(".fo3d"):
        scene_usages.append((path, usage))


def _add_reference_assets(
    assets,
    usages,
    sources,
    sample,
    logical_identity,
    group_slice,
    resolve,
):
    reference = sample.media_reference
    kind = get_media_reference_kind(reference)
    materializer = get_media_asset_materializer(kind)
    source = materializer.describe_source(reference)
    sources.setdefault(source.key, source)
    descriptions = tuple(reference.describe_assets())
    resolved = None
    if resolve:
        manifest = get_media_resolver(reference).resolve_assets(
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
        key = get_shared_media_asset_key(reference, description)
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
        planned = PlannedMediaAsset(
            key=key,
            source_mode="reference",
            reference_kind=kind,
            source=source,
            location=location,
            path=(None if resolved_asset is None else resolved_asset.path),
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
            MediaAssetUsage(
                sample_id=str(sample.id),
                logical_media_identity=logical_identity,
                asset_key=key,
                role=description.role,
                selector=description.selector,
                group_slice=group_slice,
                feature_name=description.feature_name,
            )
        )


def _add_scene_assets(assets, usages, scene_usages):
    if not scene_usages:
        return

    scene_paths = list(OrderedDict.fromkeys(path for path, _ in scene_usages))
    asset_map = fou3d.get_scene_asset_paths(
        scene_paths, abs_paths=True, skip_failures=False
    )
    for scene_path, scene_usage in scene_usages:
        for path in asset_map.get(scene_path, ()):
            path = fos.normalize_path(path)
            key = _filepath_asset_key(path)
            assets.setdefault(
                key,
                PlannedMediaAsset(
                    key=key,
                    source_mode="filepath",
                    location=path,
                    path=path,
                ),
            )
            usages.append(
                MediaAssetUsage(
                    sample_id=scene_usage.sample_id,
                    logical_media_identity=(
                        scene_usage.logical_media_identity
                    ),
                    asset_key=key,
                    role=MediaAssetRole.SCENE_ASSET,
                    selector=WholeFile(),
                    group_slice=scene_usage.group_slice,
                )
            )


def _scan_media_sources(sample_collection, group_slices=None):
    source_modes = set()
    reference_kinds = set()
    sources = OrderedDict()
    if sample_collection.media_type == fom.GROUP:
        samples = sample_collection.select_group_slices(
            slices=group_slices, _allow_mixed=True
        )
    else:
        samples = sample_collection

    for sample in samples.iter_samples():
        if sample.filepath is not None:
            source_modes.add("filepath")
            continue

        source_modes.add("reference")
        reference = sample.media_reference
        kind = get_media_reference_kind(reference)
        reference_kinds.add(kind)
        try:
            source = get_media_asset_materializer(kind).describe_source(
                reference
            )
        except UnsupportedMediaReferenceOperation:
            continue

        sources.setdefault(source.key, source)

    return source_modes, reference_kinds, tuple(sources.values())


def _get_group_slice(sample, group_field):
    if group_field is None:
        return None

    group = sample.get_field(group_field)
    return None if group is None else group.name


def _filepath_asset_key(path):
    return hashlib.sha256(("filepath\0" + path).encode("utf-8")).hexdigest()


def _validate_relative_root(relative_root):
    try:
        return DatasetRelativeLocation(relative_root).path
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Materialized source root must be a canonical POSIX path"
        ) from exc


def _materialize_filepath_assets(plan, filepath_assets, staging_dir):
    if not filepath_assets:
        return {}

    import fiftyone.utils.data.exporters as foue

    assets_by_key = {asset.key: asset for asset in filepath_assets}
    primary_keys = list(
        OrderedDict.fromkeys(
            usage.asset_key
            for usage in plan.usages
            if usage.role is MediaAssetRole.PRIMARY_MEDIA
            and usage.asset_key in assets_by_key
        )
    )
    asset_keys = primary_keys + [
        asset.key for asset in filepath_assets if asset.key not in primary_keys
    ]
    media_exporter = foue.MediaExporter(
        True,
        export_path=os.path.join(staging_dir, "data"),
        supported_modes=(True,),
    )
    media_exporter.setup()
    materialized = {}
    try:
        for key in asset_keys:
            output_path, _ = media_exporter.export(assets_by_key[key].path)
            materialized[key] = os.path.relpath(
                output_path, staging_dir
            ).replace(os.sep, "/")
    finally:
        media_exporter.close()

    return materialized


def _validate_publish_destination(output_dir, overwrite):
    if not os.path.exists(output_dir):
        return

    if os.path.isdir(output_dir) and not os.listdir(output_dir):
        return

    if not overwrite:
        raise FileExistsError(
            "Media asset materialization requires an empty destination or "
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
