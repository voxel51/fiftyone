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
        ``MeshInstances3D.instances``

2. 3D Scene Slice Samples
-------------------------

Each 3D scene sample (``.fo3d`` file) contains a ``MeshInstances3D`` label
(default field: ``human_pose_3d``) with:

-   **instances**: List of :class:`fiftyone.core.labels.MeshInstance3D` objects,
    each representing one detected person with:

    -   ``instance_id``: numeric identifier
    -   ``label``: semantic label (typically "person")
    -   ``detection``: :class:`fiftyone.core.labels.Detection` (absolute pixel coordinates)
    -   ``mesh``: :class:`fiftyone.core.labels.Mesh3D` with vertices and faces
    -   ``keypoints_3d``: :class:`fiftyone.core.labels.Keypoints3D` label
    -   ``keypoints_2d``: :class:`fiftyone.core.labels.Keypoint` (normalized [0, 1])
    -   ``camera``: :class:`fiftyone.core.labels.Camera` (weak_perspective + translation)
    -   ``attributes``: dict containing model-specific parameters:

        -   ``"source"``: ``"hrm2"``
        -   ``"smpl_params"``: dict with body_pose, betas, global_orient, camera

-   **frame_size**: [height, width] of the originating frame
-   **camera**: Optional :class:`fiftyone.core.labels.Camera` for scene-level camera

.. note::

    **SMPL Parameters**: SMPL-specific data is stored in
    ``mesh_instance.attributes["smpl_params"]`` dictionary, making the structure
    model-agnostic while preserving all SMPL information.

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

        # 2D Keypoints (normalized [0, 1])
        keypoints_2d = first_person_2d.pose.points
        confidences = first_person_2d.pose.confidence

        # Person bounding box (normalized [0, 1])
        bbox_2d = first_person_2d.detection.bounding_box

        print("First person 2D keypoints:", keypoints_2d)
        print("First person 2D bbox:", bbox_2d)

    #
    # Access the 3D scene sample with MeshInstances3D
    #
    scene_sample = scene_slice.match(fo.ViewField("human_pose_3d") != None).first()
    mesh_instances = scene_sample.human_pose_3d  # MeshInstances3D

    if mesh_instances and mesh_instances.instances:
        # Iterate through detected people
        for mesh_instance in mesh_instances.instances:
            # Access SMPL parameters from attributes dict
            if mesh_instance.attributes and "smpl_params" in mesh_instance.attributes:
                smpl_params = mesh_instance.attributes["smpl_params"]
                print("Body pose:", len(smpl_params["body_pose"]))
                print("Shape params:", len(smpl_params["betas"]))

            # Access mesh geometry
            if mesh_instance.mesh:
                print("Vertices:", len(mesh_instance.mesh.vertices))
                print("Faces:", len(mesh_instance.mesh.faces))

            # Access 3D keypoints
            if mesh_instance.keypoints_3d and mesh_instance.keypoints_3d.keypoints:
                print("3D joints:", len(mesh_instance.keypoints_3d.keypoints))

            # Access 2D keypoints
            if mesh_instance.keypoints_2d:
                print("2D keypoints:", len(mesh_instance.keypoints_2d.points))

            # Access camera
            if mesh_instance.camera:
                print("Translation:", mesh_instance.camera.translation)
                print("Weak perspective:", mesh_instance.camera.weak_perspective)

            # Access bounding box
            if mesh_instance.detection:
                print("Bbox:", mesh_instance.detection.bounding_box)
                print("Relative coords:", mesh_instance.detection.relative_coordinate)

    # View the 3D scene file path (.fo3d)
    print("Scene file:", scene_sample.filepath)

.. _hrm2-skeleton-visualization:

Skeleton Visualization
______________________

Although the meshes come from SMPL parameters, HMR2/4D-Humans **reorders the
predicted joints to the OpenPose BODY-25 topology** (and adds additional facial
and foot landmarks). The integration configures this BODY-25 skeleton
automatically so the FiftyOne App can render clean overlays that match the
ordering of the keypoints you receive from the model.

BODY-25 Structure
-----------------

BODY-25 uses 25 keypoints with the neck/mid-hip chain as the torso root and
additional joints for eyes, ears, and toes:

.. code-block:: text

                     17 (right_ear)   18 (left_ear)
                           |               |
                    15 (right_eye)   16 (left_eye)
                             \         /
                              0 (nose)
                               |
                             1 (neck)
                         /     |      \\
               2 (r_shoulder) |   5 (l_shoulder)
                     |        |        |
                3 (r_elbow)   |   6 (l_elbow)
                     |        |        |
                4 (r_wrist)   |   7 (l_wrist)
                              |
                           8 (mid_hip)
                          /          \\
                9 (r_hip)             12 (l_hip)
                   |                      |
               10 (r_knee)           13 (l_knee)
                   |                      |
               11 (r_ankle)          14 (l_ankle)
                /   |   \\           /   |    \\
      22 (r_big_toe) |  24(r_heel) 19(l_big_toe) | 21(l_heel)
                     23 (r_small_toe)              20(l_small_toe)

Key facts:

-   **25 joints** (0-24) following the OpenPose/COCO convention
-   **24 edges** that connect torso, limbs, and extra facial/foot landmarks
-   Symmetric layout for left/right limbs for consistent visualization

Automatic Configuration
-----------------------

When you use ``apply_hrm2_to_dataset_as_groups()``, the BODY-25 skeleton is
automatically configured on the dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.hrm2 as fouh

    # Load model and apply to dataset
    model = foz.load_zoo_model("hrm2-torch", smpl_model_path="/path/to/SMPL_NEUTRAL.pkl")
    dataset = fouh.apply_hrm2_to_dataset_as_groups(model, dataset, label_field="human_pose")

    # Skeleton is automatically set
    print(f"Skeleton configured: {dataset.default_skeleton is not None}")  # True
    print(f"Number of joints: {len(dataset.default_skeleton.labels)}")     # 25
    print(f"Number of edges: {len(dataset.default_skeleton.edges)}")       # 24

Manual Configuration
--------------------

You can also manually retrieve and configure the HRM2/BODY-25 skeleton:

.. code-block:: python
    :linenos:

    from fiftyone.utils.hrm2 import get_hrm2_skeleton, HRM2_JOINT_NAMES

    # Get the BODY-25 skeleton
    skeleton = get_hrm2_skeleton()

    # Inspect the structure
    print("Joint names:", skeleton.labels)
    print("Edges:", skeleton.edges)

    # Set it on your dataset
    dataset.default_skeleton = skeleton
    dataset.save()

App Visualization
-----------------

Once the skeleton is configured, the FiftyOne App will automatically render
skeleton overlays when viewing keypoints:

1. **Image slice**: The 2D keypoints (from ``human_pose_2d`` field) will display
   with skeleton connections overlaid on the image
2. **3D slice**: The 3D keypoints will show the skeleton structure in the 3D viewer

The skeleton visualization helps validate:

-   Correct joint detection and positioning
-   Body pose and posture
-   Multi-person tracking (each person maintains their own skeleton)
-   Temporal consistency in video sequences

Joint Names Reference
---------------------

``HRM2_JOINT_NAMES`` captures the BODY-25 ordering used by HMR2/4D-Humans:

.. code-block:: python

    HRM2_JOINT_NAMES = [
        "nose",            # 0
        "neck",            # 1
        "right_shoulder",  # 2
        "right_elbow",     # 3
        "right_wrist",     # 4
        "left_shoulder",   # 5
        "left_elbow",      # 6
        "left_wrist",      # 7
        "mid_hip",         # 8
        "right_hip",       # 9
        "right_knee",      # 10
        "right_ankle",     # 11
        "left_hip",        # 12
        "left_knee",       # 13
        "left_ankle",      # 14
        "right_eye",       # 15
        "left_eye",        # 16
        "right_ear",       # 17
        "left_ear",        # 18
        "left_big_toe",    # 19
        "left_small_toe",  # 20
        "left_heel",       # 21
        "right_big_toe",   # 22
        "right_small_toe", # 23
        "right_heel",      # 24
    ]

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

.. _hrm2-migration:

Migration from Previous Versions
_________________________________

If you're upgrading from an earlier version of the HRM2 integration, the API has
changed to use model-agnostic label structures.

Old API (No Longer Supported)
------------------------------

The previous integration used SMPL-specific classes:

.. code-block:: python

    # OLD - No longer available
    smpl_poses = sample.human_pose_3d  # SMPLHumanPoses
    for smpl_pose in smpl_poses.poses:  # List of SMPLHumanPose
        body_pose = smpl_pose.smpl_params.body_pose
        betas = smpl_pose.smpl_params.betas
        vertices = smpl_pose.person_3d.vertices

New API (Current)
-----------------

The current integration uses ``MeshInstances3D`` with SMPL parameters stored in
the attributes dictionary:

.. code-block:: python

    # NEW - Current API
    mesh_instances = scene_sample.human_pose_3d  # MeshInstances3D
    for mesh_instance in mesh_instances.instances:  # List of MeshInstance3D
        # Access SMPL params from attributes dict
        if mesh_instance.attributes and "smpl_params" in mesh_instance.attributes:
            smpl_params = mesh_instance.attributes["smpl_params"]
            body_pose = smpl_params["body_pose"]
            betas = smpl_params["betas"]

        # Access mesh geometry
        if mesh_instance.mesh:
            vertices = mesh_instance.mesh.vertices

Key Changes
-----------

-   ``SMPLHumanPoses`` → ``MeshInstances3D``
-   ``smpl_pose.smpl_params.body_pose`` → ``mesh_instance.attributes["smpl_params"]["body_pose"]``
-   ``smpl_pose.person_3d.vertices`` → ``mesh_instance.mesh.vertices``
-   ``smpl_pose.person_3d.keypoints_3d`` → ``mesh_instance.keypoints_3d``
-   SMPL parameters are now in a dict for model-agnostic design

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

