"""
Tests for the label conversion helpers of fiftyone/utils/transformers.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace

import numpy as np
import pytest

# Importing fiftyone.utils.transformers runs ensure_package("transformers")
# at module scope, so the whole module must skip where it is not installed.
transformers = pytest.importorskip("transformers")

import torch

import fiftyone.core.labels as fol
import fiftyone.utils.transformers as fout

ID2LABEL = {0: "cat", 1: "dog", 2: "bird"}


class TestToClassification:
    def test_single_result_returns_one_classification(self):
        logits = [0.5, 2.0, -1.0]
        results = SimpleNamespace(logits=torch.tensor([logits]))

        label = fout.to_classification(results, ID2LABEL)

        assert isinstance(label, fol.Classification)
        assert label.label == "dog"
        assert label.confidence == pytest.approx(
            np.exp(2.0) / np.sum(np.exp(logits))
        )
        np.testing.assert_allclose(label.logits, logits)

    def test_batch_returns_one_classification_per_row(self):
        results = SimpleNamespace(
            logits=torch.tensor([[3.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
        )

        labels = fout.to_classification(results, ID2LABEL)

        assert [label.label for label in labels] == ["cat", "bird"]
