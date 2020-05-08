# End-to-End Example with Image De-duplication

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
session.view = dataset.default_view().take(10, random=True)
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
for idx, sample in enumerate(dataset):
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

```python
pipeline = [
    {"$group": {"_id": "$insights.file_hash.file_hash", "count": {"$sum": 1}}},
    {"$match": {"count": {"$gt": 1}}},
]

dup_filehashes = [d["_id"] for d in dataset.aggregate(pipeline)]

print("Number of unique images that are duplicated: %d" % len(dup_filehashes))

view = dataset.default_view().filter(
    filter={"insights.file_hash.file_hash": {"$in": dup_filehashes}}
)

print("Number of images that have a duplicate: %d" % len(view))
```
