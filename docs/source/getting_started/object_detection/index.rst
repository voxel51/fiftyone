.. _detection_guide:

Object Detection Guide
======================

.. default-role:: code

**Complete Object Detection Workflow with COCO, YOLOv8, and Model Evaluation**

**Level:** Beginner | **Estimated Time:** 20-30 minutes | **Tags:** Detection, Object Detection, YOLO, COCO, Model Evaluation

This step-by-step guide will walk you through a complete object detection workflow using FiftyOne. You'll learn how to:

- Load and explore detection datasets with FiftyOne
- Add object detection predictions using pre-trained models
- Find and analyze detection mistakes using FiftyOne Brain
- Evaluate detection model performance comprehensively
- Visualize and curate detection datasets effectively

.. _detection-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Loading Detection Datasets** - Load detection datasets into FiftyOne using both built-in datasets from the zoo and custom datasets
2. **Adding Object Detections** - Learn how to add object detection predictions to your datasets using both pre-trained models from the model zoo and your own models
3. **Finding Detection Mistakes** - Use FiftyOne Brain to identify detection mistakes including erroneous boxes, class mistakes, and overlapping detections
4. **Evaluating Detections** - Perform comprehensive evaluation of your detection model using FiftyOne's evaluation API and analyze best and worst performing samples

.. _detection-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This tutorial is designed for computer vision practitioners and data scientists who want to master object detection workflows using FiftyOne. Whether you're new to computer vision or experienced with other tools, you'll learn how to leverage FiftyOne's powerful capabilities for detection dataset curation, model evaluation, and visual analysis.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **torch & torchvision** - PyTorch framework for deep learning operations
- **ultralytics** - YOLOv8 implementation for object detection
- **numpy & opencv-python** - Image processing and numerical operations
- **matplotlib** - Visualization and plotting

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS
- **Python:** 3.9, 3.11
- **Memory:** 8GB RAM recommended for COCO dataset operations
- **Storage:** 2GB free space for datasets and models
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _detection-datasets:

The COCO Dataset
----------------

The Common Objects in Context (COCO) dataset is one of the most important benchmarks in computer vision for object detection, segmentation, and captioning. It contains over 200,000 images with more than 500,000 object instances across 80 different categories, from everyday objects like cars and people to animals and household items.

COCO's rich annotations include bounding boxes, segmentation masks, and detailed metadata, making it ideal for learning detection concepts. Its diverse scenes and challenging object configurations provide excellent training ground for understanding real-world detection challenges.

.. _detection-models:

Models We'll Explore
-------------------

**YOLOv8 (You Only Look Once v8)**

YOLOv8 represents the latest evolution in the YOLO family of real-time object detection models. Known for their speed and accuracy balance, YOLO models process images in a single forward pass, making them ideal for real-time applications. YOLOv8 improvements include:

- Enhanced architecture with better feature extraction
- Improved training techniques and data augmentation
- Better small object detection capabilities
- Multiple model sizes (nano, small, medium, large, extra-large)

**FiftyOne Model Zoo Integration**

We'll also explore how to use pre-trained models from FiftyOne's Model Zoo, which provides easy access to state-of-the-art detection models with standardized interfaces for inference and evaluation.

.. _detection-workflow:

Detection Analysis Workflow
---------------------------

This tutorial demonstrates a complete detection workflow that combines:

1. **Data Management** - Using FiftyOne to load, organize, and explore detection datasets with rich metadata and annotations

2. **Model Integration** - Seamlessly adding predictions from multiple detection models and comparing their performance

3. **Quality Analysis** - Leveraging FiftyOne Brain to automatically identify potential annotation errors and model failure cases

4. **Performance Evaluation** - Computing comprehensive detection metrics including mAP, precision, recall, and analyzing performance across different object categories and sizes

This integrated approach gives you the tools to not just train detection models, but to understand their behavior, identify improvement opportunities, and maintain high-quality datasets.

.. _detection-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Loading Detection Datasets with FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading Detection Datasets <01_loading_datasets.ipynb>
   Adding Object Detections <02_adding_detections.ipynb>
   Finding Detection Mistakes <03_finding_mistakes.ipynb>
   Evaluating Detections <04_evaluating_detections.ipynb>
   Guide Summary <summary> 