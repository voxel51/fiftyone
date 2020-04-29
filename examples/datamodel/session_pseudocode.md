# Session Pseudocode

WIP pseudocode for object that manages the active dataset and socket
connection.

## Usage:

```python
import fiftyone.core.dataset as voxd
import fiftyone.core.session as voxs
import fiftyone.core.query as voxq

session = voxs.Session()    # GUI displays dataset browser landing page
session.dataset = voxd.Dataset("cifar100") # GUI displays CIFAR100 dataset
session.query = (
    voxq.DatasetQuery()
        .filter({"metadata.size_bytes": {"$gt": 1000}})
        .sort("metadata.size_bytes")
)   # GUI displays filtered/sorted CIFAR100 dataset
session.clear_query()   # GUI displays CIFAR100 datase
session.clear_dataset() # displays dataset browser
```

## "Thing being serialized" on every modification to `session` object

```python
# we paginate the query
samples = {
    query_idx: sample.serialize
    for query_idx, sample in (
        query
            .offset(offset)
            .limit(limit)
            .iter_samples(dataset)
        )
}

session.serilized_stuff = {
    "dataset": {
        "name": dataset.name,
        ...
    },
    "query": [str(stage) for stage in query],
    "page": {
        "offset": offset,
        "limit": limit,
        "count": query.count(dataset) # this gives the un-paginated count
    }
    "samples": {
        offset: {"filepath": "...", ...},
        offset+1: {"filepath": "...", ...},
        ...
        offset+limit-1: {"filepath": "...", ...},
    }

}
```

## Considering `DatasetView`

This is still up in the air simply because it complicates things.

We could also add a view, which takes precedence over the active dataset if set

```
session.view = session.dataset.get_view("train") # GUI displays train subset
session.clear_view()    # GUI displays CIFAR100 dataset
session.clear_dataset() # displays dataset browser (clears view as well if set)
```

## Ideas for querying labels from our meeting (Tyler, Ben, Eric, Alan)

```python
import fiftyone.core.dataset as voxd
import fiftyone.core.session as voxs
import fiftyone.core.query as voxq

session = voxs.Session()
session.dataset = voxd.Dataset("cifar100") # GUI displays CIFAR100 dataset
session.query = voxq.DatasetQuery()

sample_dict = next(session.query(session.dataset)).serialize()

# IN:
sample_dict
# OUT:
{
    "filepath": "/Users/tylerganter/source/fiftyone/examples/datamodel/data/train/0.jpg",
    "filename": "0.jpg",
    "tags": [
        "train"
    ],
    "labels": {
        "ground_truth": {"label": "cat"},
        "model1_pred": {"label": "cat", "confidence": 0.2},
        "model2_pred": {"label": "dog", "confidence": 0.4},
    },
    "metadata": {
        "frame_size": [
            32,
            32
        ],
        "num_channels": 3,
        "size_bytes": 1426,
        "mime_type": "image/jpeg"
    },
    "_id": "5ea848b3aa5d2c2f3f5ef88a"
}

# specify what labels to return
session.query = session.query.filter_labels([
    {"ground_truth": {}},
    {"model2_pred": {"threshold": 0.1}},
    {"model2_pred": {"threshold": 0.5}},
])

sample_dict = next(session.query(session.dataset)).serialize()

# IN:
sample_dict["labels"]
# OUT:
{
    "ground_truth": {"label": "cat"},
    "model2_pred--0.1": {"label": "dog", "confidence": 0.4},
    "model2_pred--0.5": {},
}

```
