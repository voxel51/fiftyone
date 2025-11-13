"""
Example script demonstrating HRM2.0 (4D-Humans) integration with FiftyOne.

This script shows how to:
1. Load a dataset of images (from directory or FiftyOne Zoo)
2. Apply the HRM2 model for 3D human mesh reconstruction
3. Visualize the results in the FiftyOne App

The HRM2 model supports both single-person and multi-person modes:
- Single-person: Processes the full image, best for images with one person
- Multi-person: Uses pre-computed person detections via --detections-field

Before running this script:
1. Install dependencies: pip install torch torchvision trimesh smplx
2. Install 4D-Humans: pip install git+https://github.com/shubham-goel/4D-Humans.git
3. Download SMPL_NEUTRAL.pkl from https://smpl.is.tue.mpg.de/

Usage:
    # Single-person mode (processes full image):
    python hrm2_example.py --images-dir /path/to/images \
        --smpl-path /path/to/SMPL_NEUTRAL.pkl

    # From FiftyOne Zoo dataset:
    python hrm2_example.py --zoo-dataset coco-2017 --zoo-split validation \
        --smpl-path /path/to/SMPL_NEUTRAL.pkl

    # Multi-person mode (requires pre-computed detections):
    # First run a person detector to populate a field, then:
    python hrm2_example.py --images-dir /path/to/images \
        --smpl-path /path/to/SMPL_NEUTRAL.pkl \
        --detections-field ground_truth_detections

Advanced Usage:
    # Custom output processor (programmatic API):
    from fiftyone.utils.hrm2 import HRM2Model, HRM2Config, HRM2OutputProcessor

    class CustomHRM2Processor(HRM2OutputProcessor):
        def __call__(self, outputs, frame_size, confidence_thresh=None):
            # Custom postprocessing logic here
            return super().__call__(outputs, frame_size, confidence_thresh)

    config = HRM2Config({
        "smpl_model_path": "/path/to/SMPL_NEUTRAL.pkl",
        "output_processor_cls": CustomHRM2Processor,
    })
    model = HRM2Model(config)
"""

import argparse
import os
import sys
import fiftyone as fo
import fiftyone.zoo as foz


def main():
    parser = argparse.ArgumentParser(
        description="Apply HRM2.0 model to images for 3D human mesh reconstruction"
    )
    parser.add_argument(
        "--images-dir",
        type=str,
        default=None,
        help="Path to directory containing images",
    )
    parser.add_argument(
        "--zoo-dataset",
        type=str,
        default=None,
        help="Name of FiftyOne Zoo dataset to load (e.g., 'coco-2017')",
    )
    parser.add_argument(
        "--zoo-split",
        type=str,
        default="validation",
        help="Split of zoo dataset to load (default: 'validation')",
    )
    parser.add_argument(
        "--zoo-max-samples",
        type=int,
        default=50,
        help="Maximum number of samples to load from zoo dataset (default: 50)",
    )
    parser.add_argument(
        "--dataset-name",
        type=str,
        default=None,
        help="Name of existing FiftyOne dataset to load, or name for new dataset",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing dataset without prompting",
    )
    parser.add_argument(
        "--smpl-path",
        type=str,
        required=True,
        help="Path to SMPL_NEUTRAL.pkl file",
    )
    parser.add_argument(
        "--checkpoint-version",
        type=str,
        default="2.0b",
        choices=["2.0b", "2.0a", "1.0"],
        help="HRM2 checkpoint version",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1,
        help="Batch size for inference",
    )
    parser.add_argument(
        "--confidence-thresh",
        type=float,
        default=0.5,
        help="Confidence threshold for keypoint filtering",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Torch device to use (e.g. 'cuda:0', 'cpu'). Defaults to CUDA if available",
    )
    parser.add_argument(
        "--no-export-meshes",
        action="store_true",
        help="Disable mesh export (only compute keypoints and SMPL params)",
    )
    parser.add_argument(
        "--detections-field",
        type=str,
        default=None,
        help="Field name containing person detections for multi-person mode. "
        "If not provided, processes images in single-person mode.",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("HRM2.0 3D Human Mesh Reconstruction Example")
    print("=" * 60)

    # Validate arguments
    if not args.images_dir and not args.zoo_dataset and not args.dataset_name:
        print("\n✗ Error: You must specify one of:")
        print("  --images-dir (path to image directory)")
        print("  --zoo-dataset (FiftyOne Zoo dataset name)")
        print("  --dataset-name (existing FiftyOne dataset name)")
        sys.exit(1)

    # Load or create dataset
    print("\n1. Loading dataset...")
    dataset = None

    # Option 1: Load existing dataset by name
    if args.dataset_name and args.dataset_name in fo.list_datasets():
        try:
            dataset = fo.load_dataset(args.dataset_name)
            print(
                f"   ✓ Loaded existing dataset '{args.dataset_name}' with {len(dataset)} samples"
            )
        except Exception as e:
            print(f"   ✗ Failed to load dataset '{args.dataset_name}': {e}")
            sys.exit(1)

    # Option 2: Load from Zoo
    elif args.zoo_dataset:
        try:
            print(
                f"   Loading zoo dataset '{args.zoo_dataset}' (split: {args.zoo_split}, max: {args.zoo_max_samples})..."
            )
            dataset_name = (
                args.dataset_name
                or f"hrm2-{args.zoo_dataset}-{args.zoo_split}"
            )
            dataset = foz.load_zoo_dataset(
                args.zoo_dataset,
                split=args.zoo_split,
                max_samples=args.zoo_max_samples,
                dataset_name=dataset_name,
            )
            print(
                f"   ✓ Loaded zoo dataset '{args.zoo_dataset}' with {len(dataset)} samples"
            )
        except Exception as e:
            print(f"   ✗ Failed to load zoo dataset '{args.zoo_dataset}': {e}")
            print("   Make sure the dataset name and split are correct.")
            print("   Example: --zoo-dataset coco-2017 --zoo-split validation")
            sys.exit(1)

    # Option 3: Load from image directory
    elif args.images_dir:
        if not os.path.exists(args.images_dir):
            print(
                f"   ✗ Error: Image directory does not exist: {args.images_dir}"
            )
            sys.exit(1)

        if not os.path.isdir(args.images_dir):
            print(f"   ✗ Error: Path is not a directory: {args.images_dir}")
            sys.exit(1)

        # Check if directory has images
        image_extensions = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif")
        has_images = any(
            f.lower().endswith(image_extensions)
            for f in os.listdir(args.images_dir)
            if os.path.isfile(os.path.join(args.images_dir, f))
        )

        if not has_images:
            print(
                f"   ✗ Error: No images found in directory: {args.images_dir}"
            )
            print(f"   Looking for files with extensions: {image_extensions}")
            sys.exit(1)

        try:
            dataset_name = args.dataset_name or "hrm2-custom"
            print(f"   Loading images from {args.images_dir}...")

            # Check if dataset already exists
            if dataset_name in fo.list_datasets():
                if args.overwrite:
                    print(
                        f"   ⚠ Dataset '{dataset_name}' already exists - overwriting..."
                    )
                    fo.delete_dataset(dataset_name)
                    dataset = fo.Dataset.from_dir(
                        args.images_dir,
                        dataset_type=fo.types.ImageDirectory,
                        name=dataset_name,
                    )
                    print(
                        f"   ✓ Created dataset '{dataset_name}' with {len(dataset)} samples"
                    )
                else:
                    print(f"   ⚠ Dataset '{dataset_name}' already exists")
                    response = (
                        input(
                            "   Do you want to (o)verwrite it, (u)se it, or (c)ancel? [o/u/c]: "
                        )
                        .lower()
                        .strip()
                    )

                    if response == "o":
                        print(
                            f"   Deleting existing dataset '{dataset_name}'..."
                        )
                        fo.delete_dataset(dataset_name)
                        dataset = fo.Dataset.from_dir(
                            args.images_dir,
                            dataset_type=fo.types.ImageDirectory,
                            name=dataset_name,
                        )
                        print(
                            f"   ✓ Created dataset '{dataset_name}' with {len(dataset)} samples"
                        )
                    elif response == "u":
                        dataset = fo.load_dataset(dataset_name)
                        print(
                            f"   ✓ Using existing dataset '{dataset_name}' with {len(dataset)} samples"
                        )
                    else:
                        print("   Cancelled by user")
                        sys.exit(0)
            else:
                dataset = fo.Dataset.from_dir(
                    args.images_dir,
                    dataset_type=fo.types.ImageDirectory,
                    name=dataset_name,
                )
                print(
                    f"   ✓ Created dataset '{dataset_name}' with {len(dataset)} samples"
                )
        except Exception as e:
            print(f"   ✗ Failed to load images from directory: {e}")
            sys.exit(1)

    if dataset is None or len(dataset) == 0:
        print("   ✗ Error: Dataset is empty. No samples to process.")
        sys.exit(1)

    # Load HRM2 model
    print(f"\n2. Loading HRM2 model (version {args.checkpoint_version})...")
    print(f"   SMPL model: {args.smpl_path}")
    print(
        f"   Mode: {'Multi-person' if args.detections_field else 'Single-person'}"
    )
    if args.detections_field:
        print(f"   Detections field: {args.detections_field}")

    try:
        extra = {}
        if args.device:
            extra["device"] = args.device
        model = foz.load_zoo_model(
            "hrm2-torch",
            smpl_model_path=args.smpl_path,
            checkpoint_version=args.checkpoint_version,
            export_meshes=not args.no_export_meshes,
            confidence_thresh=args.confidence_thresh,
            detections_field=args.detections_field,
            **extra,
        )
        print("   ✓ Model loaded successfully")
    except Exception as e:
        print(f"   ✗ Failed to load model: {e}")
        try:
            import traceback

            traceback.print_exc()
        except Exception:
            pass
        print("\nMake sure you have:")
        print(
            "  1. Installed 4D-Humans: pip install git+https://github.com/shubham-goel/4D-Humans.git"
        )
        print(
            "  2. Downloaded SMPL_NEUTRAL.pkl from https://smpl.is.tue.mpg.de/"
        )
        print("\nFor multi-person mode:")
        print(
            "  - Run a person detection model first to populate a detections field"
        )
        print(
            "  - Then use --detections-field <field_name> to process each detected person"
        )
        return

    # Apply model and create grouped dataset
    print(f"\n3. Applying HRM2 model to {len(dataset)} samples...")
    print(f"   Batch size: {args.batch_size}")
    print(f"   This will create a grouped dataset with image and 3D slices...")
    print(
        f"   This may take a while depending on your GPU and number of images..."
    )

    try:
        dataset = model.apply_to_dataset_as_groups(
            dataset,
            label_field="human_pose",
            batch_size=args.batch_size,
            num_workers=4,
            image_slice_name="image",
            scene_slice_name="3d",
        )
        print("   ✓ Model applied successfully")
        print(
            f"   ✓ Dataset converted to grouped format: {dataset.media_type}"
        )
    except Exception as e:
        print(f"   ✗ Failed to apply model: {e}")
        try:
            import traceback

            traceback.print_exc()
        except Exception:
            pass
        return

    # Print results summary
    print("\n4. Results Summary:")
    print(f"   Total samples: {len(dataset)}")
    print(f"   Media type: {dataset.media_type}")

    # Get slices for grouped dataset
    image_slice = dataset.select_group_slices("image")
    scene_slice = dataset.select_group_slices("3d")

    print(f"   Image samples: {len(image_slice)}")
    print(f"   3D scene samples: {len(scene_slice)}")

    # Count samples with predictions
    with_2d_predictions = len(
        image_slice.match(fo.ViewField("human_pose_2d") != None)
    )
    with_3d_predictions = len(
        scene_slice.match(fo.ViewField("human_pose_3d") != None)
    )

    print(f"   Images with 2D keypoints: {with_2d_predictions}")
    print(f"   3D scenes generated: {with_3d_predictions}")

    # Show example prediction
    if with_3d_predictions > 0:
        scene_sample = scene_slice.match(
            fo.ViewField("human_pose_3d") != None
        ).first()
        pose_3d = scene_sample.human_pose_3d

        print("\n5. Example Prediction:")
        print(f"   Sample ID: {scene_sample.id}")
        print(f"   3D Scene: {scene_sample.filepath}")

        # New multi-person format: pose_3d.people is a list of person detections
        if pose_3d.people and len(pose_3d.people) > 0:
            print(f"   ✓ Number of people detected: {len(pose_3d.people)}")

            # Show details for the first person
            person = pose_3d.people[0]
            if person.get("smpl_params"):
                print(f"   ✓ SMPL parameters computed (person 0)")
                print(
                    f"     - Body pose shape: {len(person['smpl_params']['body_pose'])}"
                )
                print(
                    f"     - Shape params: {len(person['smpl_params']['betas'])}"
                )

            if person.get("keypoints_3d"):
                print(
                    f"   ✓ 3D keypoints: {len(person['keypoints_3d'])} joints"
                )

            if person.get("bbox"):
                print(f"   ✓ Bounding box: {person['bbox']}")

            print(f"   ✓ 3D meshes exported to scene file")

    # Launch app
    print("\n6. Launching FiftyOne App...")
    print("   View the results in your browser!")
    print("")
    print("   HOW TO VIEW 3D MESHES:")
    print(
        "   1. Look for the slice selector in the App (typically in the top bar)"
    )
    print("   2. Toggle between 'image' and '3d' slices")
    print("   3. When viewing the '3d' slice, you'll see the 3D scene viewer")
    print("   4. Use your mouse to rotate, zoom, and explore the 3D meshes")
    print("")
    print("   TIP: You can switch between slices to compare the original")
    print("        image with its 3D reconstruction!")

    session = fo.launch_app(dataset)

    print("\n" + "=" * 60)
    print("Press Ctrl+C to exit")
    print("=" * 60)

    session.wait()


if __name__ == "__main__":
    main()
