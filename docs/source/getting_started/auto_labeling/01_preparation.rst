.. _val_preparation:

Step 1: Prepare Your Dataset and Compute Cluster
=================================================

.. default-role:: code

Before using Auto Labeling, you need to prepare two key components: your dataset and a compute cluster to run inference.

Overview
--------

Preparation for auto labeling involves:

1. **Setting up a compute cluster** - Configure a compute orchestrator for running model inference
2. **Loading and preparing your dataset** - Get your data into FiftyOne
3. **Identifying your labeling task** - Define what you want to accomplish


Setting Up a Compute Cluster
----------------------------

A compute orchestrator is the infrastructure that executes model inference and other computationally intensive operations in FiftyOne Enterprise. Delegated operations run on these orchestrators. Many inference tasks are compute-heavy, so having GPU support in your orchestrator is recommended. For Auto Labeling to work, you need at least one active orchestrator. See the :ref:`delegated operations documentation <enterprise-delegated-operations>` for more details.

Dataset Preparation
-------------------

This guide presumes you have an unlabeled image dataset loaded into your FiftyOne Enterprise instance. This dataset should contain objects of interest as we will be performing object detection for our auto-labeling task.

To create a dataset in FiftyOne Enterprise and load in samples, see :ref:`creating datasets <enterprise-creating-datasets>`. In order to include specific examples in this guide we will be using an unlabeled version of the :ref:`BDD100K image dataset <dataset-zoo-bdd100k>` available in the :doc:`FiftyOne dataset zoo </dataset_zoo/index>`.


Identify Labeling Task and Classes
----------------------------------

Auto Labeling currently supports the following 3 annotation tasks.

- **Classification:** Label applied to the entire image (e.g., `cloudy`)
- **Object detection:** Bounding box labels drawn around objects of interest (e.g., `dog`, `cat`, `bigfoot`)
- **Instance segmentation**: Pixel-level masks delineating exact object boundaries (e.g., individual `cars` on a crowded road)

In this guide, we will choose **object detection**. Object detection is ideal when you need to locate and classify multiple objects within each image. For the BDD100K driving dataset, this means identifying vehicles, pedestrians, traffic signs, and other road objects. These labels are essential for training perception models used in autonomous driving systems. The bounding box format also makes it easy to verify label accuracy at a glance. 

You will also want an idea of the **classes**, or object categories, you will be annotating in the dataset. Based on the annotation task chosen, FiftyOne will let you choose from a list of models that can be used for labeling. Some models are **zero-shot** and support arbitrary, plain-language class descriptions. Others are **fixed-vocabulary** and require choosing from a fixed list of classes that model was trained on.

Next Steps
----------

With your infrastructure prepared and dataset ready, you're now set to configure your first auto labeling run.

In the next section, you'll learn how to:

- Select appropriate models for your task
- Choose which samples to label
- Configure classes and confidence thresholds
- Launch your auto labeling run

Click **Next** to continue to :ref:`Step 2: Configure Auto Label Run <val_configure_run>`.

.. tip::
   Once your orchestrator is configured, you can reuse it for almost any type of computational operation within FiftyOne. The initial setup investment pays dividends over time.
