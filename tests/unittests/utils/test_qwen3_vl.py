"""
Tests for fiftyone/utils/qwen3_vl.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import tempfile

import PIL.Image
import pytest
import numpy as np
import torch
from unittest import mock

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
from fiftyone.utils.qwen3_vl import (
    Qwen3VLModel,
    Qwen3VLModelConfig,
    Qwen3VLOutputProcessor,
)


class TestQwen3VLOutputProcessor:
    """Test Qwen3VLOutputProcessor parsing logic"""

    def test_parse_valid_array_json(self):
        """Test parsing valid JSON array with detections"""
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
        processor = Qwen3VLOutputProcessor()
        raw = '{"label": "dog", "bbox_2d": [100, 200, 400, 600]}'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "dog"

    def test_parse_multiple_detections(self):
        """Test parsing multiple detections"""
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
        processor = Qwen3VLOutputProcessor()
        raw = '```json\n[{"label": "bird", "bbox_2d": [100, 100, 300, 300]}]\n```'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        assert detections[0].label == "bird"

    def test_parse_empty_responses(self):
        """Test parsing various empty response formats"""
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
        processor = Qwen3VLOutputProcessor()
        raw = "this is not json at all"
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_parse_missing_bbox(self):
        """Test handling detection without bbox_2d"""
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat"}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0

    def test_parse_invalid_bbox_length(self):
        """Test handling bbox with wrong number of elements"""
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [100, 200, 300]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLCoordinateClamping:
    """Test coordinate clamping for out-of-range values"""

    def test_clamp_coordinates_above_1000(self):
        """Test coordinates above 1000 are clamped to 1.0"""
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
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [-100, -100, 1100, 1100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 1
        bbox = detections[0].bounding_box
        assert bbox == [0.0, 0.0, 1.0, 1.0]

    def test_skip_zero_size_after_clamp(self):
        """Test boxes that become zero-size after clamping are skipped"""
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [1100, 1100, 1200, 1200]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLBboxConversion:
    """Test bbox coordinate conversion from 0-1000 to normalized"""

    def test_standard_conversion(self):
        """Test standard coordinate conversion"""
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
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [0, 0, 1000, 1000]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        bbox = detections[0].bounding_box
        assert bbox == [0.0, 0.0, 1.0, 1.0]

    def test_skip_inverted_bbox(self):
        """Test inverted bbox (x2 < x1) is skipped"""
        processor = Qwen3VLOutputProcessor()
        raw = '[{"label": "cat", "bbox_2d": [500, 500, 100, 100]}]'
        detections = processor._parse_detections(raw, (1000, 1000))

        assert len(detections) == 0


class TestQwen3VLOutputProcessorCall:
    """Test the __call__ method of Qwen3VLOutputProcessor"""

    def test_process_batch(self):
        """Test processing a batch of outputs"""
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
        config = Qwen3VLModelConfig({})

        assert config.name_or_path == "Qwen/Qwen3-VL-2B-Instruct"
        assert config.prompt is None
        assert config.classes is None
        assert config.max_new_tokens == 4096
        assert config.embedding_dim is None
        assert config.normalize_embeddings is True

    def test_custom_config(self):
        """Test custom configuration values"""
        config = Qwen3VLModelConfig({
            "name_or_path": "Qwen/Qwen3-VL-8B-Instruct",
            "classes": ["person", "car"],
            "max_new_tokens": 2048,
        })

        assert config.name_or_path == "Qwen/Qwen3-VL-8B-Instruct"
        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 2048

    def test_embedding_config(self):
        """Test embedding-specific configuration"""
        config = Qwen3VLModelConfig({
            "name_or_path": "Qwen/Qwen3-VL-Embedding-2B",
            "embedding_dim": 512,
            "normalize_embeddings": False,
        })

        assert config.name_or_path == "Qwen/Qwen3-VL-Embedding-2B"
        assert config.embedding_dim == 512
        assert config.normalize_embeddings is False


class TestQwen3VLPromptGeneration:
    """Test prompt generation logic"""

    def test_default_prompt(self):
        """Test default detection prompt"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({})

        prompt = model._get_prompt()

        assert "Detect all objects" in prompt
        assert "bbox_2d" in prompt

    def test_custom_classes_prompt(self):
        """Test prompt with custom classes"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({"classes": ["person", "car", "dog"]})

        prompt = model._get_prompt()

        assert "person" in prompt
        assert "car" in prompt
        assert "dog" in prompt

    def test_custom_prompt_override(self):
        """Test custom prompt overrides default"""
        custom = "Find all the cats in this image."
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model.config = Qwen3VLModelConfig({"prompt": custom})

        prompt = model._get_prompt()

        assert prompt == custom


class TestQwen3VLEmbeddingMode:
    """Test embedding mode functionality"""

    def test_has_embeddings_detection_mode(self):
        """Test has_embeddings is False when output_processor is set"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = Qwen3VLOutputProcessor()

        assert model.has_embeddings is False

    def test_has_embeddings_embedding_mode(self):
        """Test has_embeddings is True when output_processor is None"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = None

        assert model.has_embeddings is True

    def test_prepare_image_pil(self):
        """Test _prepare_image with PIL input"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = PIL.Image.new("RGB", (100, 100), color="red")
        result = model._prepare_image(img)

        assert isinstance(result, PIL.Image.Image)

    def test_prepare_image_numpy(self):
        """Test _prepare_image with numpy input"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        result = model._prepare_image(img)

        assert isinstance(result, PIL.Image.Image)

    def test_prepare_image_float_normalized(self):
        """Test _prepare_image with float normalized numpy array"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = np.random.rand(100, 100, 3).astype(np.float32)
        result = model._prepare_image(img)

        assert isinstance(result, PIL.Image.Image)

    def test_prepare_image_hwc_small_height(self):
        """Test _prepare_image with HWC tensors where height is 1, 3, or 4"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)

        for height in [1, 3, 4]:
            img = torch.randint(0, 255, (height, 224, 3), dtype=torch.uint8)
            result = model._prepare_image(img)

            assert isinstance(result, PIL.Image.Image)
            assert result.size == (224, height)


class TestQwen3VLMode:
    """Test model mode and media_type behavior"""

    def test_default_mode(self):
        """Test default config mode is None"""
        config = Qwen3VLModelConfig({})
        assert config.mode is None

    def test_config_mode_video(self):
        """Test config accepts mode=video"""
        config = Qwen3VLModelConfig({"mode": "video"})
        assert config.mode == "video"

    def test_media_type_reflects_mode(self):
        """Test media_type returns current mode"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._mode = "image"
        assert model.media_type == "image"

        model._mode = "video"
        assert model.media_type == "video"

    def test_media_type_defaults_image_when_none(self):
        """Test media_type falls back to image when mode is None"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._mode = None
        assert model.media_type == "image"

    def test_mode_setter(self):
        """Test mode can be changed at runtime"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._mode = "image"

        model.mode = "video"
        assert model.mode == "video"
        assert model.media_type == "video"


class TestQwen3VLAutoMode:
    """Test that mode auto-defaults from dataset media type via compute_embeddings"""

    def _make_mock_model(self):
        class _Mock(fom.Model, fom.EmbeddingsMixin):
            def __init__(self):
                self._mode = None

            @property
            def mode(self):
                return self._mode

            @mode.setter
            def mode(self, value):
                self._mode = value

            @property
            def media_type(self):
                return self._mode or "image"

            @property
            def has_embeddings(self):
                return True

            def embed(self, arg):
                return np.random.randn(8).astype(np.float32)

            @property
            def ragged_batches(self):
                return True

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

        return _Mock()

    def test_mode_none_video_dataset(self, tmp_path):
        """mode=None on video dataset -> sample-level embeddings"""
        model = self._make_mock_model()
        ds = fo.Dataset()
        ds.media_type = "video"
        ds.add_sample(fo.Sample(
            filepath=str(tmp_path / "test_video.mp4")
        ))
        mock_reader = mock.MagicMock()
        with mock.patch(
            "fiftyone.core.models.etav.FFmpegVideoReader",
            return_value=mock_reader,
        ):
            mock_reader.__enter__ = mock.Mock(return_value=mock_reader)
            mock_reader.__exit__ = mock.Mock(return_value=False)
            ds.compute_embeddings(model, embeddings_field="emb")
        assert ds.has_sample_field("emb")
        assert not ds.has_frame_field("emb")
        assert model.mode is None
        sample = ds.first()
        assert sample.emb is not None
        assert np.array(sample.emb).shape == (8,)
        assert np.isfinite(sample.emb).all()
        ds.delete()

    def test_explicit_image_not_overridden(self, tmp_path):
        """mode='image' on video dataset -> frame-level embeddings"""
        model = self._make_mock_model()
        model.mode = "image"
        embed_calls = []
        _orig_embed = model.embed
        def _tracking_embed(arg):
            embed_calls.append(type(arg).__name__)
            return _orig_embed(arg)
        model.embed = _tracking_embed

        ds = fo.Dataset()
        ds.media_type = "video"
        ds.add_sample(fo.Sample(
            filepath=str(tmp_path / "test_video.mp4")
        ))
        mock_reader = mock.MagicMock()
        fake_frame = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
        mock_reader.__iter__ = mock.Mock(
            return_value=iter([fake_frame, fake_frame])
        )
        mock_reader.total_frame_count = 2
        type(mock_reader).frame_number = mock.PropertyMock(
            side_effect=[1, 2]
        )
        with mock.patch(
            "fiftyone.core.models.etav.FFmpegVideoReader",
            return_value=mock_reader,
        ):
            mock_reader.__enter__ = mock.Mock(return_value=mock_reader)
            mock_reader.__exit__ = mock.Mock(return_value=False)
            ds.compute_embeddings(model, embeddings_field="emb")
        assert ds.has_frame_field("emb")
        assert not ds.has_sample_field("emb")
        assert model.mode == "image"
        assert len(embed_calls) == 2
        assert all(t != "FFmpegVideoReader" for t in embed_calls)
        frames = list(ds.first().frames.values())
        assert len(frames) == 2
        for frame in frames:
            assert frame.emb is not None
            assert np.array(frame.emb).shape == (8,)
            assert np.isfinite(frame.emb).all()
        ds.delete()

    def test_mode_none_image_dataset(self, tmp_path):
        """mode=None on image dataset -> sample-level embeddings"""
        model = self._make_mock_model()
        tmp = str(tmp_path / "test_auto_mode.png")
        PIL.Image.new("RGB", (10, 10)).save(tmp)
        ds = fo.Dataset()
        ds.add_sample(fo.Sample(filepath=tmp))
        ds.compute_embeddings(model, embeddings_field="emb")
        assert ds.has_sample_field("emb")
        assert model.mode is None
        sample = ds.first()
        assert sample.emb is not None
        assert np.array(sample.emb).shape == (8,)
        assert np.isfinite(sample.emb).all()
        ds.delete()


class TestQwen3VLVideoConfig:
    """Test video-specific config defaults"""

    def test_video_fps_default(self):
        """Test default video_fps is 2.0"""
        config = Qwen3VLModelConfig({})
        assert config.video_fps == 2.0
        assert config.max_video_frames == 128


class TestQwen3VLModeValidation:
    """Test that invalid mode values are rejected"""

    def test_invalid_mode_raises(self):
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._mode = None

        for bad in ["garbage", 123, ""]:
            with pytest.raises(ValueError, match="mode must be"):
                model.mode = bad


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
