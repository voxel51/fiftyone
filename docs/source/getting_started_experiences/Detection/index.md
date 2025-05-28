## Who this is for
This page is for those new to FiftyOne looking to get started with detection models! We will cover how to load, visualize, curate, and evaluate our detections. 

Perfect for any level of computer vision engineer, by the end of the tutorial, you will be able to quickly find detection label mistakes, evaluate a detection model, and easily import and export detections into FiftyOne.

## Assumed Knowledge
We will start with the assumption that you are familiar with the basic[ FiftyOne dataset structure](https://docs.voxel51.com/user_guide/basics.html) and early computer vision concepts. This tutorial is recommended for beginners new to computer vision or FiftyOne.

## Time to complete
20-30 minutes

## Required packages
FiftyOne and Pytorch as well as some others are required. You can install  with
```
pip install fiftyone torch torchvision ultralytics
```

## Content

### [Step 1: Loading Detection Datasets](./step1.ipynb)

Explore how to load detection datasets into FiftyOne using both built-in
datasets from the zoo and custom datasets.


### [Step 2: Adding Object Detections](./step2.ipynb)

Learn how to add object detections predictions to your datasets using both
pre-trained from model zoo and your own models.

### [Step 3: Find Detection Mistakes in FiftyOn](./step3.ipynb)

Dive into the advanced capabilities of FiftyOne by using the [FiftyOne Brain](https://docs.voxel51.com/brain.html) to find detection mistakes. Erroneous boxes, class mistakes, or overlapping boxes can all be found using FiftyOne!

### [Step 4: Evaluating Detections](./step4.ipynb)
Learn how to use FiftyOne to perform hands-on evaluation of your detection model. This includes evaluating your model using FiftyOne’s evaluation API and viewing the best and worst performing samples in your dataset