"""
FiftyOne Server annotation-write construction unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime

import numpy as np
from bson import Binary, ObjectId

import fiftyone.core.utils as fou
from fiftyone.server import annotations as aw


class TestHelpers:
    def test_gatable_scalars(self):
        assert aw._gatable("cat") is True
        assert aw._gatable(0.5) is True
        assert aw._gatable(None) is True
        assert aw._gatable([0.1, 0.2, 0.3]) is True

    def test_gatable_rejects_documents_and_binary(self):
        assert aw._gatable({"label": "cat"}) is False
        assert aw._gatable(b"\x00\x01") is False
        # array containing an embedded document
        assert aw._gatable([{"_id": ObjectId()}]) is False

    def test_changed_label_fields_detects_change(self):
        old = {"_id": ObjectId(), "_cls": "Detection", "label": "cat"}
        new = {**old, "label": "dog"}
        set_fields, unset_fields = aw._changed_label_fields(old, new)
        assert set_fields == {"label": "dog"}
        assert unset_fields == []

    def test_changed_label_fields_detects_unset(self):
        oid = ObjectId()
        old = {"_id": oid, "label": "cat", "confidence": 0.9}
        new = {"_id": oid, "label": "cat"}
        set_fields, unset_fields = aw._changed_label_fields(old, new)
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
        set_fields, unset_fields = aw._changed_label_fields(old, new)
        assert set_fields == {}
        assert unset_fields == []

    def test_label_to_mongo_coerces_mask_to_binary(self):
        mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        mask_b64 = fou.serialize_numpy_array(mask, ascii=True)
        bson = aw._label_to_mongo(
            {"_cls": "Detection", "label": "x", "mask": mask_b64}
        )
        assert isinstance(bson["mask"], (bytes, Binary))
        assert bson["label"] == "x"


class TestBuildWrite:
    """``build_write`` is the gate. Each (filter, update, applied_filter) must
    carry the optimistic-concurrency precondition, addressed correctly, so a
    stale edit misses and a concurrent edit to another field does not."""

    # -- primitives --------------------------------------------------------

    def test_primitive_modify_gates_on_previous_value(self):
        doc_id = ObjectId()
        filt, update, applied = aw.build_write(
            "primitive_field", None, "old", "new", {"_id": doc_id}
        )
        # write matches only while the field still holds the previous value
        assert filt == {"_id": doc_id, "primitive_field": "old"}
        assert update["$set"]["primitive_field"] == "new"
        assert isinstance(
            update["$set"]["last_modified_at"], datetime.datetime
        )
        # the idempotency probe is keyed on the NEW value
        assert applied == {"_id": doc_id, "primitive_field": "new"}

    def test_primitive_unset_gates_on_previous_and_unsets(self):
        doc_id = ObjectId()
        filt, update, applied = aw.build_write(
            "primitive_field", None, "old", None, {"_id": doc_id}
        )
        assert filt["primitive_field"] == "old"
        assert update["$unset"] == {"primitive_field": ""}
        assert "last_modified_at" in update["$set"]
        assert applied["primitive_field"] == {"$in": [None]}

    def test_primitive_create_gates_on_absent_or_null(self):
        filt, update, _ = aw.build_write(
            "primitive_field", None, None, "new", {"_id": ObjectId()}
        )
        # create only while the field is still missing/null
        assert filt["primitive_field"] == {"$in": [None]}
        assert update["$set"]["primitive_field"] == "new"

    def test_primitive_applied_filter_none_when_not_comparable(self):
        # a non-scalar new value can't be reliably matched, so no idempotency
        # probe is offered (the endpoint then treats a gate miss as a conflict)
        _, _, applied = aw.build_write(
            "meta", None, {"a": 1}, {"a": 2}, {"_id": ObjectId()}
        )
        assert applied is None

    # -- list labels (addressed by _id) ------------------------------------

    def test_array_label_modify_gates_identity_and_only_changed_field(self):
        det_id = ObjectId()
        old = {
            "_cls": "Detection",
            "_id": det_id,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        new = {**old, "label": "dog"}
        filt, update, _ = aw.build_write(
            "ground_truth.detections", det_id, old, new, {"_id": ObjectId()}
        )
        elem = filt["ground_truth.detections"]["$elemMatch"]
        # bound to identity, gated ONLY on the field we changed -- a concurrent
        # bbox edit must not spuriously conflict with our label edit
        assert set(elem) == {"_id", "label"}
        assert elem["_id"] == det_id
        assert elem["label"] == "cat"
        assert update["$set"]["ground_truth.detections.$.label"] == "dog"

    def test_array_label_delete_pulls_by_id_gated_on_scalars(self):
        det_id = ObjectId()
        old = {
            "_cls": "Detection",
            "_id": det_id,
            "label": "cat",
            "bounding_box": [0.1, 0.1, 0.2, 0.2],
        }
        filt, update, applied = aw.build_write(
            "ground_truth.detections", det_id, old, None, {"_id": ObjectId()}
        )
        elem = filt["ground_truth.detections"]["$elemMatch"]
        assert elem["_id"] == det_id
        # a stale delete view (label already changed) misses the gate
        assert elem["label"] == "cat"
        assert update["$pull"] == {"ground_truth.detections": {"_id": det_id}}
        # already-applied iff no element with that id remains
        assert applied["ground_truth.detections._id"] == {"$ne": det_id}

    def test_array_label_add_pushes_gated_on_absent_id(self):
        det_id = ObjectId()
        new = {
            "_cls": "Detection",
            "_id": det_id,
            "label": "bird",
            "bounding_box": [0.5, 0.5, 0.1, 0.1],
        }
        filt, update, _ = aw.build_write(
            "ground_truth.detections", det_id, None, new, {"_id": ObjectId()}
        )
        # add only while no element already carries this id
        assert filt["ground_truth.detections._id"] == {"$ne": det_id}
        assert update["$push"]["ground_truth.detections"]["label"] == "bird"

    # -- flat (single) labels ----------------------------------------------

    def test_flat_label_modify_binds_identity(self):
        label_id = ObjectId()
        old = {"_cls": "Classification", "_id": label_id, "label": "cat"}
        new = {"_cls": "Classification", "_id": label_id, "label": "dog"}
        filt, update, _ = aw.build_write(
            "scene", None, old, new, {"_id": ObjectId()}
        )
        # a replacement label with a new _id must not be mistaken for ours
        assert filt["scene._id"] == label_id
        assert filt["scene.label"] == "cat"
        assert update["$set"]["scene.label"] == "dog"

    def test_flat_label_create_gates_on_absent(self):
        new = {"_cls": "Classification", "_id": ObjectId(), "label": "mine"}
        filt, update, _ = aw.build_write(
            "scene", None, None, new, {"_id": ObjectId()}
        )
        assert filt["scene"] == {"$in": [None]}
        assert update["$set"]["scene"]["label"] == "mine"
