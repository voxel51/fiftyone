"""
Tests for fiftyone/utils/torch.py ClassifierOutputProcessor.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch

import fiftyone.core.labels as fol


def _processor(classes=None, store_logits=False):
    from fiftyone.utils.torch import ClassifierOutputProcessor

    return ClassifierOutputProcessor(
        classes=classes or ["cat", "dog", "bird"], store_logits=store_logits
    )


class TestClassifierOutputProcessor:
    def test_requires_classes(self):
        from fiftyone.utils.torch import ClassifierOutputProcessor

        with pytest.raises(ValueError, match="requires class labels"):
            ClassifierOutputProcessor(classes=None)

    def test_confidence_matches_softmax(self):
        processor = _processor()
        logits = torch.tensor([[1.0, 3.0, 2.0]])

        preds = processor(logits, None)

        expected = torch.softmax(logits, dim=1).max().item()
        assert preds[0].label == "dog"
        assert preds[0].confidence == pytest.approx(expected, abs=1e-6)

    def test_half_precision_logits_are_finite(self):
        # A model running under torch.amp.autocast emits half-precision
        # logits; exponentiating them directly overflows and yields NaN
        processor = _processor()
        logits = torch.tensor([[10.0, 23.4, 5.0]], dtype=torch.float16)

        preds = processor(logits, None)

        assert preds[0].label == "dog"
        assert np.isfinite(preds[0].confidence)
        assert 0.0 <= preds[0].confidence <= 1.0
        expected = torch.softmax(logits.float(), dim=1).max().item()
        assert preds[0].confidence == pytest.approx(expected, abs=1e-3)

    def test_large_logits_are_finite(self):
        processor = _processor()
        logits = torch.tensor([[500.0, 100.0, 0.0]])

        preds = processor(logits, None)

        assert preds[0].label == "cat"
        assert preds[0].confidence == pytest.approx(1.0)

    def test_batch_is_scored_per_row(self):
        processor = _processor()
        logits = torch.tensor([[5.0, 0.0, 0.0], [0.0, 0.0, 5.0]])

        preds = processor(logits, None)

        assert [p.label for p in preds] == ["cat", "bird"]
        assert all(np.isfinite(p.confidence) for p in preds)

    def test_confidence_thresh_blanks_the_label(self):
        processor = _processor()
        logits = torch.tensor([[1.0, 1.1, 1.0]])

        preds = processor(logits, None, confidence_thresh=0.9)

        assert preds[0].label is None

    def test_class_filter_blanks_the_label(self):
        processor = _processor()
        logits = torch.tensor([[1.0, 3.0, 2.0]])

        preds = processor(logits, None, classes=["cat"])

        assert preds[0].label is None

    def test_logits_are_stored_when_requested(self):
        processor = _processor(store_logits=True)
        logits = torch.tensor([[1.0, 3.0, 2.0]])

        preds = processor(logits, None)

        assert isinstance(preds[0], fol.Classification)
        np.testing.assert_allclose(preds[0].logits, [1.0, 3.0, 2.0])

    def test_dict_output_is_unwrapped(self):
        processor = _processor()
        logits = torch.tensor([[1.0, 3.0, 2.0]])

        preds = processor({"logits": logits}, None)

        assert preds[0].label == "dog"
