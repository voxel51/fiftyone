.. _verified_auto_labeling_guide:

Verified Auto-Labeling Guide
=============================

.. default-role:: code

**Bootstrapping Datasets with Verified Auto-Labeling (VAL)**

**Level:** Intermediate | **Estimated Time:** 30-45 minutes | **Tags:** Auto-Labeling, Annotation, Delegated Operations, Model Inference

This guide walks you through using FiftyOne's Verified Auto-Labeling (VAL) feature to rapidly bootstrap and refine labels on your dataset. You'll learn how to:

- Configure GPU-enabled delegated operators (DOs) for efficient model inference
- Generate high-quality auto-labels using state-of-the-art models
- Analyze and review predictions with confidence-based filtering
- Refine your labels with visualization tools (patches view, embeddings)
- Systematically approve correct predictions and flag issues
- Complete the VAL workflow to integrate labels into your dataset

.. _val-overview:

Guide Overview
--------------

Verified Auto-Labeling combines model inference with human verification to dramatically accelerate dataset labeling while maintaining high quality standards. This guide demonstrates the complete workflow from initial setup through final label approval.

The workflow consists of the following steps:

1. **Gather Your Data** - Prepare your dataset in FiftyOne
2. **Set Up Delegated Operators** - Configure GPU resources for delegated model inference
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

This tutorial is designed for machine learning practitioners and data scientists who need to efficiently label large datasets. Whether you're bootstrapping a new project or improving existing annotations, VAL provides a systematic approach to leveraging model predictions while maintaining human oversight.

**Required Knowledge**

- Familiarity with the FiftyOne Enterprise App interface and basic operations
- Understanding of your target task (detection, classification, segmentation)
- Basic knowledge of machine learning models and confidence thresholds

**System Requirements**

- **FiftyOne Enterprise:** This feature requires FiftyOne Enterprise with delegated operations
- **GPU Access:** Orchestrator must have GPU resources for model inference
- **Memory:** 16GB+ RAM recommended for typical workloads
- **Storage:** Sufficient space for model weights and predictions

.. _val-key-concepts:

Key Concepts
------------

**Verified Auto-Labeling (VAL)**

VAL is a human-in-the-loop workflow that combines automated model predictions with systematic human review. Unlike fully automated labeling, VAL ensures quality by requiring explicit approval of predictions before they become permanent dataset labels.

**Delegated Operations**

Model inference runs as a delegated operation on a configured orchestrator, enabling:
- GPU-accelerated processing without local hardware requirements
- Parallel execution across large datasets
- Resource isolation and scalability

**Three-Stage Review Process**

1. **Analyze** - Initial review of all predictions, filtering by confidence
2. **Approval** - Queue of predictions marked ready for final acceptance
3. **Approved** - Finalized labels integrated into the dataset

**Confidence-Based Filtering**

The confidence slider enables dynamic filtering of predictions based on model confidence scores, allowing reviewers to:
- Focus on uncertain predictions requiring verification
- Batch approve high-confidence correct predictions
- Identify systematic model failures at specific confidence ranges

.. _val-models-section:

Supported Models
----------------

VAL works with models from FiftyOne's Model Zoo, including:

**Object Detection**
- YOLOv8 (all variants: nano, small, medium, large, extra-large)
- Grounding DINO (zero-shot, text-prompted detection)
- DINO (Detection Transformer)
- Faster R-CNN variants

**Classification**
- CLIP (zero-shot image classification)
- ResNet, EfficientNet (fine-tuned classifiers)
- Vision Transformers (ViT)

**Segmentation**
- Segment Anything Model (SAM, SAM2)
- Mask R-CNN

.. _val-best-practices:

Best Practices
--------------

TBD

.. _val-troubleshooting:

Troubleshooting
---------------

TBD

.. _val-next-steps:

Next Steps
----------

TBD

.. _val-summary:

Summary
-------

Verified Auto-Labeling provides a systematic approach to dataset labeling that balances automation and human oversight. It uses state-of-the-art foundation modelswith an intuitive review workflow to accelerate annotation while maintaining high quality standards.

The key to success with VAL is understanding it as an iterative process where you refine over multiple passes. Combined with FiftyOne's exploration and curation capabilities, VAL becomes a cornerstone of efficient, high-quality dataset development.

.. toctree::
   :maxdepth: 1
   :hidden:

   Prepare Your Dataset and Delegated Operators <01_preparation>
   Configure VAL Run <02_configure_run>
   Analyze Predictions <03_analyze_results>
   Batch Approve Labels <04_batch_approve>
   Tag Problem Cases <05_tag_problems>
   Finalize Workflow <06_finalize>
   Guide Summary <summary>
