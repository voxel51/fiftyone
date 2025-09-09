.. _self_driving_guide:

Self-Driving Car Dataset Guide
==============================

.. default-role:: code

**Complete Self-Driving Dataset Workflow with nuScenes, Multi-Sensor Data, and Advanced Analysis**

**Level:** Intermediate | **Estimated Time:** 25-40 minutes | **Tags:** Self-Driving, Autonomous Vehicles, nuScenes, Multi-Sensor, Video Sequences, 3D Data

This step-by-step guide will walk you through a complete self-driving car dataset workflow using FiftyOne. You'll learn how to:

- Load and organize complex multi-sensor self-driving datasets
- Work with video sequences and temporal data
- Handle 3D bounding boxes and camera projections
- Apply advanced filtering and curation techniques
- Use embeddings and similarity for dataset analysis
- Integrate with the FiftyOne Model Zoo for enhanced insights

.. _self_driving-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Loading Self-Driving Datasets** - Learn how to load complex self-driving datasets into FiftyOne, working with multi-frame video sequences, sensor metadata, and associating labels with frames
2. **Advanced Self-Driving Techniques** - Dive into advanced tools for managing and analyzing self-driving datasets, including filtering by events, syncing labels across sequences, and curating key frames

.. _self_driving-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This tutorial is designed for computer vision engineers working with self-driving car datasets. Whether you're dealing with large-scale video data, sensor fusion, or frame-level labels, this guide shows how FiftyOne can streamline your workflow.

**Required Knowledge**

You should be familiar with the FiftyOne dataset structure and have a basic understanding of working with grouped datasets. If not, we recommend starting with the Getting Started with Grouped Datasets guide first.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **nuscenes-devkit** - nuScenes dataset SDK for loading and processing data
- **open3d** - 3D data processing and visualization
- **torch & torchvision** - PyTorch framework for deep learning operations
- **transformers** - Hugging Face transformers for embedding models
- **umap-learn** - Dimensionality reduction for visualization
- **matplotlib** - Visualization and plotting

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS (Run All (only the sam2 section doesn’t work))
- **Python:** 3.10 recommended for compatibility
- **Memory:** 16GB RAM recommended for large datasets
- **Storage:** 10GB free space for nuScenes dataset
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _self_driving-datasets:

The nuScenes Dataset
--------------------

The nuScenes dataset is a public dataset for autonomous driving that contains 1,000 scenes of 20 seconds each, captured in Boston and Singapore. It includes data from 6 cameras, 1 LIDAR, 5 RADAR, GPS, and IMU sensors, making it perfect for learning multi-sensor data handling.

The dataset includes:
- Multi-camera video sequences with synchronized timestamps
- 3D bounding box annotations in global coordinates
- LIDAR point clouds and RADAR data
- GPS and IMU sensor data
- Scene metadata and weather conditions

.. _self_driving-sensors:

Multi-Sensor Data Handling
--------------------------

**Camera Data**

- **Multi-Camera Setup** - Working with 6 synchronized cameras (front, back, left, right, front-left, front-right)
- **3D to 2D Projection** - Converting 3D bounding boxes to 2D camera coordinates
- **Temporal Sequences** - Managing video sequences with frame-level annotations
- **Sensor Synchronization** - Aligning data across different sensor modalities

**Advanced Features**

- **Grouped Datasets** - Organizing data by scenes and sensor types
- **Dynamic Group Views** - Creating flexible views across different sensor combinations
- **Embedding Analysis** - Using CLIP embeddings for semantic search and visualization
- **Model Integration** - Applying SAM2 and other models for enhanced analysis

.. _self_driving-workflow:

Self-Driving Analysis Workflow
------------------------------

This tutorial demonstrates a complete self-driving workflow that combines:

1. **Data Ingestion** - Loading complex multi-sensor datasets with proper organization and metadata

2. **Temporal Analysis** - Working with video sequences, understanding frame relationships, and managing temporal data

3. **Advanced Curation** - Using embeddings, similarity search, and model predictions to identify key moments and edge cases

4. **Multi-Sensor Fusion** - Coordinating data across cameras, LIDAR, and other sensors for comprehensive analysis

This integrated approach gives you the tools to not just load self-driving data, but to understand complex multi-sensor relationships, identify critical scenarios, and prepare datasets for model training and validation.

.. _self_driving-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Loading Self-Driving Datasets with FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading Self-Driving Datasets <01_loading_datasets.ipynb>
   Advanced Self-Driving Techniques <02_advanced_techniques.ipynb>
   Guide Summary <summary> 