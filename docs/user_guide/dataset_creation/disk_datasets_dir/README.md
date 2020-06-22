# Disk Dataset Examples

FiftyOne provides native support for loading labeled datasets from disk in a
variety of common formats.

## Basic recipe

### Python library

The interface for importing datasets is conveniently exposed via the
`Dataset.from_dir` and `Dataset.add_dir` methods, which make it easy to import
datasets from disk in any supported format by simply specifiying the path to
their containing directory on disk and the type of the dataset.

The basic syntax is simple:

```py
import fiftyone as fo

# A name for the FiftyOne dataset
name = "my-coco-dataset"

# The directory containing the dataset to import
dataset_dir = "/path/to/dataset"

# The type of the dataset being imported
# Any subclass of `fiftyone.types.BaseDataset` is supported
dataset_type = fo.types.COCODetectionDataset  # for example

# Import the dataset!
dataset = fo.Dataset.from_dir(dataset_dir, dataset_type, name=name)
```

### CLI

FiftyOne datasets can also be created from datasets on disk via the
`fiftyone datasets create` CLI command:

```shell
# Creates a dataset from the given data on disk
fiftyone datasets create \
    --name <name> --dataset-dir <dataset-dir> --type <type>
```

where the arguments are as follows:

```
  -n NAME, --name NAME  a name for the dataset
  -d DATASET_DIR, --dataset-dir DATASET_DIR
                        the directory containing the dataset
  -t TYPE, --type TYPE  the type of the dataset (a subclass of `fiftyone.types.BaseDataset`)
```

### Supported formats

Each supported dataset type is represented by a subclass of
`fiftyone.types.BaseDataset`, which is used by the Python library and CLI to
refer to the corresponding dataset format when reading the dataset from disk.

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

Datasets of this type are read in the following format:

```
<dataset_dir>/
    <filename1>.<ext>
    <filename2>.<ext>
```

When reading datasets of this type, subfolders are recursively traversed, and
files with non-image MIME types are omitted.

### Python library

To load a directory of images as a FiftyOne dataset, you can execute:

```py
import fiftyone as fo

name = "my-images-dir"
dataset_dir = "/path/to/images-dir"

# Create the dataset
dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory, name=name)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a directory of images as a FiftyOne dataset, you can execute:

```shell
NAME=my-images-dir
DATASET_DIR=/path/to/images-dir

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageDirectory

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a directory of images in the FiftyOne Dashboard without creating a
persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/images-dir

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageDirectory
```

## Image classification datasets

The `fiftyone.types.ImageClassificationDataset` type represents a labeled
dataset consisting of images and their associated classification labels stored
in a simple JSON format.

### Disk format

Datasets of this type are read in the following format:

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

To load an image classification dataset stored in the above format as a
FiftyOne dataset, you can execute:

```py
import fiftyone as fo

name = "my-image-classification-dataset"
dataset_dir = "/path/to/image-classification-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.ImageClassificationDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load an image classification dataset stored in the above format as a
FiftyOne dataset, you can execute:

```shell
NAME=my-image-classification-dataset
DATASET_DIR=/path/to/image-classification-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageClassificationDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view an image classification dataset in the FiftyOne Dashboard without
creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/image-classification-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageClassificationDataset
```

## Image classification directory tree

The `fiftyone.types.ImageClassificationDirectoryTree` type represents a
directory tree whose subfolders define an image classification dataset.

### Disk format

Datasets of this type are read in the following format::

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

To load an image classification directory tree stored in the above format as a
FiftyOne dataset, you can execute:

```py
import fiftyone as fo

name = "my-image-classification-dir-tree"
dataset_dir = "/path/to/image-classification-dir-tree"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.ImageClassificationDirectoryTree, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load an image classification directory tree stored in the above format as a
FiftyOne dataset, you can execute:

```shell
NAME=my-image-classification-dir-tree
DATASET_DIR=/path/to/image-classification-dir-tree

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageClassificationDirectoryTree

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view an image classification directory tree in the FiftyOne Dashboard
without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/image-classification-dir-tree

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageClassificationDirectoryTree
```

## TF image classification dataset

The `fiftyone.types.TFImageClassificationDataset` type represents a labeled
dataset consisting of images and their associated classification labels stored
as [TFRecords](https://www.tensorflow.org/tutorials/load_data/tfrecord).

### Disk format

Datasets of this type are read in the following format:

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

To load an image classification dataset stored as a directory of TFRecords in
the above format, you can execute:

```py
import fiftyone as fo

name = "my-tf-image-classification-dataset"
dataset_dir = "/path/to/tf-image-classification-dataset"
images_dir = "/path/for/images"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir,
    fo.types.TFImageClassificationDataset,
    name=name,
    images_dir=images_dir
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

When the above command is executed, the images in the TFRecords will be written
to the provided `images_dir`, which is required because FiftyOne datasets must
make their images available as invididual files on disk.

### CLI

To load an image classification dataset stored as a directory of TFRecords in
the above format, you can execute:

```shell
NAME=my-tf-image-classification-dataset
DATASET_DIR=/path/to/tf-image-classification-dataset
IMAGES_DIR=/path/for/images

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.TFImageClassificationDataset
    --images-dir

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view an image classification dataset stored as a directory of TFRecords in
the FiftyOne Dashboard without creating a persistent FiftyOne dataset, you can
execute:

```shell
DATASET_DIR=/path/to/tf-image-classification-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.TFImageClassificationDataset
```

## Image detection dataset

The `fiftyone.types.ImageDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections stored in a simple
JSON format.

### Disk format

Datasets of this type are read in the following format:

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

To load an image detection dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-image-detection-dataset"
dataset_dir = "/path/to/image-detection-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.ImageDetectionDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load an image detection dataset stored in the above format, you can execute:

```shell
NAME=my-image-detection-dataset
DATASET_DIR=/path/to/image-detection-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageDetectionDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view an image detection dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/image-detection-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageDetectionDataset
```

## COCO detection dataset

The `fiftyone.types.COCODetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[COCO format](http://cocodataset.org/#home).

### Disk format

Datasets of this type are read in the following format:

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

To load a COCO detection dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-coco-detection-dataset"
dataset_dir = "/path/to/coco-detection-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.COCODetectionDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a COCO detection dataset stored in the above format, you can execute:

```shell
NAME=my-coco-detection-dataset
DATASET_DIR=/path/to/coco-detection-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.COCODetectionDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a COCO detection dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/coco-detection-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.COCODetectionDataset
```

## VOC detection dataset

The `fiftyone.types.VOCDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[VOC format](http://host.robots.ox.ac.uk/pascal/VOC).

### Disk format

Datasets of this type are read in the following format:

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

### Python library

To load a VOC detection dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-voc-detection-dataset"
dataset_dir = "/path/to/voc-detection-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.VOCDetectionDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a VOC detection dataset stored in the above format, you can execute:

```shell
NAME=my-voc-detection-dataset
DATASET_DIR=/path/to/voc-detection-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.VOCDetectionDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a VOC detection dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/voc-detection-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.VOCDetectionDataset
```

## KITTI detection dataset

The `fiftyone.types.KITTIDetectionDataset` type represents a labeled dataset
consisting of images and their associated object detections saved in
[KITTI format](http://www.cvlibs.net/datasets/kitti/eval_object.php).

### Disk format

Datasets of this type are read in the following format:

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

When reading datasets of this type, all columns after the four `bbox` columns
may be omitted.

### Python library

To load a KITTI detection dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-kitti-detection-dataset"
dataset_dir = "/path/to/kitti-detection-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.KITTIDetectionDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a KITTI detection dataset stored in the above format, you can execute:

```shell
NAME=my-kitti-detection-dataset
DATASET_DIR=/path/to/kitti-detection-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.KITTIDetectionDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a KITTI detection dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/kitti-detection-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.KITTIDetectionDataset
```

## CVAT image dataset

The `fiftyone.types.CVATImageDataset` type represents a labeled dataset
consisting of images and their associated object detections stored in
[CVAT image format](https://github.com/opencv/cvat).

### Disk format

Datasets of this type are read in the following format:

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

To load a CVAT image dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-cvat-image-dataset"
dataset_dir = "/path/to/cvat-image-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.CVATImageDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a CVAT image dataset stored in the above format, you can execute:

```shell
NAME=my-cvat-image-dataset
DATASET_DIR=/path/to/cvat-image-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.CVATImageDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a CVAT image dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/cvat-image-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.CVATImageDataset
```

## Multitask image labels dataset

The `fiftyone.types.ImageLabelsDataset` type represents a labeled dataset
consisting of images and their associated multitask predictions stored in
[eta.core.image.ImageLabels format](https://voxel51.com/docs/api/#types-imagelabels).

### Disk format

Datasets of this type are read in the following format:

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

To load an image labels dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-image-labels-dataset"
dataset_dir = "/path/to/image-labels-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.ImageLabelsDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load an image labels dataset stored in the above format, you can execute:

```shell
NAME=my-image-labels-dataset
DATASET_DIR=/path/to/image-labels-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageLabelsDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view an image labels dataset stored in the above format in the FiftyOne
Dashboard without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/image-labels-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.ImageLabelsDataset
```

## BDD dataset

The `fiftyone.types.BDDDataset` type represents a labeled dataset consisting of
images and their associated multitask predictions saved in
[Berkeley DeepDrive (BDD) format](https://bdd-data.berkeley.edu).

### Disk format

Datasets of this type are read in the following format:

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

To load a BDD dataset stored in the above format, you can execute:

```py
import fiftyone as fo

name = "my-bdd-dataset"
dataset_dir = "/path/to/bdd-dataset"

# Create the dataset
dataset = fo.Dataset.from_dir(
    dataset_dir, fo.types.BDDDataset, name=name
)

# View summary info about the dataset
print(dataset)

# Print the first few samples in the dataset
print(dataset.view().head())
```

### CLI

To load a BDD dataset stored in the above format, you can execute:

```shell
NAME=my-bdd-dataset
DATASET_DIR=/path/to/bdd-dataset

# Create the dataset
fiftyone datasets create \
    --name $NAME \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.BDDDataset

# View summary info about the dataset
fiftyone datasets info $NAME

# Print the first few samples in the dataset
fiftyone datasets head $NAME
```

To view a BDD dataset stored in the above format in the FiftyOne Dashboard
without creating a persistent FiftyOne dataset, you can execute:

```shell
DATASET_DIR=/path/to/bdd-dataset

# View the dataset in the dashboard
fiftyone dashboard view \
    --dataset-dir $DATASET_DIR \
    --type fiftyone.types.BDDDataset
```
