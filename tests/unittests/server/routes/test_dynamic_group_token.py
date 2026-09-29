"""
FiftyOne Server dynamic group PATCH route unit tests: group version token.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-value-for-parameter,unused-import
import json

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo

import fiftyone.server.routes.dynamic_group as ford

from server.routes.dynamic_group_fixtures import (
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
    SCENE,
    FRAMES_PER_SCENE,
)


class TestDynamicGroupToken:
    """Group version token and compare-and-swap tests for the PATCH route."""

    @pytest.mark.asyncio
    async def test_stale_token_is_rejected(
        self, mutator, mock_request, stages, members
    ):
        """A write under a stale token 412s with the fresh group state."""
        # another writer moves a member after the token was minted
        members[0]["detections"].detections[0].label = "moved"
        members[0].save()

        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(members[1], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412
        assert response.headers.get("ETag")

        response_dict = json.loads(response.body)
        member_ids = {m["id"] for m in response_dict["members"]}
        assert member_ids == {str(m.id) for m in members}

        # the write did not land
        members[1].reload()
        assert members[1]["detections"].detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_member_moved_after_group_check_is_rejected(
        self, mutator, mock_request, dataset, stages, members, monkeypatch
    ):
        """A member another client writes between the group check and its
        swap 412s instead of being overwritten under a 200."""
        real_get_group_state = ford.get_group_state

        def move_member_after_check(view):
            state = real_get_group_state(view)
            other = dataset[members[1].id]
            other["detections"].detections[0].label = "moved"
            other.save()
            return state

        monkeypatch.setattr(ford, "get_group_state", move_member_after_check)

        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(members[1], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412

        # the other client's write survives
        target = dataset[members[1].id]
        assert target["detections"].detections[0].label == "moved"

    @pytest.mark.asyncio
    async def test_member_moved_while_patches_resolve_writes_nothing(
        self, mutator, mock_request, dataset, stages, members, monkeypatch
    ):
        """Resolving the patches reads every member, so a member another
        client moves meanwhile rejects with no member written."""
        real_apply = ford._apply_member_patch
        moved = []

        def move_other_member(dataset_, dynamic_group, member_ids, entry):
            sample = real_apply(dataset_, dynamic_group, member_ids, entry)

            if not moved:
                moved.append(True)
                other = dataset[members[1].id]
                other["detections"].detections[0].label = "moved"
                other.save()

            return sample

        monkeypatch.setattr(ford, "_apply_member_patch", move_other_member)

        mock_request.body.return_value = json_payload(
            body(
                stages,
                [
                    replace_label(members[0], "dog"),
                    replace_label(members[2], "dog"),
                ],
            )
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412
        assert json.loads(response.body)["written"] == []

        # neither patched member was written
        for member in (members[0], members[2]):
            member.reload()
            assert member["detections"].detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_member_moved_inside_write_window_names_what_was_written(
        self, mutator, mock_request, dataset, stages, members, monkeypatch
    ):
        """The one window that can still write part of a request reports the
        members it wrote, so the client reconciles them instead of re-sending
        deltas that would duplicate their labels."""
        real_save = ford.save_sample
        saved = []

        def move_next_member(sample, if_last_modified_at):
            etag = real_save(sample, if_last_modified_at)
            saved.append(sample.id)

            if len(saved) == 1:
                other = dataset[members[2].id]
                other["detections"].detections[0].label = "moved"
                other.save()

            return etag

        monkeypatch.setattr(ford, "save_sample", move_next_member)

        mock_request.body.return_value = json_payload(
            body(
                stages,
                [
                    replace_label(members[0], "dog"),
                    replace_label(members[2], "dog"),
                ],
            )
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412
        assert json.loads(response.body)["written"] == [str(members[0].id)]

        # the first member's write landed, the interfering write survives
        members[0].reload()
        assert members[0]["detections"].detections[0].label == "dog"
        members[2].reload()
        assert members[2]["detections"].detections[0].label == "moved"

    @pytest.mark.asyncio
    async def test_membership_change_is_rejected(
        self, mutator, mock_request, dataset, stages, members
    ):
        """Adding a member after the token was minted fails the count pin."""
        sample = fo.Sample(
            filepath="/tmp/late.jpg",
            scene_id=SCENE,
            frame_number=FRAMES_PER_SCENE + 1,
        )
        dataset.add_sample(sample)

        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(members[0], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412

    @pytest.mark.asyncio
    async def test_missing_if_match_is_rejected(
        self, mutator, mock_request, stages, members
    ):
        """The group token is required."""
        del mock_request.headers["If-Match"]
        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(members[0], "dog")])
        )

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_raw_token_accepted(
        self, mutator, mock_request, stages, members, group_view
    ):
        """The raw `<iso>|<count>` token form validates like the ETag form."""
        _, lmts = group_view.values(["id", "last_modified_at"])
        mock_request.headers["If-Match"] = (
            f"{max(lmts).isoformat()}|{len(lmts)}"
        )
        mock_request.body.return_value = json_payload(
            body(stages, [replace_label(members[0], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200
