# HRM2.0 (4D-Humans) Integration

## Overview

HRM2.0 is a state-of-the-art model for reconstructing 3D human body meshes from
images. This integration allows you to:

-   Reconstruct 3D human meshes from images using the SMPL body model
-   Extract 3D and 2D keypoints
-   Visualize 3D meshes directly in the FiftyOne App using grouped datasets
-   Access SMPL body model parameters for further processing
-   Toggle between viewing original images and 3D reconstructions in the App

## Prerequisites

### 1. Install Dependencies

```bash
pip install torch torchvision trimesh smplx
pip install git+https://github.com/shubham-goel/4D-Humans.git
```

### 2. Obtain SMPL Model Files

HRM2.0 requires the SMPL neutral body model. You must register and download
these files:

1. Go to [https://smpl.is.tue.mpg.de/](https://smpl.is.tue.mpg.de/)
2. Register for an account
3. Download the SMPL model files
4. Extract and locate the `SMPL_NEUTRAL.pkl` file

## Usage

### Method 1: Python API

```python
import fiftyone as fo
import fiftyone.zoo as foz

# Load your dataset
dataset = fo.Dataset.from_dir(
    "/path/to/images", dataset_type=fo.types.ImageDirectory
)

# Load the HRM2 model from the zoo
model = foz.load_zoo_model(
    "hrm2-torch",
    smpl_model_path="/path/to/SMPL_NEUTRAL.pkl",
    checkpoint_version="2.0b",  # Options: "2.0b", "2.0a", "1.0"
    export_meshes=True,
    confidence_thresh=0.5,
)

# Apply the model to your dataset and create grouped samples
# This converts your image dataset into a grouped dataset with:
# - "image" slice: original images with 2D keypoints
# - "3d" slice: 3D scene files with meshes and SMPL parameters
dataset = model.apply_to_dataset_as_groups(
    dataset,
    label_field="human_pose",  # Creates "human_pose_2d" and "human_pose_3d" fields
    batch_size=1,
    num_workers=4,
    image_slice_name="image",
    scene_slice_name="3d",
)

# Launch the app to visualize results
# Use the slice selector in the App UI to toggle between "image" and "3d" views
session = fo.launch_app(dataset)
```

**Important**: The model creates a **grouped dataset** where each group
contains:

-   An **image slice** with the original image and 2D keypoint data
-   A **3D slice** with the reconstructed mesh as a `.fo3d` scene file

To view the 3D meshes, use the **slice selector** in the FiftyOne App to switch
to the "3d" slice.

### Method 2: UI Operator

1. Open your dataset in the FiftyOne App
2. Click on the "Apply HRM2.0 Model" button in the samples grid actions
3. Fill in the required parameters:
    - **SMPL Model Path**: Path to your `SMPL_NEUTRAL.pkl` file
    - **Output Field Base Name**: Base name for label fields (default:
      `human_pose`)
        - Creates `{name}_2d` on image samples
        - Creates `{name}_3d` on 3D scene samples
    - **Checkpoint Version**: HRM2 model version to use
    - **Export 3D Meshes**: Whether to generate mesh files
    - **Confidence Threshold**: Filter keypoints by confidence
    - **Batch Size**: Number of images per batch
    - **Device**: GPU/CPU device to use
4. Click "Execute" to run the model
5. **After processing**: Use the **slice selector** dropdown in the App to
   switch between "image" and "3d" views

## Output Format

The model creates a **grouped dataset** with two types of samples:

### 1. Image Slice Samples

Each image sample contains a `HumanPose2D` label with:

-   **keypoints**: List of 2D keypoint locations in pixel coordinates (Nx2)
-   **confidence**: Per-keypoint confidence scores (N,)
-   **bounding_box**: Bounding box around the detected person [x, y, w, h]

### 2. 3D Scene Slice Samples

Each 3D scene sample (`.fo3d` file) contains a `HumanPose3D` label with:

-   **smpl_params**: Dictionary with SMPL body model parameters

    -   `body_pose`: Body pose parameters (69,)
    -   `betas`: Shape parameters (10,)
    -   `global_orient`: Global orientation (3,)
    -   `camera`: Camera parameters (3,)

-   **keypoints_3d**: List of 3D joint locations (Nx3)

-   **mesh_path**: Path to the exported .obj mesh file

-   **confidence**: Overall prediction confidence

### Accessing Results

```python
# Get the image and 3D slices
image_slice = dataset.select_group_slices("image")
scene_slice = dataset.select_group_slices("3d")

# Access an image sample and its 2D keypoints
image_sample = image_slice.first()
pose_2d = image_sample.human_pose_2d
print("2D keypoints:", pose_2d.keypoints)
print("Confidence:", pose_2d.confidence)

# Access the corresponding 3D scene sample
# (samples in the same group share the same group ID)
scene_sample = scene_slice.first()
pose_3d = scene_sample.human_pose_3d

# Print SMPL parameters
print("Body pose:", pose_3d.smpl_params["body_pose"])
print("Shape params:", pose_3d.smpl_params["betas"])

# Access 3D keypoints
print("3D keypoints:", pose_3d.keypoints_3d)

# View the 3D mesh
print("Mesh path:", pose_3d.mesh_path)
print("Scene file:", scene_sample.filepath)  # The .fo3d file itself
```

## 3D Visualization

### Viewing in the FiftyOne App

The HRM2 integration creates grouped datasets where 3D meshes are stored as
`.fo3d` scene files. The FiftyOne App automatically detects these and enables
3D visualization:

1. **Launch the App**: `fo.launch_app(dataset)`
2. **Use the Slice Selector**: Look for the slice selector dropdown in the App
   UI (typically in the top bar)
3. **Switch to "3d" slice**: Select "3d" from the dropdown
4. **Interact with 3D scenes**:
    - Rotate: Click and drag
    - Zoom: Scroll or pinch
    - Pan: Right-click and drag

### How It Works

FiftyOne determines the media type based on the sample's `filepath`:

-   Image samples: `filepath` points to `.jpg`, `.png`, etc. → Shows image
    viewer
-   3D samples: `filepath` points to `.fo3d` file → Shows 3D viewer

This is why the 3D viewer button only appears when viewing the "3d" slice.

### Programmatic 3D Visualization

```python
from fiftyone.core.threed import Scene

# Get a 3D scene sample
scene_slice = dataset.select_group_slices("3d")
scene_sample = scene_slice.first()

# Load the scene from the .fo3d file
scene = Scene.from_fo3d(scene_sample.filepath)

# The scene contains the ObjMesh that can be rendered in the FiftyOne App
```

## Advanced Configuration

### Custom Mesh Output Directory

```python
model = foz.load_zoo_model(
    "hrm2-torch",
    smpl_model_path="/path/to/SMPL_NEUTRAL.pkl",
    mesh_output_dir="/path/to/output/meshes",
)
```

### Using Different Checkpoint Versions

HRM2.0 supports multiple checkpoint versions:

-   `"2.0b"`: Latest and recommended (default)
-   `"2.0a"`: Earlier 2.0 version
-   `"1.0"`: Original version

```python
model = foz.load_zoo_model(
    "hrm2-torch",
    smpl_model_path="/path/to/SMPL_NEUTRAL.pkl",
    checkpoint_version="2.0a",
)
```

### Disable Mesh Export

If you only need keypoints and SMPL parameters:

```python
model = foz.load_zoo_model(
    "hrm2-torch",
    smpl_model_path="/path/to/SMPL_NEUTRAL.pkl",
    export_meshes=False,
)
```

## Requirements

-   **GPU**: Required (CPU inference not supported)
-   **VRAM**: Minimum 4GB recommended
-   **Python**: 3.10+
-   **PyTorch**: Latest version with CUDA support

## Limitations

-   Currently supports single image processing only (video tracking not yet
    implemented)
-   Requires SMPL model files (registration required)
-   GPU-only (CPU inference not available)
-   Works best on images with clearly visible humans

## Citation

If you use HRM2.0 in your research, please cite:

```bibtex
@inproceedings{goel20234dhuman,
  title={Humans in 4D: Reconstructing and Tracking Humans with Transformers},
  author={Goel, Shubham and Pavlakos, Georgios and Rajasegaran, Jathushan and Kanazawa, Angjoo and Malik, Jitendra},
  booktitle={ICCV},
  year={2023}
}
```

## Resources

-   [4D-Humans GitHub Repository](https://github.com/shubham-goel/4D-Humans)
-   [SMPL Body Model](https://smpl.is.tue.mpg.de/)
-   [FiftyOne 3D Visualization Docs](https://docs.voxel51.com/user_guide/dataset_creation/3d_viz.html)
-   [FiftyOne Model Zoo](https://docs.voxel51.com/user_guide/model_zoo/index.html)

## Troubleshooting

### "I don't see a 3D viewer button in the App"

**Solution**: You need to switch to the "3d" slice using the slice selector.

The 3D viewer only appears when viewing samples whose `filepath` points to
`.fo3d` files. After running HRM2:

1. Look for the **slice selector dropdown** in the App (usually in the top bar
   near the dataset name)
2. Click the dropdown and select **"3d"**
3. The 3D viewer will now appear

If you still don't see the slice selector:

-   Make sure the model processing completed successfully
-   Check that `dataset.media_type` returns `"group"`
-   Verify that `.fo3d` files were created (check `mesh_output_dir`)

### "SMPL model not found" Error

Make sure you've downloaded the SMPL_NEUTRAL.pkl file from the SMPL website and
provided the correct path.

### "Failed to import HRM2 dependencies" Error

Install the 4D-Humans package:

```bash
pip install git+https://github.com/shubham-goel/4D-Humans.git
```

### CUDA Out of Memory

Reduce the batch size or process fewer images at a time:

```python
dataset = model.apply_to_dataset_as_groups(dataset, batch_size=1)
```

### No Humans Detected

HRM2.0 works best on images with clearly visible humans. Make sure:

-   The image contains at least one human
-   The human is clearly visible (not heavily occluded)
-   The image quality is sufficient

### "Dataset media_type is not 'group'"

If you see this issue, the dataset conversion may have failed. Try:

```python
# Check current media type
print(dataset.media_type)

# If it's not "group", the apply_to_dataset_as_groups method should handle it
# Make sure you're assigning the return value:
dataset = model.apply_to_dataset_as_groups(
    dataset, ...
)  # Don't forget the assignment!
```

## Support

For issues related to:

-   **FiftyOne integration**: Create an issue on the FiftyOne GitHub
-   **HRM2.0 model**: Create an issue on the 4D-Humans GitHub
-   **SMPL model**: Contact the SMPL team
