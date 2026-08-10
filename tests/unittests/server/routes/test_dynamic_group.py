"""
FiftyOne Server dynamic group mutation endpoint unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json

# pylint: disable=no-value-for-parameter
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId, json_util
import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.stages as fosg
import fiftyone.server.routes.dynamic_group as ford
import fiftyone.server.view as fosv

SCENE = "scene-a"
OTHER_SCENE = "scene-b"
FRAMES_PER_SCENE = 3

DETECTION_IDS = {
    (scene, frame_number): ObjectId()
    for scene in (SCENE, OTHER_SCENE)
    for frame_number in range(1, FRAMES_PER_SCENE + 1)
}


def json_payload(payload) -> bytes:
    """Converts a dictionary to a JSON payload."""
    return json_util.dumps(payload).encode("utf-8")


@pytest.fixture(name="dataset")
def fixture_dataset():
    """An image dataset dynamically groupable into ordered scenes."""
    dataset = fo.Dataset()
    dataset.persistent = True

    samples = []
    for scene in (SCENE, OTHER_SCENE):
        for frame_number in range(1, FRAMES_PER_SCENE + 1):
            sample = fo.Sample(
                filepath=f"/tmp/{scene}-{frame_number}.jpg",
                scene_id=scene,
                frame_number=frame_number,
            )
            sample["detections"] = fol.Detections(
                detections=[
                    fol.Detection(
                        id=DETECTION_IDS[(scene, frame_number)],
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.2, 0.2],
                    )
                ]
            )
            samples.append(sample)

    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="stages")
def fixture_stages():
    """The serialized GroupBy stage defining the dynamic grouping."""
    return [fosg.GroupBy("scene_id", order_by="frame_number")._serialize()]


@pytest.fixture(name="group_view")
def fixture_group_view(dataset, stages):
    """The ordered member view of the scene under test."""
    return fosv.get_view(dataset.name, stages=stages, dynamic_group=SCENE)


@pytest.fixture(name="group_token")
def fixture_group_token(group_view):
    """The current group version token."""
    _, lmts = group_view.values(["id", "last_modified_at"])
    return ford.generate_group_etag(max(lmts), len(lmts))


@pytest.fixture(name="members")
def fixture_members(dataset, group_view):
    """The scene's ordered member samples.

    Loaded through the dataset — the dynamic-group view injects a `_group`
    field that the `Sample` loader rejects when iterating the view itself.
    """
    return [dataset[_id] for _id in group_view.values("id")]


@pytest.fixture(name="mutator")
def fixture_mutator():
    """Returns the DynamicGroup route mutator."""
    return ford.DynamicGroup(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_request")
def fixture_mock_request(dataset, group_token):
    """A PATCH request against the dataset's dynamic-group route."""
    # pylint: disable-next=protected-access
    mock_request = MagicMock()
    mock_request.path_params = {"dataset_id": dataset._doc.id}
    mock_request.headers = {
        "Content-Type": "application/json",
        "If-Match": group_token,
    }
    mock_request.body = AsyncMock(return_value=json_payload({}))

    return mock_request


def _body(stages, patches, dynamic_group=SCENE):
    return {
        "dynamicGroup": dynamic_group,
        "view": stages,
        "patches": patches,
    }


def _replace_label(sample, label):
    detection_id = str(sample["detections"].detections[0].id)
    return {
        "sampleId": str(sample.id),
        "patch": [
            {
                "op": "replace",
                "path": "/detections/detections/0/label",
                "value": label,
            }
        ],
    }


class TestDynamicGroupPatch:
    """Tests for the dynamic-group PATCH route."""

    @pytest.mark.asyncio
    async def test_patch_member(
        self, mutator, mock_request, stages, members, group_view
    ):
        """A member edit lands on that member under the group token."""
        target = members[1]
        mock_request.body.return_value = json_payload(
            _body(stages, [_replace_label(target, "dog")])
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
            _body(
                stages,
                [
                    _replace_label(members[0], "dog"),
                    _replace_label(members[2], "bird"),
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
            _body(
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
    async def test_stale_token_is_rejected(
        self, mutator, mock_request, stages, members
    ):
        """A write under a stale token 412s with the fresh group state."""
        # another writer moves a member after the token was minted
        members[0]["detections"].detections[0].label = "moved"
        members[0].save()

        mock_request.body.return_value = json_payload(
            _body(stages, [_replace_label(members[1], "dog")])
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
            _body(stages, [_replace_label(members[0], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 412

    @pytest.mark.asyncio
    async def test_non_member_is_rejected(
        self, mutator, mock_request, dataset, stages
    ):
        """A patch addressing a sample outside the group 400s."""
        outsider = dataset.match(
            fo.ViewField("scene_id") == OTHER_SCENE
        ).first()
        mock_request.body.return_value = json_payload(
            _body(stages, [_replace_label(outsider, "dog")])
        )

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_missing_if_match_is_rejected(
        self, mutator, mock_request, stages, members
    ):
        """The group token is required."""
        del mock_request.headers["If-Match"]
        mock_request.body.return_value = json_payload(
            _body(stages, [_replace_label(members[0], "dog")])
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
        mock_request.headers[
            "If-Match"
        ] = f"{max(lmts).isoformat()}|{len(lmts)}"
        mock_request.body.return_value = json_payload(
            _body(stages, [_replace_label(members[0], "dog")])
        )

        #####
        response = await mutator.patch(mock_request)
        #####

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_empty_patches_rejected(self, mutator, mock_request, stages):
        """An empty patch list is a bad request."""
        mock_request.body.return_value = json_payload(_body(stages, []))

        with pytest.raises(HTTPException) as exc_info:
            await mutator.patch(mock_request)

        assert exc_info.value.status_code == 400
