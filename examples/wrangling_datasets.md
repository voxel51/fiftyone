# Wrangling Datasets

This example provides a brief overivew of loading datasets in common formats
into FiftyOne, manipulating them, and then exporting them (or subsets of them)
to disk (in possbily different formats).

For more details, check out the resources below:

-   [Loading data into FiftyOne](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/index.html)
-   [Dataset basics](https://voxel51.com/docs/fiftyone/user_guide/basics.html)
-   [Using dataset views](https://voxel51.com/docs/fiftyone/user_guide/using_views.html)
-   [Exporting FiftyOne datasets](https://voxel51.com/docs/fiftyone/user_guide/export_datasets.html)

## Setup

Let's prepare some datasets to work with. Don't worry about the details for
now.

```py
import fiftyone as fo
import fiftyone.zoo as foz

# ImageClassificationDirectoryTree
dataset = foz.load_zoo_dataset("cifar10", split="test")
dataset.take(250).export(
    "/tmp/fiftyone-examples/image-classification-directory-tree",
    fo.types.ImageClassificationDirectoryTree,
)

# CVATImageDataset
dataset = foz.load_zoo_dataset("coco-2017", split="validation")
dataset.take(250).export(
    "/tmp/fiftyone-examples/cvat-image-dataset",
    fo.types.CVATImageDataset,
)
```

## Loading data into FiftyOne

FiftyOne provides support for loading
[many common dataset formats](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/datasets.html#supported-formats)
out-of-the-box.

#### Example: Image classification directory tree

You can load a classification dataset stored as a directory tree whose
subfolders define the classes of the images.

The relevant dataset type is
[ImageClassificationDirectoryTree](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/datasets.html#imageclassificationdirectorytree).

```py
import fiftyone as fo

DATASET_DIR = "/tmp/fiftyone-examples/image-classification-directory-tree"

classification_dataset = fo.Dataset.from_dir(
    DATASET_DIR, fo.types.ImageClassificationDirectoryTree
)

print(classification_dataset)
```

#### Example: CVAT image dataset

You can load a set of object detections stored in
[CVAT format](https://github.com/openvinotoolkit/cvat).

The relevant dataset type is
[CVATImageDataset](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/datasets.html#cvatimagedataset).

```py
import fiftyone as fo

DATASET_DIR = "/tmp/fiftyone-examples/cvat-image-dataset"

detection_dataset = fo.Dataset.from_dir(
    DATASET_DIR, fo.types.CVATImageDataset
)

print(detection_dataset)
```

## Adding samples to datasets

Adding new samples to datsets is easy.

You can
[create new samples](https://voxel51.com/docs/fiftyone/user_guide/basics.html#samples):

```py
import fiftyone as fo

sample = fo.Sample(filepath="/path/to/image.jpg")

print(sample)
```

...
[add fields dynamically](https://voxel51.com/docs/fiftyone/user_guide/basics.html#fields)
to them:

```py
sample["quality"] = 89.7
sample["keypoints"] = [[31, 27], [63, 72]]
sample["geo_json"] = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [125.6, 10.1]},
    "properties": {"name": "camera"},
}

print(sample)
```

...
[add labels](https://voxel51.com/docs/fiftyone/user_guide/basics.html#labels)
that can be rendered on the media in the App:

```py
sample["weather"] = fo.Classification(label="sunny", confidence=0.95)
sample["animals"] = fo.Detections(
    detections=[
        fo.Detection(
            label="cat", bounding_box=[0.5, 0.5, 0.4, 0.3], confidence=0.75
        ),
        fo.Detection(
            label="dog", bounding_box=[0.2, 0.2, 0.2, 0.4], confidence=0.51
        )
    ]
)

print(sample)
```

...and add them to datasets:

```py
dataset = fo.Dataset()
print(dataset)

dataset.add_sample(sample)
print(dataset)
print(dataset.first())
```

## Working with datasets

You can access samples in datasts by iterating over them:

```py
dataset = classification_dataset.clone()
dataset.compute_metadata()

for sample in dataset:
    # Do something with the sample here

    sample.tags.append("processed")
    sample.save()

print(dataset.first())
```

...or access them directly by ID:

```py
sample = dataset.first()

same_sample = dataset[sample.id]

same_sample is sample  # True: samples are singletons!
```

You can also
[create views](https://voxel51.com/docs/fiftyone/user_guide/using_views.html)
into your datasets that slice and dice your data in interesting ways:

```py
# Sort by filepath
view1 = dataset.sort_by("filepath")
print(view1)
print(view1.first())

# Random sample from a dataset
view2 = dataset.take(100)
print(view2)
print(view2.first())

# Extract slice of a dataset
view3 = dataset[10:30]
print(view3)
print(view3.first())
```

View operations can be chained together:

```py
from fiftyone import ViewField as F

complex_view = (
    dataset
    .match_tag("processed")
    .exists("metadata")
    .match(F("metadata.size_bytes") >= 1024)  # >= 1 kB
    .sort_by("filepath")
    .limit(5)
)

print(complex_view)
print(complex_view.first())
```

See the other examples in this folder for more sophisticated view operations!

## Exporting datasets

You can easily
[export samples](https://voxel51.com/docs/fiftyone/user_guide/export_datasets.html)
in whatever format suits your fancy:

#### Example: exporting a classification dataset

```py
# Create a view
view = classification_dataset.take(100)

# Export as a classification directory tree using the labels in the
# `ground_truth` field as classes
view.export(
    "/tmp/fiftyone-examples/export-classification-directory-tree",
    fo.types.ImageClassificationDirectoryTree,
    label_field="ground_truth"
)
```

#### Example: exporting a detection dataset

```py
# Create a view
view = detection_dataset.take(100)

# Export in COCO format with detections from the `ground_truth` field of
# the samples
view.export(
    "/tmp/fiftyone-examples/export-coco",
    fo.types.COCODetectionDataset,
    label_field="ground_truth"
)
```

#### Example: exporting entire samples

```py
# Create a view
view = detection_dataset.take(100)

# Export entire samples
view.export(
    "/tmp/fiftyone-examples/export-fiftyone-dataset",
    fo.types.FiftyOneDataset
)
```
