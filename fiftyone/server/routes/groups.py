"""
FiftyOne Server groups endpoints.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.core.odm.utils as fou
from fiftyone.server import utils

logger = logging.getLogger(__name__)


def _normalize_sample_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalizes sample data by converting _id to id.

    Args:
        data: The dictionary to normalize

    Returns:
        A normalized dictionary with id field
    """
    result = data.copy()
    # Convert _id to id
    if "_id" in result:
        _id_value = result.get("_id")
        if isinstance(_id_value, dict) and "$oid" in _id_value:
            result["id"] = _id_value["$oid"]
        else:
            result["id"] = str(_id_value) if _id_value is not None else None
        del result["_id"]
    elif "id" not in result:
        result["id"] = None
    return result


def _filter_dict_by_fields(
    data: Dict[str, Any], fields: Optional[List[str]]
) -> Dict[str, Any]:
    """Filters a dictionary to include only the specified fields.

    Supports nested fields using dot notation (e.g., "metadata.width").
    Always includes 'id' (converted from '_id' if needed).
    Returns null for missing fields (optimistic approach).

    Args:
        data: The dictionary to filter
        fields: Optional list of field paths
        (e.g., ["filepath", "metadata.width"])

    Returns:
        A filtered dictionary containing only the requested fields plus 'id'
    """
    normalized = _normalize_sample_data(data)

    if not fields:
        return normalized

    field_set = set(fields)

    # Track parent fields that need to be included for nested fields
    parent_fields = set()
    for field in fields:
        parts = field.split(".")
        for i in range(1, len(parts)):
            parent_fields.add(".".join(parts[:i]))

    def _should_include_field(field_path: str) -> bool:
        """Checks if a field should be included based on the field list."""
        # Always include id and filepath
        if field_path in ("id", "filepath"):
            return True

        # Include if explicitly requested
        if field_path in field_set:
            return True

        # Include if it's a parent of a requested field
        if field_path in parent_fields:
            return True

        # Include if this field is a parent of any requested field
        for requested_field in field_set:
            if requested_field.startswith(field_path + "."):
                return True

        return False

    def _set_nested_value(obj: Dict[str, Any], path: str, value: Any) -> None:
        """Sets a nested value in a dict, creating intermediate dicts if needed."""
        parts = path.split(".")
        current = obj
        for part in parts[:-1]:
            if part not in current or not isinstance(current[part], dict):
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value

    def _filter_dict_recursive(obj: Any, prefix: str = "") -> Any:
        """Recursively filters a dictionary with optimistic field inclusion."""
        if isinstance(obj, dict):
            filtered = {}

            # First, include fields that exist and should be included
            for key, value in obj.items():
                field_path = f"{prefix}.{key}" if prefix else key
                if _should_include_field(field_path):
                    filtered[key] = _filter_dict_recursive(value, field_path)

            # Optimistically include requested top-level fields that don't exist
            if not prefix:
                for requested_field in field_set:
                    if "." not in requested_field:  # Top-level field
                        if requested_field not in filtered:
                            filtered[requested_field] = None
                    else:  # Nested field
                        parent = requested_field.split(".")[0]
                        if parent not in filtered:
                            # Check if parent exists in original data
                            if parent in obj:
                                filtered[parent] = _filter_dict_recursive(
                                    obj[parent], parent
                                )
                            else:
                                # Create nested structure with None at the end
                                filtered[parent] = {}
                                remaining = ".".join(
                                    requested_field.split(".")[1:]
                                )
                                _set_nested_value(
                                    filtered[parent], remaining, None
                                )

            return filtered
        elif isinstance(obj, list):
            return [_filter_dict_recursive(item, prefix) for item in obj]
        else:
            return obj

    filtered = _filter_dict_recursive(normalized)

    return filtered


def _extract_urls(data: Dict[str, Any], prefix: str = "") -> Dict[str, str]:
    """Extracts filepath field from a dictionary and returns it keyed by field path.

    Args:
        data: The dictionary to extract filepath from
        prefix: The prefix for the field path

    Returns:
        A dictionary mapping field path to filepath value
    """
    filepath = data.get("filepath")
    if not isinstance(filepath, str):
        return {}

    field_path = f"{prefix}.filepath" if prefix else "filepath"
    return {field_path: filepath}


def get_group(
    dataset_id: str,
    group_id: str,
    slice_name: Optional[str] = None,
) -> Dict[str, fo.Sample]:
    """Retrieves a group from a dataset.

    Args:
        dataset_id: The ID of the dataset
        group_id: The ID of the group
        slice_name: Optional slice name to filter to a single slice

    Raises:
        HTTPException: If the dataset or group is not found

    Returns:
        A dictionary mapping slice names to Sample objects
    """
    try:
        dataset = fou.load_dataset(id=dataset_id)
    except ValueError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Dataset '{dataset_id}' not found",
        ) from err

    if dataset.media_type != fom.GROUP:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset '{dataset_id}' is not a grouped dataset",
        )

    try:
        # First get the group without filtering to check if it exists
        group = dataset.get_group(group_id, group_slices=None)
    except KeyError as err:
        raise HTTPException(
            status_code=404,
            detail=f"Group '{group_id}' not found in dataset '{dataset_id}'",
        ) from err

    # Check if the requested slice exists
    if slice_name and slice_name not in group:
        raise HTTPException(
            status_code=404,
            detail=f"Slice '{slice_name}' not found in group '{group_id}'",
        )

    # Filter to specific slice if requested
    if slice_name:
        group = {slice_name: group[slice_name]}

    return group


class Groups(HTTPEndpoint):
    """Groups endpoints."""

    async def get(self, request: Request) -> Dict[str, Any]:
        """Retrieves a group and its slices.

        Args:
            request: Starlette request with dataset_id and group_id in path
                params, and optional slice in path params

        Returns:
            A dictionary containing the group data
        """
        dataset_id = request.path_params["dataset_id"]
        group_id = request.path_params["group_id"]
        slice_name = request.path_params.get("slice")

        logger.debug(
            "Received GET request for group %s in dataset %s%s",
            group_id,
            dataset_id,
            f" (slice: {slice_name})" if slice_name else "",
        )

        fields_param = request.query_params.get("fields")
        fields = (
            {f.strip() for f in fields_param.split(",") if f.strip()}
            if fields_param
            else None
        )

        media_type_param = request.query_params.get("media_type")
        media_types = (
            [m.strip() for m in media_type_param.split(",") if m.strip()]
            if media_type_param
            else None
        )

        resolve_urls = (
            request.query_params.get("resolve_urls", "false").lower() == "true"
        )

        group = get_group(dataset_id, group_id, slice_name)

        # Filter by media type if requested
        if media_types:
            filtered_group = {}
            for slice_name_key, sample in group.items():
                if sample.media_type in media_types:
                    filtered_group[slice_name_key] = sample
            group = filtered_group

            # If filtering resulted in empty group, raise 404
            if not group:
                media_types_str = ",".join(media_types)
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"No slices found with media_type '{media_types_str}' "
                        f"in group '{group_id}'"
                    ),
                )

        # Serialize samples
        serialized_group = {}
        for slice_name_key, sample in group.items():
            serialized_sample = utils.json.serialize(sample)
            serialized_group[slice_name_key] = serialized_sample

        # Always filter fields to ensure id is present and
        # created_at/last_modified_at are excluded
        filtered_group = {}
        for slice_name_key, sample_data in serialized_group.items():
            filtered_group[slice_name_key] = _filter_dict_by_fields(
                sample_data, fields
            )
        serialized_group = filtered_group

        # Extract urls if requested
        urls = {}
        if resolve_urls:
            for slice_name_key, sample_data in serialized_group.items():
                slice_urls = _extract_urls(sample_data)
                for field_path, url in slice_urls.items():
                    full_path = (
                        f"{slice_name_key}.{field_path}"
                        if len(serialized_group) > 1
                        else field_path
                    )
                    urls[full_path] = url

        response_data = {"group": serialized_group}
        if urls:
            response_data["urls"] = urls

        # If filepath wasn't explicitly requested, remove it from the response
        if fields and "filepath" not in fields:
            for slice_name_key, sample_data in serialized_group.items():
                del sample_data["filepath"]

        return utils.json.JSONResponse(response_data)


GroupsRoutes = [
    ("/dataset/{dataset_id}/groups/{group_id}", Groups),
    ("/dataset/{dataset_id}/groups/{group_id}/slices/{slice}", Groups),
]
