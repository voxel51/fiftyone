"""
FiftyOne Server camera endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Dict, List, Optional, Set

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone.core.camera as focam
import fiftyone.core.groups as fog
from fiftyone.server import utils
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset

_MAX_COLLECT_DEPTH = 4
_SerializedStaticTransform = Dict[str, object]

logger = logging.getLogger(__name__)


def _parse_transform_key(key: str):
    """Parses a transform key of form `source::target` or `source`."""
    if "::" in key:
        source_frame, target_frame = key.split("::", 1)
    else:
        source_frame = key
        target_frame = focam.DEFAULT_TRANSFORM_TARGET_FRAME

    return source_frame, target_frame


def _serialize_static_transform(
    transform: focam.StaticTransform,
    source_frame: Optional[str] = None,
    target_frame: Optional[str] = None,
) -> Optional[_SerializedStaticTransform]:
    """Serializes a static transform with normalized source/target frames."""
    serialized = utils.json.serialize(transform)
    normalized_source = serialized.get("source_frame") or source_frame
    if not normalized_source:
        return None

    normalized_target = (
        serialized.get("target_frame")
        or target_frame
        or focam.DEFAULT_TRANSFORM_TARGET_FRAME
    )
    serialized["source_frame"] = normalized_source
    serialized["target_frame"] = normalized_target
    return serialized


def _build_transform_dedupe_key(
    source_frame: str, target_frame: Optional[str] = None
) -> str:
    """Builds the frame-pair key used to dedupe repeated transforms."""
    normalized_target = target_frame or focam.DEFAULT_TRANSFORM_TARGET_FRAME
    return f"{source_frame}::{normalized_target}"


def _get_static_transform_dedupe_key(
    transform: focam.StaticTransform,
) -> Optional[str]:
    """Builds the frame-pair dedupe key for a transform object."""
    source_frame = transform.source_frame
    if not source_frame:
        return None

    return _build_transform_dedupe_key(
        source_frame,
        transform.target_frame or focam.DEFAULT_TRANSFORM_TARGET_FRAME,
    )


def _get_serialized_transform_dedupe_key(
    serialized_transform: _SerializedStaticTransform,
) -> Optional[str]:
    """Builds the frame-pair dedupe key for a serialized transform."""
    source_frame = serialized_transform.get("source_frame")
    if not isinstance(source_frame, str) or not source_frame:
        return None

    target_frame = serialized_transform.get("target_frame")
    if not isinstance(target_frame, str) or not target_frame:
        target_frame = focam.DEFAULT_TRANSFORM_TARGET_FRAME

    return _build_transform_dedupe_key(source_frame, target_frame)


def _serialized_transforms_have_dedupe_key(
    serialized_transforms: List[_SerializedStaticTransform], dedupe_key: str
) -> bool:
    """Whether serialized transforms already include the dedupe key."""
    for serialized in serialized_transforms:
        if _get_serialized_transform_dedupe_key(serialized) == dedupe_key:
            return True

    return False


def _collect_inline_transform_dedupe_keys_from_value(
    value, inline_transform_dedupe_keys: Set[str], _depth: int = 0
):
    """Collects frame-pair dedupe keys for inline sample transforms.

    Only direct :class:`fiftyone.core.camera.StaticTransform` values and
    list nesting are traversed here. Other container types are ignored so
    this helper stays aligned with the sample-field shapes that camera
    transform resolution already supports.
    """
    if isinstance(value, list):
        if _depth >= _MAX_COLLECT_DEPTH:
            return

        for item in value:
            _collect_inline_transform_dedupe_keys_from_value(
                item,
                inline_transform_dedupe_keys,
                _depth=_depth + 1,
            )
        return

    if isinstance(value, focam.StaticTransform):
        dedupe_key = _get_static_transform_dedupe_key(value)
        if dedupe_key is not None:
            inline_transform_dedupe_keys.add(dedupe_key)


def _collect_sample_static_transforms_from_value(
    value,
    dataset_transforms: Dict[str, focam.StaticTransform],
    serialized_transforms: List[_SerializedStaticTransform],
    inline_transform_dedupe_keys: Set[str],
    _depth: int = 0,
):
    """Collects serialized static transforms from a sample field value.

    Only direct transform values and list nesting are traversed here.
    Other container types are intentionally ignored rather than treated as
    arbitrary recursive structures.
    """
    if isinstance(value, list):
        if _depth >= _MAX_COLLECT_DEPTH:
            return

        for item in value:
            _collect_sample_static_transforms_from_value(
                item,
                dataset_transforms,
                serialized_transforms,
                inline_transform_dedupe_keys,
                _depth=_depth + 1,
            )
        return

    if isinstance(value, focam.StaticTransform):
        serialized = _serialize_static_transform(value)
        if serialized is not None:
            serialized_transforms.append(serialized)
        return

    if isinstance(value, focam.StaticTransformRef):
        source_frame, target_frame = _parse_transform_key(value.ref)
        ref_dedupe_key = _build_transform_dedupe_key(
            source_frame, target_frame
        )
        if ref_dedupe_key in inline_transform_dedupe_keys:
            return

        if _serialized_transforms_have_dedupe_key(
            serialized_transforms, ref_dedupe_key
        ):
            return

        ref_value = dataset_transforms.get(value.ref)
        if isinstance(ref_value, focam.StaticTransform):
            serialized = _serialize_static_transform(
                ref_value,
                source_frame=source_frame,
                target_frame=target_frame,
            )
            if serialized is not None:
                serialized_transforms.append(serialized)


def _list_resolved_sample_static_transforms(
    dataset, sample
) -> List[_SerializedStaticTransform]:
    """Lists static transforms for a sample."""
    dataset_transforms: Dict[str, focam.StaticTransform] = (
        dataset.static_transforms or {}
    )
    serialized_transforms: List[_SerializedStaticTransform] = []
    inline_transform_dedupe_keys: Set[str] = set()

    for _, value in sample.iter_fields():
        _collect_inline_transform_dedupe_keys_from_value(
            value, inline_transform_dedupe_keys
        )

    # We do two passes so that sample-attached StaticTransform values win
    # over StaticTransformRef values regardless of field-order
    for _, value in sample.iter_fields():
        _collect_sample_static_transforms_from_value(
            value,
            dataset_transforms,
            serialized_transforms,
            inline_transform_dedupe_keys,
        )

    slice_name = fog.get_group_slice_name(sample, dataset.group_field)
    if slice_name:
        for key, transform in dataset_transforms.items():
            if not isinstance(transform, focam.StaticTransform):
                continue

            source_frame, target_frame = _parse_transform_key(key)
            if source_frame != slice_name:
                continue

            serialized = _serialize_static_transform(
                transform,
                source_frame=source_frame,
                target_frame=target_frame,
            )
            if serialized is not None:
                serialized_transforms.append(serialized)

    # Sample-level transforms are collected first, so they take
    # precedence over dataset-level ones during dedup.
    deduped_transforms: Dict[str, _SerializedStaticTransform] = {}
    for serialized in serialized_transforms:
        dedupe_key = _get_serialized_transform_dedupe_key(serialized)
        if dedupe_key is None:
            continue

        if dedupe_key in deduped_transforms:
            continue

        deduped_transforms[dedupe_key] = serialized

    return sorted(
        deduped_transforms.values(),
        key=lambda transform: (
            transform.get("source_frame") or "",
            transform.get("target_frame")
            or focam.DEFAULT_TRANSFORM_TARGET_FRAME,
        ),
    )


class CameraIntrinsics(HTTPEndpoint):
    """Camera intrinsics endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera intrinsics for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params

        Returns:
            JSON response containing the intrinsics data, or null if not found
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.debug(
            "Received GET request for camera intrinsics for sample %s in dataset %s",
            sample_id,
            dataset_id,
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        intrinsics = dataset.resolve_intrinsics(sample)

        if intrinsics is None:
            return utils.json.JSONResponse({"intrinsics": None})

        return utils.json.JSONResponse(
            {"intrinsics": utils.json.serialize(intrinsics)}
        )


class StaticTransforms(HTTPEndpoint):
    """Resolved sample static transforms endpoint."""

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves static transforms for a sample.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params

        Returns:
            JSON response containing ``{"transforms": [...]}``
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        logger.debug(
            "Received GET request for static transforms for sample %s in dataset %s",
            sample_id,
            dataset_id,
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        transforms = _list_resolved_sample_static_transforms(dataset, sample)
        return utils.json.JSONResponse({"transforms": transforms})


def _parse_transform_params(
    request: Request, default_target_frame: str = "world"
):
    """Parses transform-related query params.

    Args:
        request: Starlette request
        default_target_frame: Default value for target_frame if not provided

    Returns:
        Tuple of (source_frame, target_frame, chain_via)
    """
    source_frame = request.query_params.get("source_frame")
    target_frame = request.query_params.get(
        "target_frame", default_target_frame
    )
    chain_via_param = request.query_params.get("chain_via")

    chain_via: Optional[List[str]] = None
    if chain_via_param:
        chain_via = [
            f.strip() for f in chain_via_param.split(",") if f.strip()
        ]

    return source_frame, target_frame, chain_via


def _parse_slices(request: Request) -> List[str]:
    """Parses optional slices from query params.

    Args:
        request: Starlette request

    Returns:
        List of slice names, or empty list if not provided
    """
    slices_param = request.query_params.get("slices")
    if slices_param:
        return [s.strip() for s in slices_param.split(",") if s.strip()]
    return []


def _get_group_info(dataset, sample, sample_id: str):
    """Gets group info from a sample, validating it belongs to a group.

    Args:
        dataset: The dataset the sample belongs to
        sample: The sample to get group info from
        sample_id: The sample ID (for error messages)

    Raises:
        HTTPException: If sample does not belong to a group

    Returns:
        The group info object
    """
    group_info = None
    group_field = dataset.group_field

    if group_field is not None:
        group_info = getattr(sample, group_field, None)

    if group_info is None:
        raise HTTPException(
            status_code=400,
            detail=f"Sample '{sample_id}' does not belong to a group",
        )

    return group_info


def _get_group_slices(dataset, slices: List[str]) -> List[str]:
    """Gets the list of slices to query for a group.

    Args:
        dataset: The dataset
        slices: User-provided slices (may be empty)

    Raises:
        HTTPException: If no slices available

    Returns:
        List of slice names to query
    """
    if slices:
        return slices

    available_slices = dataset.group_slices or []
    if not available_slices:
        raise HTTPException(
            status_code=400,
            detail="No slices available for this group",
        )

    return available_slices


def _get_slice_sample(dataset, group_id: str, slice_name: str):
    """Gets a sample for a specific slice in a group.

    Args:
        dataset: The dataset
        group_id: The group ID
        slice_name: The slice name

    Returns:
        Tuple of (slice_sample, error_dict). If successful, error_dict is None.
        If failed, slice_sample is None and error_dict contains the error.
    """
    try:
        group_samples = dataset.get_group(group_id, group_slices=[slice_name])
        slice_sample = group_samples.get(slice_name)
    except KeyError:
        return None, {"error": f"Slice '{slice_name}' not found in group"}

    if slice_sample is None:
        return None, {"error": f"Slice '{slice_name}' not found in group"}

    return slice_sample, None


def _find_best_target_frame(dataset, slices: List[str]) -> Optional[str]:
    """Finds the target frame with the most coverage across slices.

    Scans dataset.static_transforms to find which target_frame has
    transforms defined for the most slices.

    Args:
        dataset: The dataset
        slices: List of slice names to check coverage for

    Returns:
        The target frame with most coverage, or None if no transforms found
    """
    static_transforms = dataset.static_transforms or {}
    if not static_transforms:
        return None

    # Count coverage for each target frame
    target_counts = {}  # target_frame -> set of slices that have it

    for key in static_transforms.keys():
        # Parse key to get source and target
        if "::" in key:
            source, target = key.split("::", 1)
        else:
            source = key
            target = "world"

        # Only count if source matches one of our slices
        if source in slices:
            if target not in target_counts:
                target_counts[target] = set()
            target_counts[target].add(source)

    if not target_counts:
        return None

    # Find target with most coverage
    best_target = max(
        target_counts.keys(), key=lambda t: len(target_counts[t])
    )
    return best_target


def _has_successful_static_transform(results: dict) -> bool:
    """Checks if any result has non-null staticTransform.

    Args:
        results: Dict mapping slice names to result dicts

    Returns:
        True if at least one result has valid staticTransform
    """
    for result in results.values():
        if result.get("staticTransform") is not None:
            return True
    return False


def _collect_static_transforms(
    dataset,
    group_id: str,
    slices: List[str],
    source_frame: str,
    target_frame: str,
    chain_via: Optional[List[str]],
) -> dict:
    """Collects static transforms for all slices in a group.

    Args:
        dataset: The FiftyOne dataset
        group_id: The group ID to fetch transforms for
        slices: List of slice names to collect transforms from
        source_frame: The source coordinate frame
        target_frame: The target coordinate frame
        chain_via: Optional list of intermediate frames for chaining transforms

    Returns:
        Dict mapping slice names to result dicts containing either
        staticTransform data, null, or error message
    """
    results = {}
    for slice_name in slices:
        slice_sample, error = _get_slice_sample(dataset, group_id, slice_name)
        if error:
            results[slice_name] = error
            continue

        try:
            transform = dataset.resolve_transformation(
                slice_sample,
                source_frame=source_frame,
                target_frame=target_frame,
                chain_via=chain_via,
            )
        except ValueError as err:
            results[slice_name] = {"error": str(err)}
            continue

        if transform is None:
            results[slice_name] = {"staticTransform": None}
        else:
            results[slice_name] = {
                "staticTransform": utils.json.serialize(transform)
            }

    return results


class GroupIntrinsics(HTTPEndpoint):
    """Group camera intrinsics endpoint.

    Retrieves intrinsics for multiple slices belonging to a group.
    """

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves camera intrinsics for slices in a sample's group.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional slices query param

        Returns:
            JSON response containing results dict mapping slice name to
            intrinsics data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        group_info = _get_group_info(dataset, sample, sample_id)
        group_id = group_info.id
        slices = _get_group_slices(dataset, _parse_slices(request))

        logger.debug(
            "Received GET request for group camera intrinsics for sample %s "
            "in dataset %s (group_id=%s, slices=%s)",
            sample_id,
            dataset_id,
            group_id,
            slices,
        )

        results = {}
        for slice_name in slices:
            slice_sample, error = _get_slice_sample(
                dataset, group_id, slice_name
            )
            if error:
                results[slice_name] = error
                continue

            intrinsics = dataset.resolve_intrinsics(slice_sample)

            if intrinsics is None:
                results[slice_name] = {"intrinsics": None}
            else:
                results[slice_name] = {
                    "intrinsics": utils.json.serialize(intrinsics)
                }

        return utils.json.JSONResponse(
            {"group_id": group_id, "results": results}
        )


class GroupStaticTransforms(HTTPEndpoint):
    """Group static transforms endpoint.

    Retrieves static transforms for multiple slices belonging to a group.
    """

    async def get(self, request: Request) -> JSONResponse:
        """Retrieves static transforms for slices in a sample's group.

        Args:
            request: Starlette request with dataset_id and sample_id in path
                params, and optional slices, source_frame, target_frame,
                chain_via query params

        Returns:
            JSON response containing results dict mapping slice name to
            staticTransform data, null, or error message
        """
        dataset_id = request.path_params["dataset_id"]
        sample_id = request.path_params["sample_id"]
        source_frame, target_frame, chain_via = _parse_transform_params(
            request
        )

        dataset = get_dataset(dataset_id)
        sample = get_sample_from_dataset(dataset, sample_id)

        group_info = _get_group_info(dataset, sample, sample_id)
        group_id = group_info.id
        slices = _get_group_slices(dataset, _parse_slices(request))

        logger.debug(
            "Received GET request for group static transforms for sample %s "
            "in dataset %s (group_id=%s, slices=%s, source_frame=%s, "
            "target_frame=%s, chain_via=%s)",
            sample_id,
            dataset_id,
            group_id,
            slices,
            source_frame,
            target_frame,
            chain_via,
        )

        results = _collect_static_transforms(
            dataset, group_id, slices, source_frame, target_frame, chain_via
        )

        # If no successful transforms found and target_frame was defaulted,
        # try to find the best available target
        if not _has_successful_static_transform(results):
            # Check if target_frame was explicitly provided in request
            explicit_target = request.query_params.get("target_frame")

            if explicit_target is None:
                # target_frame was defaulted - try to find best available
                best_target = _find_best_target_frame(dataset, slices)

                if best_target is not None and best_target != "world":
                    logger.debug(
                        "No transforms found with target_frame='world', "
                        "retrying with best available target_frame='%s'",
                        best_target,
                    )
                    target_frame = best_target

                    # Re-collect results with new target_frame
                    results = _collect_static_transforms(
                        dataset,
                        group_id,
                        slices,
                        source_frame,
                        target_frame,
                        chain_via,
                    )

        return utils.json.JSONResponse(
            {
                "group_id": group_id,
                "target_frame": target_frame,
                "results": results,
            }
        )


CameraRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/intrinsics",
        CameraIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/static_transforms",
        StaticTransforms,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/group/intrinsics",
        GroupIntrinsics,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/group/static_transforms",
        GroupStaticTransforms,
    ),
]
