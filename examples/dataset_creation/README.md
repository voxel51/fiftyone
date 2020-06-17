# Dataset Creation Examples

Examples of creating datasets with FiftyOne.

## Loading zoo datasets

FiftyOne provides a Dataset Zoo that contains a collection of common datasets
that you can download and load into FiftyOne via a few simple commands.

You can interact with the Dataset Zoo either via the Python library or the CLI.

### Python library

The Dataset Zoo is accessible via the `fiftyone.zoo` package. Loading a dataset
is as simple as follows:

```py
import fiftyone.zoo as foz

# List available datasets
print(foz.list_zoo_datasets())

# Load a zoo dataset
# The dataset will be downloaded from the web the first time you access it
dataset = foz.load_zoo_dataset("cifar10", split="test")

# Print a few samples from the dataset
print(dataset.view().head())
```

Behind the scenes, FiftyOne uses the
[TensorFlow Datasets](https://www.tensorflow.org/datasets) or
[TorchVision Datasets](https://pytorch.org/docs/stable/torchvision/datasets.html)
libraries to wrangle the datasets, depending on which ML library you have
installed. In order to load datasets using TF, you must have the
[tensorflow-datasets](https://pypi.org/project/tensorflow-datasets) package
installed on your machine. In order to load datasets using PyTorch, you must
have the [torch](https://pypi.org/project/torch) and
[torchvision](https://pypi.org/project/torchvision) packages installed.

> Note that the ML backends may expose different datasets

### CLI

The `fiftyone zoo` CLI command provides convenient utilities for working with
datasets in the FiftyOne Dataset Zoo:

```
$ fiftyone zoo -h

usage: fiftyone zoo [-h] [--all-help] {list,info,download,load} ...

Tools for working with the FiftyOne Dataset Zoo.

optional arguments:
  -h, --help            show this help message and exit
  --all-help            show help recurisvely and exit

available commands:
  {list,info,download,load}
    list                Tools for listing datasets in the FiftyOne Dataset Zoo.
    info                Tools for printing info about downloaded zoo datasets.
    download            Tools for downloading zoo datasets.
    load                Tools for loading zoo datasets as persistent FiftyOne datasets.
```

#### Listing zoo datasets

You can access information about the available zoo datasets via the
`fiftyone zoo list` command:

```
$ fiftyone zoo list -h

usage: fiftyone zoo list [-h] [-b BASE_DIR]

Tools for listing datasets in the FiftyOne Dataset Zoo.

    Examples::

        # List available datasets
        fiftyone zoo list

        # List available datasets, using the specified base directory to search
        # for downloaded datasets
        fiftyone zoo list --base-dir <base-dir>

optional arguments:
  -h, --help            show this help message and exit
  -b BASE_DIR, --base-dir BASE_DIR
                        a custom base directory in which to search for downloaded datasets
```

For example, to list the available zoo datasets and whether you have downloaded
them, you can execute:

```
$ fiftyone zoo list

name           split       downloaded    dataset_dir                     torch (*)    tensorflow
-------------  ----------  ------------  ------------------------------  -----------  ------------
caltech101     test                                                      ✓
caltech101     train                                                     ✓
cifar10        test        ✓             ~/fiftyone/cifar10/test         ✓            ✓
cifar10        train       ✓             ~/fiftyone/cifar10/train        ✓            ✓
cifar100       test        ✓             ~/fiftyone/cifar100/test        ✓            ✓
cifar100       train       ✓             ~/fiftyone/cifar100/train       ✓            ✓
coco-2014      test                                                      ✓            ✓
coco-2014      train                                                     ✓            ✓
coco-2014      validation                                                ✓            ✓
coco-2017      test                                                      ✓            ✓
coco-2017      train                                                     ✓            ✓
coco-2017      validation                                                ✓            ✓
fashion-mnist  test                                                      ✓            ✓
fashion-mnist  train                                                     ✓            ✓
imagenet-2012  train                                                     ✓            ✓
imagenet-2012  validation                                                ✓            ✓
kitti          test        ✓             ~/fiftyone/kitti/test                        ✓
kitti          train       ✓             ~/fiftyone/kitti/train                       ✓
kitti          validation  ✓             ~/fiftyone/kitti/validation                  ✓
mnist          test        ✓             ~/fiftyone/mnist/test           ✓            ✓
mnist          train       ✓             ~/fiftyone/mnist/train          ✓            ✓
voc-2007       test                                                                   ✓
voc-2007       train       ✓             ~/fiftyone/voc-2007/train       ✓            ✓
voc-2007       validation  ✓             ~/fiftyone/voc-2007/validation  ✓            ✓
voc-2012       test                                                                   ✓
voc-2012       train                                                     ✓            ✓
voc-2012       validation                                                ✓            ✓
```

Dataset splits that have been downloaded are indicated by a checkmark in the
`downloaded` column, and their location on disk is indicated by the
`dataset_dir` column.

The `torch` and `tensorflow` columns indicate whether the particular dataset
split is available in the respective ML backends. The `(*)` indicates your
default ML backend, which will be used in case a given split is available
through multiple sources.

#### Getting information about zoo datasets

You can view detailed information about a dataset (either downloaded or not)
via the `fiftyone zoo info` command:

```
$ fiftyone zoo info -h
usage: fiftyone zoo info [-h] [-b BASE_DIR] NAME

Tools for printing info about downloaded zoo datasets.

    Examples::

        # Print information about a downloaded zoo dataset
        fiftyone zoo info <name>

        # Print information about the zoo dataset downloaded to the specified
        # base directory
        fiftyone zoo info <name> --base-dir <base-dir>

positional arguments:
  NAME                  the name of the dataset

optional arguments:
  -h, --help            show this help message and exit
  -b BASE_DIR, --base-dir BASE_DIR
                        a custom base directory in which to search for downloaded datasets
```

For example, you can view information about the CIFAR-10 dataset:

```
$ fiftyone zoo info cifar10

***** Dataset description *****
The CIFAR-10 dataset consists of 60000 32 x 32 color images in 10
    classes, with 6000 images per class. There are 50000 training images and
    10000 test images.

    Dataset size:
        132.40 MiB

    Source:
        https://www.cs.toronto.edu/~kriz/cifar.html

***** Supported splits *****
test, train

***** Dataset location *****
~/fiftyone/cifar10

***** Dataset info *****
{
    "name": "cifar10",
    "zoo_dataset": "fiftyone.zoo.torch.CIFAR10Dataset",
    "dataset_type": "fiftyone.types.dataset_types.ImageClassificationDataset",
    "num_samples": 60000,
    "downloaded_splits": {
        "test": {
            "split": "test",
            "num_samples": 10000
        },
        "train": {
            "split": "train",
            "num_samples": 50000
        }
    },
    "classes": [
        "airplane",
        "automobile",
        "bird",
        "cat",
        "deer",
        "dog",
        "frog",
        "horse",
        "ship",
        "truck"
    ]
}
```

#### Downloading zoo datasets

You can download zoo datasets (or individual splits of them) from the web via
the `fiftyone zoo download` command:

```
$ fiftyone zoo download -h

usage: fiftyone zoo download [-h] [-s SPLITS [SPLITS ...]] [-d DATASET_DIR]
                             NAME

Tools for downloading zoo datasets.

    Examples::

        # Download the entire zoo dataset
        fiftyone zoo download <name>

        # Download the specified split(s) of the zoo dataset
        fiftyone zoo download <name> --splits <split1> ...

        # Download to the zoo dataset to a custom directory
        fiftyone zoo download <name> --dataset-dir <dataset-dir>

positional arguments:
  NAME                  the name of the dataset

optional arguments:
  -h, --help            show this help message and exit
  -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                        the dataset splits to download
  -d DATASET_DIR, --dataset-dir DATASET_DIR
                        a custom directory to which to download the dataset
```

For example, you can download the test split of the CIFAR-10 dataset as
follows:

```
$ fiftyone zoo download cifar10 --splits test

Downloading split 'test' to '~/fiftyone/cifar10/test'
Downloading https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz
170500096it [00:04, 34514685.48it/s]
Extracting ~/fiftyone/cifar10/tmp-download/cifar-10-python.tar.gz to ~/fiftyone/cifar10/tmp-download
Writing samples to '~/fiftyone/cifar10/test' in 'fiftyone.types.dataset_types.ImageClassificationDataset' format...
 100% |██████████████████████████████████████████████████████| 10000/10000 [5.4s elapsed, 0s remaining, 1.9K samples/s]
Writing labels to '~/fiftyone/cifar10/test/labels.json'
Dataset created
Dataset info written to '~/fiftyone/cifar10/info.json'
```

#### Loading zoo datasets into FiftyOne

After a zoo dataset has been downloaded from the web, you can load it as a
FiftyOne dataset via the `fiftyone zoo load` command:

```
$ fiftyone zoo load -h

usage: fiftyone zoo load [-h] [-s SPLITS [SPLITS ...]] [-d DATASET_DIR] NAME

Tools for loading zoo datasets as persistent FiftyOne datasets.

    Examples::

        # Load the zoo dataset with the given name
        fiftyone zoo load <name>

        # Load the specified split(s) of the zoo dataset
        fiftyone zoo load <name> --splits <split1> ...

        # Load the zoo dataset from a custom directory
        fiftyone zoo load <name> --dataset-dir <dataset-dir>

positional arguments:
  NAME                  the name of the dataset

optional arguments:
  -h, --help            show this help message and exit
  -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                        the dataset splits to load
  -d DATASET_DIR, --dataset-dir DATASET_DIR
                        a custom directory in which the dataset is downloaded
```

For example, you can load the test splits of the CIFAR-10 dataset as follows:

```
$ fiftyone zoo load cifar10 --splits test

Split 'test' already downloaded
Loading 'cifar10' split 'test'
 100% |██████████████████████████████████████████████████████| 10000/10000 [3.6s elapsed, 0s remaining, 2.9K samples/s]
Dataset 'cifar10-test' created
```

### Customizing your ML backend

By default, FiftyOne will use whichever ML backend is available. If both are
found, it will use the backend specified by the `tf.config.default_ml_backend`
setting in your FiftyOne config.

You can customize this backend in any of the following ways:

-   Directly editing your FiftyOne config at `~/.fiftyone/config.json`

```shell
# Print your current config
fiftyone config

# Locate your config
fiftyone constants FIFTYONE_CONFIG_PATH
```

-   Setting the `FIFTYONE_DEFAULT_ML_BACKEND` environment variable

```shell
# Example: use the `tensorflow` backend
export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow
```

-   Setting the `default_ml_backend` config setting from your Python code

```py
# Example: use the `torch` backend
import fiftyone.core.config as foc
foc.set_config_settings(default_ml_backend="torch")
```

## Building datasets from scratch

FiftyOne datasets are composed of `fiftyone.core.sample.Sample` instances, and
FiftyOne provides the ability for you to construct your own dataset from
scratch by creating your own samples, if desired.

The following example demonstrates the construction of a dataset with ground
truth labels stored in a `ground_truth` field:

```py
import fiftyone as fo

# List of class labels
classes = ["cat", "dog"]

# A list of `(image_path, target)` tuples
samples = [("/path/to/cat.jpg", 0), ("/path/to/dog.png", 1)]

# Construct your dataset manually
_samples = []
for image_path, target in samples:
    _samples.append(
        fo.Sample(
            filepath=image_path,
            tags=["train"],
            ground_truth=fo.Classification(label=classes[target]),
        )
    )

dataset = fo.Dataset("catdog")
dataset.add_samples(_samples)

# Print a few samples from the dataset
print(dataset.view().head())
```

## Image classification datasets

FiftyOne provides native support for working with image classification samples
whose images are stored on disk and whose corresponding predictions are stored
in-memory.

In the code below, the input `samples` can be any iterable that emits
`(image_path, target)` tuples, where:

-   `image_path` is the path to the image on disk

-   `target` is either a label string, or, if `classes` are provided, a class
    ID that can be mapped to a label string via `classes[target]`

For example, `samples` may be a `torch.utils.data.Dataset` or an iterable
generated by `tf.data.Dataset.as_numpy_iterator()`.

If your samples do not fit this schema, you can use the
`fiftyone.Dataset.from_labeled_image_samples()` factory method to provide your
own `fiftyone.utils.data.LabeledImageSampleParser` to parse your samples.

```py
import fiftyone as fo

# List of class labels
classes = ...

# A list of `(image_path, target)` tuples
samples = ...

dataset = fo.Dataset.from_image_classification_samples(samples, classes=classes)
```

## Image detection datasets

FiftyOne provides native support for working with image detection samples whose
images are stored on disk and whose corresponding detections are stored
in-memory.

In the code below, the input `samples` can be any iterable that emits
`(image_path, detections)` tuples, where:

-   `image_path` is the path to the image on disk

-   `detections` is a list of detections in the following format:

```
[
    {
        "label": <target>,
        "bounding_box": [
            <top-left-x>, <top-left-y>, <width>, <height>
        ],
        "confidence": <optional-confidence>,
    },
    ...
]
```

where `target` is either a label string, or, if `classes` are provided, a class
ID that can be mapped to a label string via `classes[label]`, and the bounding
box coordinates are relative values in `[0, 1] x [0, 1]`.

For example, `samples` may be a `torch.utils.data.Dataset` or an iterable
generated by `tf.data.Dataset.as_numpy_iterator()`.

If your samples do not fit this schema, you can use the
`fiftyone.Dataset.from_labeled_image_samples()` factory method to provide your
own `fiftyone.utils.data.LabeledImageSampleParser` to parse your samples.

```py
import fiftyone as fo

# List of class labels
classes = ...

# A list of `(image_path, detections)` tuples
samples = ...

dataset = fo.Dataset.from_image_detection_samples(samples, classes=classes)
```

## Multitask image prediction datasets

FiftyOne provides native support for working with multitask image predictions
samples whose images are stored on disk and whose corresponding labels are
stored in-memory.

In the code below, the input `samples` can be any iterable that emits
`(image_path, image_labels)` tuples, where:

-   `image_path` is the path to the image on disk

-   `image_labels` is an `eta.core.image.ImageLabels` instance or a serialized
    dict representation of one

For example, `samples` may be a `torch.utils.data.Dataset` or an iterable
generated by `tf.data.Dataset.as_numpy_iterator()`.

See https://voxel51.com/docs/api/#types-imagelabels for more information on the
`ImageLabels` format.

If your samples do not fit this schema, you can use the
`fiftyone.Dataset.from_labeled_image_samples()` factory method to provide your
own `fiftyone.utils.data.LabeledImageSampleParser` to parse your samples.

```py
import fiftyone as fo

# A list of `(image_path, image_labels)` tuples
samples = ...

dataset = fo.Dataset.from_image_labels_samples(samples)
```

## Custom labeled image datasets

FiftyOne provides support for working with custom labeled image datasets whose
label formats differ from the native classification, detection, and multitask
structures described above.

In the code below, the input `samples` can be any iterable that emits
`(image_path, label)` tuples, where:

-   `image_path` is the path to the image on disk

-   `label` is a `fiftyone.core.labels.Label` instance containing the image
    labels(s)

If your samples require preprocessing to convert to the above format, you can
provide a custom `fiftyone.utils.data.LabeledImageSampleParser` instance via
the `sample_parser` argument whose
`fiftyone.utils.data.LabeledImageSampleParser.parse_label()` method will be
used to parse the sample labels in the input iterable.

```py
import fiftyone as fo
from fiftyone.utils.data import LabeledImageSampleParser


class MyLabeledImageSampleParser(LabeledImageSampleParser):
    """Your custom sample parser class."""

    def parse_label(self, sample):
        """Parses the label from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Label` instance
        """
        # @todo: parse the sample and return the label in the correct format
        pass


# A list of `(image_path, your_custom_labels)` tuples
samples = ...

# The sample parser to use to parse the samples
sample_parser = MyLabeledImageSampleParser()

dataset = fo.Dataset.from_labeled_image_samples(
    samples, sample_parser=sample_parser
)
```

## Labeled image datasets stored in-memory

FiftyOne provides support for ingesting labeled image datasets that are stored
as in-memory collections of images and labels.

In the method below, `samples` can be any iterable that emits
`(image_or_path, label)` tuples, where:

-   `image_or_path` is either an image that can be converted to numpy format
    via `np.asarray()` or the path to an image on disk

-   `label` is a `fiftyone.core.labels.Label` instance

If your samples require preprocessing to convert to the above format, you can
provide a custom `fiftyone.utils.data.LabeledImageSampleParser` instance via
the `sample_parser` argument whose
`fiftyone.utils.data.LabeledImageSampleParser.parse()` method will be used to
parse the input samples.

The code below demonstrates using the default
`fiftyone.utils.data.ImageClassificationSampleParser` to ingest an image
classification dataset stored in-memory:

```py
import fiftyone as fo
import fiftyone.utils.data as fod

# List of class labels
classes = ...

# A list of `(img, target)` tuples
samples = ...

# The sample parser to use to parse the samples
sample_parser = fodu.ImageClassificationSampleParser(classes=classes)

dataset = fo.Dataset("test-dataset")
dataset.ingest_labeled_image_samples(
    samples,
    dataset_dir="/tmp/dataset",
    sample_parser=sample_parser,
)
```

## Image classification datasets stored on disk

FiftyOne provides native support for loading image classification datasets that
are stored on disk in the following format:

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

This dataset format is encapsulated by the
`fiftyone.types.ImageClassificationDataset` type in FiftyOne.

You can load an image classification dataset from disk via the following
command:

```py
import fiftyone as fo

dataset = fo.Dataset.from_image_classification_dataset(dataset_dir)

# Print a few samples from the dataset
print(dataset.view().head())
```

## Image detection datasets stored on disk

FiftyOne provides native support for loading image detection datasets that are
stored on disk in the following format:

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

This dataset format is encapsulated by the
`fiftyone.types.ImageDetectionDataset` type in FiftyOne.

You can load an image detection dataset from disk via the following command:

```py
import fiftyone as fo

dataset = fo.Dataset.from_image_detection_dataset(dataset_dir)

# Print a few samples from the dataset
print(dataset.view().head())
```

## Multitask image prediction datasets stored on disk

> Factory method: `fiftyone.Dataset.from_image_labels_dataset()`

FiftyOne provides native support for loading multitask image prediction
datasets that are stored on disk in the following format:

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

where `manifest.json` is a JSON file in the following format:

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

and where each labels JSON file is stored in `eta.core.image.ImageLabels`
format. See https://voxel51.com/docs/api/#types-imagelabels for more details.

This dataset format is encapsulated by the `fiftyone.types.ImageLabelsDataset`
type in FiftyOne.

You can load a multitask image labels dataset from disk via the following
command:

```py
import fiftyone as fo

dataset = fo.Dataset.from_image_labels_dataset(dataset_dir)

# Print a few samples from the dataset
print(dataset.view().head())
```
