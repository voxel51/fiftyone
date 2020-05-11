# `fiftyone.Dataset/Sample/DatasetView`

The fundamental `fiftyone` object that a user interacts with is the
`DatasetView`. Users are constantly creating and chaining commands on views.
Any method on a `DatasetView` is also available on a `Dataset`. If appropriate,
the dataset creates a default view and calls the method on that view.

```python
import fiftyone as fo
```

## Poking Around

```python
len(dataset)

# get all accessible fields on samples of a dataset
dataset.get_fields()
# ["tags", "metadata", file_hash", "ground_truth_fine", "ground_truth_coarse",
# "model_1_preds", "gtf_hardness", "m1_hardness", "gtf_m1_eval"]

# get all fields that are subclass of `Labels`
dataset.get_fields(type=fo.Labels)
# ["ground_truth_fine", "ground_truth_coarse", "model_1"]

# get all tags
dataset.distinct("tags")
# ["train", "test", "validation"]

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
view.sort_by("model_1_preds.confidence")
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

The core query function is `match`, which uses
[MongoDB query syntax](https://docs.mongodb.com/manual/tutorial/query-documents/#read-operations-query-argument):

```python
# samples with this tag
view.match({"tags": "train"})

# samples with 3 channels and size > 1200 bytes
view.match(
    {"metadata.num_channels": 3, "metadata.size_bytes": {"$gt": 1200},}
)
```

Convenience wrappers are available for common queries:

```python
# samples that have the file hash field populated
view.exists("file_hash")

# samples that have the `model_1_preds` field populated
view.exists("ground_truth_fine")

# samples with/without these IDs
view.select([id1, id2, id3])
view.exclude([id1, id2, id3])
```

## Chaining Commands

Many operations on views return a view. It is easy to chain these commands.

```python
dataset.match({"tags": "train"}).exists("file_hash").sort_by("filepath")[
    10:20
].sample(5)
# -> fiftyone.core.view.DatasetView
```

## All Query/Sort/Slice Operations On Views

```python
# query
view.match({"tags": "train"})
view.exists("metadata")
view.select([id1, id2, id3])
view.exclude([id1, id2, id3])

# sory
view.sort_by("filepath")

# slice
view.head(5)
view.tail(5)
view.skip(3)
view.limit(10)
view.sample(10)
```

## Modifying

### Operations on `Dataset` or `View`

```python
# add one or more samples to a dataset
dataset.add_sample(sample)
dataset.add_samples([sample1, sample2])

# samples can NOT be added to a view
view.add_sample(sample1)
# AttributeError: type object 'DatasetView' has no attribute 'add_sample'

# @todo(Tyler) is this even needed?
dataset.update(...)
view.update(...)

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

## `Field`(s) of `Sample`(s)

`Sample`s have `Field`s on them.

Some fields are automatically set on all samples. And some are immutable:

```python
sample.id  # -> str
sample.filepath  # -> str
sample.dataset  # -> str? or fiftyone.core.dataset.Dataset object??

sample.filepath = "new/file/path.jpg"
# AttributeError: can't set attribute
```

Samples can have arbitrary `Field`s added to them. This example adds a `tags`
field which is a list of strings.

Modifications to samples are not saved to the DB until `sample.save` is called.

```python
sample["tags"] = ["train"]

sample["tags"]
sample.tags  # -> mongoengine.base.datastructures.BaseList
# ["train"]

sample.save()
```

Datasets contain meta information about the fields. The `tags` field was
automatically added when `tags` was added to a sample in the above code block.

```python
dataset.fields
# {
#     "dataset": fiftyone.core.fields.StringField(immutable=True),
#     "filepath": fiftyone.core.fields.StringField(immutable=True),
#     "tags": fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
# }
```

Setting a `Field` to an inappropriate type raises an error when saving.
However, a field can be entirely deleted from a dataset, afterwhich it can be
set again to any type.

```python
sample.tags = 67
# ValidationError: ValidationError (ODMDocument.ODMSample:5eb9c958a33a60b54d16eee5) (Only lists and tuples may be used in a list field: ['tags'])

sample.tags = [1, 2]
# ValidationError: ValidationError (ODMDocument.ODMSample:5eb9c958a33a60b54d16eee5) (StringField only accepts string values 1.StringField only accepts string values: ['tags'])

dataset.delete_field("tags")

sample["tags"] = 9
sample.save()
# {
#     "dataset": fiftyone.core.fields.StringField(immutable=True),
#     "filepath": fiftyone.core.fields.StringField(immutable=True),
#     "tags": fiftyone.core.fields.IntField()
# }
```

Adding a classification label to a sample:

```python
sample["model_1_preds"] = fo.ClassificationLabel(label="cow", confidence=0.98)
sample.save()

sample.model_1_preds
# <ClassificationLabel: ClassificationLabel object>
```

What used to be called "insights" are nothing more than `Fields`:

```python
file_hash = compute_file_hash(sample.filepath)
sample["model_1"] = fo.IntField(file_hash)
sample.save()

sample.file_hash
# 8495821470157
```
