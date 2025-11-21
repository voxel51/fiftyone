.. _hrm2-integration:

HRM2.0 (4D-Humans) Integration
==============================

.. default-role:: code

HRM2.0 is a state-of-the-art model for reconstructing 3D human body meshes from
images. This integration allows you to:

-   Reconstruct 3D human meshes from images using the SMPL body model
-   Extract 3D and 2D keypoints
-   Visualize 3D meshes directly in the FiftyOne App using grouped datasets
-   Access SMPL body model parameters for further processing
-   Toggle between viewing original images and 3D reconstructions in the App

.. _hrm2-prerequisites:

Prerequisites
_____________

1. Install Dependencies
-----------------------

.. code-block:: shell

    pip install torch torchvision trimesh smplx
    pip install git+https://github.com/shubham-goel/4D-Humans.git

2. Obtain SMPL Model Files
--------------------------

HRM2.0 requires the SMPL neutral body model. You must register and download
these files:

1. Go to https://smpl.is.tue.mpg.de/
2. Register for an account
3. Download the SMPL model files
4. Extract and locate the ``SMPL_NEUTRAL.pkl`` file

.. _hrm2-usage:

Usage
_____

Method 1: Python API
--------------------

Single-Person Mode (Full Image)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Use this mode when images typically contain a single person or you want to
process the primary person in the center of the image.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.hrm2 as fouh

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
    dataset = fouh.apply_hrm2_to_dataset_as_groups(
        model,
        dataset,
        label_field="human_pose",  # Creates "human_pose_2d" and "human_pose_3d" fields
        batch_size=1,
        num_workers=4,
        image_slice_name="image",
        scene_slice_name="3d",
        output_dir=None,  # Optional: defaults to fo.config.model_zoo_dir/hrm2
    )

    # Launch the app to visualize results
    session = fo.launch_app(dataset)

Multi-Person Mode
~~~~~~~~~~~~~~~~~

To process multiple people in an image, you first need to generate person
detections (e.g., using YOLOv8) and pass the field name to the model.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.hrm2 as fouh

    dataset = fo.load_dataset("your-dataset")

    # 1. Generate person detections
    detector = foz.load_zoo_model("yolov8n-coco-torch")
    dataset.apply_model(detector, label_field="detections")

    # Filter to keep only 'person' class if needed
    from fiftyone import ViewField as F
    dataset.match_labels(fields="detections", filter=F("label") == "person").save()

    # 2. Load HRM2 model configured for multi-person
    model = foz.load_zoo_model(
        "hrm2-torch",
        smpl_model_path="/path/to/SMPL_NEUTRAL.pkl",
        detections_field="detections",  # Use the detections we just generated
    )

    # 3. Apply and group
    dataset = fouh.apply_hrm2_to_dataset_as_groups(
        model,
        dataset,
        label_field="human_pose",
    )

    session = fo.launch_app(dataset)

.. note::

    The output dataset is a **grouped dataset** where each group contains:

    -   An **image slice** with the original image and 2D keypoint data
    -   A **3D slice** with the reconstructed mesh as a ``.fo3d`` scene file

    To view the 3D meshes, use the **slice selector** in the FiftyOne App to switch
    to the "3d" slice.

Method 2: UI Operator
---------------------

1. Open your dataset in the FiftyOne App
2. Click on the "Apply HRM2.0 Model" button in the samples grid actions
3. Fill in the required parameters:
    - **SMPL Model Path**: Path to your ``SMPL_NEUTRAL.pkl`` file
    - **Output Field Base Name**: Base name for label fields (default:
      ``human_pose``)
    - **Export 3D Meshes**: Whether to generate mesh files
    - **Detections Field**: (Optional) Field containing person boxes for multi-person processing
4. Click "Execute" to run the model
5. **After processing**: Use the **slice selector** dropdown in the App to
   switch between "image" and "3d" views

.. _hrm2-output-format:

Output Format
_____________

The model creates a **grouped dataset** with two types of samples:

1. Image Slice Samples
----------------------

Each image sample contains a ``HumanPoses2D`` label (default field: ``human_pose_2d``).

This is a list-like container where each element is a ``HumanPose2D`` instance
corresponding to one detected person. Each ``HumanPose2D`` wraps native
FiftyOne label types so that you can easily access both keypoints and the
person box:

-   ``pose``: a :class:`fiftyone.core.labels.Keypoint` instance

    -   ``pose.points``: list of 2D keypoints in normalized coordinates
        ``[0, 1] x [0, 1]`` (Nx2)
    -   ``pose.confidence``: optional per-keypoint confidence scores (N,)

-   ``detection``: a :class:`fiftyone.core.labels.Detection` instance

    -   ``detection.bounding_box``: person box ``[x, y, w, h]`` in normalized
        coordinates ``[0, 1]``
    -   ``detection.instance``: shared :class:`fiftyone.core.labels.Instance`
        used to link this 2D person to the corresponding 3D person in
        ``SMPLHumanPoses.poses``

2. 3D Scene Slice Samples
-------------------------

Each 3D scene sample (``.fo3d`` file) contains a ``SMPLHumanPoses`` label (default field: ``human_pose_3d``) with:

-   **poses**: List of :class:`fiftyone.core.labels.SMPLHumanPose` instances, each containing:

    -   ``person``: :class:`fiftyone.core.labels.Person3D` with geometric data (bbox, vertices, keypoints_3d, keypoints_2d)
    -   ``smpl_params``: :class:`fiftyone.core.labels.SMPLParams` with SMPL body model parameters (body_pose, betas, etc.)
    -   ``camera_translation``: Camera translation [tx, ty, tz] in 3D world coordinates

-   **scene_path**: Path to the .fo3d scene file
-   **smpl_faces**: SMPL mesh topology (shared across all people)
-   **frame_size**: [height, width] of the input frame

Accessing Results
-----------------

.. code-block:: python
    :linenos:

    import fiftyone as fo

    #
    # Get image/3D slices from the grouped dataset
    #
    image_slice = dataset.select_group_slices("image")
    scene_slice = dataset.select_group_slices("3d")

    #
    # Access 2D poses on the image slice
    #
    img_sample = image_slice.match(fo.ViewField("human_pose_2d") != None).first()
    pose_2d_list = img_sample.human_pose_2d  # HumanPoses2D

    if pose_2d_list and pose_2d_list.poses:
        first_person_2d = pose_2d_list.poses[0]  # HumanPose2D

        # Keypoints (normalized [0, 1])
        keypoints = first_person_2d.pose.points
        confidences = first_person_2d.pose.confidence

        # Person bounding box (normalized [0, 1])
        bbox = first_person_2d.detection.bounding_box

        print("First person keypoints:", keypoints)
        print("First person bbox:", bbox)

    #
    # Access the 3D scene sample and SMPL data
    # (samples in the same group share the same group ID)
    #
    scene_sample = scene_slice.match(fo.ViewField("human_pose_3d") != None).first()
    pose_3d = scene_sample.human_pose_3d  # SMPLHumanPoses

    if pose_3d and pose_3d.poses:
        # pose_3d.poses is a list of SMPLHumanPose instances
        for smpl_pose in pose_3d.poses:
            # Access SMPL parameters
            print("Body pose:", smpl_pose.smpl_params.body_pose)
            print("Shape params:", smpl_pose.smpl_params.betas)
            print("Camera translation:", smpl_pose.camera_translation)

            # Access geometric data from Person3D
            person = smpl_pose.person
            print("3D keypoints:", person.keypoints_3d)
            print("2D keypoints:", person.keypoints_2d)
            print("Bbox:", person.bbox)
            print("Vertices:", person.vertices)

    # View the 3D scene file path (.fo3d)
    print("Scene file:", scene_sample.filepath)

.. _hrm2-3d-visualization:

3D Visualization
________________

Viewing in the FiftyOne App
---------------------------

The HRM2 integration creates grouped datasets where 3D meshes are stored as
``.fo3d`` scene files. The FiftyOne App automatically detects these and enables
3D visualization:

1. **Launch the App**: ``fo.launch_app(dataset)``
2. **Use the Slice Selector**: Look for the slice selector dropdown in the App
   UI (typically in the top bar)
3. **Switch to "3d" slice**: Select "3d" from the dropdown
4. **Interact with 3D scenes**:
    - Rotate: Click and drag
    - Zoom: Scroll or pinch
    - Pan: Right-click and drag

.. _hrm2-storage:

Storage and Output Management
_____________________________

HRM2 generates 3D scene files (``.fo3d``) and mesh files (``.obj``) when
``export_meshes=True`` (default).

The ``output_dir`` parameter in ``apply_hrm2_to_dataset_as_groups()``
controls where files are written. If not provided, files are stored in
``fo.config.model_zoo_dir/hrm2``.

.. code-block:: python
    :linenos:

    dataset = fouh.apply_hrm2_to_dataset_as_groups(
        model,
        dataset,
        output_dir="/path/to/my/scenes"
    )

Citation
________

If you use HRM2.0 in your research, please cite:

.. code-block:: bibtex

    @inproceedings{goel20234dhuman,
      title={Humans in 4D: Reconstructing and Tracking Humans with Transformers},
      author={Goel, Shubham and Pavlakos, Georgios and Rajasegaran, Jathushan and Kanazawa, Angjoo and Malik, Jitendra},
      booktitle={ICCV},
      year={2023}
    }

