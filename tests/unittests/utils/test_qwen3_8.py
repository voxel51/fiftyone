"""
Tests for fiftyone/utils/qwen3_8.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Tuple

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone.core.labels as fol
from fiftyone.utils.qwen3_8 import (
    DEFAULT_DETECTION_PROMPT,
    ImageLike,
    Qwen38Model,
    Qwen38ModelConfig,
    Qwen38OutputProcessor,
)

# Thinking mode is on by default and the generation prompt opens the <think>
# block, so generated text begins inside the reasoning and carries only the
# closing tag. The reasoning rehearses a candidate box that differs from the
# committed answer, and the turn terminator survives decoding.
FULL_TRANSCRIPT = (
    "The user wants all objects. A candidate is "
    '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}] but looking closer '
    "it is a bear near the bottom.</think>"
    '[{"label": "bear", "bbox_2d": [0, 100, 1000, 1000]}]<|im_end|>'
)

TRUNCATED_TRANSCRIPT = (
    "Let me identify the objects. I see a cat at "
    '[{"label": "cat", "bbox_2d": [100, 100, 400, 400]}] and also'
)

# The model fences its answer, and the fence is followed by the terminator
FENCED_TRANSCRIPT = (
    "Considering the scene.</think>\n"
    '```json\n[\n\t{"label": "bird", "bbox_2d": [10, 20, 30, 40]}\n]\n```'
    "<|im_end|>"
)


class TestQwen38AnswerExtraction:
    """Test extraction of the committed answer past the reasoning block"""

    def test_answer_wins_over_reasoning(self) -> None:
        """Only the committed answer is parsed, not the rehearsed candidate"""
        processor = Qwen38OutputProcessor()
        detections = processor._parse_detections(
            processor._extract_answer(FULL_TRANSCRIPT), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "bear"
        bbox = detections[0].bounding_box
        assert bbox[0] == pytest.approx(0.0)
        assert bbox[1] == pytest.approx(0.1)
        assert bbox[2] == pytest.approx(1.0)
        assert bbox[3] == pytest.approx(0.9)

    def test_truncated_reasoning_yields_empty(self) -> None:
        """A generation that exhausted its budget mid-reasoning commits
        nothing, even though the reasoning contains parseable JSON"""
        processor = Qwen38OutputProcessor()
        answer = processor._extract_answer(TRUNCATED_TRANSCRIPT)

        assert answer == ""
        assert processor._parse_detections(answer, (1000, 1000)) == []

    def test_turn_terminator_stripped(self) -> None:
        """The terminator survives decoding with special tokens retained,
        and must not reach the JSON parser"""
        processor = Qwen38OutputProcessor()
        answer = processor._extract_answer(FULL_TRANSCRIPT)

        assert "<|im_end|>" not in answer
        assert answer.endswith("]")

    def test_fenced_answer_with_terminator(self) -> None:
        """A fenced answer followed by the terminator still parses; the
        trailing fence is only stripped once the terminator is gone"""
        processor = Qwen38OutputProcessor()
        detections = processor._parse_detections(
            processor._extract_answer(FENCED_TRANSCRIPT), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "bird"

    def test_multiple_reasoning_blocks(self) -> None:
        """Every closed reasoning block is stripped, not just the first"""
        processor = Qwen38OutputProcessor()
        raw = (
            "first pass</think>"
            "<think>second pass, candidate "
            '[{"label": "cat", "bbox_2d": [0, 0, 10, 10]}]</think>'
            '[{"label": "dog", "bbox_2d": [0, 0, 500, 500]}]'
        )
        detections = processor._parse_detections(
            processor._extract_answer(raw), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_unclosed_reasoning_yields_empty(self) -> None:
        """Text with no closing tag never left the reasoning block, even
        when it carries no opening tag either"""
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 400, 600]}]'

        assert processor._extract_answer(raw) == ""

    def test_empty_output(self) -> None:
        processor = Qwen38OutputProcessor()

        assert processor._extract_answer("") == ""
        assert processor._extract_answer(None) == ""

    def test_reasoning_closed_with_empty_answer(self) -> None:
        """Closed reasoning followed by nothing commits no labels"""
        processor = Qwen38OutputProcessor()
        raw = (
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}]</think><|im_end|>'
        )

        assert processor._extract_answer(raw) == ""


class TestQwen38DetectionParsing:
    """Test parsing of bbox JSON into detections"""

    def test_parse_multiple_detections(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = (
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}, '
            '{"label": "dog", "bbox_2d": [500, 500, 1000, 1000]}]'
        )
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 2
        assert [d.label for d in detections] == ["cat", "dog"]

    def test_parse_single_object_json(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = '{"label": "cat", "bbox_2d": [0, 0, 500, 500]}'

        assert len(processor._parse_detections(raw, (1000, 1000))) == 1

    @pytest.mark.parametrize(
        "raw", ["", "none", "There are none.", "no objects detected", "[]"]
    )
    def test_parse_empty_responses(self, raw: str) -> None:
        processor = Qwen38OutputProcessor()

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_parse_invalid_json(self) -> None:
        processor = Qwen38OutputProcessor()

        assert processor._parse_detections("[{broken", (1000, 1000)) == []

    def test_parse_missing_bbox(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat"}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    @pytest.mark.parametrize(
        "bbox", ["[0, 0, 500]", '"0,0,500,500"', "null", "{}", "5"]
    )
    def test_parse_malformed_bbox(self, bbox: str) -> None:
        """A bbox that is not a four-element sequence is skipped"""
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": %s}]' % bbox

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_parse_non_numeric_bbox_elements(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": ["a", "b", "c", "d"]}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    @pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
    def test_parse_non_finite_coordinates(self, literal: str) -> None:
        """JSON permits NaN and Infinity literals; NaN also passes the
        positive-area check, so it must be rejected explicitly"""
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [0, 0, 500, %s]}]' % literal

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_clamp_out_of_range(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-100, -100, 1500, 1500]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert detections[0].bounding_box == [0.0, 0.0, 1.0, 1.0]

    def test_skip_inverted_bbox(self) -> None:
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [500, 500, 100, 100]}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_standard_conversion(self) -> None:
        """bbox_2d is a 0-1000 scale with x first"""
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 600]}]'
        bbox = processor._parse_detections(raw, (1000, 1000))[0].bounding_box

        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.2)
        assert bbox[3] == pytest.approx(0.4)


class TestQwen38OutputProcessorCall:
    """Test the batch entry point"""

    def test_process_batch(self) -> None:
        processor = Qwen38OutputProcessor()
        output = [
            FULL_TRANSCRIPT,
            TRUNCATED_TRANSCRIPT,
            'done.</think>[{"label": "car", "bbox_2d": [0, 0, 100, 100]}]',
        ]
        results = processor(output, (1000, 1000))

        assert len(results) == 3
        assert all(isinstance(r, fol.Detections) for r in results)
        assert [len(r.detections) for r in results] == [1, 0, 1]


class TestQwen38ModelConfig:
    """Test config parsing and validation"""

    def test_default_config(self) -> None:
        config = Qwen38ModelConfig({})

        assert config.name_or_path == "Qwen/Qwen3.8-27B"
        assert config.max_new_tokens == 4096
        assert config.reasoning_effort == "low"
        assert config.load_in_4bit is True
        assert config.raw_inputs is True

    def test_custom_config(self) -> None:
        config = Qwen38ModelConfig(
            {
                "classes": ["person", "car"],
                "max_new_tokens": 512,
                "reasoning_effort": "xhigh",
                "load_in_4bit": False,
            }
        )

        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 512
        assert config.reasoning_effort == "xhigh"
        assert config.load_in_4bit is False

    @pytest.mark.parametrize("effort", ["high", "none", "XHIGH", ""])
    def test_rejects_unsupported_reasoning_effort(self, effort: str) -> None:
        """The chat template raises on anything outside xhigh/medium/low,
        so the config rejects it before a generation is attempted"""
        with pytest.raises(ValueError, match="reasoning_effort"):
            Qwen38ModelConfig({"reasoning_effort": effort})


class TestQwen38PrepareImage:
    """Test image normalization to PIL, which needs no model"""

    def _prepare(self, img: ImageLike) -> PILImage.Image:
        return Qwen38Model._prepare_image(None, img)

    def test_channel_first_tensor_is_transposed(self) -> None:
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_channel_last_array_is_left_alone(self) -> None:
        img = np.zeros((40, 60, 3), dtype=np.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_unit_float_array_is_scaled(self) -> None:
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == 127

    @pytest.mark.parametrize(
        "value,expected", [(200.0, 200), (255.0, 255), (300.0, 255)]
    )
    def test_wide_float_array_is_clipped(
        self, value: float, expected: int
    ) -> None:
        """A 0-255 float array is clipped, not wrapped"""
        img = np.full((8, 8, 3), value, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == expected

    def test_singleton_channel_is_widened_to_rgb(self) -> None:
        """The processor takes RGB, so a single channel is widened"""
        img = np.zeros((8, 8, 1), dtype=np.uint8)
        out = self._prepare(img)

        assert out.mode == "RGB"
        assert out.size == (8, 8)

    def test_pil_image_is_preserved(self) -> None:
        img = PILImage.new("RGB", (12, 9), color=(10, 20, 30))
        out = self._prepare(img)

        assert out.mode == "RGB"
        assert out.size == (12, 9)
        assert np.array_equal(np.asarray(out), np.asarray(img))


class TestQwen38Prompt:
    """Test prompt selection, which needs no model"""

    def _prompt(self, d: dict) -> str:
        model = Qwen38Model.__new__(Qwen38Model)
        model.config = Qwen38ModelConfig(d)
        return Qwen38Model._get_prompt(model)

    def test_default_prompt(self) -> None:
        assert self._prompt({}) == DEFAULT_DETECTION_PROMPT

    def test_classes_are_named_in_the_prompt(self) -> None:
        prompt = self._prompt({"classes": ["person", "car", "dog"]})

        assert "person, car, dog" in prompt
        assert "bbox_2d" in prompt

    def test_explicit_prompt_wins_over_classes(self) -> None:
        prompt = self._prompt(
            {"prompt": "Find the cats.", "classes": ["person"]}
        )

        assert prompt == "Find the cats."


class TestQwen38FrameSizeIndependence:
    """bbox_2d is normalized, so detections do not depend on frame size"""

    @pytest.mark.parametrize(
        "frame_size", [(1000, 1000), (640, 480), (1920, 1080), (100, 800)]
    )
    def test_non_square_frames_give_the_same_box(
        self, frame_size: Tuple[int, int]
    ) -> None:
        processor = Qwen38OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 600]}]'
        bbox = processor._parse_detections(raw, frame_size)[0].bounding_box

        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.2)
        assert bbox[3] == pytest.approx(0.4)
