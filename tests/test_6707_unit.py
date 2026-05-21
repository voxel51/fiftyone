"""
Unit tests for GitHub issue #6707 fix.
No MongoDB required — tests _compute_matches directly.
Run: python tests/test_6707_unit.py
"""
import sys
from collections import defaultdict
from fiftyone.utils.eval.coco import _compute_matches, _NO_MATCH_ID, _NO_MATCH_IOU
import fiftyone.utils.iou as foui


class FakeDet:
    def __init__(self, label, det_id, bounding_box, confidence=None):
        self.label = label
        self.id = det_id
        self.bounding_box = bounding_box
        self.confidence = confidence
        self._iscrowd = False
        self._attrs = {}
    def __getitem__(self, key):
        return self._attrs.get(key, _NO_MATCH_ID if key.endswith("_id") else _NO_MATCH_IOU)
    def __setitem__(self, key, value):
        self._attrs[key] = value
    def get(self, key, default=None):
        return self._attrs.get(key, default)
    def get_attribute_value(self, key, default=None):
        return self._iscrowd if key == "iscrowd" else default


def _make_cats(gt_specs, pred_specs):
    id_key, iou_key = "eval_id", "eval_iou"
    gts   = [FakeDet(label, det_id, box) for label, det_id, box in gt_specs]
    preds = [FakeDet(label, det_id, box, conf) for label, det_id, box, conf in pred_specs]
    for obj in gts + preds:
        obj[id_key] = _NO_MATCH_ID
        obj[iou_key] = _NO_MATCH_IOU

    def iscrowd(obj):
        return obj._iscrowd

    cats = defaultdict(lambda: defaultdict(list))
    for gt in gts:
        cats[gt.label]["gts"].append(gt)
    for pred in preds:
        cats[pred.label]["preds"].append(pred)
    pred_ious = {}
    for objects in cats.values():
        ious = foui.compute_ious(objects["preds"], objects["gts"],
                                 sparse=True, iscrowd=iscrowd, error_level=1)
        pred_ious.update(ious)
    return cats, pred_ious, iscrowd


def run(cats, pred_ious, iscrowd, classes):
    return _compute_matches(cats, pred_ious, 0.5, iscrowd,
                            eval_key="eval", id_key="eval_id",
                            iou_key="eval_iou", classes=classes)


GT_SPECS   = [("apple","gt1",[0.1,0.1,0.3,0.3]),
              ("orange","gt2",[0.6,0.6,0.3,0.3])]
PRED_SPECS = [("apple","p1",[0.1,0.1,0.3,0.3],0.99)]


def test_classes_none_baseline():
    cats, pred_ious, iscrowd = _make_cats(GT_SPECS, PRED_SPECS)
    run(cats, pred_ious, iscrowd, classes=None)
    gts = {g.id: g for objs in cats.values() for g in objs["gts"]}
    assert gts["gt1"]["eval"] == "tp"
    assert gts["gt2"]["eval"] == "fn"
    print("PASS test_classes_none_baseline")


def test_classes_filter_apple_only():
    cats, pred_ious, iscrowd = _make_cats(GT_SPECS, PRED_SPECS)
    matches = run(cats, pred_ious, iscrowd, classes=["apple"])
    gts = {g.id: g for objs in cats.values() for g in objs["gts"]}
    assert gts["gt1"]["eval"] == "tp"
    assert gts["gt2"].get("eval") is None, f"orange must be untagged, got {gts['gt2'].get('eval')}"
    assert sum(1 for m in matches if m[1] is None) == 0
    print("PASS test_classes_filter_apple_only")


def test_multiple_excluded_classes():
    gt_specs = [("apple","gt1",[0.1,0.1,0.3,0.3]),
                ("orange","gt2",[0.6,0.6,0.3,0.3]),
                ("banana","gt3",[0.4,0.1,0.2,0.2])]
    cats, pred_ious, iscrowd = _make_cats(gt_specs, PRED_SPECS)
    run(cats, pred_ious, iscrowd, classes=["apple"])
    gts = {g.id: g for objs in cats.values() for g in objs["gts"]}
    assert gts["gt1"]["eval"] == "tp"
    assert gts["gt2"].get("eval") is None
    assert gts["gt3"].get("eval") is None
    print("PASS test_multiple_excluded_classes")


def test_empty_classes_list():
    cats, pred_ious, iscrowd = _make_cats(GT_SPECS, [])
    matches = run(cats, pred_ious, iscrowd, classes=[])
    assert matches == []
    print("PASS test_empty_classes_list")


def test_all_classes_explicit_equals_none():
    cats1, p1, ic1 = _make_cats(GT_SPECS, PRED_SPECS)
    cats2, p2, ic2 = _make_cats(GT_SPECS, PRED_SPECS)
    m1 = run(cats1, p1, ic1, classes=["apple","orange"])
    m2 = run(cats2, p2, ic2, classes=None)
    fn1 = sum(1 for m in m1 if m[1] is None)
    fn2 = sum(1 for m in m2 if m[1] is None)
    assert fn1 == fn2 == 1
    print("PASS test_all_classes_explicit_equals_none")


if __name__ == "__main__":
    passed = failed = 0
    for t in [test_classes_none_baseline, test_classes_filter_apple_only,
              test_multiple_excluded_classes, test_empty_classes_list,
              test_all_classes_explicit_equals_none]:
        try:
            t()
            passed += 1
        except Exception as e:
            import traceback
            print(f"FAIL {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed}/5 passed, {failed} failed")
    sys.exit(1 if failed else 0)
