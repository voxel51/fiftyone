# FiftyOne Dataset Basics

Fiftyone `Dataset` allow you to easily load, view, and modify your image
datasets along with any related classification, detection, segmentation, or
custom labels.

## Dataset Properties

`Datasets` are composed of `Samples` which contain `Fields`, all of which can
be dynamically created, modified and deleted.

## Samples

`Samples` are the elements of `Datasets` that store all the information related
to a given image. Any `Sample` must include a file path to an image.

```python
sample = fo.Sample(filepath="/path/to/image.png")
```

## Fields

## Tags

## Views
