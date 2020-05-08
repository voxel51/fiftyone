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
view = dataset.default_view().filter({"labels.ground_truth.label": "mountain"})
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

```python
session = fo.launch_dashboard()
```
