"""
Tests for fiftyone/utils/twelvelabs.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest import mock

import numpy as np
import pytest

import fiftyone.core.labels as fol
import fiftyone.utils.twelvelabs as foutl
from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig


class TestTwelveLabsModelConfig:
    """Test config parsing/validation (no network)."""

    def test_defaults(self):
        config = TwelveLabsModelConfig({})
        assert config.operation == "embed"
        assert config.embedding_model == "marengo3.0"
        assert config.analysis_model == "pegasus1.5"
        assert config.max_tokens == 512

    def test_invalid_operation(self):
        with pytest.raises(ValueError):
            TwelveLabsModelConfig({"operation": "bogus"})

    def test_invalid_max_tokens(self):
        with pytest.raises(ValueError):
            TwelveLabsModelConfig({"max_tokens": 16})


class TestTwelveLabsModel:
    """Test model wiring with a mocked client (no network)."""

    @mock.patch.object(foutl, "twelvelabs", new_callable=mock.MagicMock)
    def test_missing_api_key(self, _mock_tl):
        with mock.patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError):
                TwelveLabsModel(TwelveLabsModelConfig({}))

    @mock.patch.object(foutl, "twelvelabs", new_callable=mock.MagicMock)
    def test_properties(self, _mock_tl):
        model = TwelveLabsModel(TwelveLabsModelConfig({"api_key": "sk-test"}))
        assert model.media_type == "video"
        assert model.has_embeddings is True
        assert model.can_embed_prompts is True
        assert model.ragged_batches is False

    @mock.patch.object(foutl, "twelvelabs", new_callable=mock.MagicMock)
    def test_embed_video(self, mock_tl):
        client = mock_tl.TwelveLabs.return_value

        task = mock.Mock(id="task-1")
        client.embed.tasks.create.return_value = task

        clip = mock.Mock(embedding_scope="clip", float_=[0.0] * 512)
        video = mock.Mock(embedding_scope="video", float_=list(range(512)))
        retrieved = mock.Mock()
        retrieved.video_embedding.segments = [clip, video]
        client.embed.tasks.retrieve.return_value = retrieved

        model = TwelveLabsModel(TwelveLabsModelConfig({"api_key": "sk-test"}))

        emb = model.embed("https://example.com/video.mp4")
        assert isinstance(emb, np.ndarray)
        assert emb.shape == (512,)
        # The whole-video segment is preferred over the clip segment
        assert emb[1] == pytest.approx(1.0)

        # URL inputs are passed through without uploading
        _, kwargs = client.embed.tasks.create.call_args
        assert kwargs["video_url"] == "https://example.com/video.mp4"
        assert "clip" in kwargs["video_embedding_scope"]

        # get_embeddings() returns a batched array
        assert model.get_embeddings().shape == (1, 512)

    @mock.patch.object(foutl, "twelvelabs", new_callable=mock.MagicMock)
    def test_embed_prompt(self, mock_tl):
        client = mock_tl.TwelveLabs.return_value

        segment = mock.Mock(float_=list(range(512)))
        response = mock.Mock()
        response.text_embedding.segments = [segment]
        client.embed.create.return_value = response

        model = TwelveLabsModel(TwelveLabsModelConfig({"api_key": "sk-test"}))

        emb = model.embed_prompt("a person riding a bike")
        assert emb.shape == (512,)
        _, kwargs = client.embed.create.call_args
        assert kwargs["text"] == "a person riding a bike"

    @mock.patch.object(foutl, "twelvelabs", new_callable=mock.MagicMock)
    def test_predict_caption(self, mock_tl):
        client = mock_tl.TwelveLabs.return_value
        client.analyze.return_value = mock.Mock(data="  A dog runs.  ")

        model = TwelveLabsModel(
            TwelveLabsModelConfig(
                {"api_key": "sk-test", "operation": "caption"}
            )
        )

        label = model.predict("https://example.com/video.mp4")
        assert isinstance(label, fol.Classification)
        assert label.label == "A dog runs."
