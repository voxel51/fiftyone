"""
HRM2.0 (4D-Humans) model intensive tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/hrm2_tests.py -s -k test_<name>

Prerequisites:
    1. Install 4D-Humans package:
       pip install git+https://github.com/shubham-goel/4D-Humans.git

    2. Download 4D-Humans model assets:
       python -c "from hmr2.models import download_models; download_models()"

    3. Download SMPL body model:
       - Register at https://smpl.is.tue.mpg.de/
       - Download SMPL_NEUTRAL.pkl
       - Set SMPL_MODEL_PATH environment variable or pass to config

    4. Install Detectron2 (for multi-person mode):
       pip install 'git+https://github.com/facebookresearch/detectron2.git'

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import tempfile

import numpy as np
import pytest

import fiftyone as fo
import fiftyone.zoo as foz


def test_hrm2_download_and_load():
    """
    Test downloading 4D-Humans assets and loading the HRM2 model.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_download_and_load
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    # Download models if not already present
    try:
        from hmr2.models import download_models

        download_models()
    except Exception as e:
        pytest.skip(f"Failed to download HRM2 models: {e}")

    # Create config
    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if smpl_path and not os.path.exists(smpl_path):
        pytest.skip(f"SMPL model not found at {smpl_path}")

    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "checkpoint_version": "2.0b",
            "export_meshes": False,
            "enable_multi_person": False,
        }
    )

    # Load model
    model = HRM2Model(config)
    print(f"✓ Successfully loaded HRM2 model")
    print(f"  Device: {model._device}")
    print(f"  Multi-person mode: {config.enable_multi_person}")


def test_hrm2_single_person_inference():
    """
    Test HRM2 inference on a single person image.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_single_person_inference
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    # Get SMPL path
    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip(
            "SMPL_MODEL_PATH not set or file not found. Set it to SMPL_NEUTRAL.pkl"
        )

    # Create config for single-person mode
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
            "enable_multi_person": False,
        }
    )

    model = HRM2Model(config)

    # Load a test dataset
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()

    # Run prediction
    from PIL import Image

    img = Image.open(sample.filepath)
    result = model.predict(img)

    print(f"✓ Prediction successful")
    print(f"  Number of people detected: {len(result['people'])}")
    if result["people"]:
        person = result["people"][0]
        print(
            f"  SMPL parameters shape: body_pose={len(person['smpl_params']['body_pose'])}, "
            f"betas={len(person['smpl_params']['betas'])}"
        )
        print(f"  3D keypoints shape: {len(person['keypoints_3d'])}")
        if person["keypoints_2d"]:
            print(f"  2D keypoints shape: {len(person['keypoints_2d'])}")
    if result["scene_path"]:
        print(f"  Scene file: {result['scene_path']}")

    # Verify output structure
    assert "people" in result
    assert len(result["people"]) > 0
    assert "smpl_params" in result["people"][0]
    assert "keypoints_3d" in result["people"][0]


def test_hrm2_multi_person_inference():
    """
    Test HRM2 inference with multi-person detection.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_multi_person_inference
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    # Check dependencies
    try:
        import detectron2
    except ImportError:
        pytest.skip(
            "Detectron2 not installed. Install with: "
            "pip install 'git+https://github.com/facebookresearch/detectron2.git'"
        )

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set or file not found")

    # Create config for multi-person mode
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
            "enable_multi_person": True,
            "detector_type": "vitdet",
            "detection_score_thresh": 0.5,
        }
    )

    model = HRM2Model(config)

    # Load a test dataset
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()

    # Run prediction
    from PIL import Image

    img = Image.open(sample.filepath)
    result = model.predict(img)

    print(f"✓ Multi-person prediction successful")
    print(f"  Number of people detected: {len(result['people'])}")

    for i, person in enumerate(result["people"]):
        print(f"\n  Person {i}:")
        print(f"    Person ID: {person['person_id']}")
        if person["bbox"]:
            print(f"    Bounding box: {person['bbox']}")
        if person.get("camera_translation"):
            print(f"    Camera translation: {person['camera_translation']}")

    if result["scene_path"]:
        print(f"\n  Multi-person scene file: {result['scene_path']}")


def test_hrm2_vitdet_vs_regnety():
    """
    Compare ViTDet and RegNetY detectors for multi-person detection.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_vitdet_vs_regnety
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    try:
        import detectron2
    except ImportError:
        pytest.skip("Detectron2 not installed")

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set")

    # Load test image
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()
    from PIL import Image

    img = Image.open(sample.filepath)

    results = {}
    for detector_type in ["vitdet", "regnety"]:
        print(f"\nTesting {detector_type} detector...")

        config = HRM2Config(
            {
                "smpl_model_path": smpl_path,
                "export_meshes": False,
                "enable_multi_person": True,
                "detector_type": detector_type,
                "detection_score_thresh": 0.5,
            }
        )

        model = HRM2Model(config)
        result = model.predict(img)

        results[detector_type] = len(result["people"])
        print(f"  {detector_type}: {results[detector_type]} people detected")

    print(f"\n✓ Detector comparison complete")
    print(f"  ViTDet: {results['vitdet']} people")
    print(f"  RegNetY: {results['regnety']} people")


def test_hrm2_mesh_export():
    """
    Test 3D mesh generation and export.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_mesh_export
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set")

    # Create temporary directory for meshes
    with tempfile.TemporaryDirectory() as mesh_dir:
        config = HRM2Config(
            {
                "smpl_model_path": smpl_path,
                "export_meshes": True,
                "mesh_output_dir": mesh_dir,
                "enable_multi_person": False,
            }
        )

        model = HRM2Model(config)

        # Load test image
        dataset = foz.load_zoo_dataset("quickstart")
        sample = dataset.first()

        from PIL import Image

        img = Image.open(sample.filepath)
        result = model.predict(img)

        print(f"✓ Mesh export successful")

        if result["scene_path"]:
            print(f"  Scene file: {result['scene_path']}")
            assert os.path.exists(result["scene_path"]), "Scene file not found"

            # Check for OBJ files
            obj_files = [f for f in os.listdir(mesh_dir) if f.endswith(".obj")]
            print(f"  Generated {len(obj_files)} OBJ mesh file(s)")
            print(f"  Mesh directory: {mesh_dir}")

            for obj_file in obj_files:
                obj_path = os.path.join(mesh_dir, obj_file)
                size = os.path.getsize(obj_path)
                print(f"    - {obj_file} ({size} bytes)")


def test_hrm2_full_pipeline():
    """
    Test complete pipeline: dataset application with grouped output.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_full_pipeline
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set")

    # Create config
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
            "enable_multi_person": True,
            "detector_type": "vitdet",
        }
    )

    model = HRM2Model(config)

    # Load a small test dataset
    dataset = foz.load_zoo_dataset("quickstart")
    view = dataset.take(3)

    # Create a new dataset for testing
    test_dataset = fo.Dataset("hrm2_test_pipeline")
    test_dataset.add_samples(view)

    print(f"Processing {len(test_dataset)} samples...")

    # Apply model and create grouped dataset
    result_dataset = model.apply_to_dataset_as_groups(
        test_dataset,
        label_field="human_pose",
        batch_size=1,
    )

    print(f"✓ Pipeline complete")
    print(f"  Dataset media type: {result_dataset.media_type}")
    print(f"  Total samples: {len(result_dataset)}")
    print(f"  Has groups: {result_dataset.media_type == 'group'}")

    # Check grouped structure
    if result_dataset.media_type == "group":
        sample = result_dataset.first()
        print(f"  Group slices: {result_dataset.group_slices}")

        # Check for 2D pose labels on image slice
        if "human_pose_2d" in sample:
            print(f"  ✓ Found 2D pose labels")

    # Cleanup
    test_dataset.delete()


def test_hrm2_batch_processing():
    """
    Test batch processing of multiple images.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_batch_processing
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set")

    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": False,
            "enable_multi_person": False,
        }
    )

    model = HRM2Model(config)

    # Load test dataset
    dataset = foz.load_zoo_dataset("quickstart")
    samples = dataset.take(5)

    # Load images
    from PIL import Image

    images = [Image.open(s.filepath) for s in samples]

    print(f"Processing batch of {len(images)} images...")

    # Process batch
    results = model._predict_all(images)

    print(f"✓ Batch processing complete")
    print(f"  Processed {len(results)} images")

    for i, result in enumerate(results):
        num_people = len(result["people"])
        print(f"  Image {i}: {num_people} person(s) detected")

    assert len(results) == len(images)


def test_hrm2_coordinate_transform():
    """
    Test camera coordinate transformation from crop to full image.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_coordinate_transform
    """
    from fiftyone.utils.hrm2 import cam_crop_to_full

    # Test with sample values
    pred_cam = np.array([2.0, 0.1, 0.2])  # [scale, tx, ty]
    box_center = np.array([320.0, 240.0])  # Center of 640x480 image
    box_size = 200.0
    img_size = np.array([640.0, 480.0])
    focal_length = 5000.0

    result = cam_crop_to_full(
        pred_cam, box_center, box_size, img_size, focal_length
    )

    print(f"✓ Coordinate transformation test")
    print(f"  Input cam (crop space): {pred_cam}")
    print(f"  Output cam (full space): {result}")
    print(
        f"  Translation: [{result[0]:.3f}, {result[1]:.3f}, {result[2]:.3f}]"
    )

    # Check output is reasonable
    assert result[2] > 0, "Depth (tz) should be positive"
    assert np.isfinite(result).all(), "All values should be finite"


if __name__ == "__main__":
    # Run all tests
    pytest.main([__file__, "-v", "-s"])
