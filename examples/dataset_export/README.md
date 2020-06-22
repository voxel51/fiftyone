# Dataset Export Example

FiftyOne provides native support for exporting datasets to disk in a variety of
common formats.

## Basic recipe

### Python library

The interface for exporting datasets is conveniently exposed via the
`Dataset.export()` and `DatasetView.export()` methods, which makes it easy to
export entire datasets as well as arbitrary subsets of your datasets that you
have identified by constructing a view.

The basic syntax is simple:

```py
import fiftyone as fo

# The Dataset or DatasetView containing the samples you wish to export
dataset_or_view = fo.Dataset(...)

# The directory to which to write the exported dataset
export_dir = "/path/for/export"

# The name of the sample field containing the label that you wish to export
# Used when exporting labeled datasets (e.g., classification or detection)
label_field = "ground_truth"  # for example

# The type of dataset to export
# Any subclass of `fiftyone.types.BaseDataset` is supported
dataset_type = fo.types.COCODetectionDataset  # for example

# Export the dataset!
dataset_or_view.export(
    export_dir, label_field=label_field, dataset_type=dataset_type
)
```

Note the `label_field` argument in the above example, which specifies the
particular label field that you wish to export. This is necessary your FiftyOne
dataset contains multiple label fields.

### CLI

FiftyOne datasets can also be exported via the `fiftyone datasets export` CLI
command:

```shell
# Exports the dataset to disk in the specified format
fiftyone datasets export <name> \
    --export-dir <export-dir> --type <type> --label-field <label-field>
```

where the arguments are as follows:

```
  NAME                  the name of the dataset to export

  -d EXPORT_DIR, --export-dir EXPORT_DIR
                        the directory in which to export the dataset
  -f LABEL_FIELD, --label-field LABEL_FIELD
                        the name of the label field to export
  -t TYPE, --type TYPE  the format in which to export the dataset (a subclass of `fiftyone.types.BaseDataset`)
```

### Supported formats

Each supported dataset type is represented by a subclass of
`fiftyone.types.BaseDataset`, which is used by the Python library and CLI to
refer to the corresponding dataset format when writing the dataset to disk.

| Dataset Type                                      | Description                                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fiftyone.types.ImageDirectory`                   | A directory of images.                                                                                                                                                                                            |
| `fiftyone.types.ImageClassificationDataset`       | A labeled dataset consisting of images and their associated classification labels in a simple JSON format.                                                                                                        |
| `fiftyone.types.ImageClassificationDirectoryTree` | A directory tree whose subfolders define an image classification dataset.                                                                                                                                         |
| `fiftyone.types.TFImageClassificationDataset`     | A labeled dataset consisting of images and their associated classification labels stored as TFRecords.                                                                                                            |
| `fiftyone.types.ImageDetectionDataset`            | A labeled dataset consisting of images and their associated object detections stored in a simple JSON format.                                                                                                     |
| `fiftyone.types.COCODetectionDataset`             | A labeled dataset consisting of images and their associated object detections saved in COCO format (http://cocodataset.org/#home).                                                                                |
| `fiftyone.types.VOCDetectionDataset`              | A labeled dataset consisting of images and their associated object detections saved in VOC format (http://host.robots.ox.ac.uk/pascal/VOC).                                                                       |
| `fiftyone.types.KITTIDetectionDataset`            | A labeled dataset consisting of images and their associated object detections saved in KITTI format (http://www.cvlibs.net/datasets/kitti/eval_object.php).                                                       |
| `fiftyone.types.TFObjectDetectionDataset`         | A labeled dataset consisting of images and their associated object detections stored as TFRecords in TF Object Detection API format (https://github.com/tensorflow/models/blob/master/research/object_detection). |
| `fiftyone.types.CVATImageDataset`                 | A labeled dataset consisting of images and their associated object detections stored in CVAT image format (https://github.com/opencv/cvat).                                                                       |
| `fiftyone.types.ImageLabelsDataset`               | A labeled dataset consisting of images and their associated multitask predictions stored in `eta.core.image.ImageLabels` format.                                                                                  |
| `fiftyone.types.BDDDataset`                       | A labeled dataset consisting of images and their associated multitask predictions saved in Berkeley DeepDrive (BDD) format (https://bdd-data.berkeley.edu).                                                       |

## Image directories

The `fiftyone.types.ImageDirectory` type represents a directory of images.

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    <filename1>.<ext>
    <filename2>.<ext>
```

### Python library

To export the images in a FiftyOne dataset as a directory of images on disk,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/images-dir"

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(export_dir, dataset_type=fo.types.ImageDirectory)
```

### CLI

To export the images in a FiftyOne dataset as a directory of images on disk,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/to/images-dir

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --type fiftyone.types.ImageDirectory
```

## Image classification datasets

The `fiftyone.types.ImageClassificationDataset` type represents a labeled
dataset consisting of images and their associated classification labels stored
in a simple JSON format.

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels.json
```

where `labels.json` is a JSON file in the following format:

```
{
    "classes": [
        <labelA>,
        <labelB>,
        ...
    ],
    "labels": {
        <uuid1>: <target1>,
        <uuid2>: <target2>,
        ...
    }
}
```

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

### Python library

To export a FiftyOne dataset as an image classification dataset stored on disk
in the above format, you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/image-classification-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.ImageClassificationDataset,
)
```

### CLI

To export a FiftyOne dataset as an image classification dataset stored on disk
in the above format, you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/image-classification-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.ImageClassificationDataset
```

## Image classification directory tree

The `fiftyone.types.ImageClassificationDirectoryTree` type represents a
directory tree whose subfolders define an image classification dataset.

### Disk format

Datasets of this type are exported in the following format::

```
<dataset_dir>/
    <classA>/
        <image1>.<ext>
        <image2>.<ext>
        ...
    <classB>/
        <image1>.<ext>
        <image2>.<ext>
        ...
```

### Python library

To export a FiftyOne dataset as an image classification directory tree stored
on disk in the above format, you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/image-classification-dir-tree"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.ImageClassificationDirectoryTree,
)
```

### CLI

To export a FiftyOne dataset as an image classification directory tree stored
on disk in the above format, you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/image-classification-dir-tree
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.ImageClassificationDirectoryTree
```

## TF image classification dataset

The `fiftyone.types.TFImageClassificationDataset` type represents a labeled
dataset consisting of images and their associated classification labels stored
as [TFRecords](https://www.tensorflow.org/tutorials/load_data/tfrecord).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    tf.records-?????-of-?????
```

where the features of the (possibly sharded) TFRecords are stored in the
following format:

```
{
    # Image dimensions
    "height": tf.io.FixedLenFeature([], tf.int64),
    "width": tf.io.FixedLenFeature([], tf.int64),
    "depth": tf.io.FixedLenFeature([], tf.int64),

    # Image filename
    "filename": tf.io.FixedLenFeature([], tf.int64),

    # Encoded image bytes
    "image_bytes": tf.io.FixedLenFeature([], tf.string),

    # Class label string
    "label": tf.io.FixedLenFeature([], tf.string),
}
```

### Python library

To export a FiftyOne dataset as a directory of TFRecords in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/tf-image-classification-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.TFImageClassificationDataset,
)
```

### CLI

To export a FiftyOne dataset as a directory of TFRecords in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/tf-image-classification-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.TFImageClassificationDataset
```

## Image detection dataset

The `fiftyone.types.ImageDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections stored in a simple
JSON format.

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels.json
```

where `labels.json` is a JSON file in the following format:

```
{
    "classes": [
        <labelA>,
        <labelB>,
        ...
    ],
    "labels": {
        <uuid1>: [
            {
                "label": <target>,
                "bounding_box": [
                    <top-left-x>, <top-left-y>, <width>, <height>
                ],
                "confidence": <optional-confidence>,
            },
            ...
        ],
        <uuid2>: [
            ...
        ],
        ...
    }
}
```

and where the bounding box coordinates are expressed as relative values in
`[0, 1] x [0, 1]`.

If the `classes` field is provided, the `target` values are class IDs that are
mapped to class label strings via `classes[target]`. If no `classes` field is
provided, then the `target` values directly store the label strings.

### Python library

To export a FiftyOne dataset as an image detection dataset in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/image-detection-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.ImageDetectionDataset,
)
```

### CLI

To export a FiftyOne dataset as an image detection dataset in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/image-detection-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.ImageDetectionDataset
```

## COCO detection dataset

The `fiftyone.types.COCODetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[COCO format](http://cocodataset.org/#home).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <filename0>
        <filename1>
        ...
    labels.json
```

where `labels.json` is a JSON file in the following format:

```
{
    "info": {
        "year": "",
        "version": "",
        "description": "Exported from FiftyOne",
        "contributor": "",
        "url": "https://voxel51.com/fiftyone",
        "date_created": "2020-06-19T09:48:27"
    },
    "licenses": [],
    "categories": [
        ...
        {
            "id": 2,
            "name": "cat",
            "supercategory": "none"
        },
        ...
    ],
    "images": [
        {
            "id": 0,
            "license": null,
            "file_name": <filename0>,
            "height": 480,
            "width": 640,
            "date_captured": null
        },
        ...
    ],
    "annotations": [
        {
            "id": 0,
            "image_id": 0,
            "category_id": 2,
            "bbox": [260, 177, 231, 199],
            "area": 45969,
            "segmentation": [],
            "iscrowd": 0
        },
        ...
    ]
}
```

### Python library

To export a FiftyOne dataset as a COCO detection dataset in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/image-detection-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.COCODetectionDataset,
)
```

### CLI

To export a FiftyOne dataset as a COCO detection dataset in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/coco-detection-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.COCODetectionDataset
```

## VOC detection dataset

The `fiftyone.types.VOCDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[VOC format](http://host.robots.ox.ac.uk/pascal/VOC).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels/
        <uuid1>.xml
        <uuid2>.xml
```

where the labels XML files are in the following format:

```xml
<annotation>
    <folder>data</folder>
    <filename>image.ext</filename>
    <path>/path/to/dataset-dir/data/image.ext</path>
    <source>
        <database></database>
    </source>
    <size>
        <width>640</width>
        <height>480</height>
        <depth>3</depth>
    </size>
    <segmented></segmented>
    <object>
        <name>cat</name>
        <pose></pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <occluded>0</occluded>
        <bndbox>
            <xmin>256</xmin>
            <ymin>200</ymin>
            <xmax>450</xmax>
            <ymax>400</ymax>
        </bndbox>
    </object>
    <object>
        <name>dog</name>
        <pose></pose>
        <truncated>1</truncated>
        <difficult>1</difficult>
        <occluded>1</occluded>
        <bndbox>
            <xmin>128</xmin>
            <ymin>100</ymin>
            <xmax>350</xmax>
            <ymax>300</ymax>
        </bndbox>
    </object>
    ...
</annotation>
```

Samples with no values for certain attributes (like `pose` in the above
example) are left empty.

### Python library

To export a FiftyOne dataset as a VOC detection dataset in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/voc-detection-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.VOCDetectionDataset,
)
```

### CLI

To export a FiftyOne dataset as a VOC detection dataset in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/voc-detection-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.VOCDetectionDataset
```

## KITTI detection dataset

The `fiftyone.types.KITTIDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[KITTI format](http://www.cvlibs.net/datasets/kitti/eval_object.php).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels/
        <uuid1>.txt
        <uuid2>.txt
```

where the labels TXT files are space-delimited files where each row corresponds
to an object and the 15 (and optional 16th score) columns have the following
meanings:

| Number of columns | Name       | Description                                                                                                                                            | Default |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1                 | type       | The object label                                                                                                                                       |         |
| 1                 | truncated  | A float in `[0, 1]`, where 0 is non-truncated and 1 is fully truncated. Here, truncation refers to the object leaving image boundaries                 | 0       |
| 1                 | occluded   | An int in `(0, 1, 2, 3)` indicating occlusion state, where:<br>- 0 = fully visible<br>- 1 = partly occluded<br>- 2 = largely occluded<br>- 3 = unknown | 0       |
| 1                 | alpha      | Observation angle of the object, in `[-pi, pi]`                                                                                                        | 0       |
| 4                 | bbox       | 2D bounding box of object in the image in pixels, in the format `[xtl, ytl, xbr, ybr]`                                                                 |         |
| 1                 | dimensions | 3D object dimensions, in meters, in the format `[height, width, length]`                                                                               | 0       |
| 1                 | location   | 3D object location `(x, y, z)` in camera coordinates (in meters)                                                                                       | 0       |
| 1                 | rotation_y | Rotation around the y-axis in camera coordinates, in `[-pi, pi]`                                                                                       | 0       |
| 1                 | score      | `(optional)` A float confidence for the detection                                                                                                      |         |

The `default` column above indicates the default value that will be used when
writing datasets in this type whose samples do not contain the necessary
field(s).

### Python library

To export a FiftyOne dataset as a KITTI detection dataset in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/kitti-detection-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.KITTIDetectionDataset,
)
```

### CLI

To export a FiftyOne dataset as a KITTI detection dataset in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/kitti-detection-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.KITTIDetectionDataset
```

## CVAT image dataset

The `fiftyone.types.CVATImageDataset` type represents a labeled dataset
consisting of images and their associated object detections stored in
[CVAT image format](https://github.com/opencv/cvat).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels.xml
```

where `labels.xml` is an XML file in the following format:

```xml
<?xml version="1.0" encoding="utf-8"?>
<annotations>
    <version>1.1</version>
    <meta>
        <task>
            <size>51</size>
            <mode>annotation</mode>
            <labels>
                <label>
                    <name>car</name>
                    <attributes>
                        <attribute>
                            <name>type</name>
                            <values>coupe,sedan,truck</values>
                        </attribute>
                        ...
                    </attributes>
                </label>
                <label>
                    <name>person</name>
                    <attributes>
                        <attribute>
                            <name>gender</name>
                            <values>male,female</values>
                        </attribute>
                        ...
                    </attributes>
                </label>
                ...
            </labels>
        </task>
        <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
    </meta>
    <image id="1" name="<uuid1>.<ext>" width="640" height="480">
        <box label="car" xtl="100" ytl="50" xbr="325" ybr="190" type="sedan"></box>
        ...
    </image>
    ...
    <image id="51" name="<uuid51>.<ext>" width="640" height="480">
        <box label="person" xtl="300" ytl="25" xbr="375" ybr="400" gender="female"></box>
        ...
    </image>
</annotations>
```

### Python library

To export a FiftyOne dataset as a CVAT image dataset in the above format, you
can execute:

```py
import fiftyone as fo

export_dir = "/path/for/cvat-image-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.CVATImageDataset,
)
```

### CLI

To export a FiftyOne dataset as a CVAT image dataset in the above format, you
can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/cvat-image-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.CVATImageDataset
```

## Multitask image labels dataset

The `fiftyone.types.ImageLabelsDataset` type represents a labeled dataset
consisting of images and their associated multitask predictions stored in
[eta.core.image.ImageLabels format](https://voxel51.com/docs/api/#types-imagelabels).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <uuid1>.<ext>
        <uuid2>.<ext>
        ...
    labels/
        <uuid1>.json
        <uuid2>.json
        ...
    manifest.json
```

where `manifest.json` is a JSON file in the following format::

```
{
    "type": "eta.core.datasets.LabeledImageDataset",
    "description": "",
    "index": [
        {
            "data": "data/<uuid1>.<ext>",
            "labels": "labels/<uuid1>.json"
        },
        ...
    ]
}
```

and where each labels JSON file is stored in
[eta.core.image.ImageLabels format](https://voxel51.com/docs/api/#types-imagelabels).

### Python library

To export a FiftyOne dataset as an image labels dataset in the above format,
you can execute:

```py
import fiftyone as fo

export_dir = "/path/for/image-labels-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.ImageLabelsDataset,
)
```

### CLI

To export a FiftyOne dataset as an image labels dataset in the above format,
you can execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/image-labels-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.ImageLabelsDataset
```

## BDD dataset

The `fiftyone.types.BDDDataset` type represents a labeled dataset consisting of
images and their associated multitask predictions saved in
[Berkeley DeepDrive (BDD) format](https://bdd-data.berkeley.edu).

### Disk format

Datasets of this type are exported in the following format:

```
<dataset_dir>/
    data/
        <filename0>
        <filename1>
        ...
    labels.json
```

where `labels.json` is a JSON file in the following format:

```
[
    {
        "attributes": {
            "scene": "city street",
            "timeofday": "daytime",
            "weather": "overcast"
        },
        "labels": [
            {
                "attributes": {
                    "occluded": false,
                    "trafficLightColor": "none",
                    "truncated": false
                },
                "box2d": {
                    "x1": 1000.698742,
                    "x2": 1040.626872,
                    "y1": 281.992415,
                    "y2": 326.91156
                },
                "category": "traffic sign",
                "id": 0,
                "manualAttributes": true,
                "manualShape": true
            },
            ...
        ],
        "name": <filename0>,
        ...
    },
    ...
]
```

### Python library

To export a FiftyOne dataset as a BDD dataset in the above format, you can
execute:

```py
import fiftyone as fo

export_dir = "/path/for/bdd-dataset"
label_field = "ground_truth"  # for example

# The Dataset or DatasetView to export
dataset_or_view = fo.Dataset(...)

# Export the dataset
dataset_or_view.export(
    export_dir,
    label_field=label_field,
    dataset_type=fo.types.BDDDataset,
)
```

### CLI

To export a FiftyOne dataset as a BDD dataset in the above format, you can
execute:

```shell
NAME=my-dataset
EXPORT_DIR=/path/for/bdd-dataset
LABEL_FIELD=ground_truth  # for example

# Export the dataset
fiftyone datasets export $NAME \
    --export-dir $EXPORT_DIR \
    --label-field $LABEL_FIELD \
    --type fiftyone.types.BDDDataset
```
