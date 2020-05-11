# `fiftyone.Dataset/Sample/DatasetView`

The fundamental `fiftyone` object that a user interacts with is the
`DatasetView`. Users are constantly creating and chaining commands on views.
Any method on a `DatasetView` is also available on a `Dataset`. If appropriate,
the dataset creates a default view and calls the method on that view.

```python
import fiftyone as fo
```

## Viewing

```python
len(dataset)
dataset.get_tags()
# ["train", "test", "validation"]
dataset.get_insight_groups()
# ["file_hash", "gtf_hardness", "m1_hardness", "gtf_m1_eval"]
dataset.get_label_groups()
# ["ground_truth_fine", "ground_truth_coarse", "model_1"]
dataset.sample_class
# fiftyone.core.sample.ImageSample

dataset.summary()
# a string of all the above things

dataset.view  # -> fiftyone.core.view.DatasetView
dataset.view()  # -> fiftyone.core.view.DatasetView

# grab 5 random samples
dataset.view.sample(5)  # -> fiftyone.core.view.DatasetView
# all methods on views are also valid on datasets. The dataset merely creates
# a view and calls the method on that view:
dataset.sample(5)  # -> fiftyone.core.view.DatasetView
```

## Sorting

```python
view.sort_by("filepath")
view.sort_by("labels.ground_truth.confidence")
# -> fiftyone.core.view.DatasetView
```

## Selection (slicing)

### Slice

Slices are always list-like.

```python
# two equivalent methods:
view.skip(5).limit(5)  # -> fiftyone.core.view.DatasetView
view[5:10]  # -> fiftyone.core.view.DatasetView
```

### Key/Index

#### Idea 1:

Views are keyed same as datasets. Slicing only works if a `:` is provided.

```python
sample_id = "FFFFFFFF"
view[sample_id]  # -> fiftyone.core.sample.Sample OR KeyError

view[5]  # -> KeyError
```

#### Idea 2:

Views are NOT keyed same as datasets. They are always accessed in a list-like
style.

To get a similar effect to dataset keys one would use the `with_id` filter.

```python
view[5]  # -> fiftyone.core.sample.Sample OR IndexError

sample_id = "FFFFFFFF"
view.with_id(sample_id)  # -> fiftyone.core.view.DatasetView
view.with_id(sample_id)[0]  # -> fiftyone.core.sample.Sample OR IndexError
```

## Querying (searching)

@todo(Tyler)

## Chaining Commands

Many operations on views return a view. It is easy to chain these commands.

```python
dataset.match_tag("train").sort_by("filepath")[10:20].sample(5)
# -> fiftyone.core.view.DatasetView
```

## Modifying

### Operations on `Sample`

@todo(Tyler)

### Operations on `Dataset` or `View`

```python
# add one or more samples to a dataset
dataset.add_sample(sample)
dataset.add_samples([sample1, sample2])

# samples can NOT be added to a view
view.add_sample(sample1)
# AttributeError: type object 'DatasetView' has no attribute 'add_sample'

# @todo(Tyler)
dataset.update(...)

# delete all matching samples
view.delete()
```

## Operations (Aggregations)

Some simple aggregations are methods on `DatasetView`. For more powerful custom
aggregations, the MongoDB aggregation API is available.

```python
# get a list of all unique tags in the view
view.distinct("tags")  # -> list
# ["train", "test"]

# sum/average over the specified field
view.sum("labels.ground_truth.confidence")  # -> scalar
view.average("labels.ground_truth.confidence")  # -> scalar

# MongoDB aggregation pipeline
pipeline = [
    # filter samples that have `file_hash`
    {"$match": {"insights.file_hash": {"$exists": True}}},
    # find all unique file hashes
    {"$group": {"_id": "$insights.file_hash.file_hash", "count": {"$sum": 1}}},
    # filter out file hashes with a count of 1
    {"$match": {"count": {"$gt": 1}}},
]
view.aggregate(pipeline)  # -> pymongo.command_cursor.CommandCursor
for d in view.aggregate(pipeline):
    # d is a dictionary whos structure depends on the pipeline
    ...
```
