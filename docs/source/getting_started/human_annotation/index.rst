.. _human_annotation_guide:

Human Annotation Guide
======================

.. default-role:: code

**Use In-App Labeling Alongside a Complete Curate-Annotate-Train-Evaluate Loop**

**Level:** Intermediate | **Estimated Time:** 40-50 minutes | **Tags:** Annotation, Human-in-the-Loop, Detection, Embeddings, Active Learning, YOLOv8

This step-by-step guide will walk you through a complete human annotation workflow using FiftyOne. You'll learn how to:

- Set up proper data splits for iterative annotation
- Use embeddings and algorithmic sampling to intelligently select high-value samples for labeling
- Annotate and QA labels directly in the FiftyOne App using patch views
- Train a YOLOv8 detector and evaluate performance with detailed failure analysis
- Iterate with a strategy that balances coverage and targeted fixes

.. _human_annotation-overview:

Guide Overview
--------------

This guide teaches you a **data-centric annotation loop**: instead of labeling randomly, you'll learn to label strategically by combining diversity-based selection (ZCore) with model-driven failure mining.

The workflow is broken into five sequential steps:

1. **Setup: Flatten Dataset and Create Splits** - Load KITTI-style grouped data, flatten to images, and establish frozen test, golden QA, and active pool splits
2. **Bootstrap Selection: Embeddings + ZCore** - Compute embeddings and use zero-shot coreset selection to select a coverage-optimized initial batch for labeling
3. **Human Annotation Pass and QA** - Annotate using patch views in the FiftyOne App with a disciplined QA workflow
4. **Train Baseline and Evaluate** - Train YOLOv8 on your labels, evaluate with FiftyOne's detection evaluation, and analyze FP/FN failure modes
5. **Iteration: Hybrid Acquisition Loop** - Select the next batch, then repeat

.. _human_annotation-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This guide is for ML engineers and data scientists who want to implement a rigorous human annotation workflow. You'll learn to avoid common pitfalls like test set contamination, failure-only sampling bias, and label drift. Whether you're building an annotation pipeline from scratch or improving an existing one, this guide intends to provide a battle-tested framework.

**Packages Used**

The notebooks will automatically install the required packages when you run them:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **ultralytics** - YOLOv8 implementation for object detection training
- **torch & torchvision** - PyTorch framework for deep learning
- **numpy & pillow** - Image processing and numerical operations

Each notebook contains the necessary `pip install` commands at the beginning.

**System Requirements**

- **Operating System:** Linux (Ubuntu 20.04+), macOS
- **Python:** 3.9+
- **Memory:** 16GB RAM recommended
- **Storage:** 5GB free space for datasets and model checkpoints
- **GPU:** Optional but recommended for training (CUDA-compatible)
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks

.. _human_annotation-dataset:

The KITTI Dataset
-------------------------------------

We use FiftyOne's `quickstart-groups` dataset, which contains 200 scenes from the KITTI autonomous driving benchmark. Each scene includes:

- **Left and right camera images** - Stereo image pairs
- **Point cloud data** - LiDAR scans
- **2D bounding box annotations** - Object detections in image space
- **3D cuboid annotations** - Object locations in 3D space

This grouped, multi-modal dataset represents real-world complexity. However, as a learning exercise, we'll also flatten to a single camera slice for some tasks in this tutorial.

.. _human_annotation-concepts:

Key Concepts: The Data-Centric Loop
-----------------------------------

**Why Not Just Label Everything?**

Labeling is expensive. Smart selection means you can achieve similar model performance with far fewer labels. This guide teaches you to:

1. **Start with coverage**: Label diverse samples first, not random ones
2. **Then chase failures**: After training, label where the model struggles
3. **Keep a coverage budget**: Don't only fix failures or you'll overfit to edge cases

**The Three Splits You Must Maintain**

.. warning::

    If you skip this, your "improvements" are lies.

- **Frozen Test Set** - Never touched by active learning. This is your ground truth.
- **Golden QA Set** - Small (20-30 samples), heavily reviewed. Detects label drift.
- **Active Pool** - Everything else. The only place you sample new labels from.

.. _human_annotation-workflow:

Annotation Workflow Overview
----------------------------

.. code-block:: text

    Iteration 0 (Bootstrap)
    ========================
    [Pool] --ZCore--> [Batch v0] --Annotate--> [human_labels_v0]
                                                      |
                                              Train YOLOv8 v0
                                                      |
                                              Evaluate on Val
                                                      |
                                              Analyze FP/FN slices

    Iteration N (Repeat)
    ====================
    [Pool - already_labeled] --30% ZCore + 70% Failure Mining--> [Batch vN]
                                                                      |
                                                              Annotate + QA
                                                                      |
                                                              Retrain v(N+1)
                                                                      |
                                                      Compare: Val / Test / Golden

.. _human_annotation-start:

Ready to Begin?
---------------

Click **Next** to start with Step 1: Setting up your dataset with proper splits.

.. toctree::
   :maxdepth: 1
   :hidden:

   Setup: Flatten Dataset and Create Splits <01_setup_dataset.ipynb>
   Bootstrap Selection: Embeddings + ZCore <02_bootstrap_selection.ipynb>
   Human Annotation Pass + QA <03_human_annotation.ipynb>
   Train Baseline + Evaluate <04_train_evaluate.ipynb>
   Iteration: Hybrid Acquisition Loop <05_iteration_loop.ipynb>
   Guide Summary <summary>
