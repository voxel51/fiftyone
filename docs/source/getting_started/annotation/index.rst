.. _annotation_guide:

Annotation Guide
================

.. default-role:: code

**Multimodal 2D/3D Annotation for Detection Datasets**

FiftyOne's in-app annotation lets you create and edit labels directly in the App—including 2D bounding boxes on images and 3D cuboids on point clouds. This guide offers two tracks depending on your goals.

.. _annotation-tracks:

Choose Your Track
-----------------

.. list-table::
   :widths: 20 15 25 40
   :header-rows: 1

   * - Track
     - Level
     - Time
     - Best For
   * - **Quickstart**
     - Beginner
     - 15-20 min
     - "Does this work for me?" Try multimodal annotation immediately.
   * - **Full Loop**
     - Intermediate
     - 90-120 min
     - Build a complete curate → annotate → train → evaluate pipeline.

.. note::

   **These tracks are independent.** Quickstart uses the zoo dataset directly (ephemeral), Full Loop clones to ``annotation_tutorial`` (persistent). You can do both without conflict.

.. _annotation-quickstart:

Quickstart Track
----------------

**Level:** Beginner | **Time:** 15-20 minutes

Jump straight to multimodal annotation:

- :doc:`01_quickstart` - Load grouped data, explore 2D/3D views, draw boxes

If in-app annotation fits your needs, check out the Full Loop for production workflows.

.. _annotation-full-loop:

Full Loop Track
---------------

**Level:** Intermediate | **Time:** 90-120 minutes

A complete data-centric detection workflow with multimodal data. You should be comfortable with:

- Basic Python and Jupyter notebooks
- Train/val/test split concepts
- What embeddings represent (conceptually)
- Running a training loop (we use YOLOv8)

**Steps:**

- :doc:`02_setup_splits` - Clone dataset, create group-level splits (test, val, golden, pool)
- :doc:`03_smart_selection` - Use diversity sampling to pick high-value scenes
- :doc:`04_annotation_2d` - Annotate 2D detections on camera images with QA discipline
- :doc:`05_annotation_3d` - Annotate 3D cuboids on point clouds
- :doc:`06_train_evaluate` - Train YOLOv8, evaluate, analyze failure modes
- :doc:`07_iteration` - Hybrid acquisition loop: coverage + targeted failure mining

.. _annotation-what-you-learn:

What You'll Learn
-----------------

**Quickstart Track:**

- What grouped datasets are (synchronized multi-sensor data)
- Switching between 2D images and 3D point clouds
- Creating detection bounding boxes in Annotate mode
- Exploring 3D point cloud data

**Full Loop Track (adds):**

- Group-level split discipline: frozen test set, golden QA, active pool
- Diversity-based sample selection for efficient labeling
- 2D annotation on camera images with QA workflows
- 3D cuboid annotation on point clouds
- Camera projections: seeing 3D labels on 2D images
- Failure analysis to drive the next labeling batch
- Iterative improvement without test set contamination

.. _annotation-when-to-use:

When to Use In-App Annotation
-----------------------------

**Ideal for:**

- Rapid prototyping and schema iteration
- Model-in-the-loop correction workflows
- QA passes and targeted refinement
- Single annotator or small team projects
- Multimodal data with synchronized 2D/3D views
- Tight feedback loops between labeling and evaluation

**For large-scale annotation projects**, FiftyOne's :ref:`annotation API <fiftyone-annotation>`
lets you orchestrate external annotation services while keeping FiftyOne as your
central data hub for curation, QA, and model evaluation.

.. _annotation-dataset:

Dataset
-------

Both tracks use the ``quickstart-groups`` dataset—a subset of KITTI with:

- **Left/right camera images** (2D)
- **Point cloud data** (3D LiDAR)
- **200 scenes** with synchronized multi-sensor data

The dataset downloads automatically when you run the notebooks.

.. code-block:: python

   import fiftyone as fo
   import fiftyone.zoo as foz

   dataset = foz.load_zoo_dataset("quickstart-groups")
   session = fo.launch_app(dataset)

.. _annotation-start:

Ready to Begin?
---------------

Click **Next** to start with the Quickstart track, or jump directly to :doc:`02_setup_splits` for the Full Loop.

.. toctree::
   :maxdepth: 1
   :hidden:

   Quickstart: Multimodal Annotation <01_quickstart.ipynb>
   Setup Data Splits <02_setup_splits.ipynb>
   Smart Sample Selection <03_smart_selection.ipynb>
   2D Annotation + QA <04_annotation_2d.ipynb>
   3D Annotation <05_annotation_3d.ipynb>
   Train + Evaluate <06_train_evaluate.ipynb>
   Iteration Loop <07_iteration.ipynb>
   Guide Summary <summary>
