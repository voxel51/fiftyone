# Image Deduplication with FiftyOne

This example demonstrates a simple use case of using FiftyOne to detect and
remove duplicate images from your dataset.

## Download the data

First we download the dataset to disk. The dataset is a 1000 sample subset of
CIFAR100, a dataset of 32x32 pixel images with one of 100 different
classification labels such as `apple`, `bicycle`, `porcupine`, etc.

```bash
python download_dataset.py
```

The dataset is organized on disk as follows:

```
/tmp/fiftyone/
└── cifar100_with_duplicates/
    ├── <classA>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    ├── <classB>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    └── ...
```

As we will soon come to discover, some of these samples are duplicates and
we have no clue which they are!

## Walkthrough

Open an ipython session in your terminal by typing: `ipython`

### 0. Imports

```python
import os

import fiftyone as fo
from fiftyone.utils.data import parse_image_classification_dir_tree
import fiftyone.core.features as fof
import fiftyone.core.insights as foi
```

### 1. Create a `fiftyone.Dataset`

```python
dataset_name = "cifar100_with_duplicates"

src_data_dir = os.path.join("/tmp/fiftyone", dataset_name)

samples, _ = parse_image_classification_dir_tree(src_data_dir)
dataset = fo.Dataset.from_image_classification_samples(
    samples, name=dataset_name
)
```

### 2. Explore the dataset

We can poke around in the dataset:

```python
print(dataset.summary())
```

Grab a sample:

```python
sample = next(dataset.iter_samples())
print(sample)
```

Create a view that filters only `mountain`

```python
view = dataset.default_view().filter(
    filter={"labels.ground_truth.label": "mountain"}
)
print(view.summary())

sample = next(view.iter_samples())
print(sample)
```

Create a view that sorts labels reverse-alphabetically

```python
view = dataset.default_view().sort_by(
    "labels.ground_truth.label", reverse=True
)
print(view.summary())

sample = next(view.iter_samples())
print(sample)
```

### 3. Visualize the dataset

Start browsing the dataset:

```python
session = fo.launch_dashboard(dataset=dataset)
```

Narrow your scope to 10 random samples

```python
session.view = dataset.default_view().sample(10)
```

Select some samples in the GUI and see how this field updates instantly!

```python
session.selected
```

Create a view on the samples you selected:

```python
session.view = dataset.default_view().select(session.selected)
```

### 4. Compute File Hashes

Iterate over the samples and compute file hash:

```python
for sample in dataset:
    # compute the insight
    file_hash = fof.compute_filehash(sample.filepath)

    # add the insight to the sample
    sample.add_insight(
        "file_hash", foi.FileHashInsight.create(file_hash=file_hash)
    )

print(dataset.summary())
```

We have two ways to look at a sample:

1. In the `ipython` terminal:

```python
sample = next(dataset.iter_samples())
print(sample)
```

2. By refreshing the GUI:

```python
session.dataset = dataset
```

### 5. Check for duplicates

We are using a more powerful query here to search for all file hashes with
more than sample:

```python
pipeline = [
    # find all unique file hashes
    {"$group": {"_id": "$insights.file_hash.file_hash", "count": {"$sum": 1}}},
    # filter out file hashes with a count of 1
    {"$match": {"count": {"$gt": 1}}},
]

dup_filehashes = [d["_id"] for d in dataset.aggregate(pipeline)]
```

We can look at the list of file hashes, and we can create a view on the dataset
that contrains to only samples with these file hashes:

```python
print("Number of unique images that are duplicated: %d" % len(dup_filehashes))

view = dataset.default_view().filter(
    filter={"insights.file_hash.file_hash": {"$in": dup_filehashes}}
)

print("Number of images that have a duplicate: %d" % len(view))

print("Number of duplicates: %d" % (len(view) - len(dup_filehashes)))
```

And we can always visualize views!

```python
session.view = view.sort_by("insights.file_hash.file_hash")
```

### 6. Delete duplicates

This snippet iterates over the duplicate file hashes and deletes `count - 1`
samples with each file hash.

```python
print("Length of dataset before: %d" % len(dataset))

for d in dataset.aggregate(pipeline):
    file_hash = d["_id"]
    count = d["count"]

    view = (
        dataset.default_view()
        .filter(filter={"insights.file_hash.file_hash": file_hash})
        .limit(count - 1)
    )

    for sample in view:
        del dataset[sample.id]

print("Length of dataset after: %d" % len(dataset))
```

Alternatively, it also would be possible to create a view with all of the
duplicates "to be deleted" and then iterate over our own non-`fiftyone` code
to delete these files from the original dataset.

### 7. Export

In this lightweight workflow none of the work down with `fiftyone` persists.
As mentioned above we could have used fiftyone to tell us which samples we
needed to delete.

But we have a very small dataset here, so we could just export a copy:

```python
dataset.export(group="ground_truth", export_dir="/tmp/fiftyone/export")
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
