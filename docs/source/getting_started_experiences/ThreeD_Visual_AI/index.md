## Who this is for
This guide is for developers and computer vision engineers looking to work with 3D datasets in FiftyOne. Whether you’re dealing with LiDAR point clouds, voxel grids, or 3D bounding boxes, this series introduces the tools and workflows you’ll need to visualize and curate your 3D data effectively.

By the end of this tutorial, you’ll be able to load, inspect, and interact with 3D datasets — including both raw point clouds and annotated scenes.

## Assumed Knowledge
You should be comfortable with the FiftyOne dataset structure and basic computer vision concepts. Prior experience with point cloud data or 3D annotations is helpful, but not required.

## Time to complete
20–30 minutes

## Required packages
To work with 3D datasets, you’ll need FiftyOne and Open3D installed. Install them with:

```
pip install fiftyone open3d
```

## Content
### [Step 1: Getting Started with 3D Datasets](./step1.ipynb)
Learn how to load and visualize raw 3D data, including point clouds, inside FiftyOne. You'll explore basic navigation in the 3D viewer and how to organize your dataset for spatial tasks.

### [Step 2: Getting Started with Loading 3D Annotations](./step2.ipynb)
Take your 3D workflows further by adding annotations like bounding boxes and labels to your point clouds. You’ll learn how to bring in annotations and overlay them seamlessly for inspection and validation