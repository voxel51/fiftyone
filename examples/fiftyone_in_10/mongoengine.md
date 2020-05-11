# `mongoengine.Document`

The core of `mongoengine` is the `QuerySet` which allows you to search, sort
and slice collections of `Document`s.

```python
from mongoengine import *


class ODMSample(Document):
    dataset = StringField()
    filepath = StringField(unique=True)
    tags = ListField(StringField())


ODMSample  # -> mongoengine.base.metaclasses.TopLevelDocumentMetaclass
# fiftyone.core.odm.ODMSample

sample = ODMSample(filepath="path/to/img.jpg")
```

## Viewing

```python
ODMSample.objects()  # -> mongoengine.queryset.queryset.QuerySet
ODMSample.objects  # -> mongoengine.queryset.queryset.QuerySet
# [<ODMSample: ODMSample object>]
```

## Sorting

```python
ODMSample.objects.order_by("filepath")
```

## Selection (slicing)

```python
# Only the first 5
ODMSample.objects.limit(5)
samples = ODMSample.objects[:5]

# All except for the first 5
ODMSample.objects.skip(5)
samples = ODMSample.objects[5:]

# 5 samples, starting from the 11th user found
ODMSample.objects.skip(5).limit(10)
samples = ODMSample.objects[10:15]

ODMSample.objects[0]
# <ODMSample: ODMSample object>
ODMSample.objects[1]
# IndexError: no such item for Cursor instance

ODMSample.objects.get(tags="train")
# Retrieve the the matching object raising MultipleObjectsReturned or
# DocumentName.MultipleObjectsReturned exception if multiple results and
# DoesNotExist or DocumentName.DoesNotExist if no results are found.
```

## Querying (searching)

```python
ODMSample.objects(tags="train")
ODMSample.objects(__raw__={"tags": "train"})
# -> mongoengine.queryset.queryset.QuerySet

ODMSample.objects(labels__ground_truth__exists=True)
ODMSample.objects(__raw__={"labels.ground_truth": {"$exists": True}})
# -> mongoengine.queryset.queryset.QuerySet
```

## Chaining Commands

```python
query_set = ODMSample.objects
query_set.order_by("filepath").limit(10).skip(5)[10:15].filter(
    tags="train"
).order_by("tags")
# -> mongoengine.queryset.queryset.QuerySet
```

## Modifying

### Modifying one document

```python
sample.tags  # -> mongoengine.base.datastructures.BaseList
# []

sample.tags += ["train"]
sample.tags.append("train")
sample.tags
# ['train']
```

### Modifying multiple documents

```python
# bulk insert
ODMSample.objects.insert([sample1, sample2])

# Modify and insert if does not exist
ODMSample.objects.update(upsert=True)

# delete all matches
ODMSample.objects.delete()
```

## Operations (Aggregations)

```python
ODMSample.objects.count()  # -> int
ODMSample.objects.distinct("tags")
# -> mongoengine.base.datastructures.BaseList
ODMSample.objects.sum("labels.ground_truth.confidence")  # -> scalar
ODMSample.objects.average("labels.ground_truth.confidence")  # -> scalar

# MongoDB aggregation pipeline
ODMSample.objects.aggregate([])  # -> pymongo.command_cursor.CommandCursor
```
