"""
FiftyOne Server dynamic group endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
import datetime
import logging
from typing import List, Optional, Tuple

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.server.view as fosv
from fiftyone.server import decorators, utils
from fiftyone.server.exceptions import DbVersionMismatchError
from fiftyone.server.routes.sample import (
    _handle_top_level_patch,
    datetimes_match,
    save_sample,
)
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset
from fiftyone.server.utils.json.encoder import JSONResponse

logger = logging.getLogger(__name__)


def parse_group_token(
    request: Request,
) -> Optional[Tuple[datetime.datetime, int]]:
    """Parses the ``If-Match`` group version token from the request.

    The token is ``"<max last_modified_at ISO>|<member count>"``, optionally
    base64-encoded. The two components pin the group's state: any member
    write bumps the max, and membership changes move the count.

    Args:
        request: The request

    Raises:
        HTTPException: If an ``If-Match`` header is present but unparseable

    Returns:
        A ``(max_last_modified_at, member_count)`` tuple, or ``None`` if the
        header is absent
    """
    header = request.headers.get("If-Match")
    if not header:
        return None

    value, _ = utils.http.ETag.parse(header)

    raw = value
    try:
        raw = base64.b64decode(value.encode("utf-8")).decode("utf-8")
    except Exception:
        pass

    try:
        iso, count = raw.rsplit("|", 1)
        return datetime.datetime.fromisoformat(iso), int(count)
    except Exception as err:
        raise HTTPException(
            status_code=400, detail="Invalid If-Match header"
        ) from err


def generate_group_etag(
    max_last_modified_at: datetime.datetime, count: int
) -> str:
    """Generates the group ETag for the given group state.

    Args:
        max_last_modified_at: The max ``last_modified_at`` across the group's
            members
        count: The number of members in the group

    Returns:
        The ETag
    """
    value = base64.b64encode(
        f"{max_last_modified_at.isoformat()}|{count}".encode("utf-8")
    ).decode("utf-8")

    return utils.http.ETag.create(value)


def get_group_state(view) -> Tuple[List[str], List[datetime.datetime]]:
    """Reads the member ids and ``last_modified_at`` values of a dynamic
    group view.

    Args:
        view: The dynamic group's member view

    Raises:
        HTTPException: If the group has no members

    Returns:
        A ``(member_ids, last_modified_ats)`` tuple
    """
    member_ids, lmts = view.values(["id", "last_modified_at"])
    if not member_ids:
        raise HTTPException(status_code=404, detail="Dynamic group is empty")

    return member_ids, lmts


class DynamicGroup(HTTPEndpoint):
    """Dynamic group endpoints."""

    @decorators.route
    async def patch(self, request: Request, data: dict) -> JSONResponse:
        """Applies JSON-patch deltas to members of a dynamic group under a
        single group version token.

        The group — not each member — is the concurrency container: the
        ``If-Match`` token pins the whole group's state, mirroring a video
        sample's single-ETag semantics. Members are written sequentially with
        per-member compare-and-swap; a swap that loses a race fails the whole
        request with a 412 carrying a fresh group token, and the client
        re-applies against refreshed state (the deltas are id-aligned, so a
        retry after a partial write converges).

        Args:
            request: Starlette request with ``dataset_id`` in path params
            data: ``{dynamicGroup, view, patches: [{sampleId, patch}]}`` —
                the dynamic group value, the serialized view stages that
                define the grouping, and the per-member JSON-patch lists

        Returns:
            The final state of the patched samples, with the new group token
            in the ``ETag`` header
        """
        dataset_id = request.path_params["dataset_id"]

        dynamic_group = data.get("dynamicGroup")
        if dynamic_group is None:
            raise HTTPException(
                status_code=400, detail="dynamicGroup is required"
            )

        patches = data.get("patches")
        if not isinstance(patches, list) or not patches:
            raise HTTPException(
                status_code=400, detail="patches must be a non-empty list"
            )

        token = parse_group_token(request)
        if token is None:
            raise HTTPException(
                status_code=400, detail="Invalid If-Match header"
            )

        dataset = get_dataset(dataset_id)
        view = fosv.get_view(
            dataset,
            stages=data.get("view"),
            dynamic_group=dynamic_group,
        )

        member_ids, lmts = get_group_state(view)
        max_lmt, count = max(lmts), len(member_ids)

        if_max_lmt, if_count = token
        if count != if_count or not datetimes_match(max_lmt, if_max_lmt):
            logger.debug(
                "Group If-Match condition failed for dynamic group %s: "
                "(%s, %d) != (%s, %d)",
                dynamic_group,
                max_lmt,
                count,
                if_max_lmt,
                if_count,
            )
            return self._version_mismatch(view)

        members = set(member_ids)
        samples = []
        for entry in patches:
            sample_id = entry.get("sampleId")
            ops = entry.get("patch")

            if sample_id not in members:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sample '{sample_id}' is not a member of "
                    f"dynamic group '{dynamic_group}'",
                )

            if not isinstance(ops, list):
                raise HTTPException(
                    status_code=400,
                    detail=f"patch for sample '{sample_id}' must be a list",
                )

            sample = get_sample_from_dataset(dataset, sample_id)
            _handle_top_level_patch(sample, ops)

            try:
                save_sample(sample, sample.last_modified_at)
            except DbVersionMismatchError:
                # A member moved between the group validation and its swap.
                # The whole request fails with GROUP-shaped state — the
                # per-member ETag the decorator would emit must not be
                # mistaken for a group token.
                return self._version_mismatch(view)

            samples.append(utils.json.serialize(sample))

        member_ids, lmts = get_group_state(view)
        etag = generate_group_etag(max(lmts), len(member_ids))

        return utils.json.JSONResponse(
            {"samples": samples}, headers={"ETag": etag}
        )

    def _version_mismatch(self, view) -> JSONResponse:
        """Builds the 412 response carrying the group's fresh state."""
        member_ids, lmts = get_group_state(view)

        return utils.json.JSONResponse(
            {
                "members": [
                    {"id": _id, "last_modified_at": lmt.isoformat()}
                    for _id, lmt in zip(member_ids, lmts)
                ]
            },
            status_code=412,
            headers={"ETag": generate_group_etag(max(lmts), len(member_ids))},
        )


DynamicGroupRoutes = [
    ("/dataset/{dataset_id}/dynamic-group", DynamicGroup),
]
