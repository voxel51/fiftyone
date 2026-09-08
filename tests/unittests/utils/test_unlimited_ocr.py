"""
Tests for fiftyone/utils/unlimited_ocr.py document-parsing output.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone.core.labels as fol
import fiftyone.utils.unlimited_ocr as fuo


class TestUnlimitedOCRConfig:
    def test_defaults(self):
        config = fuo.UnlimitedOCRModelConfig({})
        assert config.name_or_path == "baidu/Unlimited-OCR"
        assert config.prompt == "<image>document parsing."
        assert config.base_size == 1024
        assert config.crop_size == 640
        assert config.crop_mode is True
        assert config.no_repeat_ngram_size == 35
        assert config.ngram_window == 128
        assert config.raw_inputs is True

    def test_custom(self):
        config = fuo.UnlimitedOCRModelConfig(
            {"prompt": "<image>Free OCR.", "crop_size": 1024}
        )
        assert config.prompt == "<image>Free OCR."
        assert config.crop_size == 1024


class TestUnlimitedOCRGetItem:
    def test_required_keys(self):
        assert fuo.UnlimitedOCRGetItem().required_keys == ["filepath"]

    def test_passes_filepath(self):
        out = fuo.UnlimitedOCRGetItem()({"filepath": "/a/b.jpg"})
        assert out == {"filepath": "/a/b.jpg"}


class TestParseLayout:
    def test_single_element(self):
        # bins 0..999 map to the full [0, 1] image
        text = "<|det|>title [0, 0, 999, 999]<|/det|>Quarterly Report"
        els = fuo._parse_layout(text)
        assert len(els) == 1
        assert els[0]["type"] == "title"
        assert els[0]["text"] == "Quarterly Report"
        assert els[0]["box"] == pytest.approx([0.0, 0.0, 1.0, 1.0])

    def test_coordinate_decode(self):
        text = "<|det|>text [250, 500, 750, 900]<|/det|>hello"
        box = fuo._parse_layout(text)[0]["box"]
        assert box == pytest.approx(
            [250 / 999, 500 / 999, 500 / 999, 400 / 999]
        )

    def test_multiple_elements_content_split(self):
        text = (
            "<|det|>title [0, 0, 500, 100]<|/det|>Report"
            "<|det|>text [0, 120, 800, 200]<|/det|>Body copy here"
        )
        els = fuo._parse_layout(text)
        assert [e["type"] for e in els] == ["title", "text"]
        assert [e["text"] for e in els] == ["Report", "Body copy here"]

    def test_table_html_preserved(self):
        text = (
            "<|det|>table [0, 0, 999, 999]<|/det|>"
            "<table><tr><td>A</td><td>B</td></tr></table>"
        )
        el = fuo._parse_layout(text)[0]
        assert el["type"] == "table"
        assert el["text"] == "<table><tr><td>A</td><td>B</td></tr></table>"

    def test_out_of_frame_clamped(self):
        text = "<|det|>text [900, 900, 1200, 1200]<|/det|>x"
        box = fuo._parse_layout(text)[0]["box"]
        assert all(0.0 <= v <= 1.0 for v in box)
        assert box[0] == pytest.approx(900 / 999)
        assert box[2] == pytest.approx(1.0 - 900 / 999)

    def test_degenerate_box_dropped(self):
        text = "<|det|>text [100, 100, 100, 100]<|/det|>x"
        assert fuo._parse_layout(text) == []

    def test_malformed_box_skipped(self):
        text = "<|det|>text [not, a, box]<|/det|>x"
        assert fuo._parse_layout(text) == []

    def test_empty_output(self):
        assert fuo._parse_layout("") == []
        assert fuo._parse_layout("no markers here") == []


class TestPredictAll:
    def test_predict_all_builds_detections(self):
        model = fuo.UnlimitedOCRModel.__new__(fuo.UnlimitedOCRModel)

        raw = (
            "<|det|>title [0, 0, 999, 100]<|/det|>Report"
            "<|det|>table [0, 200, 999, 999]<|/det|>"
            "<table><tr><td>A</td></tr></table>"
        )

        class _FakeModel:
            def infer(self, tokenizer, **kwargs):
                return raw

        model._model = _FakeModel()
        model._tokenizer = None
        model.config = fuo.UnlimitedOCRModelConfig({})

        out = model._predict_all([{"filepath": "/a.jpg"}])
        assert len(out) == 1
        assert isinstance(out[0], fol.Detections)
        dets = out[0].detections
        assert [d.label for d in dets] == ["title", "table"]
        assert dets[0].get_attribute_value("text") == "Report"
        assert "table" in dets[1].get_attribute_value("text")

    def test_predict_all_guards_failures(self):
        model = fuo.UnlimitedOCRModel.__new__(fuo.UnlimitedOCRModel)

        class _BoomModel:
            def infer(self, tokenizer, **kwargs):
                raise RuntimeError("boom")

        model._model = _BoomModel()
        model._tokenizer = None
        model.config = fuo.UnlimitedOCRModelConfig({})

        out = model._predict_all([{"filepath": "/a.jpg"}])
        assert isinstance(out[0], fol.Detections)
        assert out[0].detections == []


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
