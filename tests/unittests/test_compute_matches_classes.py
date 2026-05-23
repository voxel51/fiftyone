"""
Unit tests for _compute_matches classes-filter fix (issue #6707).

Verifies that ground-truth objects whose label is not in the user-supplied
``classes`` list are not tagged as false negatives during detection evaluation.

No MongoDB connection required -- exercises the COCO matching helper directly.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from collections import defaultdict

import fiftyone.utils.eval.coco as cocoe
import fiftyone.utils.iou as foui

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_APPLE_GT = ("apple", "gt1", [0.10, 0.10, 0.30, 0.30])
_ORANGE_GT = ("orange", "gt2", [0.60, 0.60, 0.30, 0.30])
_BANANA_GT = ("banana", "gt3", [0.40, 0.10, 0.20, 0.20])
_APPLE_PRED = ("apple", "p1", [0.10, 0.10, 0.30, 0.30], 0.99)

_EVAL_KEY = "eval"
_ID_KEY = "eval_id"
_IOU_KEY = "eval_iou"
_IOU_THRESH = 0.50


# ---------------------------------------------------------------------------
# Minimal Detection stub (no dataset / MongoDB required)
# ---------------------------------------------------------------------------

class _Det:
    """Lightweight stand-in for a FiftyOne Detection label object."""

    def __init__(self, label, det_id, bounding_box, confidence=None):
        self.label = label
        self.id = det_id
        self.bounding_box = bounding_box
        self.confidence = confidence
        self._attrs = {}

    def __getitem__(self, key):
        sentinel = cocoe._NO_MATCH_ID if key.endswith("_id") else cocoe._NO_MATCH_IOU
        return self._attrs.get(key, sentinel)

    def __setitem__(self, key, value):
        self._attrs[key] = value

    def get(self, key, default=None):
        return self._attrs.get(key, default)

    def get_attribute_value(self, key, default=None):  # iscrowd support
        return default


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _build_cats(gt_specs, pred_specs):
    """
    Construct the ``cats`` / ``pred_ious`` structures consumed by
    ``_compute_matches``, initialising every object with the sentinel values
    that the real COCO setup code would apply.
    """
    gts = [_Det(label, det_id, box) for label, det_id, box in gt_specs]
    preds = [_Det(label, det_id, box, conf) for label, det_id, box, conf in pred_specs]

    for obj in gts + preds:
        obj[_ID_KEY] = cocoe._NO_MATCH_ID
        obj[_IOU_KEY] = cocoe._NO_MATCH_IOU

    iscrowd = lambda obj: False  # noqa: E731

    cats = defaultdict(lambda: defaultdict(list))
    for gt in gts:
        cats[gt.label]["gts"].append(gt)
    for pred in preds:
        cats[pred.label]["preds"].append(pred)

    pred_ious = {}
    for objects in cats.values():
        ious = foui.compute_ious(
            objects["preds"], objects["gts"], sparse=True, iscrowd=iscrowd, error_level=1
        )
        pred_ious.update(ious)

    return cats, pred_ious, iscrowd


def _run_matches(cats, pred_ious, iscrowd, classes):
    return cocoe._compute_matches(
        cats,
        pred_ious,
        _IOU_THRESH,
        iscrowd,
        eval_key=_EVAL_KEY,
        id_key=_ID_KEY,
        iou_key=_IOU_KEY,
        classes=classes,
    )


def _gt_map(cats):
    return {gt.id: gt for objs in cats.values() for gt in objs["gts"]}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestComputeMatchesClassesFilter(unittest.TestCase):
    """_compute_matches correctly applies the optional ``classes`` filter."""

    def test_classes_none_preserves_existing_behaviour(self):
        """classes=None: all unmatched GTs must still be tagged 'fn'."""
        cats, pred_ious, iscrowd = _build_cats(
            [_APPLE_GT, _ORANGE_GT], [_APPLE_PRED]
        )
        _run_matches(cats, pred_ious, iscrowd, classes=None)

        gts = _gt_map(cats)
        self.assertEqual(gts["gt1"][_EVAL_KEY], "tp")
        self.assertEqual(gts["gt2"][_EVAL_KEY], "fn")

    def test_excluded_class_gt_not_tagged_fn(self):
        """classes=['apple']: orange GT must remain untagged."""
        cats, pred_ious, iscrowd = _build_cats(
            [_APPLE_GT, _ORANGE_GT], [_APPLE_PRED]
        )
        matches = _run_matches(cats, pred_ious, iscrowd, classes=["apple"])

        gts = _gt_map(cats)
        self.assertEqual(gts["gt1"][_EVAL_KEY], "tp")
        self.assertIsNone(gts["gt2"].get(_EVAL_KEY))

        fn_count = sum(1 for m in matches if m[1] is None)
        self.assertEqual(fn_count, 0)

    def test_multiple_excluded_classes_all_untagged(self):
        """classes=['apple']: every non-apple GT must remain untagged."""
        cats, pred_ious, iscrowd = _build_cats(
            [_APPLE_GT, _ORANGE_GT, _BANANA_GT], [_APPLE_PRED]
        )
        _run_matches(cats, pred_ious, iscrowd, classes=["apple"])

        gts = _gt_map(cats)
        self.assertEqual(gts["gt1"][_EVAL_KEY], "tp")
        self.assertIsNone(gts["gt2"].get(_EVAL_KEY))
        self.assertIsNone(gts["gt3"].get(_EVAL_KEY))

    def test_empty_classes_list_produces_no_tags(self):
        """classes=[]: no GT should be tagged and the match list is empty."""
        cats, pred_ious, iscrowd = _build_cats([_APPLE_GT, _ORANGE_GT], [])
        matches = _run_matches(cats, pred_ious, iscrowd, classes=[])

        self.assertEqual(matches, [])
        for gt in _gt_map(cats).values():
            self.assertIsNone(gt.get(_EVAL_KEY))

    def test_explicit_full_class_list_equivalent_to_none(self):
        """Passing all GT labels explicitly must equal the classes=None result."""
        cats_a, pa, ica = _build_cats([_APPLE_GT, _ORANGE_GT], [_APPLE_PRED])
        cats_b, pb, icb = _build_cats([_APPLE_GT, _ORANGE_GT], [_APPLE_PRED])

        m_explicit = _run_matches(cats_a, pa, ica, classes=["apple", "orange"])
        m_none = _run_matches(cats_b, pb, icb, classes=None)

        fn_explicit = sum(1 for m in m_explicit if m[1] is None)
        fn_none = sum(1 for m in m_none if m[1] is None)
        self.assertEqual(fn_explicit, fn_none)

