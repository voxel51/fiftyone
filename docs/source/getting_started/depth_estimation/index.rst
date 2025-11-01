.. _depth_estimation_guide:

Depth Estimation Guide
======================

.. default-role:: code

**Complete Depth Estimation Workflow with Loading, Visualization, and Model Integration**

**Level:** Beginner to Intermediate | **Estimated Time:** 45-60 minutes | **Tags:** Depth Estimation, Heatmaps, Monocular Depth, Model Zoo, Hugging Face

This step-by-step guide will walk you through a complete depth estimation workflow using FiftyOne. You'll learn how to:

- Load and visualize depth data from various sources and formats
- Work with depth maps stored as NumPy arrays and image files
- Handle depth validity masks for reliable measurements
- Use pre-trained depth estimation models from multiple sources
- Compare and evaluate depth estimation results
- Organize depth datasets for analysis and model training

.. _depth_estimation-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Loading Depth Data** - Learn how to load depth estimation datasets in FiftyOne, working with both NumPy-based depth maps (DICOM dataset) and image-based depth maps (NYU Depth V2), understanding depth validity masks, and creating structured datasets for analysis

2. **Using Depth Estimation Models** - Explore multiple approaches to running depth estimation models including FiftyOne's Model Zoo integration, Hugging Face Transformers, community plugins, and the Diffusers library for zero-shot depth prediction

.. _depth_estimation-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This guide is for developers and computer vision practitioners who want to work with depth estimation in FiftyOne. Whether you're training depth models, evaluating predictions, or exploring depth datasets, this tutorial will help you leverage FiftyOne's capabilities for depth data visualization and analysis. Perfect for those with basic Python and computer vision knowledge who want to incorporate depth estimation into their workflows.

**Required Knowledge**

We will start with the assumption that you are familiar with the basic FiftyOne dataset structure and fundamental computer vision concepts. This guide is ideal for those who want to work with depth estimation datasets or integrate depth models into their workflows using Python.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **torch** - PyTorch for deep learning operations
- **transformers** - Hugging Face Transformers for pre-trained depth models
- **diffusers** - Diffusers library for zero-shot depth estimation
- **datasets** - Hugging Face Datasets for loading benchmark datasets
- **kagglehub** - Dataset downloading from Kaggle
- **pandas & numpy** - Data manipulation and numerical operations
- **PIL (Pillow)** - Image processing operations

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS
- **Python:** 3.9, 3.11
- **Memory:** 8GB RAM recommended (16GB for larger models)
- **Storage:** 10GB free space for datasets and models
- **GPU:** Optional but recommended for faster inference (CUDA-capable GPU)
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _depth_estimation-datasets:

Depth Estimation Datasets
-------------------------

**DIODE (Dense Indoor and Outdoor DEpth) Dataset**

The DIODE dataset is the first public dataset to include RGBD images of both indoor and outdoor scenes captured with a single sensor suite. Key features include:

- High-resolution color images (1024 × 768) with accurate depth measurements
- Both indoor and outdoor scenes for diverse training scenarios
- Depth validity masks indicating reliable sensor measurements
- NumPy-based storage format for precise depth values
- Far-range depth measurements up to 300 meters

Created by researchers from TTI-Chicago, University of Chicago, and Beihang University, DIODE provides ground truth depth data suitable for training and evaluating monocular depth estimation models.

**NYU Depth Dataset V2**

A benchmark dataset for indoor depth estimation containing RGB-D images captured in various indoor environments. Features include:

- 1449 densely labeled RGB-D images
- Diverse indoor scenes (bedrooms, living rooms, offices, bathrooms, etc.)
- Image-based depth map storage (PNG format)
- Sequential frame data for temporal analysis
- Rich metadata for scene organization

**CLEVR with Depth Dataset**

A synthetic dataset from Hugging Face Hub containing:

- Rendered 3D scenes with precise depth information
- Clean depth maps without sensor noise
- Text prompts describing each scene
- Ideal for testing depth estimation algorithms in controlled settings

.. _depth_estimation-formats:

Depth Map Formats
-----------------

Different datasets store depth information in various formats:

- **NumPy arrays**: Direct numerical storage (`.npy` files) with metric depth values
- **16-bit PNG**: High-precision image-based storage for depth maps
- **8-bit normalized**: Scaled depth for visualization purposes
- **Metric vs. Inverse**: Absolute distance or inverse depth encoding

FiftyOne uses the `Heatmap <https://docs.voxel51.com/user_guide/using_datasets.html#heatmaps>`_ class to represent depth data, supporting both array-based and file-based storage with flexible visualization options.

.. _depth_estimation-models:

Depth Estimation Models
-----------------------

This guide covers multiple approaches to running depth estimation models:

**FiftyOne Model Zoo**

Pre-integrated Hugging Face transformers models accessible via FiftyOne's Model Zoo:

- Depth-Anything V2 (small, base, large variants)
- Intel DPT (Dense Prediction Transformer) models
- ZoeDepth for metric depth estimation
- GLPN (Global-Local Path Networks)

**Hugging Face Transformers**

Manual integration for models not in the Model Zoo, including:

- DPT-BEiT models for high-quality depth
- MiDaS variants for general-purpose depth
- Custom fine-tuned models

**Community Plugins**

FiftyOne plugins extending depth estimation capabilities:

- `DepthPro plugin <https://docs.voxel51.com/plugins/plugins_ecosystem/depth_pro_plugin.html>`_ for state-of-the-art depth estimation
- Delegated execution for processing large datasets

**Diffusers Library**

Zero-shot depth prediction using:

- Marigold Depth models
- Stable Diffusion-based depth estimation
- 16-bit precision depth map export

.. _depth_estimation-workflow:

Depth Estimation Workflow
-------------------------

This tutorial demonstrates a complete depth estimation workflow that combines:

1. **Data Loading** - Loading different depth map formats (NumPy arrays, PNG images) with proper metadata handling

2. **Depth Visualization** - Creating color-coded visualizations with appropriate range scaling

3. **Model Integration** - Running multiple depth estimation models from FiftyOne Model Zoo, Hugging Face, plugins, and Diffusers

4. **Dataset Organization** - Structuring depth datasets with metadata and preparing data for analysis

This integrated approach gives you the tools to not just load depth data, but to run state-of-the-art models, compare predictions, and build production-ready depth estimation pipelines.

.. _depth_estimation-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Loading Depth Data in FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading Depth Data <01_loading_depth_data.ipynb>
   Using Depth Estimation Models <02_depth_estimation.ipynb>
   Guide Summary <summary>
