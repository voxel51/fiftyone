.. _threed_visual_ai_guide:

3D Visual AI Guide
==================

.. default-role:: code

**Complete 3D Data Workflow with Point Clouds, Meshes, and 3D Annotations**

**Level:** Intermediate | **Estimated Time:** 20-30 minutes | **Tags:** 3D Data, Point Clouds, LiDAR, 3D Meshes, 3D Annotations, Spatial Data

This step-by-step guide will walk you through a complete 3D data workflow using FiftyOne. You'll learn how to:

- Load and visualize raw 3D data including point clouds and meshes
- Work with different 3D file formats (GLTF, OBJ, PLY, STL, FBX)
- Add 3D annotations like bounding boxes and polylines
- Navigate and interact with 3D scenes in FiftyOne's viewer
- Organize 3D datasets for spatial analysis and model training

.. _threed_overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Getting Started with 3D Datasets** - Learn how to load and visualize raw 3D data, including point clouds, inside FiftyOne, exploring basic navigation in the 3D viewer and organizing datasets for spatial tasks
2. **Loading 3D Annotations** - Take your 3D workflows further by adding annotations like bounding boxes and labels to your point clouds, learning how to bring in annotations and overlay them seamlessly for inspection and validation

.. _threed_prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This guide is for developers and computer vision engineers looking to work with 3D datasets in FiftyOne. Whether you're dealing with LiDAR point clouds, voxel grids, or 3D bounding boxes, this series introduces the tools and workflows you'll need to visualize and curate your 3D data effectively.

**Required Knowledge**

You should be comfortable with the FiftyOne dataset structure and basic computer vision concepts. Prior experience with point cloud data or 3D annotations is helpful, but not required.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and 3D visualization
- **open3d** - 3D data processing and point cloud operations
- **numpy** - Numerical operations and array manipulation
- **matplotlib** - Visualization and plotting

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS
- **Python:** 3.9, 3.11
- **Memory:** 8GB RAM recommended for 3D operations
- **Storage:** 5GB free space for 3D datasets
- **Graphics:** GPU recommended for large point cloud visualization
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _threed_formats:

3D Data Formats
---------------

**Point Clouds**

- **LiDAR Data** - Raw sensor data from autonomous vehicles and robotics
- **PLY Format** - Standard point cloud format with color and normal information
- **PCD Format** - Point Cloud Data format for efficient storage
- **XYZ Format** - Simple coordinate-based point cloud representation

**3D Meshes**

- **GLTF/GLB** - Modern 3D format with materials and animations
- **OBJ** - Wavefront Object format for 3D geometry
- **PLY** - Stanford Triangle format for 3D meshes
- **STL** - Stereolithography format for 3D printing
- **FBX** - Autodesk format for 3D content exchange

**3D Annotations**

- **3D Bounding Boxes** - Object detection with location, dimensions, and rotation
- **3D Polylines** - Path and lane annotations in 3D space
- **3D Segmentation** - Point-level annotations for semantic understanding

.. _threed_workflow:

3D Data Workflow
----------------

This tutorial demonstrates a complete 3D data workflow that combines:

1. **Data Loading** - Loading different 3D formats (point clouds, meshes) with proper coordinate systems and transformations

2. **Scene Management** - Creating and organizing 3D scenes using FiftyOne's Scene class and FO3D file format

3. **3D Visualization** - Navigating and interacting with 3D data in FiftyOne's interactive 3D viewer

4. **Annotation Integration** - Adding 3D bounding boxes, polylines, and other annotations for comprehensive analysis

This integrated approach gives you the tools to not just load 3D data, but to understand spatial relationships, manage complex 3D scenes, and prepare datasets for 3D computer vision applications.

.. _threed_start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Getting Started with 3D Datasets in FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Getting Started with 3D Datasets <01_getting_started_3d.ipynb>
   Loading 3D Annotations <02_loading_annotations.ipynb>
   Guide Summary <summary> 