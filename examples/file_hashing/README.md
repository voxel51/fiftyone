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

As we will soon come to discover, some of these samples are duplicates and we
have no clue which they are!

## Walkthrough

Open an ipython session in your terminal by typing: `ipython`

### 0. Imports

```python
import os

import fiftyone as fo
from fiftyone.utils.data import parse_image_classification_dir_tree
import fiftyone.core.features as fof
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
# Print summary information about the dataset
print(dataset.summary())

# Print a random sample
print(dataset.take(1))
```

Create a view that filters only `mountain`

```python
view = dataset.view().match({"ground_truth.label": "mountain"})

# Print summary information about the view
print(view.summary())

# Print the first sample in the view
print(view.first())
```

Create a view that sorts labels reverse-alphabetically

```python
view = dataset.view().sort_by("ground_truth.label", reverse=True)

print(view.summary())
print(view.first())
```

### 3. Visualize the dataset

Start browsing the dataset:

```python
session = fo.launch_dashboard(dataset=dataset)
```

Narrow your scope to 10 random samples:

```python
session.view = dataset.view().take(10)
```

Select some samples in the GUI and access their IDs from code!

```python
# Get the IDs of the currently selected samples in the dashboard
sample_ids = session.selected
```

Create a view that contains your currently selected samples:

```python
selected_view = dataset.view().select(session.selected)
```

Update the dashboard to only show your selected samples:

```python
session.view = selected_view
```

### 4. Compute file hashes

Iterate over the samples and compute file hash:

```python
for sample in dataset:
    sample["file_hash"] = fof.compute_filehash(sample.filepath)
    sample.save()

print(dataset.summary())
```

We have two ways to visualize this new information:

1. From your terminal:

```python
sample = dataset.view().first()
print(sample)
```

2. By refreshing the dashboard:

```python
session.dataset = dataset
```

### 5. Check for duplicates

Now let's use a more powerful query to search for duplicate files, i.e., those
with the same file hashses:

```python
pipeline = [
    # Find all unique file hashes
    {"$group": {"_id": "$file_hash", "count": {"$sum": 1}}},
    # Filter out file hashes with a count of 1
    {"$match": {"count": {"$gt": 1}}},
]

dup_filehashes = [d["_id"] for d in dataset.aggregate(pipeline)]

print("Number of duplicate file hashes: %d" % len(dup_filehashes))
```

Now let's create a view that contains only the samples with these duplicate
file hashes:

```python
dup_view = (
    dataset.view()
    # Extract samples with duplicate file hashes
    .match({"file_hash": {"$in": dup_filehashes}})
    # Sort by file hash so duplicates will be adjacent
    .sort_by("file_hash")
)

print("Number of images that have a duplicate: %d" % len(dup_view))

print("Number of duplicates: %d" % (len(dup_view) - len(dup_filehashes)))
```

Of course, we can always use the dashboard to visualize our work!

```python
session.view = dup_view
```

### 6. Delete duplicates

Now let's delete the duplicate samples from the dataset using our `dup_view` to
restrict our attention to known duplicates:

```python
print("Length of dataset before: %d" % len(dataset))

_dup_filehashes = set()
for sample in dup_view:
    if sample.file_hash not in _dup_filehashes:
        _dup_filehashes.add(sample.file_hash)
        continue

    del dataset[sample.id]

print("Length of dataset after: %d" % len(dataset))

# Verify that the dataset no longer contains any duplicates
print("Number of unique file hashes: %d" % len({s.file_hash for s in dataset}))
```

### 7. Export

Finally, let's export a fresh copy of our now-duplicate-free dataset:

```python
dataset.export(label_field="ground_truth", export_dir="/tmp/fiftyone/export")
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
