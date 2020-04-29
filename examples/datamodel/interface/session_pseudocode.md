# Session Pseudocode

WIP pseudocode for object that manages the active dataset and socket
connection.

## Usage:

```python
import fiftyone.core.dataset as voxd
import fiftyone.core.session as voxs

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

session.serilized_info = {
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
