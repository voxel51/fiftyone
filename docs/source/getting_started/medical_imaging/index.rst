.. _medical_imaging_guide:

Medical Imaging Guide
=====================

.. default-role:: code

**Complete Medical Imaging Workflow with DICOM, CT Scans, and Volumetric Data**

**Level:** Beginner | **Estimated Time:** 15-25 minutes | **Tags:** Medical Imaging, DICOM, CT Scans, NIfTI, Volumetric Data, Segmentation

This step-by-step guide will walk you through a complete medical imaging workflow using FiftyOne. You'll learn how to:

- Load and visualize DICOM files and CT scan data
- Work with volumetric medical imaging data
- Handle different medical image formats (DICOM, NIfTI)
- Create segmentation masks and annotations
- Use dynamic grouping for multi-slice visualization
- Organize medical datasets for analysis and curation

.. _medical_imaging-overview:

Guide Overview
--------------

This guide consists of a single comprehensive tutorial:

**Getting Started with Medical Imaging** - Learn how to load medical imaging datasets in FiftyOne, specifically working with DICOM and CT scan formats, downloading sample datasets, and preparing them for use in FiftyOne

.. _medical_imaging-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This page is for those new to FiftyOne who are looking to get started with medical imaging datasets, especially DICOM and CT scans. Perfect for any level of medical imaging or computer vision engineer, by the end of this tutorial you'll be able to load DICOM files, understand how FiftyOne visualizes volumetric data, and begin curating and inspecting medical datasets in a streamlined interface.

**Required Knowledge**

We will start with the assumption that you are familiar with the basic FiftyOne dataset structure and early computer vision concepts. This guide is ideal for those who are new to medical imaging or looking to expand into DICOM workflows using Python.

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **pydicom** - DICOM file reading and manipulation
- **rt_utils** - RT Structure Set handling for medical annotations
- **kagglehub** - Dataset downloading from Kaggle
- **nibabel** - NIfTI file format support
- **numpy & opencv-python** - Image processing and numerical operations

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS
- **Python:** 3.9, 3.11
- **Memory:** 8GB RAM recommended for medical imaging operations
- **Storage:** 5GB free space for medical datasets
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _medical_imaging-datasets:

Medical Imaging Datasets
-----------------------

**Hippocampal MRI Dataset**

A demo dataset from Kaggle containing 25 brain scans of patients with annotations of their left and right hippocampus stored in `.dcm` files. This dataset includes:
- DICOM MRI scans with RT Structure Set annotations
- Segmentation masks for left and right hippocampus
- Multi-slice volumetric data for 3D visualization

**COVID-19 CT Scans Dataset**

A comprehensive CT scan dataset for COVID-19 analysis containing:
- NIfTI format CT scans
- Lung segmentation masks
- Infection segmentation masks
- Combined lung and infection masks

.. _medical_imaging-formats:

Medical Image Formats
--------------------

**DICOM (Digital Imaging and Communications in Medicine)**

- **Standard Format** - Industry standard for medical imaging
- **Multi-Slice Support** - Handles volumetric data with multiple slices
- **Metadata Rich** - Contains patient information, scan parameters, and annotations
- **RT Structure Sets** - Standard format for segmentation annotations

**NIfTI (Neuroimaging Informatics Technology Initiative)**

- **Research Standard** - Widely used in medical imaging research
- **Volumetric Data** - Efficient storage of 3D medical images
- **Cross-Platform** - Compatible across different medical imaging software
- **Compression Support** - Efficient storage and transfer

.. _medical_imaging-workflow:

Medical Imaging Workflow
-----------------------

This tutorial demonstrates a complete medical imaging workflow that combines:

1. **Data Loading** - Loading different medical image formats (DICOM, NIfTI) with proper metadata handling

2. **Volumetric Visualization** - Working with multi-slice data and creating dynamic video representations

3. **Annotation Integration** - Loading segmentation masks and RT Structure Sets for comprehensive analysis

4. **Dataset Organization** - Creating structured medical datasets for analysis, curation, and model training

This integrated approach gives you the tools to not just load medical images, but to understand complex volumetric relationships, manage medical annotations, and prepare datasets for AI-assisted diagnosis and research.

.. _medical_imaging-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Getting Started with Medical Imaging in FiftyOne.

.. toctree::
   :maxdepth: 1
   :hidden:

   Getting Started with Medical Imaging <01_getting_started.ipynb>
   Guide Summary <summary> 