.. _manufacturing_guide:

Manufacturing Guide
===================

.. default-role:: code

**Complete Manufacturing AI Workflow with Anomaly Detection, Defect Inspection, and Safety Monitoring**

**Level:** Beginner | **Estimated Time:** 120-150 minutes | **Tags:** Manufacturing, Anomaly Detection, Defect Inspection, Safety Monitoring, Industrial AI, Computer Vision

This step-by-step guide will walk you through a complete manufacturing AI workflow using FiftyOne. You'll learn how to:

- Load and explore manufacturing datasets including MVTec AD and PPE detection
- Generate embeddings for anomaly detection and defect classification
- Apply clustering analysis to group normal vs defective parts
- Evaluate anomaly detection models with comprehensive metrics
- Use data augmentation to improve model robustness
- Visualize 3D sensor data and meshes for advanced defect inspection
- Monitor worker safety with video analytics and PPE compliance

.. _manufacturing-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Getting Started with Manufacturing Datasets** - Learn how to load and explore manufacturing datasets in FiftyOne, specifically working with MVTec Anomaly Detection dataset, understanding defect patterns, and preparing data for analysis

2. **Understanding and Using Embeddings** - Generate embeddings for anomaly detection tasks, understand their importance in Visual AI, and use them for similarity search and visualization

3. **Clustering and Labeling with Embeddings** - Perform clustering analysis to group anomalies and normal samples, use embeddings for automatic dataset labeling and cleanup

4. **Custom Embeddings for Industrial Data** - Use custom feature extractors to compute embeddings tailored for industrial data and manufacturing scenarios

5. **Model Evaluation and Integration** - Evaluate anomaly detection models with FiftyOne's evaluation modules, understand integrations and plugins

6. **Data Augmentation for Manufacturing** - Apply Albumentations for data augmentation and improve model robustness for manufacturing scenarios

7. **3D Visualization for Defect Inspection** - Visualize 3D sensor data and meshes for advanced defect inspection using MVTec 3D dataset

8. **Extended Dataset Exploration** - Dive deeper into dataset splits, statistics, and visual inspection workflows with MVTec AD

9. **Valeo Anomaly Dataset (VAD)** - Work with large-scale datasets collected from actual automotive production lines

10. **PPE Detection and Safety Monitoring** - Explore datasets for Personal Protective Equipment compliance monitoring and worker safety

11. **Video Analytics for Safety** - Classify and analyze safe vs unsafe behaviors in video data using TwelveLabs integration

.. _manufacturing-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This page is for those new to FiftyOne who are looking to get started with manufacturing AI workflows, especially anomaly detection, defect inspection, and safety monitoring. Perfect for manufacturing engineers, quality control specialists, and computer vision practitioners working in industrial environments. By the end of this tutorial, you'll be able to load manufacturing datasets, perform anomaly detection analysis, and implement safety monitoring workflows using FiftyOne.

**Required Knowledge**

We will start with the assumption that you are familiar with basic Python programming and have some exposure to computer vision concepts. This guide is ideal for those who are new to manufacturing AI or looking to expand their computer vision skills into industrial applications using FiftyOne.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **torch & torchvision** - PyTorch for deep learning and computer vision
- **albumentations** - Advanced data augmentation library
- **scikit-learn** - Machine learning utilities for clustering and evaluation
- **opencv-python** - Computer vision and image processing
- **matplotlib & seaborn** - Data visualization and plotting
- **pandas & numpy** - Data manipulation and numerical operations
- **open3d** - 3D data processing and visualization
- **timm** - Pre-trained model library for custom embeddings
- **twelvelabs** - Video analytics and embeddings API

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 20.04+), macOS
- **Python:** 3.9, 3.10, 3.11
- **Memory:** 8GB RAM recommended for manufacturing dataset operations
- **Storage:** 10GB free space for manufacturing datasets and models
- **GPU:** Optional but recommended for faster model inference
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _manufacturing-datasets:

Manufacturing Datasets
----------------------

**MVTec Anomaly Detection Dataset (MVTec AD)**

A comprehensive dataset for anomaly detection in manufacturing containing:
- 15 different object categories (bottles, cables, capsules, etc.)
- High-resolution images of normal and defective parts
- Pixel-level anomaly segmentation masks
- Train/test splits for supervised learning

**MVTec 3D Anomaly Detection Dataset**

3D sensor data for advanced defect inspection including:
- Point clouds and 3D meshes of industrial parts
- Anomaly maps for 3D visualization
- Multi-modal data (RGB + depth)

**Valeo Anomaly Dataset (VAD)**

Large-scale dataset collected from actual automotive production lines:
- Real-world manufacturing scenarios
- High-volume production data
- Complex defect patterns

**Personal Protective Equipment (PPE) Detection**

Safety monitoring datasets for worker compliance:
- Hard hat detection
- Safety vest detection
- Glove and safety equipment compliance
- Video sequences for behavior analysis

**Video Dataset for Safe and Unsafe Behaviors**

Video analytics dataset for safety monitoring:
- Safe and unsafe behavior classification
- Video sequences from manufacturing environments
- TwelveLabs API integration for video embeddings

.. _manufacturing-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Getting Started with Manufacturing Datasets in FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Manufacturing Datasets <01_intro.ipynb>
   Understanding and Using Embeddings <02_embeddings.ipynb>
   Clustering and Labeling with Embeddings <03_clustering.ipynb>
   Custom Embeddings for Industrial Data <04_custom_embeddings.ipynb>
   Model Evaluation and Integration <05_evaluation.ipynb>
   Data Augmentation for Manufacturing <06_augmentation.ipynb>
   3D Visualization for Defect Inspection <07_3d_visualization.ipynb>
   Extended Dataset Exploration <08_extended_exploration.ipynb>
   Valeo Anomaly Dataset <09_vad_dataset.ipynb>
   PPE Detection and Safety Monitoring <10_ppe_detection.ipynb>
   Video Analytics for Safety <11_video_analytics.ipynb>
   Guide Summary <summary>
