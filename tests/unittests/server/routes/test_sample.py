"""
FiftyOne Server sample field-update endpoint unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest
from bson import Binary, ObjectId, json_util
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.core.labels import _read_mask, _write_mask
from fiftyone.core.odm.database import get_db_conn
import fiftyone.server.routes.sample as fors


def json_payload(payload) -> bytes:
    """Encodes a payload the way the client does (MongoDB extended JSON)."""
    return json_util.dumps(payload).encode("utf-8")


def make_request(dataset_id, sample_id, updates):
    """Builds a mock ``SampleFields`` PATCH request for ``updates``."""
    mock_request = MagicMock(spec=Request)
    mock_request.path_params = {
        "dataset_id": dataset_id,
        "sample_id": sample_id,
    }
    mock_request.headers = {"Content-Type": "application/json"}
    mock_request.body = AsyncMock(return_value=json_payload(updates))
    return mock_request


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True
    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    # pylint: disable-next=protected-access
    return str(dataset._doc.id)


# ---------------------------------------------------------------------------
# Unit tests for the gated-update helpers
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_gatable_scalars(self):
        assert fors._gatable("cat") is True
        assert fors._gatable(0.5) is True
        assert fors._gatable(None) is True
        assert fors._gatable([0.1, 0.2, 0.3]) is True

    def test_gatable_rejects_documents_and_binary(self):
        assert fors._gatable({"label": "cat"}) is False
        assert fors._gatable(b"\x00\x01") is False
        # array containing an embedded document
        assert fors._gatable([{"_id": ObjectId()}]) is False

    def test_changed_label_fields_detects_change(self):
        old = {"_id": ObjectId(), "_cls": "Detection", "label": "cat"}
        new = {**old, "label": "dog"}
        set_fields, unset_fields = fors._changed_label_fields(old, new)
        assert set_fields == {"label": "dog"}
        assert unset_fields == []

    def test_changed_label_fields_detects_unset(self):
        oid = ObjectId()
        old = {"_id": oid, "label": "cat", "confidence": 0.9}
        new = {"_id": oid, "label": "cat"}
        set_fields, unset_fields = fors._changed_label_fields(old, new)
        assert set_fields == {}
        assert unset_fields == ["confidence"]

    def test_changed_label_fields_ignores_unchanged_and_id(self):
        oid = ObjectId()
        old = {
            "_id": oid,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {
            "_id": ObjectId(),
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        set_fields, unset_fields = fors._changed_label_fields(old, new)
        assert set_fields == {}
        assert unset_fields == []

    def test_label_to_mongo_coerces_mask_to_binary(self):
        mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        mask_b64 = fou.serialize_numpy_array(mask, ascii=True)
        bson = fors._label_to_mongo(
            {"_cls": "Detection", "label": "x", "mask": mask_b64}
        )
        assert isinstance(bson["mask"], (bytes, Binary))
        assert bson["label"] == "x"

    def test_required_returns_value(self):
        assert (
            fors._required({"collection": "samples.abc"}, "collection")
            == "samples.abc"
        )

    def test_required_missing_field(self):
        with pytest.raises(HTTPException) as exc:
            fors._required({}, "collection")
        assert exc.value.status_code == 400

    def test_object_id_rejects_none(self):
        # ObjectId(None) silently GENERATES a new id; the route must refuse it
        with pytest.raises(HTTPException) as exc:
            fors._object_id(None)
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# The SampleFields endpoint (batch of gated field updates)
# ---------------------------------------------------------------------------


class TestSampleFields:
    DET_ID = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        sample = fo.Sample(filepath="/tmp/test_sf.jpg", tags=["initial"])
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DET_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                )
            ]
        )
        sample["primitive_field"] = "initial_value"
        dataset.add_sample(sample)
        sample.reload()
        return sample

    @pytest.fixture(name="collection")
    def fixture_collection(self, dataset):
        # pylint: disable-next=protected-access
        return dataset._sample_collection_name

    @pytest.fixture(name="mutator")
    def fixture_mutator(self):
        return fors.SampleFields(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

    def _request(self, dataset_id, sample_id, updates):
        mock_request = MagicMock(spec=Request)
        mock_request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": sample_id,
        }
        mock_request.headers = {"Content-Type": "application/json"}
        mock_request.body = AsyncMock(return_value=json_payload(updates))
        return mock_request

    def _det(self, label="cat", bbox=None, **extra):
        return {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": label,
            "bounding_box": bbox or [0.1, 0.1, 0.2, 0.2],
            **extra,
        }

    @pytest.mark.asyncio
    async def test_update_label_field(
        self, mutator, dataset_id, collection, sample
    ):
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(label="cat"),
                "newValue": self._det(label="dog"),
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        det = sample.ground_truth.detections[0]
        assert det.label == "dog"
        # sibling field untouched
        assert det.bounding_box == [0.1, 0.1, 0.2, 0.2]

    @pytest.mark.asyncio
    async def test_update_bumps_last_modified_at(
        self, mutator, dataset_id, collection, sample
    ):
        before = sample.last_modified_at
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "bumped",
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        # every gated write stamps the sample's last_modified_at
        assert sample.last_modified_at > before

    @pytest.mark.asyncio
    async def test_update_primitive_field(
        self, mutator, dataset_id, collection, sample
    ):
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "updated",
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert sample.primitive_field == "updated"

    @pytest.mark.asyncio
    async def test_add_label(self, mutator, dataset_id, collection, sample):
        new_id = ObjectId()
        new_det = {
            "_cls": "Detection",
            "_id": new_id,
            "label": "bird",
            "bounding_box": [0.5, 0.5, 0.1, 0.1],
        }
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(new_id),
                "previousValue": None,
                "newValue": new_det,
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert len(sample.ground_truth.detections) == 2
        assert {d.label for d in sample.ground_truth.detections} == {
            "cat",
            "bird",
        }

    @pytest.mark.asyncio
    async def test_remove_label(self, mutator, dataset_id, collection, sample):
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(),
                "newValue": None,
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert len(sample.ground_truth.detections) == 0

    @pytest.mark.asyncio
    async def test_conflict_returns_full_document(
        self, mutator, dataset_id, collection, sample
    ):
        # Someone else changes the label AND another field out from under us.
        sample.ground_truth.detections[0].label = "changed_by_other"
        sample["primitive_field"] = "also_changed"
        sample.save()
        sample.reload()

        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(label="cat"),
                "newValue": self._det(label="dog"),
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 409
        body = json.loads(response.body)
        conflict = body["conflicts"][0]
        assert conflict["index"] == 0
        # the full document comes back, so every concurrent edit is visible —
        # not just the field we tried to write
        assert (
            conflict["value"]["ground_truth"]["detections"][0]["label"]
            == "changed_by_other"
        )
        assert conflict["value"]["primitive_field"] == "also_changed"

        # our update must NOT have applied
        sample.reload()
        assert sample.ground_truth.detections[0].label == "changed_by_other"

    @pytest.mark.asyncio
    async def test_unrelated_field_concurrent_edit_succeeds(
        self, mutator, dataset_id, collection, sample
    ):
        # An unrelated field changed concurrently; our edit still applies.
        sample["tags"] = ["touched_by_other"]
        sample.save()
        sample.reload()

        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "user_value",
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert sample.primitive_field == "user_value"
        assert sample.tags == ["touched_by_other"]

    @pytest.mark.asyncio
    async def test_interleaved_external_edit_never_conflicts(
        self, mutator, dataset_id, collection, sample
    ):
        # The thesis of field-level gating: a label edit must not conflict with
        # a concurrent write to a DIFFERENT field made outside the annotation
        # flow. Sequence: add a label, an external writer touches another
        # field, add a second label — every step succeeds (200, never 409, so
        # the client never has to retry), and no edit clobbers another.
        det_a, det_b = ObjectId(), ObjectId()

        def add_label(label_oid, label):
            return [
                {
                    "collection": collection,
                    "id": str(sample.id),
                    "lookupPath": "ground_truth.detections",
                    "labelId": str(label_oid),
                    "previousValue": None,
                    "newValue": {
                        "_cls": "Detection",
                        "_id": label_oid,
                        "label": label,
                        "bounding_box": [0.2, 0.2, 0.1, 0.1],
                    },
                }
            ]

        first = await mutator.patch(
            self._request(dataset_id, str(sample.id), add_label(det_a, "dog"))
        )
        assert first.status_code == 200

        # An external writer (not the annotation flow) edits a different field
        # directly in the database, between the two label edits.
        get_db_conn()[collection].update_one(
            {"_id": sample._id}, {"$set": {"primitive_field": "external"}}
        )

        second = await mutator.patch(
            self._request(dataset_id, str(sample.id), add_label(det_b, "bird"))
        )
        # No conflict despite the interleaved external write — different field.
        assert second.status_code == 200

        sample.reload()
        labels = {d.id: d.label for d in sample.ground_truth.detections}
        assert labels[str(det_a)] == "dog"  # first label intact
        assert labels[str(det_b)] == "bird"  # second label applied
        assert sample.primitive_field == "external"  # external edit intact

    @pytest.mark.asyncio
    async def test_malformed_payload(self, mutator, dataset_id, sample):
        request = MagicMock(spec=Request)
        request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": str(sample.id),
        }
        request.headers = {"Content-Type": "application/json"}
        request.body = AsyncMock(return_value=json_payload({"not": "a list"}))

        with pytest.raises(HTTPException) as exc:
            await mutator.patch(request)
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_collection_outside_route(
        self, mutator, dataset_id, sample
    ):
        # A body targeting another dataset's collection is refused — the route's
        # dataset_id bounds what may be written.
        updates = [
            {
                "collection": "samples.000000000000000000000000",
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "evil",
            }
        ]
        with pytest.raises(HTTPException) as exc:
            await mutator.patch(
                self._request(dataset_id, str(sample.id), updates)
            )
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_dataset_not_found(self, mutator, collection, sample):
        # The route dataset's collections are resolved from its dataset doc; an
        # unknown dataset id is a 404 (develop: test_dataset_not_found).
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "x",
            }
        ]
        with pytest.raises(HTTPException) as exc:
            await mutator.patch(
                self._request(str(ObjectId()), str(sample.id), updates)
            )
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_malformed_label_data_returns_400(
        self, mutator, dataset_id, collection, sample
    ):
        # A label value that cannot be deserialized is a 400, not a silent
        # write (develop: test_unsupported_label_class / test_malformed_label_data).
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(label="cat"),
                "newValue": {
                    "_cls": "NonExistentLabelType",
                    "_id": str(self.DET_ID),
                    "label": "dog",
                },
            }
        ]
        with pytest.raises(HTTPException) as exc:
            await mutator.patch(
                self._request(dataset_id, str(sample.id), updates)
            )
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_batch_applies_independently_when_one_update_conflicts(
        self, mutator, dataset_id, collection, sample
    ):
        # A valid primitive edit batched with a stale label edit. Updates are
        # applied independently: the conflict rejects ONLY the stale update
        # (reported by index), the valid one lands. Anything else would force
        # the client to re-send the whole batch after every conflict.
        sample.ground_truth.detections[0].label = "changed_by_other"
        sample.save()
        sample.reload()

        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "primitive_field",
                "previousValue": "initial_value",
                "newValue": "user_value",
            },
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(label="cat"),
                "newValue": self._det(label="dog"),
            },
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 409
        body = json.loads(response.body)
        assert [c["index"] for c in body["conflicts"]] == [1]

        # the valid primitive update was applied — only the conflicted update
        # was rejected ("Updates not listed in conflicts were applied")
        sample.reload()
        assert sample.primitive_field == "user_value"

    @pytest.mark.asyncio
    async def test_stale_delete_conflicts(
        self, mutator, dataset_id, collection, sample
    ):
        # The label changed out from under us; deleting our stale view of it
        # must conflict rather than erase the other editor's change.
        sample.ground_truth.detections[0].label = "changed_by_other"
        sample.save()
        sample.reload()

        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": self._det(label="cat"),
                "newValue": None,
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 409
        sample.reload()
        assert len(sample.ground_truth.detections) == 1
        assert sample.ground_truth.detections[0].label == "changed_by_other"

    @pytest.mark.asyncio
    async def test_stale_flat_label_create_conflicts(
        self, mutator, dataset_id, collection, sample
    ):
        # Another editor created the field first; our create must conflict
        # rather than clobber it.
        sample["scene"] = fol.Classification(label="other")
        sample.save()
        sample.reload()

        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "scene",
                "previousValue": None,
                "newValue": {
                    "_cls": "Classification",
                    "_id": ObjectId(),
                    "label": "mine",
                },
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 409
        sample.reload()
        assert sample.scene.label == "other"

    @pytest.mark.asyncio
    async def test_flat_label_modify_gated_on_identity(
        self, mutator, dataset_id, collection, sample
    ):
        # The flat label was replaced with a new _id (same label value); our
        # edit must gate on identity and conflict rather than mutate the
        # replacement.
        sample["scene"] = fol.Classification(label="cat")
        sample.save()
        sample.reload()

        stale_id = ObjectId()  # not the current scene's id
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "scene",
                "previousValue": {
                    "_cls": "Classification",
                    "_id": stale_id,
                    "label": "cat",
                },
                "newValue": {
                    "_cls": "Classification",
                    "_id": stale_id,
                    "label": "dog",
                },
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 409
        sample.reload()
        assert sample.scene.label == "cat"

    @pytest.mark.asyncio
    async def test_add_label_with_mask_persists_as_numpy(
        self, mutator, dataset_id, collection, sample
    ):
        mask = np.array([[1, 0], [0, 1]], dtype=np.uint8)
        mask_b64 = fou.serialize_numpy_array(mask, ascii=True)
        new_id = ObjectId()
        new_det = {
            "_cls": "Detection",
            "_id": new_id,
            "label": "masked",
            "bounding_box": [0.2, 0.2, 0.1, 0.1],
            "mask": mask_b64,
        }
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(new_id),
                "previousValue": None,
                "newValue": new_det,
            }
        ]
        response = await mutator.patch(
            self._request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        added = next(
            d for d in sample.ground_truth.detections if d.label == "masked"
        )
        assert isinstance(added.mask, np.ndarray)
        np.testing.assert_array_equal(added.mask, mask)


class TestSampleFieldsPatchesBatch:
    """A single request updates both the source and patches collections."""

    DET_ID = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        sample = fo.Sample(filepath="/tmp/test_patch_src.jpg")
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DET_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                )
            ]
        )
        dataset.add_sample(sample)
        sample.reload()
        return sample

    @pytest.fixture(name="mutator")
    def fixture_mutator(self):
        return fors.SampleFields(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

    @pytest.mark.asyncio
    async def test_batch_updates_source_and_patches(
        self, mutator, dataset, dataset_id, sample
    ):
        patches_view = dataset.to_patches("ground_truth")
        patches_dataset = patches_view._patches_dataset
        patch_sample = patches_view.first()

        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {**old, "label": "dog"}

        # One source-addressed update; the patches copy is synced server-side
        # from the hints — generated datasets are not client-addressable.
        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": new,
                "generatedDatasetName": patches_dataset.name,
                "generatedSampleId": str(patch_sample.id),
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200

        db = get_db_conn()

        # source updated
        src = db[source_collection].find_one({"_id": sample._id})
        assert src["ground_truth"]["detections"][0]["label"] == "dog"

        # patches sample updated (flat label) via the derived sync
        patch_doc = db[
            # pylint: disable-next=protected-access
            patches_dataset._sample_collection_name
        ].find_one({"_id": patch_sample._id})
        assert patch_doc["ground_truth"]["label"] == "dog"

    @pytest.mark.asyncio
    async def test_delete_label_removes_source_and_drops_patch(
        self, mutator, dataset, dataset_id, sample
    ):
        """Deleting a patch pulls it from the source list AND deletes the
        patches sample — both collections, one request."""
        patches_view = dataset.to_patches("ground_truth")
        patches_dataset = patches_view._patches_dataset
        patch_sample = patches_view.first()
        assert len(patches_dataset) == 1

        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }

        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": None,
                "generatedDatasetName": patches_dataset.name,
                "generatedSampleId": str(patch_sample.id),
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )
        assert response.status_code == 200

        db = get_db_conn()

        # source label pulled from the list
        src = db[source_collection].find_one({"_id": sample._id})
        assert src["ground_truth"]["detections"] == []

        # patches sample deleted via the derived sync
        # pylint: disable-next=protected-access
        patches_collection = patches_dataset._sample_collection_name
        assert (
            db[patches_collection].find_one({"_id": patch_sample._id}) is None
        )

    @pytest.mark.asyncio
    async def test_source_succeeds_when_patch_write_is_stale(
        self, mutator, dataset, dataset_id, sample
    ):
        """The permanent source write is authoritative: it still succeeds (200)
        even if the ephemeral patch copy changed underneath and its derived
        best-effort sync is skipped — without clobbering the other editor."""
        patches_view = dataset.to_patches("ground_truth")
        patches_dataset = patches_view._patches_dataset
        patch_sample = patches_view.first()

        # Someone else edits the (generated) patch copy independently.
        other = patches_dataset[str(patch_sample.id)]
        other.ground_truth.label = "patch_changed"
        other.save()

        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {**old, "label": "dog"}
        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": new,
                "generatedDatasetName": patches_dataset.name,
                "generatedSampleId": str(patch_sample.id),
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        # the authoritative source write applied
        sample.reload()
        assert sample.ground_truth.detections[0].label == "dog"
        # the independently-changed patch was left untouched (gate skipped it)
        assert (
            patches_dataset[str(patch_sample.id)].ground_truth.label
            == "patch_changed"
        )

    @pytest.mark.asyncio
    async def test_source_succeeds_when_patch_sync_cannot_be_planned(
        self, mutator, dataset, dataset_id, sample
    ):
        """The derived sync is best-effort even at the planning stage: hints
        naming a dataset that no longer exists are skipped, and the
        authoritative source write still lands — the request must not fail."""
        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {**old, "label": "dog"}
        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": new,
                "generatedDatasetName": "no-such-generated-dataset",
                "generatedSampleId": str(ObjectId()),
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert sample.ground_truth.detections[0].label == "dog"

    @pytest.mark.asyncio
    async def test_sync_hint_cannot_target_permanent_collection(
        self, mutator, dataset, dataset_id, sample
    ):
        """A sync hint resolving to a non-generated dataset is refused (the
        ephemeral-copy mechanism must never write a permanent collection)."""
        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {**old, "label": "dog"}
        other_sample = fo.Sample(filepath="/tmp/test_hint_other.jpg")
        other_sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DET_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                )
            ]
        )
        dataset.add_sample(other_sample)

        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": new,
                # hints pointing at the PERMANENT dataset itself
                "generatedDatasetName": dataset.name,
                "generatedSampleId": str(other_sample.id),
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )

        assert response.status_code == 200
        sample.reload()
        assert sample.ground_truth.detections[0].label == "dog"
        # the hinted permanent document was NOT written via the sync path
        other_sample.reload()
        assert other_sample.ground_truth.detections[0].label == "cat"

    @pytest.mark.asyncio
    async def test_source_planning_failure_still_errors(
        self, mutator, dataset_id, sample
    ):
        """Source-collection failures are never downgraded: a permanent update
        that cannot be planned aborts the request with its error."""
        updates = [
            {
                # pylint: disable-next=protected-access
                "collection": "samples.000000000000000000000000",
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": None,
                "newValue": {"_cls": "Detection", "_id": ObjectId()},
            }
        ]
        with pytest.raises(HTTPException) as exc:
            await mutator.patch(
                make_request(dataset_id, str(sample.id), updates)
            )
        assert exc.value.status_code == 403


class TestSampleFieldsEvaluationPatches:
    """Evaluation patches materialize ``ground_truth`` as an ARRAY (not the
    flat label that ``to_patches`` produces), so the patches-collection update
    must address it as a list element — exactly like the source. This guards
    that distinction, which the flat-label patches path would silently break.
    """

    GT_ID = ObjectId()
    PRED_ID = ObjectId()

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset):
        sample = fo.Sample(filepath="/tmp/test_eval_patch.jpg")
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.GT_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.3, 0.3],
                )
            ]
        )
        sample["predictions"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.PRED_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.3, 0.3],
                    confidence=0.9,
                )
            ]
        )
        dataset.add_sample(sample)
        sample.reload()
        return sample

    @pytest.fixture(name="eval_patches")
    def fixture_eval_patches(self, dataset, sample):
        dataset.evaluate_detections(
            "predictions", gt_field="ground_truth", eval_key="eval"
        )
        return dataset.to_evaluation_patches("eval")

    @pytest.fixture(name="mutator")
    def fixture_mutator(self):
        return fors.SampleFields(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

    @pytest.mark.asyncio
    async def test_update_gt_label_syncs_to_eval_patches(
        self, mutator, dataset, dataset_id, sample, eval_patches
    ):
        # pylint: disable-next=protected-access
        patches_dataset = eval_patches._patches_dataset
        tp_patch_id = str(eval_patches.match({"type": "tp"}).first().id)

        # pylint: disable-next=protected-access
        source_collection = dataset._sample_collection_name
        old = {
            "_cls": "Detection",
            "_id": self.GT_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.3, 0.3],
        }
        new = {**old, "label": "dog"}

        updates = [
            {
                "collection": source_collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.GT_ID),
                "previousValue": old,
                "newValue": new,
                "generatedDatasetName": patches_dataset.name,
                "generatedSampleId": tp_patch_id,
            },
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )
        assert response.status_code == 200

        db = get_db_conn()

        # source ground truth updated
        src = db[source_collection].find_one({"_id": sample._id})
        assert src["ground_truth"]["detections"][0]["label"] == "dog"

        # eval-patch ground truth (array) updated via the derived sync;
        # predictions untouched
        patch_doc = db[
            # pylint: disable-next=protected-access
            patches_dataset._sample_collection_name
        ].find_one({"_id": ObjectId(tp_patch_id)})
        assert patch_doc["ground_truth"]["detections"][0]["label"] == "dog"
        assert patch_doc["predictions"]["detections"][0]["label"] == "cat"


# ---------------------------------------------------------------------------
# ArrayField mask coercion (fiftyone behavior relied on by mask saves)
# ---------------------------------------------------------------------------


class TestArrayFieldMask:
    @staticmethod
    def _b64(mask_array):
        return fou.serialize_numpy_array(np.asarray(mask_array), ascii=True)

    def test_array_field_to_mongo_decodes_b64_string(self):
        mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        field = fo.ArrayField()
        mongo_value = field.to_mongo(self._b64(mask))
        result = field.to_python(mongo_value)
        assert isinstance(result, np.ndarray)
        np.testing.assert_array_equal(result, mask)

    def test_array_field_to_python_decodes_b64_string(self):
        mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        field = fo.ArrayField()
        result = field.to_python(self._b64(mask))
        assert isinstance(result, np.ndarray)
        np.testing.assert_array_equal(result, mask)


# ---------------------------------------------------------------------------
# Mask routing (a mask lives on disk or in the database, never both)
# ---------------------------------------------------------------------------


class TestMaskRouting:
    DET_ID = ObjectId()

    @pytest.fixture(name="mask_file")
    def fixture_mask_file(self, tmp_path):
        mask_path = str(tmp_path / "mask.png")
        _write_mask(np.zeros((10, 10), dtype=np.uint8), mask_path)
        return mask_path

    @pytest.fixture(name="sample")
    def fixture_sample(self, dataset, mask_file):
        sample = fo.Sample(filepath="/tmp/test_mask_routing.jpg")
        sample["ground_truth"] = fol.Detections(
            detections=[
                fol.Detection(
                    id=self.DET_ID,
                    label="cat",
                    bounding_box=[0.1, 0.1, 0.2, 0.2],
                    mask_path=mask_file,
                )
            ]
        )
        dataset.add_sample(sample)
        return sample

    @pytest.fixture(name="collection")
    def fixture_collection(self, dataset):
        # pylint: disable-next=protected-access
        return dataset._sample_collection_name

    @pytest.fixture(name="mutator")
    def fixture_mutator(self):
        return fors.SampleFields(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

    @pytest.mark.asyncio
    async def test_disk_backed_mask_is_written_to_file_not_db(
        self, mutator, dataset_id, collection, sample, mask_file
    ):
        """An edited mask for a ``mask_path`` detection is written to the file
        and never stored inline — disk or database, never both."""
        assert _read_mask(mask_file).max() == 0

        edited = np.ones((10, 10), dtype=np.uint8)
        old = {
            "_cls": "Detection",
            "_id": self.DET_ID,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
            "mask_path": mask_file,
        }
        new = {
            **old,
            "label": "dog",
            "mask": fou.serialize_numpy_array(edited, ascii=True),
        }
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(self.DET_ID),
                "previousValue": old,
                "newValue": new,
            }
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )
        assert response.status_code == 200

        # the file holds the edited bytes
        np.testing.assert_array_equal(_read_mask(mask_file), edited)

        # the document holds the other edits, the path, and NO inline mask
        doc = get_db_conn()[collection].find_one({"_id": sample._id})
        det = doc["ground_truth"]["detections"][0]
        assert det["label"] == "dog"
        assert det["mask_path"] == mask_file
        assert "mask" not in det

    @pytest.mark.asyncio
    async def test_db_backed_mask_is_stored_inline(
        self, mutator, dataset_id, collection, sample
    ):
        """An edited mask for a detection WITHOUT ``mask_path`` is stored in
        the database."""
        edited = np.ones((10, 10), dtype=np.uint8)
        det_id = ObjectId()
        updates = [
            {
                "collection": collection,
                "id": str(sample.id),
                "lookupPath": "ground_truth.detections",
                "labelId": str(det_id),
                "previousValue": None,
                "newValue": {
                    "_cls": "Detection",
                    "_id": det_id,
                    "label": "masked",
                    "bounding_box": [0.4, 0.4, 0.2, 0.2],
                    "mask": fou.serialize_numpy_array(edited, ascii=True),
                },
            }
        ]

        response = await mutator.patch(
            make_request(dataset_id, str(sample.id), updates)
        )
        assert response.status_code == 200

        doc = get_db_conn()[collection].find_one({"_id": sample._id})
        added = next(
            d for d in doc["ground_truth"]["detections"] if d["_id"] == det_id
        )
        assert isinstance(added["mask"], (bytes, Binary))
        assert added.get("mask_path") is None
