## Who this is for
This page is for computer vision practitioners who want to go beyond model predictions and dive into evaluation and analysis workflows. If you’ve already built a detection or classification model and want to better understand how well it’s performing — this is for you.

Whether you're exploring model confidence, false positives, or failure modes, this guide helps you build intuition and gain deeper insights into your models using FiftyOne.

## Assumed Knowledge
We assume that you’re already familiar with the [FiftyOne dataset structure](https://docs.voxel51.com/user_guide/basics.html) and have a basic understanding of how to add predictions to a dataset. If not, check out the (Getting Started with Detections)[../Detection/index.md] guide first.

## Time to complete
15-30 minutes

## Required packages
You'll need FiftyOne installed, along with PyTorch if you're generating predictions locally. Install them with:
```
pip install fiftyone torch torchvision
```

## Content

### [Step 1: Basic Evaluation](./step1.ipynb)
Learn how to evaluate your model predictions against ground truth using FiftyOne’s evaluation APIs. You’ll compute precision, recall, and other metrics, and see how to highlight mistakes in your dataset.

### [Step 2: Analyzing with Model Evaluation Panel](./step2.ipynb)
Take your evaluation further with FiftyOne’s built-in Model Evaluation Panel. Learn how to visualize model confidence, sort by false positives or negatives, and filter samples by performance to understand your model's strengths and weaknesses.