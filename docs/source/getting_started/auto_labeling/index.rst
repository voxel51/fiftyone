.. _verified_auto_labeling_guide:

Auto Labeling Guide
=============================

.. default-role:: code

**Bootstrapping Datasets with Auto Labeling**

**Level:** Intermediate | **Estimated Time:** 30-45 minutes | **Tags:** Auto-Labeling, Annotation, Delegated Operations, Model Inference

This guide walks you through using FiftyOne's Auto Labeling to rapidly bootstrap and refine labels on your dataset. You'll learn how to:

- Generate high-quality auto labels using state-of-the-art models
- Analyze and review predictions with confidence-based filtering
- Refine your labels with visualization tools (patches view, embeddings)
- Systematically approve correct predictions and flag issues
- Complete the auto labeling workflow to integrate labels into your dataset

.. _val-overview:

Guide Overview
--------------

Auto Labeling combines model inference with human verification to dramatically accelerate dataset labeling. The workflow consists of the following steps:

1. **Gather Your Data and Infrastructure** - Prepare your dataset in FiftyOne and configure GPU orchestration
2. **Configure Auto Labeling Run** - Configure and launch an auto labeling task and track progress
3. **Analyze Results** - Review predictions and select samples for approval
4. **Visualize Embeddings** - Generate patch embeddings and use it to analyze clusters of samples
5. **Finalize Workflow** - Accept approved labels and discard problematic predictions

.. _val-prerequisites:

Prerequisites
-------------

.. note::
      Auto Labeling is available in
      :ref:`FiftyOne Enterprise <fiftyone-enterprise>`.
      If you are using open source FiftyOne and are
      interested in this feature, please reach out to
      `Voxel51 sales <https://voxel51.com/sales>`_.


**Who Is This Guide For**

This guide is designed for machine learning practitioners and data scientists who need to efficiently label large datasets. Whether you're bootstrapping a new project or improving existing annotations, Auto Labeling provides a systematic approach to leveraging model predictions while maintaining human oversight.

**Required Knowledge**

- Familiarity with the FiftyOne Enterprise App interface and basic operations
- Understanding of your target task (detection, classification, segmentation)
- Basic knowledge of machine learning models and confidence thresholds

**System Requirements**

- **FiftyOne Enterprise:** This feature requires FiftyOne Enterprise with delegated operations
- **GPU Access:** Orchestrator must have GPU resources for model inference
- **Storage:** Sufficient object storage space for dataset media and label fields

.. _val-models-section:

Ready to Begin?
---------------

Click **Next** to start with the first step: Prepare Your Dataset and Delegated Operators.

.. toctree::
   :maxdepth: 1
   :hidden:

   Prepare Your Dataset and Delegated Operators <01_preparation>
   Configure Auto Labeling Run <02_configure_run>
   Analyze Predictions <03_analyze_results>
   Visualize Embeddings <04_visualize_embeddings>
   Finalize Approvals <05_finalize>
   Guide Summary <summary>
