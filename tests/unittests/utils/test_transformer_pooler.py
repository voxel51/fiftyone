"""
Tests for ZeroShotTransformerPromptMixin._embed_prompts pooler_output unwrap.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import types
from unittest import mock

import numpy as np
import pytest
import torch


def _make_mixin(get_text_features_return):
    """Build a minimal ZeroShotTransformerPromptMixin instance with mocks."""
    pytest.importorskip("transformers")
    from fiftyone.utils.transformers import ZeroShotTransformerPromptMixin

    mixin = ZeroShotTransformerPromptMixin.__new__(
        ZeroShotTransformerPromptMixin
    )

    base_model = mock.MagicMock()
    base_model.get_text_features.return_value = get_text_features_return

    model = mock.MagicMock()
    model.base_model = base_model

    mixin._model = model
    mixin._device = "cpu"
    mixin.preprocess = True

    inputs_mock = mock.MagicMock()
    inputs_mock.to.return_value = {}
    processor_mock = mock.MagicMock(return_value=inputs_mock)
    transforms_mock = mock.MagicMock()
    transforms_mock.processor = processor_mock
    transforms_mock.kwargs = {}
    mixin.transforms = transforms_mock

    return mixin


def _pooling_output(pooler_output):
    """Build a transformers ``BaseModelOutputWithPooling`` for tests.

    The import is deferred so this module can still be collected when
    ``transformers`` is not installed.
    """
    pytest.importorskip("transformers")
    from transformers.modeling_outputs import BaseModelOutputWithPooling

    return BaseModelOutputWithPooling(pooler_output=pooler_output)


class TestEmbedPromptsPoolerUnwrap:
    """Test that _embed_prompts handles plain-tensor and pooler_output returns."""

    def test_plain_tensor_returned_unchanged(self):
        """When get_text_features returns a plain tensor, it should pass through."""
        tensor = torch.randn(2, 512)
        mixin = _make_mixin(tensor)
        result = mixin._embed_prompts(["cat", "dog"])
        assert isinstance(result, torch.Tensor)
        assert result.shape == (2, 512)

    def test_pooler_output_object_is_unwrapped(self):
        """transformers 5.x returns a BaseModelOutputWithPooling; must unwrap."""
        pooler_tensor = torch.randn(2, 512)
        model_output = _pooling_output(pooler_tensor)
        mixin = _make_mixin(model_output)
        result = mixin._embed_prompts(["cat", "dog"])
        assert isinstance(result, torch.Tensor)
        assert result.shape == (2, 512)
        assert torch.equal(result, pooler_tensor)

    def test_base_model_output_without_pooler_output_raises(self):
        """A BaseModelOutputWithPooling whose pooler_output is None must raise."""
        model_output = _pooling_output(None)
        mixin = _make_mixin(model_output)
        with pytest.raises(ValueError, match="pooler_output"):
            mixin._embed_prompts(["cat"])

    def test_unsupported_output_type_raises(self):
        """An output that is neither a tensor nor a pooling output must raise."""
        bad_output = types.SimpleNamespace(
            last_hidden_state=torch.randn(2, 10, 512)
        )
        mixin = _make_mixin(bad_output)
        with pytest.raises(ValueError, match="unsupported"):
            mixin._embed_prompts(["cat"])

    def test_embed_prompts_returns_numpy_array(self):
        """embed_prompts (public) should return a numpy array."""
        tensor = torch.randn(3, 256)
        mixin = _make_mixin(tensor)
        result = mixin.embed_prompts(["a", "b", "c"])
        assert isinstance(result, np.ndarray)
        assert result.shape == (3, 256)

    def test_embed_prompts_pooler_output_returns_numpy_array(self):
        """Public embed_prompts must unwrap pooler_output (sort_by_similarity path)."""
        pooler_tensor = torch.randn(3, 256)
        model_output = _pooling_output(pooler_tensor)
        mixin = _make_mixin(model_output)
        result = mixin.embed_prompts(["a", "b", "c"])
        assert isinstance(result, np.ndarray)
        assert result.shape == (3, 256)
        assert np.allclose(result, pooler_tensor.numpy())
