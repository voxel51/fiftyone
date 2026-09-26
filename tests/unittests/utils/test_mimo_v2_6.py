"""
Tests for fiftyone/utils/mimo_v2_6.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone.core.labels as fol
from fiftyone.utils.mimo_v2_6 import (
    DEFAULT_DETECTION_PROMPT,
    MiMoV26Model,
    MiMoV26ModelConfig,
    MiMoV26OutputProcessor,
)

# With thinking disabled the template closes an empty reasoning block inside
# the prompt, so generated text is the answer alone and the turn terminator
# survives decoding
DIRECT_TRANSCRIPT = (
    '[{"label": "bear", "bbox_2d": [0, 100, 1000, 1000]}]<|im_end|>'
)

# With thinking enabled the model opens and closes the block itself. The
# reasoning rehearses a candidate box that differs from the committed answer.
THINKING_TRANSCRIPT = (
    "<think>The user wants all objects. A candidate is "
    '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}] but looking closer '
    "it is a bear near the bottom.</think>"
    '[{"label": "bear", "bbox_2d": [0, 100, 1000, 1000]}]<|im_end|>'
)

TRUNCATED_TRANSCRIPT = (
    "<think>Let me identify the objects. I see a cat at "
    '[{"label": "cat", "bbox_2d": [100, 100, 400, 400]}] and also'
)

# The model fences its answer, and the fence is followed by the terminator
FENCED_TRANSCRIPT = (
    "<think>Considering the scene.</think>\n"
    '```json\n[\n\t{"label": "bird", "bbox_2d": [10, 20, 30, 40]}\n]\n```'
    "<|im_end|>"
)


class TestMiMoV26AnswerExtraction:
    """Test extraction of the committed answer past any reasoning block"""

    def test_direct_answer(self):
        """Without a reasoning block the whole generation is the answer"""
        processor = MiMoV26OutputProcessor()
        detections = processor._parse_detections(
            processor._extract_answer(DIRECT_TRANSCRIPT), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "bear"

    def test_answer_wins_over_reasoning(self):
        """Only the committed answer is parsed, not the rehearsed candidate"""
        processor = MiMoV26OutputProcessor()
        detections = processor._parse_detections(
            processor._extract_answer(THINKING_TRANSCRIPT), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "bear"
        bbox = detections[0].bounding_box
        assert bbox[0] == pytest.approx(0.0)
        assert bbox[1] == pytest.approx(0.1)
        assert bbox[2] == pytest.approx(1.0)
        assert bbox[3] == pytest.approx(0.9)

    def test_truncated_reasoning_yields_empty(self):
        """A generation that exhausted its budget mid-reasoning commits
        nothing, even though the reasoning contains parseable JSON"""
        processor = MiMoV26OutputProcessor()
        answer = processor._extract_answer(TRUNCATED_TRANSCRIPT)

        assert answer == ""
        assert processor._parse_detections(answer, (1000, 1000)) == []

    def test_turn_terminator_stripped(self):
        """The terminator survives decoding with special tokens retained,
        and must not reach the JSON parser"""
        processor = MiMoV26OutputProcessor()

        for raw in (DIRECT_TRANSCRIPT, THINKING_TRANSCRIPT):
            answer = processor._extract_answer(raw)

            assert "<|im_end|>" not in answer
            assert answer.endswith("]")

    def test_fenced_answer_with_terminator(self):
        """A fenced answer followed by the terminator still parses; the
        trailing fence is only stripped once the terminator is gone"""
        processor = MiMoV26OutputProcessor()
        detections = processor._parse_detections(
            processor._extract_answer(FENCED_TRANSCRIPT), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "bird"

    def test_multiple_reasoning_blocks(self):
        """Every closed reasoning block is stripped, not just the first"""
        processor = MiMoV26OutputProcessor()
        raw = (
            "<think>first pass</think>"
            "<think>second pass, candidate "
            '[{"label": "cat", "bbox_2d": [0, 0, 10, 10]}]</think>'
            '[{"label": "dog", "bbox_2d": [0, 0, 500, 500]}]'
        )
        detections = processor._parse_detections(
            processor._extract_answer(raw), (1000, 1000)
        )

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_reopened_block_after_answer_yields_empty(self):
        """A second block opened after a closed one and never closed means
        the budget ran out mid-reasoning"""
        processor = MiMoV26OutputProcessor()
        raw = (
            "<think>first pass</think>"
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}]'
            "<think>wait, checking again"
        )

        assert processor._extract_answer(raw) == ""

    def test_empty_output(self):
        processor = MiMoV26OutputProcessor()

        assert processor._extract_answer("") == ""
        assert processor._extract_answer(None) == ""

    def test_reasoning_closed_with_empty_answer(self):
        """Closed reasoning followed by nothing commits no labels"""
        processor = MiMoV26OutputProcessor()
        raw = (
            '<think>[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}]</think>'
            "<|im_end|>"
        )

        assert processor._extract_answer(raw) == ""


class TestMiMoV26DetectionParsing:
    """Test parsing of bbox JSON into detections"""

    def test_parse_multiple_detections(self):
        processor = MiMoV26OutputProcessor()
        raw = (
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}, '
            '{"label": "dog", "bbox_2d": [500, 500, 1000, 1000]}]'
        )
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 2
        assert [d.label for d in detections] == ["cat", "dog"]

    def test_parse_single_object_json(self):
        processor = MiMoV26OutputProcessor()
        raw = '{"label": "cat", "bbox_2d": [0, 0, 500, 500]}'

        assert len(processor._parse_detections(raw, (1000, 1000))) == 1

    def test_repeated_boxes_are_collapsed(self):
        """A box the model emits again and again is one detection; the
        same box under another label is a second one"""
        processor = MiMoV26OutputProcessor()
        raw = (
            '[{"label": "person", "bbox_2d": [780, 355, 812, 440]}, '
            '{"label": "person", "bbox_2d": [780, 355, 812, 440]}, '
            '{"label": "person", "bbox_2d": [780, 355, 812, 440]}, '
            '{"label": "child", "bbox_2d": [780, 355, 812, 440]}]'
        )
        detections = processor._parse_detections(raw, (1000, 1000))

        assert [d.label for d in detections] == ["person", "child"]

    @pytest.mark.parametrize(
        "raw", ["", "none", "There are none.", "no objects detected", "[]"]
    )
    def test_parse_empty_responses(self, raw):
        processor = MiMoV26OutputProcessor()

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_parse_invalid_json(self):
        processor = MiMoV26OutputProcessor()

        assert processor._parse_detections("[{broken", (1000, 1000)) == []

    def test_truncated_list_keeps_completed_objects(self):
        """A generation cut off by the token budget mid-list yields the
        objects it completed; the unfinished one is dropped"""
        processor = MiMoV26OutputProcessor()
        raw = (
            "```json\n[\n"
            '\t{"bbox_2d": [168, 180, 700, 742], "label": "train"},\n'
            '\t{"bbox_2d": [700, 155, 770, 222], "label": "building"},\n'
            '\t{"bbox_2d": [742, 122, 800, 1'
        )
        detections = processor._parse_detections(raw, (1000, 1000))

        assert [d.label for d in detections] == ["train", "building"]

    def test_truncated_list_without_a_complete_object(self):
        processor = MiMoV26OutputProcessor()
        raw = '[{"bbox_2d": [168, 180, 700'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_truncated_single_object_is_not_recovered(self):
        """Only a list is closed after its last complete object"""
        processor = MiMoV26OutputProcessor()
        raw = '{"label": "cat", "bbox_2d": [0, 0, 500, 500]}, {"label": "dog"'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_parse_missing_bbox(self):
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat"}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    @pytest.mark.parametrize(
        "bbox", ["[0, 0, 500]", '"0,0,500,500"', "null", "{}", "5"]
    )
    def test_parse_malformed_bbox(self, bbox):
        """A bbox that is not a four-element sequence is skipped"""
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": %s}]' % bbox

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_parse_non_numeric_bbox_elements(self):
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": ["a", "b", "c", "d"]}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    @pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
    def test_parse_non_finite_coordinates(self, literal):
        """JSON permits NaN and Infinity literals; NaN also passes the
        positive-area check, so it must be rejected explicitly"""
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [0, 0, 500, %s]}]' % literal

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_clamp_out_of_range(self):
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-100, -100, 1500, 1500]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert detections[0].bounding_box == [0.0, 0.0, 1.0, 1.0]

    def test_skip_inverted_bbox(self):
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [500, 500, 100, 100]}]'

        assert processor._parse_detections(raw, (1000, 1000)) == []

    def test_standard_conversion(self):
        """bbox_2d is a 0-1000 scale with x first"""
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 600]}]'
        bbox = processor._parse_detections(raw, (1000, 1000))[0].bounding_box

        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.2)
        assert bbox[3] == pytest.approx(0.4)


class TestMiMoV26OutputProcessorCall:
    """Test the batch entry point"""

    def test_process_batch(self):
        processor = MiMoV26OutputProcessor()
        output = [
            DIRECT_TRANSCRIPT,
            THINKING_TRANSCRIPT,
            TRUNCATED_TRANSCRIPT,
            '<think>done.</think>[{"label": "car", "bbox_2d": [0, 0, 100, 100]}]',
        ]
        results = processor(output, (1000, 1000))

        assert len(results) == 4
        assert all(isinstance(r, fol.Detections) for r in results)
        assert [len(r.detections) for r in results] == [1, 1, 0, 1]


class TestMiMoV26ModelConfig:
    """Test config parsing and validation"""

    def test_default_config(self):
        config = MiMoV26ModelConfig({})

        assert config.name_or_path == "XiaomiMiMo/MiMo-V2.6-Distill-Qwen-9B"
        assert config.max_new_tokens == 4096
        assert config.enable_thinking is True
        assert config.repetition_penalty == 1.0
        assert config.load_in_4bit is False
        assert config.raw_inputs is True

    def test_custom_config(self):
        config = MiMoV26ModelConfig(
            {
                "classes": ["person", "car"],
                "max_new_tokens": 512,
                "enable_thinking": False,
                "repetition_penalty": 1.05,
                "load_in_4bit": True,
            }
        )

        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 512
        assert config.enable_thinking is False
        assert config.repetition_penalty == 1.05
        assert config.load_in_4bit is True


class TestMiMoV26PrepareImage:
    """Test image normalization to PIL, which needs no model"""

    def _prepare(self, img):
        return MiMoV26Model._prepare_image(None, img)

    def test_channel_first_array_is_transposed(self):
        """fout.to_rgb_pil rejects a (C, H, W) array outright"""
        img = np.zeros((3, 40, 60), dtype=np.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_channel_first_tensor_is_transposed(self):
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_channel_last_array_is_left_alone(self):
        img = np.zeros((40, 60, 3), dtype=np.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_ambiguous_square_channel_count_is_left_alone(self):
        """A (3, 224, 3) array is channel-last; transposing would corrupt it"""
        img = np.zeros((3, 224, 3), dtype=np.uint8)

        assert self._prepare(img).size == (224, 3)

    def test_unit_float_array_is_scaled(self):
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == 127

    @pytest.mark.parametrize(
        "value,expected", [(200.0, 200), (255.0, 255), (300.0, 255)]
    )
    def test_wide_float_array_is_clipped(self, value, expected):
        """A 0-255 float array is clipped, not wrapped"""
        img = np.full((8, 8, 3), value, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == expected

    @pytest.mark.parametrize(
        "value,expected", [(0.5, 127), (200.0, 200), (300.0, 255)]
    )
    def test_float_tensor_is_scaled_and_clipped(self, value, expected):
        """A float tensor takes the same 0-1 versus 0-255 handling as an
        array; to_rgb_pil would wrap anything above 1.0"""
        img = torch.full((3, 8, 8), value, dtype=torch.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == expected

    def test_singleton_channel_is_widened_to_rgb(self):
        """The processor takes RGB, so a single channel is widened"""
        img = np.zeros((8, 8, 1), dtype=np.uint8)
        out = self._prepare(img)

        assert out.mode == "RGB"
        assert out.size == (8, 8)

    def test_pil_image_is_preserved(self):
        img = PILImage.new("RGB", (12, 9), color=(10, 20, 30))
        out = self._prepare(img)

        assert out.mode == "RGB"
        assert out.size == (12, 9)
        assert np.array_equal(np.asarray(out), np.asarray(img))


class TestMiMoV26Prompt:
    """Test prompt selection, which needs no model"""

    def _prompt(self, d):
        model = MiMoV26Model.__new__(MiMoV26Model)
        model.config = MiMoV26ModelConfig(d)
        return MiMoV26Model._get_prompt(model)

    def test_default_prompt(self):
        assert self._prompt({}) == DEFAULT_DETECTION_PROMPT

    def test_classes_are_named_in_the_prompt(self):
        prompt = self._prompt({"classes": ["person", "car", "dog"]})

        assert "person, car, dog" in prompt
        assert "bbox_2d" in prompt

    def test_explicit_prompt_wins_over_classes(self):
        prompt = self._prompt(
            {"prompt": "Find the cats.", "classes": ["person"]}
        )

        assert prompt == "Find the cats."


class TestMiMoV26FrameSizeIndependence:
    """bbox_2d is normalized, so detections do not depend on frame size"""

    @pytest.mark.parametrize(
        "frame_size", [(1000, 1000), (640, 480), (1920, 1080), (100, 800)]
    )
    def test_non_square_frames_give_the_same_box(self, frame_size):
        processor = MiMoV26OutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 600]}]'
        bbox = processor._parse_detections(raw, frame_size)[0].bounding_box

        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.2)
        assert bbox[3] == pytest.approx(0.4)


class TestMiMoV26LoadGuards:
    """Configuration combinations rejected before the model is loaded"""

    @pytest.mark.parametrize("value", [0, -1, -4096])
    def test_rejects_non_positive_max_new_tokens(self, value):
        with pytest.raises(ValueError, match="max_new_tokens"):
            MiMoV26ModelConfig({"max_new_tokens": value})

    @pytest.mark.parametrize("value", [0, -1.05])
    def test_rejects_non_positive_repetition_penalty(self, value):
        with pytest.raises(ValueError, match="repetition_penalty"):
            MiMoV26ModelConfig({"repetition_penalty": value})

    def test_four_bit_without_gpu_is_rejected(self):
        """Without a GPU both load branches are skipped, which would load
        the bfloat16 weights instead of quantizing"""
        model = MiMoV26Model.__new__(MiMoV26Model)
        model._using_gpu = False
        config = MiMoV26ModelConfig({"load_in_4bit": True})

        with pytest.raises(ValueError, match="requires a GPU"):
            MiMoV26Model._load_model(model, config)
