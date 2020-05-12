# `fiftyone.Dataset/Sample/Field/DatasetView`

Two sentence summary:
> `Dataset`s are composed of `Sample`s which contain `Field`s, all of which can
be dynamically created, modified and deleted. `DatasetView`s allow one to
easily view and manipulate subsets of `Dataset`s.

The fundamental `fiftyone` object that a user interacts with is the
`DatasetView`. Users are constantly creating and chaining commands on views.
Any method on a `DatasetView` is also available on a `Dataset`. If appropriate,
the dataset creates a default view and calls the method on that view.

`Sample`s are the building blocks that `Dataset`s are composed of. `Sample`s
can have dynamically added `Field`s on them. `Field`s can be of special types,
like the `fiftyone.Labels` class, or they can be primitive serializable types
like dicts, lists, strings, scalars, etc.

```python
import fiftyone as fo
```

## Poking Around

```python
len(dataset) # -> int

# get all accessible fields on samples of a dataset
dataset.get_fields() # -> dict
# {
#     "tags":                fo.core.fields.ListField(fo.core.fields.StringField),
#     "metadata":            fo.core.fields.fo.core.fields.DictField,
#     "file_hash":           fo.core.fields.IntField,
#     "ground_truth_fine":   fo.core.fields.ClassificationLabel,
#     "ground_truth_coarse": fo.core.fields.ClassificationLabel,
#     "model_1_preds":       fo.core.fields.ClassificationLabel,
#     "gtf_hardness":        fo.core.fields.HardnessField,
#     "m1_hardness":         fo.core.fields.HardnessField,
#     "gtf_m1_eval":         fo.core.fields.EvaluationField,
# }

# get all fields that are subclass of `Labels`
dataset.get_fields(type=fo.Labels) # -> dict
# {
#     "ground_truth_fine":   fo.core.fields.ClassificationLabel,
#     "ground_truth_coarse": fo.core.fields.ClassificationLabel,
#     "model_1_preds":       fo.core.fields.ClassificationLabel,
# }

dataset.sample_class  # -> type
# fiftyone.core.sample.ImageSample

dataset.summary() # -> str
# a string of all the above things

dataset.view    # -> fiftyone.core.view.DatasetView
dataset.view()  # -> fiftyone.core.view.DatasetView

# grab 5 random samples
dataset.view.sample(5)  # -> fiftyone.core.view.DatasetView

# all methods on views are also valid on datasets. The dataset merely creates
# a view and calls the method on that view:
dataset.sample(5)  # -> fiftyone.core.view.DatasetView
```

## Basics with `DatasetView`s

### Sorting

```python
view.sort_by("filepath") # -> fiftyone.core.view.DatasetView

view.sort_by("model_1_preds.confidence") # -> fiftyone.core.view.DatasetView
```

### Selection (slicing)

#### Slice

Slices are always list-like.

```python
# equivalent:
view.skip(5).limit(5)  # -> fiftyone.core.view.DatasetView
view[5:10]  # -> fiftyone.core.view.DatasetView
```

#### Key/Index

##### Idea 1:

Views are keyed same as datasets. Slicing only works if a `:` is provided.

```python
sample_id = "FFFFFFFF"
view[sample_id]  # -> fiftyone.core.sample.Sample OR KeyError

view[5]  # -> KeyError
```

##### Idea 2:

Views are NOT keyed same as datasets. They are always accessed in a list-like
style.

To get a similar effect to dataset keys one would use the `with_id` filter.

```python
view[5]  # -> fiftyone.core.sample.Sample OR IndexError

sample_id = "FFFFFFFF"
view.with_id(sample_id)  # -> fiftyone.core.view.DatasetView
view.with_id(sample_id)[0]  # -> fiftyone.core.sample.Sample OR IndexError
```

### Querying

The core query function is `match`, which uses
[MongoDB query syntax](https://docs.mongodb.com/manual/tutorial/query-documents/#read-operations-query-argument):

```python
# samples with this tag
view.match({"tags": "train"}) # -> fiftyone.core.view.DatasetView

# samples with 3 channels and size > 1200 bytes
view.match(
    {"metadata.num_channels": 3, "metadata.size_bytes": {"$gt": 1200},}
) # -> fiftyone.core.view.DatasetView
```

Convenience wrappers are available for common queries:

```python
# samples that have the `sample.file_hash` field populated
view.exists("file_hash") # -> fiftyone.core.view.DatasetView

# samples that have the `sample.model_1_preds` field populated
view.exists("model_1_preds") # -> fiftyone.core.view.DatasetView

# samples with/without these IDs
view.select([id1, id2, id3])  # -> fiftyone.core.view.DatasetView
view.exclude([id1, id2, id3]) # -> fiftyone.core.view.DatasetView
```

### Chaining Commands

Many operations on views return a view. It is easy to chain these commands.

```python
view = (
    dataset
    .match({"tags": "train"})
    .exists("file_hash")
    .sort_by("filepath")[10:20]
    .sample(5)
) # -> fiftyone.core.view.DatasetView
```

All chain operations on `View`s:

```python
# query
view.match({"tags": "train"})
view.exists("metadata")
view.select([id1, id2, id3])
view.exclude([id1, id2, id3])

# sort
view.sort_by("filepath")

# slice
view.head(5)
view.tail(5)
view.skip(3)
view.limit(10)
view.sample(10)
```

## Modifying `Dataset`s (Insert/Delete)

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

# delete a single sample
del dataset[sample_id]
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

```python
sample["tags"] = ["train"]

# equivalent:
sample["tags"] # -> fiftyone.core.fields.ListField
sample.tags    # -> fiftyone.core.fields.ListField
# ["train"]
```

Datasets contain meta information about the fields. The `tags` field was
automatically added when `tags` was added to a sample in the above code block.

```python
dataset.get_fields()
# {
#     "dataset": fiftyone.core.fields.StringField(immutable=True),
#     "filepath": fiftyone.core.fields.StringField(immutable=True),
#     "tags": fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
# }
```

Setting a `Field` to an inappropriate type raises a `ValidationError`. However,
a field can be entirely deleted from a dataset, afterwhich it can be set again
to any type.

```python
sample.tags = 67
# ValidationError: ValidationError (ODMDocument.ODMSample:5eb9c958a33a60b54d16eee5) (Only lists and tuples may be used in a list field: ['tags'])

sample.tags = [1, 2]
# ValidationError: ValidationError (ODMDocument.ODMSample:5eb9c958a33a60b54d16eee5) (StringField only accepts string values 1.StringField only accepts string values: ['tags'])

dataset.delete_field("tags")

sample["tags"] = 9

dataset.get_fields()
# {
#     "dataset": fiftyone.core.fields.StringField(immutable=True),
#     "filepath": fiftyone.core.fields.StringField(immutable=True),
#     "tags": fiftyone.core.fields.IntField()
# }
```

Adding a classification label to a sample:

```python
sample["model_1_preds"] = fo.ClassificationLabel(label="cow", confidence=0.98)

sample.model_1_preds # -> fiftyone.core.fields.ClassificationLabel
# <ClassificationLabel: ClassificationLabel object>
```

What used to be called "insights" are nothing more than `Fields`:

```python
file_hash = compute_file_hash(sample.filepath)

# equivalent:
sample["file_hash"] = fo.IntField(file_hash)
sample["file_hash"] = file_hash

sample.file_hash # -> int
# 8495821470157
```
