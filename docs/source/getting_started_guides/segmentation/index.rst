.. _segmentation_guide:

Segmentation Guide
=================

.. default-role:: code

**Complete Segmentation Workflow with Instance and Semantic Segmentation**

**Level:** Beginner | **Estimated Time:** 20-30 minutes | **Tags:** Segmentation, Instance Segmentation, Semantic Segmentation, COCO, SAM2, Computer Vision

This step-by-step guide will walk you through a complete segmentation workflow using FiftyOne. You'll learn how to:

- Load and visualize segmentation datasets from FiftyOne's zoo and custom formats
- Add instance segmentation predictions using pre-trained models and custom models
- Work with Segment Anything 2 (SAM2) for advanced image and video segmentation
- Handle different segmentation formats including COCO, masks, and polygons
- Use bounding boxes, keypoints, and zero prompts for segmentation

.. _segmentation-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Loading Segmentation Datasets** - Learn how to load semantic and instance segmentation datasets from FiftyOne's zoo and from custom formats like COCO or segmentation masks
2. **Adding Instance Segmentations** - Enrich your dataset by adding segmentation predictions using both built-in models (e.g., SAM2) and your own custom models, with polygon and bounding box support
3. **Segment Anything 2 (SAM2) in FiftyOne** - Explore SAM 2's groundbreaking capabilities for image and video segmentation, including bounding boxes, keypoints, or zero prompts, and video mask propagation

.. _segmentation-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This page is for those new to FiftyOne looking to get started with segmentation workflows! We will cover how to load, visualize, enrich, and evaluate segmentation datasets with FiftyOne. This tutorial is ideal for computer vision engineers and AI researchers working with instance and semantic segmentation tasks.

**Required Knowledge**

We assume familiarity with common segmentation tasks (semantic and instance), dataset formats (e.g., COCO), and how masks or polygons are used in visual tasks. Some basic knowledge of Python and computer vision is assumed.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **opencv-python-headless** - Computer vision operations and image processing
- **pillow** - Image handling and manipulation
- **matplotlib** - Plotting and visualization
- **torch & torchvision** - PyTorch for deep learning models and SAM2

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04)
- **Python:** 3.10, 3.11
- **Memory:** 8GB RAM recommended for segmentation operations
- **Storage:** 2GB free space for segmentation datasets
- **GPU:** Optional but recommended for SAM2 and other deep learning models
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _segmentation-datasets:

Segmentation Datasets
--------------------

**Coffee Beans Dataset**

A demo dataset from Hugging Face containing coffee bean images with COCO format annotations. This dataset includes:
- High-quality coffee bean images
- Instance segmentation annotations in COCO format
- Multiple object classes for segmentation tasks

**Custom Segmentation Datasets**

The guide also covers how to work with your own segmentation datasets in various formats:
- COCO JSON annotations
- Segmentation mask folders
- Custom polygon annotations
- FiftyOne native format

.. _segmentation-formats:

Segmentation Formats
-------------------

**COCO (Common Objects in Context)**

- **Standard Format** - Industry standard for object detection and segmentation
- **JSON Annotations** - Structured format with bounding boxes and segmentation masks
- **Multi-Class Support** - Handles multiple object categories
- **Instance Segmentation** - Individual object masks with unique identifiers

**Segmentation Masks**

- **Binary Masks** - Pixel-wise binary classification (foreground/background)
- **Multi-Class Masks** - Pixel-wise class labels for semantic segmentation
- **Instance Masks** - Individual object masks for instance segmentation
- **Polygon Format** - Vector-based segmentation boundaries

**FiftyOne Native Format**

- **Optimized Storage** - Efficient storage and retrieval of segmentation data
- **Flexible Schema** - Customizable annotation structure
- **Real-time Updates** - Dynamic dataset modification and enrichment

.. _segmentation-workflow:

Segmentation Workflow
--------------------

This tutorial demonstrates a complete segmentation workflow that combines:

1. **Data Loading** - Loading different segmentation formats (COCO, masks, custom) with proper metadata handling

2. **Dataset Exploration** - Visualizing and understanding your segmentation data using FiftyOne's interactive interface

3. **Model Integration** - Adding segmentation predictions using pre-trained models and custom implementations

4. **Advanced Segmentation** - Working with cutting-edge models like SAM2 for zero-shot and prompted segmentation

This integrated approach gives you the tools to not just load segmentation data, but to understand complex segmentation relationships, manage annotations, and prepare datasets for AI-assisted computer vision workflows.

.. _segmentation-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Loading Segmentation Datasets in FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading Segmentation Datasets <01_intro>
   Adding Instance Segmentations <02_explore>
   Segment Anything 2 (SAM2) in FiftyOne <03_sam2>
   Guide Summary <summary> 