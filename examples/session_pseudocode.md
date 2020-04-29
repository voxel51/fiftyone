# Session Pseudocode

WIP pseudocode for object that manages the active dataset and socket
connection.

## Ideas for querying labels from our meeting (Tyler, Ben, Eric, Alan)

```python
import fiftyone.core.dataset as voxd
import fiftyone.core.query as voxq

dataset = voxd.Dataset("cifar100")
query = voxq.DatasetQuery()

sample_dict = next(query.iter_samples(dataset)).serialize()

# IN:
sample_dict
# OUT:
{
    "filepath": "/Users/tylerganter/source/fiftyone/examples/datamodel/data/train/0.jpg",
    "filename": "0.jpg",
    "tags": ["train"],
    "labels": {
        "ground_truth": {"label": "cat"},
        "model1_pred": {"label": "cat", "confidence": 0.2},
        "model2_pred": {"label": "dog", "confidence": 0.4},
    },
    "metadata": {
        "frame_size": [32, 32],
        "num_channels": 3,
        "size_bytes": 1426,
        "mime_type": "image/jpeg",
    },
    "_id": "5ea848b3aa5d2c2f3f5ef88a",
}

# specify what labels to return
query = query.filter_labels(
    [
        {"ground_truth": {}},
        {"model2_pred": {"threshold": 0.1}},
        {"model2_pred": {"threshold": 0.5}},
    ]
)

sample_dict = next(query.iter_samples(dataset)).serialize()

# IN:
sample_dict["labels"]
# OUT:
{
    "ground_truth": {"label": "cat"},
    "model2_pred--0.1": {"label": "dog", "confidence": 0.4},
    "model2_pred--0.5": {},
}
```
