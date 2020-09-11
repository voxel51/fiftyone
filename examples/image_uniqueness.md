# Exploring Image Uniqueness

This example provides a brief overivew of using FiftyOne's
[image uniqueness method](https://voxel51.com/docs/fiftyone/user_guide/brain.html#image-uniqueness)
to analyze and extract insights from unlabeled datasets.

For more details, check out the in-depth
[image uniqueness tutorial](https://voxel51.com/docs/fiftyone/tutorials/uniqueness.html).

## Load dataset

We'll work with the test split of the
[CIFAR-10 dataset](https://www.cs.toronto.edu/~kriz/cifar.html), which is
conveniently available in the
[FiftyOne Dataset Zoo](https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/zoo.html):

```py
import fiftyone as fo
import fiftyone.zoo as foz

# Load the CIFAR-10 test split
# This will download the dataset from the web, if necessary
dataset = foz.load_zoo_dataset("cifar10", split="test")
dataset.name = "image-uniqueness-example"

print(dataset)
```

## Index by visual uniqueness

Next we'll index the dataset by visual uniqueness using a
[builtin method](https://voxel51.com/docs/fiftyone/user_guide/brain.html#image-uniqueness)
from the FiftyOne Brain:

```py
import fiftyone.brain as fob

fob.compute_uniqueness(dataset)

print(dataset)

print(dataset.first())
```

## Visualize near-duplicate samples in the App

Let's open the dataset in the App:

```py
session = fo.launch_app(dataset)
```

From the App, we can show the most visually similar images in the dataset by
creating a `SortBy("uniqueness", reverse=False)` stage in the
[view bar](https://voxel51.com/docs/fiftyone/user_guide/app.html#using-the-view-bar).

Alternatively, this same operation can be performed programmatically via
Python:

```py
# Show least unique images first
least_unique_view = dataset.sort_by("uniqueness", reverse=False)

# Open view in App
session.view = least_unique_view
```

## Omit near-duplicate samples from the dataset

Next, we'll show how to omit visually similar samples from a dataset.

First, use the App to select visually similar samples.

Assuming the visually similar samples are currently selected in the App, we can
easily add a `duplicate` tag to these samples via Python:

```py
# Get currently selected images from App
dup_ids = session.selected

# Get view containing selected samples
dups_view = dataset.select(dup_ids)

# Mark as duplicates
for sample in dups_view:
    sample.tags.append("duplicate")
    sample.save()
```

## Export de-duplicated dataset

Now let's
[create a view](https://voxel51.com/docs/fiftyone/user_guide/using_views.html#filtering)
that omits samples with the `duplicate` tag, and then export them to disk:

```py
from fiftyone import ViewField as F

# Get samples that do not have the `duplicate` tag
no_dups_view = dataset.match(~F("tags").contains("duplicate"))

# Export dataset to disk as a classification directory tree
no_dups_view.export(
    "/tmp/fiftyone-examples/cifar10-no-dups",
    fo.types.ImageClassificationDirectoryTree
)
```

List contents of the exported dataset on disk to verify the export:

```shell
ls -lah /tmp/fiftyone-examples/cifar10-no-dups

ls -lah /tmp/fiftyone-examples/cifar10-no-dups/airplane | head
```
