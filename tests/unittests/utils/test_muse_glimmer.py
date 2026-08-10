"""
Tests for fiftyone/utils/muse_glimmer.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone.core.labels as fol
from fiftyone.utils.muse_glimmer import (
    MuseGlimmerModelConfig,
    MuseGlimmerOutputProcessor,
)

# The generation prompt opens the assistant turn, so generated text begins
# mid-header on the reasoning channel. The reasoning rehearses a candidate
# box that differs from the committed answer.
FULL_TRANSCRIPT = (
    " to=self<|message|>The user wants all objects. I can see a bear in "
    'the lower region. A candidate is [{"label": "cat", "bbox_2d": '
    "[0, 0, 500, 500]}] but looking closer it is a bear near the bottom."
    "<|eom|><|start|>assistant to=user<|message|>"
    '[{"label": "bear", "bbox_2d": [0, 100, 1000, 1000]}]<|eot|>'
)

TRUNCATED_TRANSCRIPT = (
    " to=self<|message|>Let me identify the objects. I see a cat at "
    '[{"label": "cat", "bbox_2d": [100, 100, 400, 400]}] and also'
)


class TestMuseGlimmerAnswerExtraction:
    """Test extraction of the to=user answer channel"""

    def test_answer_channel_wins_over_reasoning(self):
        """Only the committed answer is parsed, not the rehearsed candidate"""
        processor = MuseGlimmerOutputProcessor()
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

    def test_truncated_reasoning_yields_empty(self):
        """A generation that never reached the answer channel commits
        nothing, even though the reasoning contains parseable JSON"""
        processor = MuseGlimmerOutputProcessor()
        answer = processor._extract_answer(TRUNCATED_TRANSCRIPT)

        assert answer == ""
        detections = processor._parse_detections(answer, (1000, 1000))
        assert len(detections) == 0

    def test_answer_with_leading_start_marker(self):
        """A transcript whose first channel carries its own header parses"""
        processor = MuseGlimmerOutputProcessor()
        raw = (
            "<|start|>assistant to=self<|message|>Thinking.<|eom|>"
            "<|start|>assistant to=user<|message|>"
            '[{"label": "dog", "bbox_2d": [0, 0, 500, 500]}]<|eot|>'
        )
        answer = processor._extract_answer(raw)
        detections = processor._parse_detections(answer, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_plain_json_without_channels(self):
        """Output with no channel structure is treated as the answer"""
        processor = MuseGlimmerOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 400, 600]}]'
        answer = processor._extract_answer(raw)
        detections = processor._parse_detections(answer, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "cat"

    def test_reasoning_mention_without_markers_yields_empty(self):
        """Text referencing to=self without channel markers is not
        mistaken for an answer"""
        processor = MuseGlimmerOutputProcessor()
        raw = " to=self reasoning that never opened a message channel"
        answer = processor._extract_answer(raw)

        assert answer == ""

    def test_markdown_fenced_answer_channel(self):
        """Markdown fences inside the answer channel are stripped"""
        processor = MuseGlimmerOutputProcessor()
        raw = (
            " to=self<|message|>Reasoning.<|eom|>"
            "<|start|>assistant to=user<|message|>```json\n"
            '[{"label": "bird", "bbox_2d": [100, 100, 300, 300]}]\n'
            "```<|eot|>"
        )
        answer = processor._extract_answer(raw)
        detections = processor._parse_detections(answer, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "bird"

    def test_last_answer_channel_wins(self):
        """When multiple to=user channels appear, the last is committed"""
        processor = MuseGlimmerOutputProcessor()
        raw = (
            " to=user<|message|>"
            '[{"label": "cat", "bbox_2d": [0, 0, 100, 100]}]<|eot|>'
            "<|start|>assistant to=user<|message|>"
            '[{"label": "dog", "bbox_2d": [0, 0, 500, 500]}]<|eot|>'
        )
        answer = processor._extract_answer(raw)
        detections = processor._parse_detections(answer, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_empty_output(self):
        processor = MuseGlimmerOutputProcessor()
        assert processor._extract_answer("") == ""
        assert processor._extract_answer(None) == ""

    def test_unterminated_answer_channel(self):
        """An answer channel that truncated before <|eot|> still parses
        when its JSON is complete"""
        processor = MuseGlimmerOutputProcessor()
        raw = (
            " to=self<|message|>Reasoning.<|eom|>"
            "<|start|>assistant to=user<|message|>"
            '[{"label": "cat", "bbox_2d": [0, 0, 500, 500]}]'
        )
        answer = processor._extract_answer(raw)
        detections = processor._parse_detections(answer, (1000, 1000))

        assert len(detections) == 1


class TestMuseGlimmerDetectionParsing:
    """Test bbox parsing of the answer payload"""

    def test_parse_multiple_detections(self):
        processor = MuseGlimmerOutputProcessor()
        raw = """[
            {"label": "cat", "bbox_2d": [0, 0, 500, 500]},
            {"label": "dog", "bbox_2d": [500, 500, 1000, 1000]}
        ]"""
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 2
        assert detections[0].label == "cat"
        assert detections[1].label == "dog"

    def test_parse_single_object_json(self):
        processor = MuseGlimmerOutputProcessor()
        raw = '{"label": "dog", "bbox_2d": [100, 200, 400, 600]}'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_parse_empty_responses(self):
        processor = MuseGlimmerOutputProcessor()

        for raw in (
            "",
            "[]",
            "none",
            "None",
            "there are none.",
            "no objects detected",
        ):
            detections = processor._parse_detections(raw, (1000, 1000))
            assert len(detections) == 0, f"Expected empty for: {raw}"

    def test_parse_invalid_json(self):
        processor = MuseGlimmerOutputProcessor()
        detections = processor._parse_detections(
            "this is not json at all", (1000, 1000)
        )

        assert len(detections) == 0

    def test_parse_missing_bbox(self):
        processor = MuseGlimmerOutputProcessor()
        detections = processor._parse_detections(
            '[{"label": "cat"}]', (1000, 1000)
        )

        assert len(detections) == 0

    def test_parse_invalid_bbox_length(self):
        processor = MuseGlimmerOutputProcessor()
        detections = processor._parse_detections(
            '[{"label": "cat", "bbox_2d": [100, 200, 300]}]', (1000, 1000)
        )

        assert len(detections) == 0

    def test_clamp_out_of_range(self):
        processor = MuseGlimmerOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-100, -100, 1100, 1100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].bounding_box == [0.0, 0.0, 1.0, 1.0]

    def test_skip_zero_size_after_clamp(self):
        processor = MuseGlimmerOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [1100, 1100, 1200, 1200]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_skip_inverted_bbox(self):
        processor = MuseGlimmerOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [500, 500, 100, 100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_standard_conversion(self):
        processor = MuseGlimmerOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300, 400]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        bbox = detections[0].bounding_box
        assert bbox[0] == pytest.approx(0.1)
        assert bbox[1] == pytest.approx(0.2)
        assert bbox[2] == pytest.approx(0.2)
        assert bbox[3] == pytest.approx(0.2)


class TestMuseGlimmerOutputProcessorCall:
    """Test the __call__ method end to end on channelized outputs"""

    def test_process_batch(self):
        processor = MuseGlimmerOutputProcessor()
        outputs = [
            FULL_TRANSCRIPT,
            TRUNCATED_TRANSCRIPT,
            " to=self<|message|>Empty scene.<|eom|>"
            "<|start|>assistant to=user<|message|>[]<|eot|>",
        ]

        results = processor(outputs, (1000, 1000))

        assert len(results) == 3
        assert all(isinstance(r, fol.Detections) for r in results)
        assert len(results[0].detections) == 1
        assert results[0].detections[0].label == "bear"
        assert len(results[1].detections) == 0
        assert len(results[2].detections) == 0


class TestMuseGlimmerModelConfig:
    """Test MuseGlimmerModelConfig"""

    def test_default_config(self):
        config = MuseGlimmerModelConfig({})

        assert config.name_or_path == "meta-models/Muse-Glimmer-30B"
        assert config.prompt is None
        assert config.classes is None
        assert config.max_new_tokens == 4096
        assert config.load_in_4bit is True
        assert config.raw_inputs is True

    def test_custom_config(self):
        config = MuseGlimmerModelConfig(
            {
                "classes": ["person", "car"],
                "max_new_tokens": 2048,
                "load_in_4bit": False,
            }
        )

        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 2048
        assert config.load_in_4bit is False
