"""
FiftyOne Server dynamic group PATCH route unit tests: member writes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-value-for-parameter,unused-import
import json

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.labels as fol

import fiftyone.server.routes.dynamic_group as ford

from dynamic_group_fixtures import (
    fixture_dataset,
    fixture_stages,
    fixture_group_view,
    fixture_group_token,
    fixture_members,
    fixture_mutator,
    fixture_mock_request,
    json_payload,
    body,
    replace_label,
    OTHER_SCENE,
)


class TestDynamicGroupPatch:
    """Member-write tests for the dynamic-group PATCH route."""

    @pytest.mark.asyncio
    async def test_patch_member(
        self, mutator, mock_request, stages, members, group_view
    ):
        """A member edit lands on that member under the group token."""
        target = members[1]
        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(target, "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

        target.reload()
        assert target["detections"].detections[0].label == "dog"

        # untouched members keep their labels
        for other in (members[0], members[2]):
            other.reload()
            assert other["detections"].detections[0].label == "cat"

        # the response token reflects the post-write group state
        _, lmts = group_view.values(["id", "last_modified_at"])
        assert response.headers.get("ETag") == ford.generate_group_etag(
            max(lmts), len(lmts)
        )

        response_dict = json.loads(response.body)
        assert len(response_dict["samples"]) == 1
        assert response_dict["samples"][0]["_id"]["$oid"] == str(target.id)

    @pytest.mark.asyncio
    async def test_patch_multiple_members(
        self, mutator, mock_request, stages, members
    ):
        """One request writes several members, all-or-nothing shaped."""
        mock_request.body.return_value = json_payload(
            body(
                stages,
                [
                    replace_label(members[0], "dog"),
                    replace_label(members[2], "bird"),
                ],
            )
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

        members[0].reload()
        members[2].reload()
        assert members[0]["detections"].detections[0].label == "dog"
        assert members[2]["detections"].detections[0].label == "bird"

    @pytest.mark.asyncio
    async def test_patch_add_detection(
        self, mutator, mock_request, stages, members
    ):
        """An `add` op appends a new label to a member's list field."""
        target = members[0]
        new_detection = json.loads(
            fol.Detection(
                label="new", bounding_box=[0.3, 0.3, 0.1, 0.1]
            ).to_json()
        )
        mock_request.body.return_value = json_payload(
            body(
                stages,
                [
                    {
                        "sampleId": str(target.id),
                        "patch": [
                            {
                                "op": "add",
                                "path": "/detections/detections/1",
                                "value": new_detection,
                            }
                        ],
                    }
                ],
            )
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

        target.reload()
        labels = [d.label for d in target["detections"].detections]
        assert labels == ["cat", "new"]

    @pytest.mark.asyncio
    async def test_non_member_is_rejected(
        self, mutator, mock_request, dataset, stages
    ):
        """A patch addressing a sample outside the group 400s."""
        outsider = dataset.match(
            fo.ViewField("scene_id") == OTHER_SCENE
        ).first()
        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(outsider, "dog")])
        )

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_scalar_patch_entry_is_rejected(
        self, mutator, mock_request, stages
    ):
        """A patches entry that is not an object 400s, not 500s."""
        mock_request.body.return_value = json_payload(
            body(stages, ["invalid"])
        )

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_empty_patches_rejected(self, mutator, mock_request, stages):
        """An empty patch list is a bad request."""
        mock_request.body.return_value = json_payload(body(stages, []))

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400
