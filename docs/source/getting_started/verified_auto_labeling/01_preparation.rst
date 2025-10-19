.. _val_preparation:

Step 1: Prepare Your Dataset and Delegated Operators
=====================================================

.. default-role:: code

Before using Verified Auto-Labeling, you need to prepare two key components: your dataset and at least one GPU-enabled delegated operator,

.. contents:: In this section
   :local:
   :depth: 2

Overview
--------

Preparation for auto-labeling involves:

1. **Setting up GPU orchestration** - Configure resources for model inference
2. **Loading and preparing your dataset** - Get your data into FiftyOne
3. **Identifying your labeling task** - Define what you want to accomplish


Setting Up Delegated Operators
----------------------------

Dataset Preparation
------------------------------

This guide presumes you have an unlabeled image dataset loaded into your FiftyOne Enterprise instance. This dataset should contain objects of interest as we will be performing object detection for our auto-labeling task.




Identify Labeling Task
------------------------------

Next Steps
----------

With your infrastructure prepared and dataset ready, you're now set to configure your first VAL run.

In the next section, you'll learn how to:
- Select appropriate models for your task
- Choose which samples to label
- Configure classes and confidence thresholds
- Launch your auto-labeling run

Click **Next** to continue to :ref:`Step 2: Configure VAL Run <val_configure_run>`.

.. tip::
   Once your orchestrator is configured, you can reuse it for almost any time of computational operation within FiftyOne. The initial setup investment pays dividends over time.
