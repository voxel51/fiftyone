# Getting Started with Segmentation in FiftyOne

## Who this is for

This page is for those new to FiftyOne looking to get started with segmentation
workflows! We will cover how to load, visualize, enrich, and evaluate
segmentation datasets with FiftyOne.

This tutorial is ideal for computer vision engineers and AI researchers working
with instance and semantic segmentation tasks. Some basic knowledge of Python
and computer vision is assumed.

## Assumed Knowledge

We assume familiarity with common segmentation tasks (semantic and instance),
dataset formats (e.g., COCO), and how masks or polygons are used in visual
tasks.

## Time to complete

20–30 minutes

## Required packages

To follow along, you’ll need the following packages:

```bash
pip install fiftyone opencv-python-headless pillow matplotlib
pip install torch torchvision
```

## Content

### [Step 1: Loading Segmentation Datasets](./step1.ipynb)

Learn how to load semantic and instance segmentation datasets from FiftyOne’s
zoo and from custom formats like COCO or segmentation masks.

### [Step 2: Adding Instance Segmentations](./step2.ipynb)

Enrich your dataset by adding segmentation predictions using both built-in
models (e.g., SAM2) and your own custom models, with polygon and bounding box
support.

### [Step 3: Segment Anything 2 (SAM2) in FiftyOne](./step3.ipynb)

Explore SAM 2’s groundbreaking capabilities for image and video segmentation.
Use bounding boxes, keypoints, or zero prompts, and run video mask propagation
from a single frame.
