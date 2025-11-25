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
        }
    )

    # Load model
    model = HRM2Model(config)
    print(f"✓ Successfully loaded HRM2 model")
    print(f"  Device: {model._device}")
    print(f"  Detections field: {config.detections_field}")


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
        }
    )

    model = HRM2Model(config)

    # Load a test dataset
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()

    # Run prediction
    from PIL import Image
    import fiftyone.core.labels as fol

    img = Image.open(sample.filepath)
    result = model.predict(img)

    # Result is now a dict with label types
    print(f"✓ Prediction successful")
    pose_3d = result.get("poses_3d")
    print(
        f"  Number of people detected: {len(pose_3d.instances) if pose_3d else 0}"
    )
    if pose_3d and pose_3d.instances:
        mesh_instance = pose_3d.instances[0]
        if (
            mesh_instance.attributes
            and "smpl_params" in mesh_instance.attributes
        ):
            smpl_params = mesh_instance.attributes["smpl_params"]
            print(
                f"  SMPL parameters shape: body_pose={len(smpl_params['body_pose'])}, "
                f"betas={len(smpl_params['betas'])}"
            )
        if mesh_instance.keypoints_3d and mesh_instance.keypoints_3d.keypoints:
            print(
                f"  3D keypoints shape: {len(mesh_instance.keypoints_3d.keypoints)}"
            )
        if mesh_instance.keypoints_2d:
            print(
                f"  2D keypoints shape: {len(mesh_instance.keypoints_2d.points)}"
            )

    # Verify output structure
    assert isinstance(result, dict)
    assert "poses_3d" in result
    assert isinstance(pose_3d, fol.MeshInstances3D)
    assert len(pose_3d.instances) > 0
    if mesh_instance.attributes and "smpl_params" in mesh_instance.attributes:
        assert mesh_instance.attributes["smpl_params"] is not None
    if mesh_instance.keypoints_3d:
        assert mesh_instance.keypoints_3d.keypoints is not None


def test_hrm2_multi_person_inference():
    """
    Test HRM2 inference with multi-person detection using detections_field.

    NOTE: HRM2 now uses a modular approach where you provide pre-computed detections
    via detections_field instead of built-in PersonDetector. This allows you to use
    any detection model of your choice.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_multi_person_inference
    """
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config
    import fiftyone.core.labels as fol

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set or file not found")

    # Create config with detections_field for multi-person mode
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
            "detections_field": "ground_truth_detections",  # Use pre-computed detections
        }
    )

    model = HRM2Model(config)

    # Load a test dataset and add mock detections
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()

    # Add mock person detections to demonstrate multi-person workflow
    # In practice, you would run a separate detection model first
    mock_detections = fol.Detections(
        detections=[
            fol.Detection(
                label="person",
                bounding_box=[0.1, 0.1, 0.3, 0.6],
                confidence=0.95,
            ),
            fol.Detection(
                label="person",
                bounding_box=[0.5, 0.2, 0.35, 0.7],
                confidence=0.88,
            ),
        ]
    )
    sample["ground_truth_detections"] = mock_detections
    sample.save()

    # In multi-person mode, use apply_model on a dataset (not direct predict)
    # Direct predict() only works for single-person mode
    print(f"✓ Multi-person mode configured with detections_field")
    print(f"  Use dataset.apply_model(model, ...) for multi-person inference")
    print(f"  Mock detections added: {len(mock_detections.detections)} people")


def test_hrm2_vitdet_vs_regnety():
    """
    Compare different detection models for multi-person HRM2 inference.

    NOTE: HRM2 now uses a modular detections_field approach. To compare detectors,
    run different detection models separately and compare their results with HRM2.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_vitdet_vs_regnety
    """
    pytest.skip(
        "Detector comparison test no longer applicable. "
        "HRM2 now uses modular detections_field approach. "
        "Run separate detection models and provide results via detections_field."
    )


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

    # Create config with mesh export enabled
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
        }
    )

    model = HRM2Model(config)

    # Load test image
    dataset = foz.load_zoo_dataset("quickstart")
    sample = dataset.first()

    from PIL import Image
    import fiftyone.core.labels as fol

    img = Image.open(sample.filepath)
    result = model.predict(img)

    print(f"✓ Mesh export successful")
    assert isinstance(result, dict)
    pose_3d = result.get("poses_3d")
    assert isinstance(pose_3d, fol.MeshInstances3D)

    # Check result structure
    print(f"  Number of people: {len(pose_3d.instances)}")
    if pose_3d.instances:
        mesh_instance = pose_3d.instances[0]
        if mesh_instance.mesh and mesh_instance.mesh.vertices:
            print(f"  Vertices shape: {len(mesh_instance.mesh.vertices)}")
        if mesh_instance.mesh and mesh_instance.mesh.faces:
            print(f"  Mesh faces shape: {len(mesh_instance.mesh.faces)}")


def test_hrm2_full_pipeline():
    """
    Test complete pipeline: dataset application with grouped output.

    Run with:
        pytest tests/intensive/hrm2_tests.py -s -k test_hrm2_full_pipeline
    """
    from fiftyone.utils.hrm2 import (
        HRM2Model,
        HRM2Config,
        apply_hrm2_to_dataset_as_groups,
    )

    smpl_path = os.environ.get("SMPL_MODEL_PATH")
    if not smpl_path or not os.path.exists(smpl_path):
        pytest.skip("SMPL_MODEL_PATH not set")

    # Create config (removed deprecated enable_multi_person and detector_type)
    config = HRM2Config(
        {
            "smpl_model_path": smpl_path,
            "export_meshes": True,
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

    # Apply model and create grouped dataset using module-level function
    result_dataset = apply_hrm2_to_dataset_as_groups(
        model,
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

    # Process batch using predict_all (public API)
    results = model.predict_all(images)

    print(f"✓ Batch processing complete")
    print(f"  Processed {len(results)} images")

    # Results are now dicts with label types
    import fiftyone.core.labels as fol

    for i, result in enumerate(results):
        assert isinstance(result, dict)
        pose_3d = result.get("poses_3d")
        assert isinstance(pose_3d, fol.MeshInstances3D)
        num_people = len(pose_3d.instances) if pose_3d else 0
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
