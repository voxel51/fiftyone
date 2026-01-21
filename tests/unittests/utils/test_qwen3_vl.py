"""
Tests for fiftyone/utils/qwen3_vl.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest
import numpy as np

import fiftyone.core.labels as fol


class TestQwen3VLOutputProcessor:
    """Test Qwen3VLOutputProcessor parsing logic"""

    def test_parse_valid_array_json(self):
        """Test parsing valid JSON array with detections"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 400, 600]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "cat"
        bbox = detections[0].bounding_box
        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.3)
        assert bbox[3] == pytest.approx(0.4)

    def test_parse_single_object_json(self):
        """Test parsing single object JSON (not array)"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '{"label": "dog", "bbox_2d": [100, 200, 400, 600]}'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_parse_multiple_detections(self):
        """Test parsing multiple detections"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '''[
            {"label": "cat", "bbox_2d": [0, 0, 500, 500]},
            {"label": "dog", "bbox_2d": [500, 500, 1000, 1000]}
        ]'''
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 2
        assert detections[0].label == "cat"
        assert detections[1].label == "dog"

    def test_parse_markdown_wrapped_json(self):
        """Test parsing JSON wrapped in markdown code blocks"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '```json\n[{"label": "bird", "bbox_2d": [100, 100, 300, 300]}]\n```'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "bird"

    def test_parse_empty_responses(self):
        """Test parsing various empty response formats"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()

        empty_responses = [
            "",
            "[]",
            "none",
            "None",
            "there are none.",
            "no objects detected",
        ]

        for raw in empty_responses:
            detections = processor._parse_detections(raw, (1000, 1000))
            assert len(detections) == 0, f"Expected empty for: {raw}"

    def test_parse_invalid_json(self):
        """Test graceful handling of invalid JSON"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = "this is not json at all"
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_parse_missing_bbox(self):
        """Test handling detection without bbox_2d"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat"}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_parse_invalid_bbox_length(self):
        """Test handling bbox with wrong number of elements"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLCoordinateClamping:
    """Test coordinate clamping for out-of-range values"""

    def test_clamp_coordinates_above_1000(self):
        """Test coordinates above 1000 are clamped to 1.0"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [0, 0, 1200, 1200]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        bbox = detections[0].bounding_box
        assert bbox[0] == 0.0  # x
        assert bbox[1] == 0.0  # y
        assert bbox[2] == 1.0  # w (clamped: 1.0 - 0.0)
        assert bbox[3] == 1.0  # h (clamped: 1.0 - 0.0)

    def test_clamp_negative_coordinates(self):
        """Test negative coordinates are clamped to 0.0"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-50, -50, 500, 500]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        bbox = detections[0].bounding_box
        assert bbox[0] == 0.0  # x clamped from -0.05
        assert bbox[1] == 0.0  # y clamped from -0.05
        assert bbox[2] == 0.5  # w
        assert bbox[3] == 0.5  # h

    def test_clamp_fully_out_of_range(self):
        """Test fully out-of-range box is clamped to valid region"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-100, -100, 1100, 1100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        bbox = detections[0].bounding_box
        assert bbox == [0.0, 0.0, 1.0, 1.0]

    def test_skip_zero_size_after_clamp(self):
        """Test boxes that become zero-size after clamping are skipped"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [1100, 1100, 1200, 1200]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLBboxConversion:
    """Test bbox coordinate conversion from 0-1000 to normalized"""

    def test_standard_conversion(self):
        """Test standard coordinate conversion"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 400]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        bbox = detections[0].bounding_box
        assert bbox[0] == pytest.approx(0.1)  # x1 / 1000
        assert bbox[1] == pytest.approx(0.2)  # y1 / 1000
        assert bbox[2] == pytest.approx(0.2)  # w = (x2 - x1) / 1000
        assert bbox[3] == pytest.approx(0.2)  # h = (y2 - y1) / 1000

    def test_full_image_bbox(self):
        """Test bbox covering full image"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [0, 0, 1000, 1000]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        bbox = detections[0].bounding_box
        assert bbox == [0.0, 0.0, 1.0, 1.0]

    def test_skip_inverted_bbox(self):
        """Test inverted bbox (x2 < x1) is skipped"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [500, 500, 100, 100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLOutputProcessorCall:
    """Test the __call__ method of Qwen3VLOutputProcessor"""

    def test_process_batch(self):
        """Test processing a batch of outputs"""
        from fiftyone.utils.qwen3_vl import Qwen3VLOutputProcessor

        processor = Qwen3VLOutputProcessor()
        outputs = [
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}]',
            '[{"label": "dog", "bbox_2d": [100, 100, 600, 600]}]',
            '[]',
        ]

        results = processor(outputs, (1000, 1000))

        assert len(results) == 3
        assert isinstance(results[0], fol.Detections)
        assert isinstance(results[1], fol.Detections)
        assert isinstance(results[2], fol.Detections)
        assert len(results[0].detections) == 1
        assert len(results[1].detections) == 1
        assert len(results[2].detections) == 0


class TestQwen3VLModelConfig:
    """Test Qwen3VLModelConfig"""

    def test_default_config(self):
        """Test default configuration values"""
        from fiftyone.utils.qwen3_vl import Qwen3VLModelConfig

        config = Qwen3VLModelConfig({})

        assert config.name_or_path == "Qwen/Qwen3-VL-2B-Instruct"
        assert config.prompt is None
        assert config.classes is None
        assert config.max_new_tokens == 4096

    def test_custom_config(self):
        """Test custom configuration values"""
        from fiftyone.utils.qwen3_vl import Qwen3VLModelConfig

        config = Qwen3VLModelConfig({
            "name_or_path": "Qwen/Qwen3-VL-8B-Instruct",
            "classes": ["person", "car"],
            "max_new_tokens": 2048,
        })

        assert config.name_or_path == "Qwen/Qwen3-VL-8B-Instruct"
        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 2048


class TestQwen3VLPromptGeneration:
    """Test prompt generation logic"""

    def test_default_prompt(self):
        """Test default detection prompt"""
        from fiftyone.utils.qwen3_vl import Qwen3VLModel, Qwen3VLModelConfig

        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({})

        prompt = model._get_prompt()

        assert "Detect all objects" in prompt
        assert "bbox_2d" in prompt

    def test_custom_classes_prompt(self):
        """Test prompt with custom classes"""
        from fiftyone.utils.qwen3_vl import Qwen3VLModel, Qwen3VLModelConfig

        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({"classes": ["person", "car", "dog"]})

        prompt = model._get_prompt()

        assert "person" in prompt
        assert "car" in prompt
        assert "dog" in prompt

    def test_custom_prompt_override(self):
        """Test custom prompt overrides default"""
        from fiftyone.utils.qwen3_vl import Qwen3VLModel, Qwen3VLModelConfig

        custom = "Find all the cats in this image."
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({"prompt": custom})

        prompt = model._get_prompt()

        assert prompt == custom


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
