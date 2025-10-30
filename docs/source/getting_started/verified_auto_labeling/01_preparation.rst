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

1. **Setting up GPU orchestration** - Configure delegated operators for running model inference
2. **Loading and preparing your dataset** - Get your data into FiftyOne
3. **Identifying your labeling task** - Define what you want to accomplish


Setting Up Delegated Operators
------------------------------

Dataset Preparation
-------------------

This guide presumes you have an unlabeled image dataset loaded into your FiftyOne Enterprise instance. This dataset should contain objects of interest as we will be performing object detection for our auto-labeling task.

To create a dataset in FiftyOne Enterprise and load in samples, see :ref:`creating datasets <enterprise-creating-datasets>`. In order to include specific examples in this guide we will be using an unlabeled version of the :ref:`BDD100K image dataset <dataset-zoo-bdd100k>` available in the :doc:`FiftyOne dataset zoo </dataset_zoo/datasets>`.


Identify Labeling Task and Classes
----------------------------------

Verified auto-labeling currently supports the following 3 annotation tasks.

- **Classification:** Label applied to the entire image (e.g., `cloudy`)
- **Object detection:** Bounding box labels drawn around objects of interest (e.g., `dog`, `cat`, `bigfoot`)
- **Instance segmentation**: Pixel-level masks delineating exact object boundaries (e.g., individual `cars` on a crowded road)

In this guide, we will choose **object detection**. 

You will also want an idea of the **classes**, or object categories, you will be annotating in the dataset. Based on the annotation task chosen, FiftyOne will let you choose from a list of model that can be used for labeling. Some model are **zero-shot** and support arbitrary, plain-language class descriptions. Others are **fixed-vocabulary** and requires choosing from a fixed list of classes that model was trained on.

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
