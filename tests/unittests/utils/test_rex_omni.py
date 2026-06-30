"""
Tests for fiftyone/utils/rex_omni.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone.core.labels as fol
from fiftyone.utils.rex_omni import RexOmniOutputProcessor


def _obj(label, *coord_groups):
    """Build a Rex-Omni object span: a label plus one or more coordinate
    groups, each a tuple of bin tokens, comma-separated inside the box."""
    inner = ", ".join("".join(f"<{c}>" for c in g) for g in coord_groups)
    return (
        f"<|object_ref_start|>{label}<|object_ref_end|>"
        f"<|box_start|>{inner}<|box_end|>"
    )


class TestRexOmniOutputProcessor:
    """Rex-Omni coordinate-token parsing."""

    def test_single_box_full_image(self):
        processor = RexOmniOutputProcessor()
        dets = processor._parse(_obj("cat", (0, 0, 999, 999)))
        assert len(dets) == 1
        assert dets[0].label == "cat"
        # bins 0..999 decode to the full [0, 1] image, xywh = [0, 0, 1, 1]
        assert dets[0].bounding_box == pytest.approx([0.0, 0.0, 1.0, 1.0])
        # Rex-Omni emits no confidence scores
        assert dets[0].confidence is None

    def test_coordinate_decode(self):
        processor = RexOmniOutputProcessor()
        dets = processor._parse(_obj("dog", (250, 500, 750, 900)))
        x0, y0, w, h = dets[0].bounding_box
        assert x0 == pytest.approx(250 / 999)
        assert y0 == pytest.approx(500 / 999)
        assert w == pytest.approx((750 - 250) / 999)
        assert h == pytest.approx((900 - 500) / 999)

    def test_multiple_boxes_one_label(self):
        processor = RexOmniOutputProcessor()
        raw = _obj("cat", (12, 109, 495, 987), (535, 51, 999, 777))
        dets = processor._parse(raw)
        assert len(dets) == 2
        assert {d.label for d in dets} == {"cat"}

    def test_multiple_labels(self):
        processor = RexOmniOutputProcessor()
        raw = _obj("cat", (0, 0, 500, 500)) + ", " + _obj(
            "remote", (600, 100, 700, 300)
        )
        dets = processor._parse(raw)
        assert [d.label for d in dets] == ["cat", "remote"]

    def test_im_end_truncates(self):
        processor = RexOmniOutputProcessor()
        raw = _obj("cat", (0, 0, 999, 999)) + "<|im_end|>" + _obj(
            "dog", (1, 1, 2, 2)
        )
        dets = processor._parse(raw)
        # everything after <|im_end|> is dropped
        assert [d.label for d in dets] == ["cat"]

    def test_dangling_box_is_closed(self):
        # generation hit the token cap before emitting <|box_end|>
        processor = RexOmniOutputProcessor()
        raw = (
            "<|object_ref_start|>cat<|object_ref_end|>"
            "<|box_start|><0><0><999><999>"
        )
        dets = processor._parse(raw)
        assert len(dets) == 1
        assert dets[0].label == "cat"

    def test_degenerate_box_dropped(self):
        # zero-area box (x0==x1, y0==y1) has no width/height
        processor = RexOmniOutputProcessor()
        dets = processor._parse(_obj("cat", (100, 100, 100, 100)))
        assert dets == []

    def test_reversed_corners_normalized(self):
        # corners out of order still yield a valid positive-area box
        processor = RexOmniOutputProcessor()
        dets = processor._parse(_obj("cat", (999, 999, 0, 0)))
        assert len(dets) == 1
        assert dets[0].bounding_box == pytest.approx([0.0, 0.0, 1.0, 1.0])

    def test_point_group_ignored(self):
        # a 2-coord group is a point, not a box; detection parsing skips it
        processor = RexOmniOutputProcessor()
        dets = processor._parse(_obj("cat", (500, 500)))
        assert dets == []

    @pytest.mark.parametrize("raw", ["", "  ", "There are none.", "no objects"])
    def test_empty_outputs(self, raw):
        processor = RexOmniOutputProcessor()
        assert processor._parse(raw) == []

    def test_call_returns_detections(self):
        processor = RexOmniOutputProcessor()
        out = processor(
            [_obj("cat", (0, 0, 999, 999)), ""],
            (640, 480),
        )
        assert len(out) == 2
        assert all(isinstance(d, fol.Detections) for d in out)
        assert len(out[0].detections) == 1
        assert len(out[1].detections) == 0


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
