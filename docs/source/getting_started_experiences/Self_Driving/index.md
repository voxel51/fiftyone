## Who this is for
This guide is designed for computer vision engineers working with self-driving car datasets. Whether you're dealing with large-scale video data, sensor fusion, or frame-level labels — this series shows how FiftyOne can streamline your workflow.

By the end of the tutorial, you’ll know how to load, organize, and explore complex multi-frame self-driving datasets and apply advanced FiftyOne tools to analyze key moments and edge cases.

## Assumed Knowledge
You should be familiar with the [FiftyOne dataset structure](https://docs.voxel51.com/user_guide/basics.html), and have a basic understanding of working with [grouped datasets](https://docs.voxel51.com/user_guide/groups.html). If not, we recommend starting with the Getting Started with Grouped Datasets guide first.

## Time to complete
25-40 minutes

## Required packages
FiftyOne and other packages are required. You can install with
```
pip install  fiftyone open3d gdown

pip install matplotlib --upgrade
```

In some environments, nuscenes-devkit will cause issues. It is recommmened starting with a clean enviroment .

## Content
### [Step 1: Loading a Self Driving Car Dataset into FiftyOne](./step1.ipynb)
Learn how to load a self-driving dataset into FiftyOne. This includes working with video sequences, sensor metadata, and associating labels with frames.

### [Step 2: Advanced Self Driving Dataset Techniques](./step2.ipynb)
Dive into advanced tools and techniques for managing and analyzing self-driving datasets. This includes filtering by events, syncing labels across sequences, and curating key frames for annotation or evaluation.