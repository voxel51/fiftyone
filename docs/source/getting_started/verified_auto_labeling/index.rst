.. _verified_auto_labeling_guide:

Verified Auto-Labeling Guide
=============================

.. default-role:: code

**Bootstrapping Datasets with Verified Auto-Labeling (VAL)**

**Level:** Intermediate | **Estimated Time:** 30-45 minutes | **Tags:** Auto-Labeling, Annotation, Delegated Operations, Model Inference

This guide walks you through using FiftyOne's Verified Auto-Labeling (VAL) to rapidly bootstrap and refine labels on your dataset. You'll learn how to:

- Configure GPU-enabled delegated operators (DOs) for efficient model inference
- Generate high-quality auto-labels using state-of-the-art models
- Analyze and review predictions with confidence-based filtering
- Refine your labels with visualization tools (patches view, embeddings)
- Systematically approve correct predictions and flag issues
- Complete the VAL workflow to integrate labels into your dataset

.. _val-overview:

Guide Overview
--------------

Verified Auto-Labeling combines model inference with human verification to dramatically accelerate dataset labeling. The workflow consists of the following steps:

1. **Gather Your Data** - Prepare your dataset in FiftyOne
2. **Set Up Delegated Operators** - Configure GPU resources for delegated model inference and embeddings computation
3. **Identify Your Task** - Define the labeling objective (detection, classification, or segmentation)
4. **Configure VAL Run** - Select target samples, models, classes, and confidence threshld
5. **Execute and Monitor** - Launch the auto-labeling run and track progress
6. **Analyze Results** - Review predictions using confidence sliders, patches view, and embeddings
7. **Batch Approve Labels** - Efficiently approve high-quality true positive predictions
8. **Tag Problem Cases** - Mark samples requiring manual correction or review
9. **Finalize Workflow** - Accept approved labels and discard problematic predictions

.. _val-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

.. note::
      Verified Auto Labeling is available in
      :ref:`FiftyOne Enterprise <fiftyone-enterprise>`.
      If you are using open source FiftyOne and are
      interested in this feature, please reach out to
      `Voxel51 sales <https://voxel51.com/sales>`_.

This guide is designed for machine learning practitioners and data scientists who need to efficiently label large datasets. Whether you're bootstrapping a new project or improving existing annotations, VAL provides a systematic approach to leveraging model predictions while maintaining human oversight.

**Required Knowledge**

- Familiarity with the FiftyOne Enterprise App interface and basic operations
- Understanding of your target task (detection, classification, segmentation)
- Basic knowledge of machine learning models and confidence thresholds

**System Requirements**

- **FiftyOne Enterprise:** This feature requires FiftyOne Enterprise with delegated operations
- **GPU Access:** Orchestrator must have GPU resources for model inference
- **Storage:** Sufficient object storage space for dataset media and label fields

.. _val-models-section:

.. toctree::
   :maxdepth: 1
   :hidden:

   Prepare Your Dataset and Delegated Operators <01_preparation>
   Configure VAL Run <02_configure_run>
   Analyze Predictions <03_analyze_results>
   Visualize Embeddings <04_visualize_embeddings>
   Finalize Approvals <05_finalize>
   Guide Summary <summary>
