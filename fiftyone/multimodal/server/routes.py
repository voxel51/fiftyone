"""
Multimodal server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.multimodal.tags as fomt
import fiftyone.multimodal.tags._temporal_tags as fota
from fiftyone.multimodal.query import (
    resolve_playback_plan,
    resolve_scene_inventory,
)
from fiftyone.server import decorators
from fiftyone.server.utils.datasets import get_dataset

PROTOBUF_MEDIA_TYPE = "application/x-protobuf"


class SceneInventoryEndpoint(HTTPEndpoint):
    """Scene inventory query endpoint."""

    @decorators.route
    async def get(self, request: Request) -> Response:
        """Returns a serialized SceneInventory protobuf."""

        dataset_id = _get_required_path_param(request, "dataset_id")
        sample_id = _get_required_path_param(request, "sample_id")

        inventory = resolve_scene_inventory(dataset_id, sample_id)

        return Response(
            inventory.SerializeToString(),
            media_type=PROTOBUF_MEDIA_TYPE,
        )


class PlaybackPlanEndpoint(HTTPEndpoint):
    """Playback plan query endpoint."""

    @decorators.route
    async def get(self, request: Request) -> Response:
        """Returns a serialized PlaybackPlan protobuf."""

        inventory_id = _get_required_path_param(request, "inventory_id")

        plan = resolve_playback_plan(inventory_id)

        return Response(
            plan.SerializeToString(),
            media_type=PROTOBUF_MEDIA_TYPE,
        )


class SampleTagsEndpoint(HTTPEndpoint):
    """Sample tag collection endpoint."""

    @decorators.route
    async def get(self, request: Request) -> dict:
        """Lists tags for the sample."""

        sample_id = _get_required_path_param(request, "sample_id")
        return _list_tags(request, sample_id=sample_id)

    @decorators.route
    async def post(self, request: Request, data: dict) -> dict:
        """Creates one or more tags for the sample."""

        dataset = _get_dataset_from_request(request)
        sample_id = _get_required_path_param(request, "sample_id")
        tags = _temporal_tags_from_create_payload(data, sample_id=sample_id)

        return {
            "tags": [
                _serialize_temporal_tag(tag)
                for tag in _handle_temporal_tag_errors(
                    lambda: fomt.add_temporal_tags(dataset, tags)
                )
            ]
        }

    @decorators.route(parse_body=True)  # pyright: ignore[reportCallIssue]
    async def delete(self, request: Request, data: dict) -> dict:
        """Deletes tags for the sample."""

        dataset = _get_dataset_from_request(request)
        sample_id = _get_required_path_param(request, "sample_id")
        delete_request = _delete_request_from_payload(
            data, sample_id=sample_id
        )

        return {
            "deleted": _handle_temporal_tag_errors(
                lambda: fomt.delete_temporal_tags(
                    dataset,
                    ids=delete_request["ids"],
                    tags=delete_request["tags"],
                    filter=delete_request["filter"],
                    delete_all=delete_request["delete_all"],
                )
            )
        }


class SampleTagEndpoint(HTTPEndpoint):
    """Sample tag item endpoint."""

    @decorators.route
    async def patch(self, request: Request, data: dict) -> dict:
        """Updates a tag for the sample."""

        dataset = _get_dataset_from_request(request)
        sample_id = _get_required_path_param(request, "sample_id")
        tag_id = _get_required_path_param(request, "tag_id")
        update = _tag_update_from_payload(
            data,
            sample_id=sample_id,
            tag_id=tag_id,
        )

        return {
            "tag": _serialize_temporal_tag(
                _handle_temporal_tag_errors(
                    lambda: fota.update_temporal_tag(
                        dataset.select([sample_id]),
                        tag_id,
                        start=update["start"],
                        end=update["end"],
                        tag=update["tag"],
                        last_modified_by=update["last_modified_by"],
                    )
                )
            )
        }


class TagsEndpoint(HTTPEndpoint):
    """Dataset tags read endpoint."""

    @decorators.route
    async def get(self, request: Request) -> dict:
        """Lists tags for the dataset."""

        return _list_tags(request)


class TagCountsEndpoint(HTTPEndpoint):
    """Tag count endpoint."""

    @decorators.route
    async def get(self, request: Request) -> dict:
        """Counts tag values for the dataset."""

        dataset = _get_dataset_from_request(request)
        tag_filter = _temporal_tag_filter_from_query(request)

        return {
            "counts": _handle_temporal_tag_errors(
                lambda: fomt.count_temporal_tags(dataset, filter=tag_filter)
            )
        }


def _list_tags(request: Request, sample_id: str | None = None) -> dict:
    dataset = _get_dataset_from_request(request)
    tag_filter = _temporal_tag_filter_from_query(request, sample_id=sample_id)

    return {
        "tags": [
            _serialize_temporal_tag(tag)
            for tag in _handle_temporal_tag_errors(
                lambda: fomt.list_temporal_tags(dataset, filter=tag_filter)
            )
        ]
    }


def _get_dataset_from_request(request: Request):
    dataset_id = _get_required_path_param(request, "dataset_id")

    return get_dataset(dataset_id)


def _temporal_tags_from_create_payload(
    data, sample_id: str
) -> list[fomt.TemporalTag]:
    _require_dict(data, "request body")

    records = data.get("temporal_tags", None)
    if records is None:
        records = data.get("tags", None)

    if records is None:
        records = data

    if isinstance(records, dict):
        records = [records]

    if not isinstance(records, list) or not records:
        raise HTTPException(
            status_code=400,
            detail="'tags' must contain at least one tag",
        )

    tags = []
    for record in records:
        _require_dict(record, "temporal tag")
        _reject_temporal_tag_timestamps(record)
        record_sample_id = record.get("sample_id", None)
        _ensure_matching_sample_id(record_sample_id, sample_id)

        tags.append(
            fomt.TemporalTag(
                sample_id=sample_id,
                start=record.get("start", None),
                end=record.get("end", None),
                tag=record.get("tag", None),
                index_type=record.get("index_type", fomt.DEFAULT_INDEX_TYPE),
                anchor=record.get("anchor", None),
                kind=record.get("kind", None),
                created_by=record.get("created_by", None),
                last_modified_by=record.get("last_modified_by", None),
            )
        )

    return tags


def _delete_request_from_payload(data, sample_id: str) -> dict:
    _require_dict(data, "request body")

    # Route deletes are always scoped by the path sample. Callers can delete by
    # id/tag/filter, or opt into deleting all tags for that sample via
    # `delete_all`; dataset-wide deletes remain SDK-only.
    delete_all = data.get("delete_all", False)
    if not isinstance(delete_all, bool):
        raise HTTPException(
            status_code=400,
            detail="'delete_all' must be a boolean",
        )

    ids = _first_present(data, "ids", "id")
    tags = _first_present(data, "tags", "tag")
    filter_payload = data.get("filter", None)

    if filter_payload is None:
        tag_filter = fomt.TemporalTagFilter(sample_ids=sample_id)
        has_filter_selector = False
    else:
        _require_dict(filter_payload, "filter")
        requested_sample_ids = _first_present(
            filter_payload, "sample_ids", "sample_id"
        )
        _ensure_matching_sample_id(requested_sample_ids, sample_id)

        tag_filter = fomt.TemporalTagFilter(
            sample_ids=sample_id,
            tags=_first_present(filter_payload, "tags", "tag"),
            anchors=_first_present(filter_payload, "anchors", "anchor"),
            index_type=filter_payload.get("index_type", None),
            start=filter_payload.get("start", None),
            end=filter_payload.get("end", None),
        )
        # The path sample scopes every delete, but should not count as a
        # selector by itself; otherwise an empty request could delete the whole
        # sample unless the caller opted into delete_all.
        has_filter_selector = any(
            field in filter_payload
            for field in (
                "tags",
                "tag",
                "anchors",
                "anchor",
                "index_type",
                "start",
                "end",
            )
        )

    has_selector = ids is not None or tags is not None or has_filter_selector
    if not has_selector and not delete_all:
        raise HTTPException(
            status_code=400,
            detail=(
                "Refusing to delete tags with an empty selector; pass "
                "delete_all=True to delete all tags for the sample"
            ),
        )

    return {
        "ids": ids,
        "tags": tags,
        "filter": tag_filter,
        "delete_all": delete_all,
    }


def _tag_update_from_payload(data, *, sample_id: str, tag_id: str) -> dict:
    _require_dict(data, "request body")
    _reject_temporal_tag_update_fields(data)
    _ensure_matching_sample_id(data.get("sample_id", None), sample_id)
    _ensure_matching_tag_id(data.get("id", None), tag_id)

    update = {
        "start": data.get("start", None),
        "end": data.get("end", None),
        "tag": data.get("tag", None),
        "last_modified_by": data.get("last_modified_by", None),
    }
    if all(value is None for value in update.values()):
        raise HTTPException(
            status_code=400,
            detail=(
                "Tag update must include start, end, tag, or last_modified_by"
            ),
        )

    return update


def _temporal_tag_filter_from_query(
    request: Request, sample_id: str | None = None
) -> fomt.TemporalTagFilter:
    params = request.query_params
    sample_ids = _query_values(params, "sample_ids", "sample_id")
    if sample_id is None:
        if sample_ids is not None:
            raise HTTPException(
                status_code=400,
                detail=("'sample_id' is only supported in sample tag routes"),
            )
    else:
        _ensure_matching_sample_id(sample_ids, sample_id)
        sample_ids = sample_id

    return fomt.TemporalTagFilter(
        sample_ids=sample_ids,
        tags=_query_values(params, "tags", "tag"),
        anchors=_query_values(params, "anchors", "anchor"),
        index_type=_optional_query_int(params, "index_type"),
        start=_optional_query_int(params, "start"),
        end=_optional_query_int(params, "end"),
    )


def _serialize_temporal_tag(tag: fomt.TemporalTag) -> dict:
    return tag.to_dict()


def _handle_temporal_tag_errors(callback):
    try:
        return callback()
    except fota.TemporalTagNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _get_required_path_param(request: Request, field: str) -> str:
    value = request.path_params.get(field)

    return _require_string(value, field)


def _require_string(value, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' is required",
        )

    return value


def _first_present(data: dict, *fields):
    for field in fields:
        if field in data:
            return data[field]

    return None


def _query_values(params, *fields):
    values = []

    for field in fields:
        if hasattr(params, "getlist"):
            field_values = params.getlist(field)
        else:
            value = params.get(field, None)
            field_values = [] if value is None else [value]

        for value in field_values:
            if isinstance(value, (list, tuple)):
                values.extend(value)
            elif isinstance(value, str):
                values.extend(part for part in value.split(","))
            else:
                values.append(value)

    return values or None


def _ensure_matching_sample_id(value, sample_id: str) -> None:
    if value is None:
        return

    values = value if isinstance(value, (list, tuple)) else [value]
    if any(str(_value) != sample_id for _value in values):
        raise HTTPException(
            status_code=400,
            detail="'sample_id' must match the path sample_id",
        )


def _ensure_matching_tag_id(value, tag_id: str) -> None:
    if value is None:
        return

    if str(value) != tag_id:
        raise HTTPException(
            status_code=400,
            detail="'id' must match the path tag_id",
        )


def _optional_query_int(params, field: str) -> int | None:
    value = params.get(field, None)
    if value is None or value == "":
        return None

    try:
        return int(value)
    except (TypeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' must be an integer",
        ) from e


def _require_dict(value, field: str) -> None:
    if not isinstance(value, dict):
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' must be an object",
        )


def _reject_temporal_tag_timestamps(record: dict) -> None:
    # Timestamps are system-managed in route CRUD. SDK/import callers can
    # preserve provenance explicitly when they need to migrate existing records.
    fields = {"created_at", "last_modified_at"} & set(record)
    if fields:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tag {', '.join(sorted(fields))} {'is' if len(fields) == 1 else 'are'} response-only"
            ),
        )


def _reject_temporal_tag_update_fields(record: dict) -> None:
    fields = {
        "anchor",
        "created_at",
        "created_by",
        "index_type",
        "last_modified_at",
    } & set(record)
    if fields:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tag {', '.join(sorted(fields))} {'is' if len(fields) == 1 else 'are'} not mutable through this route"
            ),
        )


MultimodalRoutes = [
    # Update one tag scoped by sample.
    (
        "/dataset/{dataset_id}/sample/{sample_id}/tags/{tag_id}",
        SampleTagEndpoint,
    ),
    # Create, list, and delete tags for one sample.
    (
        "/dataset/{dataset_id}/sample/{sample_id}/tags",
        SampleTagsEndpoint,
    ),
    # Count tag values across a dataset.
    (
        "/dataset/{dataset_id}/tags/counts",
        TagCountsEndpoint,
    ),
    # List tags across a dataset.
    (
        "/dataset/{dataset_id}/tags",
        TagsEndpoint,
    ),
    # Resolve playback timing for a scene inventory.
    (
        "/multimodal/playback-plan/{inventory_id}",
        PlaybackPlanEndpoint,
    ),
    # Resolve multimodal scene inventory for one sample.
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/scene-inventory",
        SceneInventoryEndpoint,
    ),
]
