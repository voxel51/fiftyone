"""
Tests for fiftyone/utils/qwen3_vl.py output processor and parsing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import uuid
import os

import PIL.Image
import pytest
import numpy as np
import torch
from unittest import mock

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.utils.qwen3_vl as qwen3_vl
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
        raw = """[
            {"label": "cat", "bbox_2d": [0, 0, 500, 500]},
            {"label": "dog", "bbox_2d": [500, 500, 1000, 1000]}
        ]"""
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
            "[]",
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
        config = Qwen3VLModelConfig(
            {
                "name_or_path": "Qwen/Qwen3-VL-8B-Instruct",
                "classes": ["person", "car"],
                "max_new_tokens": 2048,
            }
        )

        assert config.name_or_path == "Qwen/Qwen3-VL-8B-Instruct"
        assert config.classes == ["person", "car"]
        assert config.max_new_tokens == 2048

    def test_embedding_config(self):
        """Test embedding-specific configuration"""
        config = Qwen3VLModelConfig(
            {
                "name_or_path": "Qwen/Qwen3-VL-Embedding-2B",
                "embedding_dim": 512,
                "normalize_embeddings": False,
            }
        )

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
        model.config = Qwen3VLModelConfig(
            {"classes": ["person", "car", "dog"]}
        )

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
        model.config = Qwen3VLModelConfig({})

        assert model.has_embeddings is True

    def test_prepare_image_pil(self):
        """Test _prepare_image with PIL input"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = PIL.Image.new("RGB", (100, 100), color="red")
        result = model._prepare_image(img)

        # Already what the processor takes, so no copy and no re-encode
        assert result is img

    def test_prepare_image_numpy(self):
        """Test _prepare_image with numpy input"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        result = model._prepare_image(img)

        assert isinstance(result, PIL.Image.Image)
        assert result.size == (100, 100)
        np.testing.assert_array_equal(np.asarray(result), img)

    def test_prepare_image_float_normalized(self):
        """Test _prepare_image with float normalized numpy array"""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        img = np.random.rand(100, 100, 3).astype(np.float32)
        result = model._prepare_image(img)

        assert isinstance(result, PIL.Image.Image)
        # [0, 1] floats are pixel intensities, so they scale to the full
        # 8-bit range rather than truncating to black
        np.testing.assert_array_equal(
            np.asarray(result),
            np.clip(img * 255.0, 0, 255).astype(np.uint8),
        )

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

    @pytest.fixture()
    def fixture_dataset(self):
        """A uniquely named, PERSISTENT dataset, deleted by that exact name on
        teardown. Persistent because concurrently running suites sweep
        non-persistent datasets, which used to kill these tests mid-run."""
        name = "qwen3_vl_test_%s" % uuid.uuid4().hex[:8]
        dataset = fo.Dataset(name=name)
        dataset.persistent = True
        try:
            yield dataset
        finally:
            fo.delete_dataset(name)

    def _make_mock_model(self):
        class MockModeAwareModel(fom.Model, fom.EmbeddingsMixin):
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

        return MockModeAwareModel()

    def test_mode_none_video_dataset(self, tmp_path, fixture_dataset):
        """mode=None on video dataset -> sample-level embeddings"""
        model = self._make_mock_model()
        ds = fixture_dataset
        ds.media_type = "video"
        ds.add_sample(fo.Sample(filepath=str(tmp_path / "test_video.mp4")))
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

    def test_explicit_image_not_overridden(self, tmp_path, fixture_dataset):
        """mode='image' on video dataset -> frame-level embeddings"""
        model = self._make_mock_model()
        model.mode = "image"
        embed_calls = []
        _orig_embed = model.embed

        def _tracking_embed(arg):
            embed_calls.append(type(arg).__name__)
            return _orig_embed(arg)

        model.embed = _tracking_embed

        ds = fixture_dataset
        ds.media_type = "video"
        ds.add_sample(fo.Sample(filepath=str(tmp_path / "test_video.mp4")))
        mock_reader = mock.MagicMock()
        fake_frame = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
        mock_reader.__iter__ = mock.Mock(
            return_value=iter([fake_frame, fake_frame])
        )
        mock_reader.total_frame_count = 2
        type(mock_reader).frame_number = mock.PropertyMock(side_effect=[1, 2])
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

    def test_mode_none_image_dataset(self, tmp_path, fixture_dataset):
        """mode=None on image dataset -> sample-level embeddings"""
        model = self._make_mock_model()
        tmp = str(tmp_path / "test_auto_mode.png")
        PIL.Image.new("RGB", (10, 10)).save(tmp)
        ds = fixture_dataset
        ds.add_sample(fo.Sample(filepath=tmp))
        ds.compute_embeddings(model, embeddings_field="emb")
        assert ds.has_sample_field("emb")
        assert model.mode is None
        sample = ds.first()
        assert sample.emb is not None
        assert np.array(sample.emb).shape == (8,)
        assert np.isfinite(sample.emb).all()


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


class TestPromptMixinInterface:
    """Verify PromptMixin is wired into the class hierarchy."""

    def test_inherits_prompt_mixin(self):
        assert issubclass(Qwen3VLModel, fom.PromptMixin)

    def test_can_embed_prompts_embedding_mode(self):
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = None
        assert model.can_embed_prompts is True

    def test_can_embed_prompts_detection_mode(self):
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = Qwen3VLOutputProcessor()
        assert model.can_embed_prompts is False


class TestPromptMixinMocked:
    """Test embed_prompt / embed_prompts with mocked internals."""

    def _make_model_with_mock_processor(self):
        """Build a Qwen3VLModel with mocked _model and _processor."""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = None
        model._mode = None
        model.config = Qwen3VLModelConfig(
            {
                "name_or_path": "Qwen/Qwen3-VL-Embedding-2B",
                "embedding_dim": None,
                "normalize_embeddings": True,
            }
        )

        fake_hidden = torch.randn(1, 10, 2048)
        mock_outputs = mock.MagicMock()
        mock_outputs.hidden_states = [fake_hidden]

        mock_model = mock.MagicMock()
        mock_model.return_value = mock_outputs
        mock_model.device = torch.device("cpu")
        model._model = mock_model

        fake_inputs = {
            "input_ids": torch.randint(0, 1000, (1, 10)),
            "attention_mask": torch.ones(1, 10, dtype=torch.long),
        }

        class FakeInputs(dict):
            def to(self, device):
                return self

        fake_dict = FakeInputs(fake_inputs)

        mock_processor = mock.MagicMock()
        mock_processor.apply_chat_template.return_value = fake_dict
        model._processor = mock_processor

        return model

    @staticmethod
    def _expected_pooled(model, dim=None):
        """What pooling must produce from the mocked hidden states: the LAST
        position of the final layer, truncated BEFORE normalizing."""
        hidden = model._model.return_value.hidden_states[-1]
        pooled = hidden[:, -1, :]
        if dim is not None:
            pooled = pooled[:, :dim]
        pooled = torch.nn.functional.normalize(pooled, p=2, dim=-1)
        return pooled.float().numpy()

    def test_embed_prompt_is_the_normalized_last_hidden_state(self):
        model = self._make_model_with_mock_processor()
        result = model.embed_prompt("a dog playing fetch")
        assert isinstance(result, np.ndarray)
        assert result.ndim == 1
        np.testing.assert_allclose(
            result, self._expected_pooled(model)[0], rtol=1e-6
        )

    def test_embed_prompts_stack_one_vector_per_prompt(self):
        model = self._make_model_with_mock_processor()
        result = model.embed_prompts(["hello", "world"])
        assert isinstance(result, np.ndarray)
        assert result.shape == (2, 2048)
        for row in result:
            np.testing.assert_allclose(
                row, self._expected_pooled(model)[0], rtol=1e-6
            )

    def test_embed_prompt_calls_chat_template_with_text(self):
        model = self._make_model_with_mock_processor()
        model.embed_prompt("a sunset over the ocean")

        call_args = model._processor.apply_chat_template.call_args
        messages = call_args[0][0]
        assert messages[0]["role"] == "user"
        content = messages[0]["content"]
        assert len(content) == 1
        assert content[0]["type"] == "text"
        assert content[0]["text"] == "a sunset over the ocean"

    def test_embed_prompt_uses_same_template_args_as_images(self):
        """Verify text embedding uses identical template kwargs as _embed_images."""
        model = self._make_model_with_mock_processor()
        model.embed_prompt("test")

        call_kwargs = model._processor.apply_chat_template.call_args[1]
        assert call_kwargs["tokenize"] is True
        assert call_kwargs["add_generation_prompt"] is False
        assert call_kwargs["return_dict"] is True
        assert call_kwargs["return_tensors"] == "pt"

    def test_embed_prompt_calls_model_with_hidden_states(self):
        model = self._make_model_with_mock_processor()
        model.embed_prompt("test")

        call_kwargs = model._model.call_args[1]
        assert call_kwargs["output_hidden_states"] is True
        assert call_kwargs["return_dict"] is True

    def test_embed_prompts_multiple_calls_processor_per_prompt(self):
        model = self._make_model_with_mock_processor()
        model.embed_prompts(["a", "b", "c"])

        assert model._processor.apply_chat_template.call_count == 3
        assert model._model.call_count == 3

    def test_embedding_dim_truncation(self):
        model = self._make_model_with_mock_processor()
        model.config.embedding_dim = 512
        result = model.embed_prompt("test")
        assert result.shape[0] == 512
        # MRL truncation slices FIRST and normalizes the slice; normalizing
        # then slicing would leave a non-unit vector in the truncated space
        np.testing.assert_allclose(
            result, self._expected_pooled(model, dim=512)[0], rtol=1e-6
        )

    def test_embed_prompt_dispatches_to_embed_prompts(self):
        model = self._make_model_with_mock_processor()
        with mock.patch.object(model, "embed_prompts") as mock_ep:
            mock_ep.return_value = np.random.randn(1, 2048).astype(np.float32)
            model.embed_prompt("test")
            mock_ep.assert_called_once_with(["test"])

    def test_embed_prompts_empty_raises(self):
        model = self._make_model_with_mock_processor()
        with pytest.raises(ValueError, match="at least one"):
            model.embed_prompts([])


class TestQwen3VLEmbedFrames:
    """Test embed_frames: embedding a list of in-memory frames as one clip."""

    def _make_model(self):
        """Build a Qwen3VLModel with mocked _model and _processor."""
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = None
        model._mode = None
        model.config = Qwen3VLModelConfig(
            {
                "name_or_path": "Qwen/Qwen3-VL-Embedding-2B",
                "embedding_dim": None,
                "normalize_embeddings": True,
            }
        )

        fake_hidden = torch.randn(1, 10, 2048)
        mock_outputs = mock.MagicMock()
        mock_outputs.hidden_states = [fake_hidden]

        mock_model = mock.MagicMock()
        mock_model.return_value = mock_outputs
        mock_model.device = torch.device("cpu")
        model._model = mock_model

        mock_processor = mock.MagicMock()
        mock_processor.apply_chat_template.return_value = "<chat-text>"
        mock_processor.return_value = {
            "input_ids": torch.randint(0, 1000, (1, 10)),
            "attention_mask": torch.ones(1, 10, dtype=torch.long),
        }
        model._processor = mock_processor

        return model

    @staticmethod
    def _frames(n):
        return [
            np.random.randint(0, 255, (8, 8, 3), dtype=np.uint8)
            for _ in range(n)
        ]

    @staticmethod
    def _marked_frames(n):
        """Frames identifiable by position: frame ``i`` is filled with ``i``."""
        return [np.full((8, 8, 3), i, dtype=np.uint8) for i in range(n)]

    @staticmethod
    def _marks(frames):
        """The source positions of the frames handed to the model."""
        return [int(np.asarray(f)[0, 0, 0]) for f in frames]

    def _capture_clip(self, model, frames, **kwargs):
        """Runs ``embed_frames`` and returns the clip the model was given."""
        captured = {}

        def _capture(messages):
            content = messages[0]["content"][0]
            captured["frames"] = content["video"]
            captured["fps"] = content["fps"]
            return (None, ["<video>"])

        with mock.patch.object(
            qwen3_vl, "qwen_vl_utils", mock.MagicMock()
        ) as mock_qvu:
            mock_qvu.process_vision_info.side_effect = _capture
            model.embed_frames(frames, **kwargs)

        return captured

    def test_embed_frames_returns_1d_array(self):
        model = self._make_model()
        with mock.patch.object(
            qwen3_vl, "qwen_vl_utils", mock.MagicMock()
        ) as mock_qvu:
            mock_qvu.process_vision_info.return_value = (None, ["<video>"])
            result = model.embed_frames(self._frames(4), fps=4.0)

        assert isinstance(result, np.ndarray)
        assert result.ndim == 1
        # The clip's vector is the pooled LAST hidden position, normalized —
        # the same pooling the image and prompt paths use
        hidden = model._model.return_value.hidden_states[-1]
        expected = torch.nn.functional.normalize(hidden[:, -1, :], p=2, dim=-1)
        np.testing.assert_allclose(
            result, expected.float().numpy()[0], rtol=1e-6
        )

    def test_embed_frames_empty_raises(self):
        model = self._make_model()
        with pytest.raises(ValueError, match="empty"):
            model.embed_frames([])

    def test_embed_frames_caps_at_max_video_frames(self):
        model = self._make_model()
        model.config.max_video_frames = 3

        captured = {}

        def _capture(messages):
            captured["frames"] = messages[0]["content"][0]["video"]
            return (None, ["<video>"])

        with mock.patch.object(
            qwen3_vl, "qwen_vl_utils", mock.MagicMock()
        ) as mock_qvu:
            mock_qvu.process_vision_info.side_effect = _capture
            model.embed_frames(self._frames(10), fps=None)

        assert len(captured["frames"]) == 3

    @pytest.mark.parametrize(
        "fps",
        [None, 0, -4.0],
        ids=["fps_none", "fps_zero", "fps_negative"],
    )
    def test_embed_frames_unknown_fps_keeps_all_frames(self, fps):
        # None and non-positive rates are all "unknown": no subsampling, and
        # the model is told the configured target rate instead
        model = self._make_model()
        model.config.video_fps = 2.0

        captured = self._capture_clip(model, self._frames(5), fps=fps)

        assert len(captured["frames"]) == 5
        assert captured["fps"] == 2.0

    @pytest.mark.parametrize(
        "case,n_frames,native_fps",
        [
            ("camera_3_frames", 3, 12.0),
            ("camera_2_frames", 2, 12.0),
            ("lidar_4_frames", 4, 20.0),
            ("radar_3_frames", 3, 13.0),
        ],
    )
    def test_embed_frames_no_subsample_keeps_every_frame(
        self, case, n_frames, native_fps
    ):
        model = self._make_model()
        model.config.video_fps = 2.0

        captured = self._capture_clip(
            model,
            self._frames(n_frames),
            fps=native_fps,
            subsample=False,
        )

        # a pre-selected clip (every frame in a time window) is embedded as
        # given; its true rate is reported but never used to thin it
        assert len(captured["frames"]) == n_frames
        assert captured["fps"] == native_fps

    def test_embed_frames_no_subsample_strides_past_cap(self):
        model = self._make_model()
        model.config.video_fps = 2.0
        model.config.max_video_frames = 3

        captured = self._capture_clip(
            model,
            self._marked_frames(10),
            fps=10.0,
            subsample=False,
        )

        # over the cap the clip is thinned by a uniform stride, so its frames
        # still span the window rather than stopping at the third one
        assert self._marks(captured["frames"]) == [0, 4, 8]
        assert captured["fps"] == 2.5

    def test_embed_frames_subsample_default_is_unchanged(self):
        model = self._make_model()
        model.config.video_fps = 2.0

        captured = self._capture_clip(model, self._marked_frames(8), fps=8.0)

        # the video-file counterpart behavior is the default: callers that
        # hand over raw frames still get them thinned toward video_fps
        assert self._marks(captured["frames"]) == [0, 4]
        assert captured["fps"] == 2.0

    def test_the_processor_is_told_not_to_resample(self):
        # without this the video processor re-samples the clip toward ITS
        # default rate (24fps absent metadata), redoing a selection the
        # caller already made — extra tokens and CPU per window
        model = self._make_model()

        self._capture_clip(model, self._frames(3), fps=12.0, subsample=False)

        kwargs = model._processor.call_args.kwargs
        assert kwargs["do_sample_frames"] is False
        # ...and the timestamps are built from the clip's REAL rate, not the
        # 24fps the processor assumes when no metadata is provided
        meta = kwargs["video_metadata"][0]
        fps = getattr(meta, "fps", None)
        if fps is None:
            fps = meta["fps"]
        assert fps == 12.0

    def test_an_older_processor_without_the_flag_still_embeds(self):
        model = self._make_model()
        inputs = model._processor.return_value

        def _strict(*args, **kwargs):
            if "do_sample_frames" in kwargs:
                raise TypeError(
                    "got an unexpected keyword argument 'do_sample_frames'"
                )
            return inputs

        model._processor = mock.MagicMock(side_effect=_strict)
        model._processor.apply_chat_template = mock.MagicMock(
            return_value="<chat-text>"
        )

        with mock.patch.object(
            qwen3_vl, "qwen_vl_utils", mock.MagicMock()
        ) as mock_qvu:
            mock_qvu.process_vision_info.return_value = (None, ["<video>"])
            result = model.embed_frames(self._frames(3), fps=3.0)

        assert isinstance(result, np.ndarray)
        assert result.ndim == 1

    def test_prepare_then_embed_matches_embed_frames(self):
        # the staged pipeline drives the two halves separately; they must
        # be the same computation as the monolithic call
        model = self._make_model()

        with mock.patch.object(
            qwen3_vl, "qwen_vl_utils", mock.MagicMock()
        ) as mock_qvu:
            mock_qvu.process_vision_info.return_value = (None, ["<video>"])
            split = model.embed_prepared(
                model.prepare_frames(self._frames(4), fps=4.0)
            )
            whole = model.embed_frames(self._frames(4), fps=4.0)

        assert split.ndim == 1
        np.testing.assert_array_equal(split, whole)


class TestMergePreparedInputs:
    """Batching prepared clips must keep every row's LAST real token at the
    last position, because the embedding pools the hidden state there."""

    PAD = 99

    @staticmethod
    def _clip(ids, n_patches, thw):
        return {
            "input_ids": torch.tensor([ids]),
            "attention_mask": torch.ones(1, len(ids), dtype=torch.long),
            "pixel_values_videos": torch.arange(
                n_patches * 3, dtype=torch.float32
            ).reshape(n_patches, 3),
            "video_grid_thw": torch.tensor([thw]),
        }

    def test_rows_are_left_padded_so_last_token_survives_pooling(self):
        merged = qwen3_vl.merge_prepared_inputs(
            [
                self._clip([1, 2, 3, 4, 5], 4, [1, 2, 2]),
                self._clip([6, 7], 6, [1, 3, 2]),
            ],
            self.PAD,
        )

        assert merged["input_ids"].shape == (2, 5)
        assert merged["input_ids"][0].tolist() == [1, 2, 3, 4, 5]
        assert merged["input_ids"][1].tolist() == [
            self.PAD,
            self.PAD,
            self.PAD,
            6,
            7,
        ]
        assert merged["attention_mask"][0].tolist() == [1, 1, 1, 1, 1]
        assert merged["attention_mask"][1].tolist() == [0, 0, 0, 1, 1]
        # Every clip's real last token sits where the pooling reads
        assert merged["input_ids"][0, -1].item() == 5
        assert merged["input_ids"][1, -1].item() == 7

    def test_visual_tensors_concatenate_in_clip_order(self):
        clip_a = self._clip([1, 2], 4, [1, 2, 2])
        clip_b = self._clip([3, 4], 6, [1, 3, 2])
        merged = qwen3_vl.merge_prepared_inputs([clip_a, clip_b], self.PAD)

        assert merged["pixel_values_videos"].shape == (10, 3)
        assert torch.equal(
            merged["pixel_values_videos"][:4], clip_a["pixel_values_videos"]
        )
        assert torch.equal(
            merged["pixel_values_videos"][4:], clip_b["pixel_values_videos"]
        )
        assert merged["video_grid_thw"].tolist() == [[1, 2, 2], [1, 3, 2]]

    def test_an_unknown_key_refuses_the_merge(self):
        clip = self._clip([1, 2], 4, [1, 2, 2])
        odd = self._clip([3, 4], 4, [1, 2, 2])
        odd["second_per_grid_ts"] = torch.tensor([0.5])

        assert qwen3_vl.merge_prepared_inputs([clip, odd], self.PAD) is None
        assert qwen3_vl.merge_prepared_inputs([odd, odd], self.PAD) is None

    def test_a_non_tensor_value_refuses_the_merge(self):
        clip = self._clip([1, 2], 4, [1, 2, 2])
        clip["attention_mask"] = [[1, 1]]

        assert qwen3_vl.merge_prepared_inputs([clip, clip], self.PAD) is None


def _frames_indices_of(metadata):
    indices = getattr(metadata, "frames_indices", None)
    if indices is None and isinstance(metadata, dict):
        indices = metadata.get("frames_indices")

    return indices


class StubVisionUtils:
    """Stands in for qwen_vl_utils, which need not be installed to test the
    processor calling convention."""

    @staticmethod
    def process_vision_info(messages):
        return None, [messages[0]["content"][0]["video"]]


class StubStrictProcessor:
    """Mimics the transformers 5.x processor: when frames are pre-sampled it
    reads ``metadata.frames_indices`` directly and dies on None — the crash a
    real run hit in its probe."""

    def __init__(self):
        self.calls = []

    def apply_chat_template(self, messages, **kwargs):
        return "clip"

    def __call__(self, text, images, videos, return_tensors, padding, **extra):
        self.calls.append(extra)
        metadata = extra.get("video_metadata")
        if metadata is not None:
            if _frames_indices_of(metadata[0]) is None:
                raise AttributeError(
                    "'NoneType' object has no attribute 'tolist'"
                )

        return {"stub": True}


class StubMetadataRejectingProcessor(StubStrictProcessor):
    """A processor that cannot digest metadata AT ALL, so the call must fall
    through to the plainer conventions instead of failing the clip."""

    def __call__(self, text, images, videos, return_tensors, padding, **extra):
        self.calls.append(extra)
        if "video_metadata" in extra:
            raise AttributeError("unexpected metadata shape")

        return {"stub": True}


class TestFrameListMetadata:
    """A frame-list clip's metadata must name its frames, and processor
    version drift must degrade the calling convention, never fail the clip."""

    @staticmethod
    def _model_with(processor):
        model = object.__new__(Qwen3VLModel)
        model._processor = processor
        return model

    @staticmethod
    def _frames(n):
        return [
            PIL.Image.new("RGB", (32, 32), (i * 40, 0, 0)) for i in range(n)
        ]

    def test_metadata_names_every_frame_of_the_clip(self):
        metadata = Qwen3VLModel._video_metadata(4, 2.0)

        assert _frames_indices_of(metadata) == [0, 1, 2, 3]

    def test_a_frames_indices_reading_processor_gets_them(self, monkeypatch):
        monkeypatch.setattr(qwen3_vl, "qwen_vl_utils", StubVisionUtils())
        processor = StubStrictProcessor()
        model = self._model_with(processor)

        result = model._prepare_frame_list(self._frames(3), 2.0)

        assert result == {"stub": True}
        metadata = processor.calls[0]["video_metadata"][0]
        assert _frames_indices_of(metadata) == [0, 1, 2]

    def test_a_metadata_rejecting_processor_falls_through(self, monkeypatch):
        monkeypatch.setattr(qwen3_vl, "qwen_vl_utils", StubVisionUtils())
        processor = StubMetadataRejectingProcessor()
        model = self._model_with(processor)

        result = model._prepare_frame_list(self._frames(3), 2.0)

        assert result == {"stub": True}
        # The metadata-free convention that succeeded still suppresses the
        # processor's own frame resampling
        assert processor.calls[-1] == {"do_sample_frames": False}


def _tiny_checkpoint(tmp_path, max_shard_size):
    """Saves a tiny but real Qwen3-VL checkpoint and returns its directory."""
    # pylint: disable=import-error
    import transformers

    # Both ARE keyword-only parameters of this constructor; pylint cannot see
    # them through transformers' lazy module
    # pylint: disable=unexpected-keyword-arg
    config = transformers.Qwen3VLConfig(
        text_config=dict(
            hidden_size=32,
            intermediate_size=64,
            num_hidden_layers=2,
            num_attention_heads=4,
            num_key_value_heads=2,
            head_dim=8,
            vocab_size=200,
            rope_scaling={"rope_type": "default", "mrope_section": [2, 1, 1]},
        ),
        vision_config=dict(
            hidden_size=32,
            intermediate_size=64,
            depth=2,
            num_heads=4,
            out_hidden_size=32,
            deepstack_visual_indexes=[0],
        ),
    )
    torch.manual_seed(0)
    full = transformers.Qwen3VLForConditionalGeneration(config).eval()
    path = str(tmp_path / "ckpt")
    full.save_pretrained(
        path, safe_serialization=True, max_shard_size=max_shard_size
    )
    return path, full


class TestQwen3VLTextOnly:
    """Loading only the language tower, for a process that will encode
    prompts and nothing else."""

    @pytest.mark.parametrize(
        "max_shard_size", ["50GB", "30KB"], ids=["unsharded", "sharded"]
    )
    def test_the_text_tower_alone_reproduces_the_full_model(
        self, tmp_path, max_shard_size
    ):
        """The reason this is safe at all: a prompt seeded by a text-only load
        must score against vectors the full model wrote, so the two towers have
        to agree exactly rather than approximately."""
        path, full = _tiny_checkpoint(tmp_path, max_shard_size)
        lean = qwen3_vl.load_text_model(
            path, dtype=torch.float32, device="cpu"
        )

        ids = torch.tensor([[5, 9, 11, 42, 7]])
        mask = torch.ones_like(ids)
        with torch.no_grad():
            expected = full.model(
                input_ids=ids,
                attention_mask=mask,
                output_hidden_states=True,
                return_dict=True,
            ).hidden_states[-1]
            actual = lean(
                input_ids=ids, attention_mask=mask, return_dict=True
            ).last_hidden_state

        torch.testing.assert_close(actual, expected, rtol=0, atol=0)

    def test_the_vision_shards_are_never_read(self, tmp_path):
        """The saving, on a cold box: the vision tower is not downloaded
        either."""
        path, _ = _tiny_checkpoint(tmp_path, "30KB")
        with open(os.path.join(path, "model.safetensors.index.json")) as f:
            weight_map = json.load(f)["weight_map"]

        vision = {v for k, v in weight_map.items() if ".visual." in k}
        text = {v for k, v in weight_map.items() if ".visual." not in k}
        vision_only = vision - text
        assert vision_only, "this checkpoint did not shard the vision tower"

        opened = []
        real_shard_path = qwen3_vl._shard_path

        def record(name_or_path, filename):
            opened.append(filename)
            return real_shard_path(name_or_path, filename)

        with mock.patch.object(qwen3_vl, "_shard_path", record):
            qwen3_vl.load_text_model(path, dtype=torch.float32, device="cpu")

        assert not (set(opened) & vision_only)

    def test_a_checkpoint_with_no_text_tower_is_refused(self, tmp_path):
        """Loading nothing would leave a freshly initialized tower, which
        answers every prompt — with noise."""
        with pytest.raises(ValueError, match="no Qwen3-VL language tower"):
            qwen3_vl._text_prefix({"something.else"}, {"layers.0.weight"})

    def test_text_only_refuses_an_output_processor(self):
        with pytest.raises(ValueError, match="no vision tower"):
            Qwen3VLModelConfig(
                {
                    "name_or_path": "Qwen/Qwen3-VL-2B-Instruct",
                    "output_processor_cls": (
                        "fiftyone.utils.qwen3_vl.Qwen3VLOutputProcessor"
                    ),
                    "text_only": True,
                }
            )

    @pytest.mark.parametrize(
        "call",
        [
            lambda m: m._forward_pass([PIL.Image.new("RGB", (8, 8))]),
            lambda m: m.prepare_frames([PIL.Image.new("RGB", (8, 8))]),
            lambda m: m.embed_prepared({}),
            lambda m: m.embed_prepared_all([{}, {}]),
        ],
        ids=["forward", "prepare_frames", "embed_prepared", "embed_all"],
    )
    def test_a_media_path_raises_rather_than_returning_noise(self, call):
        model = Qwen3VLModel.__new__(Qwen3VLModel)
        model._output_processor = None
        model._mode = None
        model.config = Qwen3VLModelConfig(
            {
                "name_or_path": "Qwen/Qwen3-VL-Embedding-2B",
                "text_only": True,
            }
        )

        assert model.can_embed_prompts is True
        # It holds no vision tower, so advertising image embeddings would have
        # a compute_embeddings run fail per sample instead of at load
        assert model.has_embeddings is False
        with pytest.raises(ValueError, match="text_only"):
            call(model)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
