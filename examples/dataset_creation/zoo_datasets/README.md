# Zoo Dataset Examples

FiftyOne provides a Dataset Zoo that contains a collection of common datasets
that you can download and load into FiftyOne via a few simple commands.

You can interact with the Dataset Zoo either via the Python library or the CLI.

## Python library

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

## CLI

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

### Listing zoo datasets

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

### Downloading zoo datasets

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
 100% |██████████████████████████████████████████████| 10000/10000 [5.4s elapsed, 0s remaining, 1.9K samples/s]
Writing labels to '~/fiftyone/cifar10/test/labels.json'
Dataset created
Dataset info written to '~/fiftyone/cifar10/info.json'
```

### Loading zoo datasets into FiftyOne

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

For example, you can load the test split of the CIFAR-10 dataset as follows:

```
$ fiftyone zoo load cifar10 --splits test

Split 'test' already downloaded
Loading 'cifar10' split 'test'
 100% |██████████████████████████████████████████████| 10000/10000 [3.6s elapsed, 0s remaining, 2.9K samples/s]
Dataset 'cifar10-test' created
```

## Customizing your ML backend

By default, FiftyOne will use whichever ML backend is necessary to download the
requested zoo dataset. If a dataset is available through both backends, it will
use the backend specified by the `tf.config.default_ml_backend` setting in your
FiftyOne config.

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
# Use the `tensorflow` backend
export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow
```

-   Setting the `default_ml_backend` config setting from your Python code

```py
# Use the `torch` backend
import fiftyone.core.config as foc
foc.set_config_settings(default_ml_backend="torch")
```
