.. _model_dataset_zoo_guide:

Model Dataset Zoo Guide
=======================

.. default-role:: code

**Complete Zoo Workflow with Datasets and Models**

**Level:** Beginner | **Estimated Time:** 65-95 minutes | **Tags:** Zoo, Datasets, Models, Pre-trained Models, Computer Vision, Machine Learning

This step-by-step guide will walk you through a complete FiftyOne Zoo workflow. You'll learn how to:

- Explore and load datasets from the FiftyOne Dataset Zoo
- Apply pre-trained models from the Model Zoo to your datasets
- Integrate custom or community models hosted on GitHub or public URLs
- Work with remotely-sourced datasets and models
- Streamline your computer vision workflows with unified zoo interfaces

.. _model_dataset_zoo-overview:

Guide Overview
--------------

This guide is broken down into the following sequential steps:

1. **Exploring the FiftyOne Dataset Zoo** - Get hands-on with the FiftyOne Dataset Zoo, learning how to list, load, and explore built-in datasets as well as work with remotely-sourced datasets hosted on external URLs or GitHub repositories
2. **Using the FiftyOne Model Zoo** - Apply pre-trained models to datasets using the built-in Zoo, seeing how to use classification and detection models, visualize results, and iterate faster
3. **Using Remotely-Sourced Zoo Models** - Learn how to integrate custom or community models hosted on GitHub or public URLs, showing how to load and run these models just like native zoo models

.. _model_dataset_zoo-prerequisites:

Prerequisites
-------------

**Who Is This Guide For**

This experience is designed for data scientists looking to explore CV datasets quickly, ML engineers wanting to prototype with pre-trained models, and computer vision practitioners seeking to integrate custom models. Whether you're exploring public data, testing models, or wrapping your own contributions, the Zoo helps you streamline your computer vision workflows.

**Required Knowledge**

To get the most out of this series, you should have basic knowledge of Python and Jupyter Notebooks, familiarity with CV tasks (classification, detection, segmentation), and some exposure to FiftyOne (optional but helpful).

**Packages Used**

The notebooks will automatically install the required packages when you run them. The main packages we'll be using include:

- **fiftyone** - Core FiftyOne library for dataset management and visualization
- **torch** - PyTorch for deep learning models
- **torchvision** - Computer vision models and datasets for PyTorch

Each notebook contains the necessary `pip install` commands at the beginning, so you can run them independently without any prior setup.

**System Requirements**

- **Operating System:** Linux (Ubuntu 24.04), macOS 
- **Python:** 3.10, 3.11
- **Memory:** 8GB RAM recommended for zoo operations
- **Storage:** 5GB free space for datasets and models
- **GPU:** Optional but recommended for model inference
- **Notebook Environment:** Jupyter, Google Colab, VS Code notebooks (all validated)

.. _model_dataset_zoo-datasets:

Dataset Zoo Features
--------------------

**Built-in Datasets**

The FiftyOne Dataset Zoo provides access to a vast collection of pre-built datasets including:
- **Classification:** CIFAR-10, CIFAR-100, ImageNet, Caltech-101, Caltech-256
- **Detection:** COCO, VOC, Open Images, KITTI, BDD100K
- **Video:** ActivityNet, Kinetics, UCF101, HMDB51
- **3D:** Quickstart-3D, KITTI Multiview
- **Specialized:** Fashion-MNIST, Places, LFW, FIW

**Remotely-Sourced Datasets**

Support for datasets hosted on external platforms:
- GitHub repositories
- Cloud storage URLs
- Custom dataset definitions
- Collaborative dataset sharing

.. _model_dataset_zoo-models:

Model Zoo Features
------------------

**Pre-trained Models**

The FiftyOne Model Zoo provides ready-to-use models for various tasks:
- **Classification Models** - Image classification with state-of-the-art architectures
- **Detection Models** - Object detection and localization
- **Segmentation Models** - Instance and semantic segmentation
- **Video Models** - Action recognition and video understanding

**Custom Model Integration**

Seamless integration with external models:
- GitHub-hosted models
- Custom model wrappers
- Community contributions
- Team-specific models

.. _model_dataset_zoo-workflow:

Zoo Workflow
------------

This tutorial demonstrates a complete zoo workflow that combines:

1. **Dataset Discovery** - Exploring available datasets and understanding their structure and content

2. **Model Application** - Applying pre-trained models to generate predictions and insights

3. **Custom Integration** - Extending the zoo with your own models and datasets for specialized use cases

4. **Workflow Optimization** - Streamlining computer vision pipelines with unified zoo interfaces

This integrated approach gives you the tools to not just use existing resources, but to extend and customize the zoo for your specific needs, whether you're prototyping, researching, or building production systems.

.. _model_dataset_zoo-start:

Ready to Begin?
---------------

Click **Next** to start with the first step: Exploring the FiftyOne Dataset Zoo.

.. toctree::
   :maxdepth: 1
   :hidden:

   Exploring the Dataset Zoo <01_intro>
   Using the Model Zoo <02_explore>
   Using Remotely-Sourced Zoo Models <03_remote_models>
   Guide Summary <summary> 