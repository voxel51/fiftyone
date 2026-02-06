"""Comprehensive test suite for C-RADIOv4 wrapper - extended coverage."""

import logging
logging.basicConfig(level=logging.WARNING)

import numpy as np
from PIL import Image
import pytest
import torch
import tempfile
import os
import sys


# =============================================================================
# CONFIG TESTS - EXTENDED
# =============================================================================

def test_config_default_repo():
    from fiftyone.utils.radio import CRadioV4ModelConfig, DEFAULT_CRADIO_MODEL
    config = CRadioV4ModelConfig({})
    assert config.hf_repo == DEFAULT_CRADIO_MODEL
    assert config.hf_repo == "nvidia/C-RADIOv4-H"

def test_config_output_summary():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"output_type": "summary"})
    assert config.output_type == "summary"
    assert config.as_feature_extractor == True

def test_config_output_spatial():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    assert config.output_type == "spatial"
    assert not getattr(config, 'as_feature_extractor', False)

def test_config_mixed_precision_default():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({})
    assert config.use_mixed_precision == True

def test_config_mixed_precision_false():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"use_mixed_precision": False})
    assert config.use_mixed_precision == False

def test_config_smoothing_default():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({})
    assert config.apply_smoothing == True

def test_config_smoothing_false():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"apply_smoothing": False})
    assert config.apply_smoothing == False

def test_config_sigma_default():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({})
    assert config.smoothing_sigma == 1.51

def test_config_sigma_custom():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"smoothing_sigma": 3.0})
    assert config.smoothing_sigma == 3.0

def test_config_sigma_zero():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"smoothing_sigma": 0.0})
    assert config.smoothing_sigma == 0.0

def test_config_sigma_small():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"smoothing_sigma": 0.1})
    assert config.smoothing_sigma == 0.1

def test_config_sigma_large():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"smoothing_sigma": 10.0})
    assert config.smoothing_sigma == 10.0

def test_config_so400m():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({"hf_repo": "nvidia/C-RADIOv4-SO400M"})
    assert config.hf_repo == "nvidia/C-RADIOv4-SO400M"

def test_config_inheritance():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    import fiftyone.utils.torch as fout
    config = CRadioV4ModelConfig({})
    assert isinstance(config, fout.TorchImageModelConfig)

def test_config_has_zoo_model():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    import fiftyone.zoo.models as fozm
    config = CRadioV4ModelConfig({})
    assert isinstance(config, fozm.HasZooModel)

def test_config_combined():
    from fiftyone.utils.radio import CRadioV4ModelConfig
    config = CRadioV4ModelConfig({
        "hf_repo": "nvidia/C-RADIOv4-SO400M",
        "output_type": "spatial",
        "use_mixed_precision": False,
        "apply_smoothing": True,
        "smoothing_sigma": 2.0,
    })
    assert config.hf_repo == "nvidia/C-RADIOv4-SO400M"
    assert config.output_type == "spatial"
    assert config.use_mixed_precision == False
    assert config.apply_smoothing == True
    assert config.smoothing_sigma == 2.0


# =============================================================================
# OUTPUT PROCESSOR TESTS - EXTENDED
# =============================================================================

def test_radio_proc_batch1():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560)
    result = proc(tensor, (640, 480))
    assert len(result) == 1
    assert result[0].shape == (2560,)

def test_radio_proc_batch2():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(2, 2560)
    result = proc(tensor, [(640, 480), (800, 600)])
    assert len(result) == 2

def test_radio_proc_batch8():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(8, 2560)
    result = proc(tensor, [(100, 100)] * 8)
    assert len(result) == 8

def test_radio_proc_batch16():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(16, 2560)
    result = proc(tensor, [(100, 100)] * 16)
    assert len(result) == 16

def test_radio_proc_dim():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    for dim in [512, 1024, 2560, 3072]:
        tensor = torch.randn(1, dim)
        result = proc(tensor, (100, 100))
        assert result[0].shape == (dim,)

def test_radio_proc_dtype_float32():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).float()
    result = proc(tensor, (100, 100))
    assert result[0].dtype == np.float32

def test_radio_proc_dtype_float16():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).half()
    result = proc(tensor, (100, 100))
    # numpy converts to float32 or float16 depending on version
    assert result[0].dtype in [np.float32, np.float16]

def test_radio_proc_dtype_bfloat16():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).bfloat16()
    result = proc(tensor, (100, 100))
    assert result[0].dtype == np.float32  # bfloat16 converts to float32

def test_radio_proc_gpu():
    from fiftyone.utils.radio import RadioOutputProcessor
    if not torch.cuda.is_available():
        return  # Skip if no GPU
    proc = RadioOutputProcessor()
    tensor = torch.randn(1, 2560).cuda()
    result = proc(tensor, (100, 100))
    assert isinstance(result[0], np.ndarray)

def test_radio_proc_numpy():
    from fiftyone.utils.radio import RadioOutputProcessor
    proc = RadioOutputProcessor()
    arr = np.random.randn(3, 2560).astype(np.float32)
    result = proc(arr, [(100, 100)] * 3)
    assert len(result) == 3

def test_spatial_proc_nchw():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 1280, 32, 32)
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_nchw_small():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 16, 16)
    result = proc(tensor, [(320, 240)])
    assert result[0].map.shape == (240, 320)

def test_spatial_proc_nchw_large():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 2048, 64, 64)
    result = proc(tensor, [(1024, 768)])
    assert result[0].map.shape == (768, 1024)

def test_spatial_proc_nlc_256():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 256, 1280)  # 16x16 patches
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_nlc_1024():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 1024, 1280)  # 32x32 patches
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_nlc_nonsquare():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 1280)  # 32x16 or 16x32
    result = proc(tensor, [(640, 480)])
    assert result[0].map.shape == (480, 640)

def test_spatial_proc_dtype():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 16, 16)
    result = proc(tensor, [(320, 240)])
    assert result[0].map.dtype == np.uint8

def test_spatial_proc_range():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 16, 16)
    result = proc(tensor, [(320, 240)])
    assert result[0].map.min() >= 0
    assert result[0].map.max() <= 255

def test_spatial_proc_range_attr():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 16, 16)
    result = proc(tensor, [(320, 240)])
    assert result[0].range == [0, 255]

def test_spatial_proc_smoothing_effect():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    tensor = torch.randn(1, 512, 16, 16)

    proc_smooth = SpatialHeatmapOutputProcessor(apply_smoothing=True, smoothing_sigma=2.0)
    proc_no_smooth = SpatialHeatmapOutputProcessor(apply_smoothing=False)

    result_smooth = proc_smooth(tensor.clone(), [(320, 240)])
    result_no_smooth = proc_no_smooth(tensor.clone(), [(320, 240)])

    # Smoothed version should have lower variance in local regions
    # (just check they're different)
    assert not np.array_equal(result_smooth[0].map, result_no_smooth[0].map)

def test_spatial_proc_all_nan():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.full((1, 512, 8, 8), float('nan'))
    result = proc(tensor, [(100, 100)])
    assert not np.isnan(result[0].map).any()

def test_spatial_proc_all_inf():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.full((1, 512, 8, 8), float('inf'))
    result = proc(tensor, [(100, 100)])
    assert not np.isinf(result[0].map).any()

def test_spatial_proc_mixed_nan_inf():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.randn(1, 512, 8, 8)
    tensor[0, :10, 0, 0] = float('nan')
    tensor[0, 10:20, 1, 1] = float('inf')
    tensor[0, 20:30, 2, 2] = float('-inf')
    result = proc(tensor, [(100, 100)])
    assert not np.isnan(result[0].map).any()
    assert not np.isinf(result[0].map).any()

def test_spatial_proc_constant():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
    proc = SpatialHeatmapOutputProcessor()
    tensor = torch.ones(1, 512, 8, 8)
    result = proc(tensor, [(100, 100)])
    # Constant input should produce zeros (no variation to visualize)
    assert result[0].map.shape == (100, 100)

def test_spatial_proc_batch_diff_sizes():
    from fiftyone.utils.radio import SpatialHeatmapOutputProcessor
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
# INFERENCE TESTS - EXTENDED
# =============================================================================

def test_infer_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(128, 128, 128))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_random():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    arr = np.random.randint(0, 256, (512, 512, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_black():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(0, 0, 0))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_white():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(255, 255, 255))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_red():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(255, 0, 0))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_gradient():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    arr = np.zeros((512, 512, 3), dtype=np.uint8)
    for i in range(512):
        arr[i, :, :] = int(i / 2)
    img = Image.fromarray(arr)
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_128():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (128, 128))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_256():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (256, 256))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_512():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_1024():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (1024, 1024))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_1080p():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (1920, 1080))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_4k():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (3840, 2160))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_portrait():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (480, 640))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_landscape():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (640, 480))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_extreme_portrait():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (100, 1000))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_extreme_landscape():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (1000, 100))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_infer_batch1():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    imgs = [Image.new("RGB", (512, 512))]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 1

def test_infer_batch2():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    imgs = [Image.new("RGB", (512, 512)) for _ in range(2)]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 2

def test_infer_batch4():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    imgs = [Image.new("RGB", (512, 512)) for _ in range(4)]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 4

def test_infer_batch8():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    imgs = [Image.new("RGB", (256, 256)) for _ in range(8)]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 8

def test_infer_batch_mixed():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
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

def test_infer_spatial_single():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone.core.labels as fol
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (640, 480))
    with model:
        result = model._predict_all([img])
    assert isinstance(result[0], fol.Heatmap)
    assert result[0].map.shape == (480, 640)

def test_infer_spatial_batch():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone.core.labels as fol
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    imgs = [
        Image.new("RGB", (320, 240)),
        Image.new("RGB", (640, 480)),
        Image.new("RGB", (800, 600)),
    ]
    with model:
        result = model._predict_all(imgs)
    assert len(result) == 3
    assert result[0].map.shape == (240, 320)
    assert result[1].map.shape == (480, 640)
    assert result[2].map.shape == (600, 800)

def test_infer_spatial_aspect():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    # 16:9 aspect
    img = Image.new("RGB", (1920, 1080))
    with model:
        result = model._predict_all([img])
    assert result[0].map.shape == (1080, 1920)

def test_infer_different_images():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img1 = Image.new("RGB", (512, 512), color=(255, 0, 0))
    img2 = Image.new("RGB", (512, 512), color=(0, 255, 0))
    with model:
        result = model._predict_all([img1, img2])
    # Different images should produce different embeddings
    assert not np.allclose(result[0], result[1])

def test_infer_same_image():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (512, 512), color=(128, 128, 128))
    with model:
        result1 = model._predict_all([img])
        result2 = model._predict_all([img])
    assert np.allclose(result1[0], result2[0])


# =============================================================================
# FIFTYONE INTEGRATION TESTS - EXTENDED
# =============================================================================

def test_fo_model_type():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone.core.models as fom
    config = CRadioV4ModelConfig({})
    model = CRadioV4Model(config)
    assert isinstance(model, fom.Model)

def test_fo_embeddings_field():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="my_embeddings")

        assert "my_embeddings" in dataset.first().field_names
    finally:
        fo.delete_dataset(dataset.name)

def test_fo_embeddings_type():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="test_emb")

        sample = dataset.first()
        emb = np.array(sample.test_emb)
        assert isinstance(emb, np.ndarray)
    finally:
        fo.delete_dataset(dataset.name)

def test_fo_embeddings_dim():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

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

def test_fo_heatmap_type():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.core.labels as fol

    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "spatial"})
        model = CRadioV4Model(config)

        dataset.apply_model(model, label_field="test_heat")

        for sample in dataset:
            assert isinstance(sample.test_heat, fol.Heatmap)

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_heatmap_dims():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz
    from PIL import Image as PILImage

    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
    try:
        config = CRadioV4ModelConfig({"output_type": "spatial"})
        model = CRadioV4Model(config)

        dataset.apply_model(model, label_field="test_heat")

        for sample in dataset:
            img = PILImage.open(sample.filepath)
            w, h = img.size
            heat_h, heat_w = sample.test_heat.map.shape
            assert heat_w == w
            assert heat_h == h

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_embeddings_view():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=10)
    try:
        view = dataset.take(5)

        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        view.compute_embeddings(model, embeddings_field="test_emb")

        # Only view samples should have embeddings
        count_with_emb = len([s for s in dataset if s.test_emb is not None])
        assert count_with_emb == 5

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_heatmap_view():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=10)
    try:
        view = dataset.skip(3).take(4)

        config = CRadioV4ModelConfig({"output_type": "spatial"})
        model = CRadioV4Model(config)

        view.apply_model(model, label_field="test_heat")

        count_with_heat = len([s for s in dataset if s.test_heat is not None])
        assert count_with_heat == 4

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_recompute_embeddings():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        # Compute twice
        dataset.compute_embeddings(model, embeddings_field="test_emb")
        first_emb = np.array(dataset.first().test_emb).copy()

        dataset.compute_embeddings(model, embeddings_field="test_emb")
        second_emb = np.array(dataset.first().test_emb)

        # Should be the same (deterministic)
        assert np.allclose(first_emb, second_emb)

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_sort_by_similarity():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.brain as fob

    dataset = foz.load_zoo_dataset("quickstart", max_samples=15)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="test_emb")
        fob.compute_similarity(dataset, embeddings="test_emb", brain_key="test_sim")

        # Sort by similarity to first sample
        query_id = dataset.first().id
        similar = dataset.sort_by_similarity(query_id, brain_key="test_sim", k=5)

        assert len(similar) == 5
        # First result should be the query itself
        assert similar.first().id == query_id

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_uniqueness():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.brain as fob

    dataset = foz.load_zoo_dataset("quickstart", max_samples=10)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="test_emb")
        fob.compute_uniqueness(dataset, embeddings="test_emb")

        # Check uniqueness field exists
        for sample in dataset:
            assert hasattr(sample, 'uniqueness')
            assert 0 <= sample.uniqueness <= 1

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_multiple_fields():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=3)
    try:

        # Compute embeddings
        config_emb = CRadioV4ModelConfig({"output_type": "summary"})
        model_emb = CRadioV4Model(config_emb)
        dataset.compute_embeddings(model_emb, embeddings_field="radio_emb")

        # Compute heatmaps
        config_heat = CRadioV4ModelConfig({"output_type": "spatial"})
        model_heat = CRadioV4Model(config_heat)
        dataset.apply_model(model_heat, label_field="radio_heat")

        # Both should exist
        sample = dataset.first()
        assert sample.radio_emb is not None
        assert sample.radio_heat is not None

    finally:
        fo.delete_dataset(dataset.name)

def test_fo_shuffled():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart", max_samples=10, shuffle=True, seed=42)
    try:
        config = CRadioV4ModelConfig({"output_type": "summary"})
        model = CRadioV4Model(config)

        dataset.compute_embeddings(model, embeddings_field="test_emb")

        for sample in dataset:
            assert sample.test_emb is not None
            assert np.array(sample.test_emb).shape == (2560,)

    finally:
        fo.delete_dataset(dataset.name)


# =============================================================================
# EDGE CASE TESTS - EXTENDED
# =============================================================================

def test_edge_gray_to_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    gray = Image.new("L", (512, 512), color=128)
    rgb = gray.convert("RGB")
    with model:
        result = model._predict_all([rgb])
    assert result[0].shape == (2560,)

def test_edge_rgba_to_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    rgba = Image.new("RGBA", (512, 512), color=(128, 64, 192, 128))
    rgb = rgba.convert("RGB")
    with model:
        result = model._predict_all([rgb])
    assert result[0].shape == (2560,)

def test_edge_palette_to_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    p = Image.new("P", (512, 512))
    rgb = p.convert("RGB")
    with model:
        result = model._predict_all([rgb])
    assert result[0].shape == (2560,)

def test_edge_1bit_to_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    bw = Image.new("1", (512, 512))
    rgb = bw.convert("RGB")
    with model:
        result = model._predict_all([rgb])
    assert result[0].shape == (2560,)

def test_edge_cmyk_to_rgb():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    cmyk = Image.new("CMYK", (512, 512))
    rgb = cmyk.convert("RGB")
    with model:
        result = model._predict_all([rgb])
    assert result[0].shape == (2560,)

def test_edge_min_size():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (32, 32))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_edge_odd_dims():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (511, 513))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_edge_prime_dims():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (509, 503))
    with model:
        result = model._predict_all([img])
    assert result[0].shape == (2560,)

def test_edge_power2_dims():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)
    for size in [64, 128, 256, 512, 1024]:
        img = Image.new("RGB", (size, size))
        with model:
            result = model._predict_all([img])
        assert result[0].shape == (2560,)

def test_edge_from_file():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)

    # Create temp file
    temp_path = tempfile.mktemp(suffix=".png")
    try:
        img = Image.new("RGB", (512, 512), color=(100, 150, 200))
        img.save(temp_path)

        # Load and process
        loaded = Image.open(temp_path).convert("RGB")
        with model:
            result = model._predict_all([loaded])
        loaded.close()
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    assert result[0].shape == (2560,)

def test_edge_jpeg():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)

    temp_path = tempfile.mktemp(suffix=".jpg")
    try:
        img = Image.new("RGB", (512, 512), color=(100, 150, 200))
        img.save(temp_path, quality=85)

        loaded = Image.open(temp_path).convert("RGB")
        with model:
            result = model._predict_all([loaded])
        loaded.close()
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    assert result[0].shape == (2560,)

def test_edge_model_reuse():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "summary"})
    model = CRadioV4Model(config)

    with model:
        for i in range(5):
            img = Image.new("RGB", (256, 256), color=(i*50, i*50, i*50))
            result = model._predict_all([img])
            assert result[0].shape == (2560,)

def test_edge_spatial_tiny():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (64, 64))
    with model:
        result = model._predict_all([img])
    assert result[0].map.shape == (64, 64)

def test_edge_spatial_large():
    from fiftyone.utils.radio import CRadioV4ModelConfig, CRadioV4Model
    config = CRadioV4ModelConfig({"output_type": "spatial"})
    model = CRadioV4Model(config)
    img = Image.new("RGB", (2048, 1536))
    with model:
        result = model._predict_all([img])
    assert result[0].map.shape == (1536, 2048)


# =============================================================================
# RUN ALL TESTS
# =============================================================================

if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
