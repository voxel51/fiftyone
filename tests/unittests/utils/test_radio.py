"""Comprehensive test suite for C-RADIOv4 wrapper - extended coverage."""

import logging
import os
import sys
import tempfile

import fiftyone as fo
import fiftyone.brain as fob
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.utils.torch as fout
import fiftyone.zoo as foz
import fiftyone.zoo.models as fozm
import numpy as np
from PIL import Image
import pytest
import torch

pytest.importorskip("transformers")

_run_inference = os.environ.get("FIFTYONE_TEST_INFERENCE", "0") == "1"

requires_inference = pytest.mark.skipif(
    not _run_inference,
    reason="Set FIFTYONE_TEST_INFERENCE=1 to run model inference tests",
)

from fiftyone.utils.radio import (
    CRadioV4Model,
    CRadioV4ModelConfig,
    DEFAULT_CRADIO_MODEL,
    RadioOutputProcessor,
    SpatialHeatmapOutputProcessor,
)


# =============================================================================
# CONFIG TESTS
# =============================================================================

def test_config_default_repo():
    config = CRadioV4ModelConfig({})
    assert config.hf_repo == DEFAULT_CRADIO_MODEL
    assert config.hf_repo == "nvidia/C-RADIOv4-H"

def test_config_output_summary():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    assert config.output_type == "summary"
    assert config.as_feature_extractor

def test_config_output_spatial():
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    assert config.output_type == "spatial"
    assert not getattr(config, 'as_feature_extractor', False)

def test_config_mixed_precision_default():
    config = CRadioV4ModelConfig({})
    assert config.use_mixed_precision

def test_config_mixed_precision_false():
    config = CRadioV4ModelConfig({"use_mixed_precision": False})
    assert not config.use_mixed_precision

def test_config_smoothing_default():
    config = CRadioV4ModelConfig({})
    assert config.apply_smoothing

def test_config_smoothing_false():
    config = CRadioV4ModelConfig({"apply_smoothing": False})
    assert not config.apply_smoothing

def test_config_sigma_default():
    config = CRadioV4ModelConfig({})
    assert config.smoothing_sigma == 1.51

def test_config_sigma_custom():
    config = CRadioV4ModelConfig({"smoothing_sigma": 3.0})
    assert config.smoothing_sigma == 3.0

def test_config_so400m():
    config = CRadioV4ModelConfig({"hf_repo": "nvidia/C-RADIOv4-SO400M"})
    assert config.hf_repo == "nvidia/C-RADIOv4-SO400M"

def test_config_hf_revision():
    config = CRadioV4ModelConfig({"hf_revision": "deadbeef"})
    assert config.hf_revision == "deadbeef"

def test_config_inheritance():
    config = CRadioV4ModelConfig({})
    assert isinstance(config, fout.TorchImageModelConfig)

def test_config_has_zoo_model():
    config = CRadioV4ModelConfig({})
    assert isinstance(config, fozm.HasZooModel)

def test_config_combined():
    config = CRadioV4ModelConfig({
        "hf_repo": "nvidia/C-RADIOv4-SO400M",
        "hf_revision": "deadbeef",
        "output_type": "spatial",
        "use_mixed_precision": False,
        "apply_smoothing": True,
        "smoothing_sigma": 2.0,
    })
    assert config.hf_repo == "nvidia/C-RADIOv4-SO400M"
    assert config.hf_revision == "deadbeef"
    assert config.output_type == "spatial"
    assert not config.use_mixed_precision
    assert config.apply_smoothing
    assert config.smoothing_sigma == 2.0


def test_load_model_uses_hf_revision(monkeypatch):
    class _StubModel:
        def __init__(self):
            self.device = None
            self.eval_called = False

        def to(self, device):
            self.device = device
            return self

        def eval(self):
            self.eval_called = True

    class _StubWrapper:
        _device = "cpu"

    calls = {}

    def _fake_from_pretrained(repo, **kwargs):
        calls["repo"] = repo
        calls["kwargs"] = kwargs
        return _StubModel()

    monkeypatch.setattr(
        "transformers.AutoModel.from_pretrained", _fake_from_pretrained
    )

    config = CRadioV4ModelConfig({"hf_revision": "deadbeef"})
    model = CRadioV4Model._load_model(_StubWrapper(), config)

    assert calls["repo"] == config.hf_repo
    assert calls["kwargs"]["trust_remote_code"] is True
    assert calls["kwargs"]["revision"] == "deadbeef"
    assert model.device == "cpu"
    assert model.eval_called


def test_load_image_processor_uses_hf_revision(monkeypatch):
    calls = {}

    def _fake_from_pretrained(repo, **kwargs):
        calls["repo"] = repo
        calls["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(
        "transformers.CLIPImageProcessor.from_pretrained",
        _fake_from_pretrained,
    )

    config = CRadioV4ModelConfig({"hf_revision": "deadbeef"})
    CRadioV4Model._load_image_processor(None, config)

    assert calls["repo"] == config.hf_repo
    assert calls["kwargs"]["revision"] == "deadbeef"


def test_check_mixed_precision_support_handles_runtime_error(
    monkeypatch, caplog
):
    class _StubWrapper:
        _device = "cuda:0"
        _using_gpu = True

    def _raise_runtime_error(_device):
        raise RuntimeError("device query failed")

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(
        torch.cuda, "get_device_capability", _raise_runtime_error
    )

    with caplog.at_level(logging.WARNING, logger="fiftyone.utils.radio"):
        supported = CRadioV4Model._check_mixed_precision_support(
            _StubWrapper()
        )

    assert not supported
    assert "Could not determine mixed precision support" in caplog.text


# =============================================================================
# OUTPUT PROCESSOR TESTS
# =============================================================================

def test_radio_proc_batch1():
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560)
    result = proc(tensor, (640, 480))
    assert len(result) == 1
    assert result[0].shape == (2560,)

def test_radio_proc_batch_multi():
    proc = RadioOutputProcessor()
    tensor = torch.randn(8, 2560)
    result = proc(tensor, [(100, 100)] * 8)
    assert len(result) == 8

def test_radio_proc_dim():
    proc = RadioOutputProcessor()
    for dim in [512, 1024, 2560, 3072]:
        tensor = torch.randn(1, dim)
        result = proc(tensor, (100, 100))
        assert result[0].shape == (dim,)

def test_radio_proc_dtype_bfloat16():
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).bfloat16()
    result = proc(tensor, (100, 100))
    assert result[0].dtype == np.float32

def test_radio_proc_gpu():
    if not torch.cuda.is_available():
        return
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).cuda()
    result = proc(tensor, (100, 100))
    assert isinstance(result[0], np.ndarray)

def test_radio_proc_numpy():
    proc = RadioOutputProcessor()
    arr = np.random.randn(3, 2560).astype(np.float32)
    result = proc(arr, [(100, 100)] * 3)
    assert len(result) == 3

def test_spatial_proc_nchw():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 1280, 32, 32)
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_nlc():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 256, 1280)
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_prime_tokens_warns(caplog):
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 509, 1280)

    with caplog.at_level(logging.WARNING, logger="fiftyone.utils.radio"):
        result = proc(tensor, [(640, 480)])

    assert result[0].map.shape == (480, 640)
    assert "Prime token count 509 produced a 1x509 spatial layout" in caplog.text

def test_spatial_proc_dtype_and_range():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 16, 16)
    result = proc(tensor, [(320, 240)])
    assert result[0].map.dtype == np.uint8
    assert result[0].map.min() >= 0
    assert result[0].map.max() <= 255
    assert result[0].range == [0, 255]

def test_spatial_proc_smoothing_effect():
    tensor = torch.randn(1, 512, 16, 16)

    proc_smooth = SpatialHeatmapOutputProcessor(apply_smoothing=True, smoothing_sigma=2.0)
    proc_no_smooth = SpatialHeatmapOutputProcessor(apply_smoothing=False)

    result_smooth = proc_smooth(tensor.clone(), [(320, 240)])
    result_no_smooth = proc_no_smooth(tensor.clone(), [(320, 240)])

    assert not np.array_equal(result_smooth[0].map, result_no_smooth[0].map)

def test_spatial_proc_nan_inf():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 8, 8)
    tensor[0, :10, 0, 0] = float('nan')
    tensor[0, 10:20, 1, 1] = float('inf')
    tensor[0, 20:30, 2, 2] = float('-inf')
    result = proc(tensor, [(100, 100)])
    assert not np.isnan(result[0].map).any()
    assert not np.isinf(result[0].map).any()

def test_spatial_proc_constant():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.ones(1, 512, 8, 8)
    result = proc(tensor, [(100, 100)])
    assert result[0].map.shape == (100, 100)

def test_spatial_proc_batch_diff_sizes():
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(4, 512, 16, 16)
    sizes = [(640, 480), (800, 600), (1024, 768), (320, 240)]
    result = proc(tensor, sizes)
    assert len(result) == 4
    assert result[0].map.shape == (480, 640)
    assert result[1].map.shape == (600, 800)
    assert result[2].map.shape == (768, 1024)
    assert result[3].map.shape == (240, 320)


# =============================================================================
# INFERENCE TESTS (require model download)
# =============================================================================

@requires_inference
def test_infer_summary_single():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(128, 128, 128))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

@requires_inference
def test_infer_summary_batch_mixed_sizes():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    imgs = [
        Image.new("RGB", (256, 256)),
        Image.new("RGB", (512, 512)),
        Image.new("RGB", (640, 480)),
        Image.new("RGB", (1024, 768)),
    ]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 4
    for r in result:
        assert r.shape == (2560,)

@requires_inference
def test_infer_spatial_single():
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (640, 480))
    with model:
        result = model._predict_all([img])
    assert isinstance(result[0], fol.Heatmap)
    assert result[0].map.shape == (480, 640)

@requires_inference
def test_infer_spatial_batch():
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    imgs = [
        Image.new("RGB", (320, 240)),
        Image.new("RGB", (640, 480)),
    ]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 2
    assert result[0].map.shape == (240, 320)
    assert result[1].map.shape == (480, 640)

@requires_inference
def test_infer_empty_input():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    with model:
        result = model._predict_all([])
    assert result == []

@requires_inference
def test_infer_min_size():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (32, 32))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

@requires_inference
def test_infer_model_reuse():
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    with model:
        for i in range(3):
            img = Image.new("RGB", (256, 256), color=(i*80, i*80, i*80))
            result = model._predict_all([img])
            assert result[0].shape == (2560,)


# =============================================================================
# FIFTYONE INTEGRATION TESTS (require model download)
# =============================================================================

@requires_inference
def test_fo_model_type():
    config = CRadioV4ModelConfig({})
    model = CRadioV4Model(config)
    assert isinstance(model, fom.Model)

@requires_inference
def test_fo_compute_embeddings():
    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="test_emb")

        for sample in dataset:
            emb = np.array(sample.test_emb)
            assert emb.shape == (2560,)
    finally:
        fo.delete_dataset(dataset.name)

@requires_inference
def test_fo_apply_model_spatial():
    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "spatial"})
        model = CRadioV4Model(config)

        dataset.apply_model(model, label_field="test_heat")

        for sample in dataset:
            assert isinstance(sample.test_heat, fol.Heatmap)
            img = Image.open(sample.filepath)
            w, h = img.size
            heat_h, heat_w = sample.test_heat.map.shape
            assert heat_w == w
            assert heat_h == h
    finally:
        fo.delete_dataset(dataset.name)


# =============================================================================
# RUN ALL TESTS
# =============================================================================

if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
