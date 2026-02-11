.. _human_annotation_guide:

Human Annotation Guide
======================

.. default-role:: code

**In-App Labeling for Detection Datasets**

FiftyOne's in-app annotation lets you create and edit labels directly in the App—no external tools required. This guide offers two tracks depending on your goals.

.. _human_annotation-tracks:

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
     - 10-15 min
     - "Does this work for me?" Try in-app labeling immediately.
   * - **Full Loop**
     - Intermediate
     - 60-90 min
     - Build a complete curate -> annotate -> train -> evaluate pipeline.

.. note::

   **These tracks are independent.** Quickstart uses dataset ``my_annotation_project``, Full Loop uses ``annotation_tutorial``. You can do both without conflict.

.. _human_annotation-quickstart:

Quickstart Track
----------------

**Level:** Beginner | **Time:** 10-15 minutes

Jump straight to labeling:

1. :doc:`01_quickstart` - Load data, enter annotate mode, draw boxes, verify labels saved

If in-app annotation fits your needs, check out the Full Loop for production workflows.

.. _human_annotation-full-loop:

Full Loop Track
---------------

**Level:** Intermediate | **Time:** 60-90 minutes

A complete data-centric detection workflow. You should be comfortable with:

- Basic Python and Jupyter notebooks
- Train/val/test split concepts
- What embeddings represent (conceptually)
- Running a training loop (we use YOLOv8)

**Steps:**

2. :doc:`02_setup_splits` - Create frozen test, golden QA, and active pool splits
3. :doc:`03_smart_selection` - Use diversity sampling to pick high-value samples
4. :doc:`04_annotation_qa` - Annotate in the App with QA discipline
5. :doc:`05_train_evaluate` - Train YOLOv8, evaluate, analyze failure modes
6. :doc:`06_iteration` - Hybrid acquisition loop: coverage + targeted failure mining

.. _human_annotation-what-you-learn:

What You'll Learn
-----------------

**Quickstart Track:**

- How to enter Annotate mode in the FiftyOne App
- Creating detection bounding boxes and classifications
- Verifying annotations saved correctly
- Exporting labeled data for training

**Full Loop Track (adds):**

- Split discipline: frozen test set, golden QA, active pool
- Diversity-based sample selection for efficient labeling
- QA workflows to catch label errors before training
- Failure analysis to drive the next labeling batch
- Iterative improvement without test set contamination

.. _human_annotation-when-to-use:

When to Use In-App Annotation
-----------------------------

**Good fit:**

- Small to medium annotation tasks (tens to hundreds of samples)
- Quick corrections and QA passes
- Prototyping label schemas before scaling
- Single annotator or small team workflows
- Tight feedback loops between labeling and model evaluation

**Consider external tools (CVAT, Label Studio) when:**

- High-volume annotation with multiple annotators
- Complex role-based review and approval workflows
- Annotation task management and assignment
- You need audit trails and annotator agreement metrics

FiftyOne integrates with external annotation tools via the :ref:`annotation API <fiftyone-annotation>`.

.. _human_annotation-dataset:

Dataset
-------

Both tracks use FiftyOne's `quickstart` dataset (200 images from COCO with detection annotations). It downloads automatically when you run the notebooks.

.. _human_annotation-start:

Ready to Begin?
---------------

Click **Next** to start with the Quickstart track, or jump directly to :doc:`02_setup_splits` for the Full Loop.

.. toctree::
   :maxdepth: 1
   :hidden:

   Quickstart: In-App Labeling <01_quickstart.ipynb>
   Setup: Data Splits <02_setup_splits.ipynb>
   Smart Sample Selection <03_smart_selection.ipynb>
   Annotation + QA <04_annotation_qa.ipynb>
   Train + Evaluate <05_train_evaluate.ipynb>
   Iteration Loop <06_iteration.ipynb>
   Guide Summary <summary>
