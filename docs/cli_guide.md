# Command-Line Interface Guide

Installing FiftyOne automatically installs `fiftyone`, a command-line interface
(CLI) for interacting with the FiftyOne tool. This utility provides access to
many useful features, including creating and inspecting datasets, visualizing
datasets in the dashboard, exporting datasets and converting dataset formats,
and downloading datasets from the FiftyOne Dataset Zoo.

This document provides an overview of using the CLI.

## Quickstart

To see the available top-level commands, type `fiftyone --help`.

You can learn more about any available subcommand via
`fiftyone <command> --help`.

For example, to see your current FiftyOne config, you can execute
`fiftyone config`.

## Tab completion

To enable tab completion in `bash`, add the following line to your `~/.bashrc`:

```shell
eval "$(register-python-argcomplete fiftyone)"
```

To enable tab completion in `zsh`, add these lines to your `~/.zshrc`:

```shell
autoload bashcompinit
bashcompinit
eval "$(register-python-argcomplete fiftyone)"
```

To enable tab completion in `tcsh`, add these lines to your `~/.tcshrc`:

```shell
eval `register-python-argcomplete --shell tcsh fiftyone`
```

## Usage

The following usage information was generated via `fiftyone --all-help`:

```
*******************************************************************************
usage: fiftyone [-h] [-v] [--all-help]
                {config,constants,convert,datasets,dashboard,zoo} ...

FiftyOne command-line interface.

optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show version info
  --all-help            show help recurisvely and exit

available commands:
  {config,constants,convert,datasets,dashboard,zoo}
    config              Tools for working with your FiftyOne config.
    constants           Print constants from `fiftyone.constants`.
    convert             Tools for converting datasets on disk into different
                        formats.
    datasets            Tools for working with FiftyOne datasets.
    dashboard           Tools for working with the FiftyOne Dashboard.
    zoo                 Tools for working with the FiftyOne Dataset Zoo.


*******************************************************************************
usage: fiftyone config [-h] [-l] [-s] [FIELD]

Tools for working with your FiftyOne config.

    Examples::

        # Print your entire config
        fiftyone config

        # Print a specific config field
        fiftyone config <field>

        # Print the location of your config
        fiftyone config --locate

        # Save your current config to disk
        fiftyone config --save

positional arguments:
  FIELD         a config field

optional arguments:
  -h, --help    show this help message and exit
  -l, --locate  print the location of your config on disk
  -s, --save    save your current config to disk


*******************************************************************************
usage: fiftyone constants [-h] [CONSTANT]

Print constants from `fiftyone.constants`.

    Examples::

        # Print all constants
        fiftyone constants

        # Print a specific constant
        fiftyone constants <CONSTANT>

positional arguments:
  CONSTANT    the constant to print

optional arguments:
  -h, --help  show this help message and exit


*******************************************************************************
usage: fiftyone convert [-h] [--input-dir INPUT_DIR] [--input-type INPUT_TYPE]
                        [--output-dir OUTPUT_DIR] [--output-type OUTPUT_TYPE]

Tools for converting datasets on disk into different formats.

    Examples::

        # Converts an image classification directory tree to TFRecords format
        fiftyone convert \
            --input-dir /path/to/image-classification-directory-tree \
            --input-type fiftyone.types.ImageClassificationDirectoryTree \
            --output-dir /path/for/tf-image-classification-dataset \
            --output-type fiftyone.types.TFImageClassificationDataset

        # Converts a COCO detection dataset to CVAT image format
        fiftyone convert \
            --input-dir /path/to/coco-detection-dataset \
            --input-type fiftyone.types.COCODetectionDataset \
            --output-dir /path/for/cvat-image-dataset \
            --output-type fiftyone.types.CVATImageDataset

optional arguments:
  -h, --help            show this help message and exit
  --input-dir INPUT_DIR
                        the directory containing the dataset
  --input-type INPUT_TYPE
                        the type of the input dataset (a subclass of `fiftyone.types.BaseDataset`)
  --output-dir OUTPUT_DIR
                        the directory to which to write the output dataset
  --output-type OUTPUT_TYPE
                        the desired output dataset type (a subclass of `fiftyone.types.BaseDataset`)


*******************************************************************************
usage: fiftyone datasets [-h] [--all-help]
                         {list,info,create,head,tail,stream,export,delete} ...

Tools for working with FiftyOne datasets.

optional arguments:
  -h, --help            show this help message and exit
  --all-help            show help recurisvely and exit

available commands:
  {list,info,create,head,tail,stream,export,delete}
    list                List FiftyOne datasets.
    info                Print information about FiftyOne datasets.
    create              Tools for creating FiftyOne datasets.
    head                Prints the first few samples in a FiftyOne dataset.
    tail                Prints the last few samples in a FiftyOne dataset.
    stream              Streams the samples in a FiftyOne dataset.
    export              Tools for exporting FiftyOne datasets.
    delete              Tools for deleting FiftyOne datasets.


*******************************************************************************
usage: fiftyone datasets list [-h]

List FiftyOne datasets.

    Examples::

        # List available datasets
        fiftyone datasets list

optional arguments:
  -h, --help  show this help message and exit


*******************************************************************************
usage: fiftyone datasets info [-h] NAME

Print information about FiftyOne datasets.

    Examples::

        # Print information about the given dataset
        fiftyone datasets info <name>

positional arguments:
  NAME        the name of the dataset

optional arguments:
  -h, --help  show this help message and exit


*******************************************************************************
usage: fiftyone datasets create [-h] [-n NAME] [-d DATASET_DIR] [-j JSON_PATH]
                                [-t TYPE]

Tools for creating FiftyOne datasets.

    Examples::

        # Creates a dataset from the given data on disk
        fiftyone datasets create \
            --name <name> --dataset-dir <dataset-dir> --type <type>

        # Creates a dataset from the given samples JSON file
        fiftyone datasets create --json-path <json-path>

optional arguments:
  -h, --help            show this help message and exit
  -n NAME, --name NAME  a name for the dataset
  -d DATASET_DIR, --dataset-dir DATASET_DIR
                        the directory containing the dataset
  -j JSON_PATH, --json-path JSON_PATH
                        the path to a samples JSON file to load
  -t TYPE, --type TYPE  the type of the dataset (a subclass of `fiftyone.types.BaseDataset`)


*******************************************************************************
usage: fiftyone datasets head [-h] [-n NUM_SAMPLES] NAME

Prints the first few samples in a FiftyOne dataset.

    Examples::

        # Prints the first few samples in a dataset
        fiftyone datasets head <name>

        # Prints the given number of samples from the head of a dataset
        fiftyone datasets head <name> --num-samples <num-samples>

positional arguments:
  NAME                  the name of the dataset

optional arguments:
  -h, --help            show this help message and exit
  -n NUM_SAMPLES, --num-samples NUM_SAMPLES
                        the number of samples to print


*******************************************************************************
usage: fiftyone datasets tail [-h] [-n NUM_SAMPLES] NAME

Prints the last few samples in a FiftyOne dataset.

    Examples::

        # Prints the last few samples in a dataset
        fiftyone datasets tail <name>

        # Prints the given number of samples from the tail of a dataset
        fiftyone datasets tail <name> --num-samples <num-samples>

positional arguments:
  NAME                  the name of the dataset

optional arguments:
  -h, --help            show this help message and exit
  -n NUM_SAMPLES, --num-samples NUM_SAMPLES
                        the number of samples to print


*******************************************************************************
usage: fiftyone datasets stream [-h] NAME

Streams the samples in a FiftyOne dataset.

    Examples::

        # Stream the samples of the dataset
        fiftyone datasets stream <name>

positional arguments:
  NAME        the name of the dataset

optional arguments:
  -h, --help  show this help message and exit


*******************************************************************************
usage: fiftyone datasets export [-h] [-d EXPORT_DIR] [-j JSON_PATH]
                                [-f LABEL_FIELD] [-t TYPE]
                                NAME

Tools for exporting FiftyOne datasets.

    Examples::

        # Exports the dataset with the given type
        fiftyone datasets export <name> \
            --export-dir <export-dir> --type <type> --label-field <label-field>

        # Exports the dataset in JSON format
        fiftyone datasets export <name> --json-path <json-path>

positional arguments:
  NAME                  the name of the dataset to export

optional arguments:
  -h, --help            show this help message and exit
  -d EXPORT_DIR, --export-dir EXPORT_DIR
                        the directory in which to export the dataset
  -j JSON_PATH, --json-path JSON_PATH
                        the path to export the dataset in JSON format
  -f LABEL_FIELD, --label-field LABEL_FIELD
                        the name of the label field to export
  -t TYPE, --type TYPE  the format in which to export the dataset (a subclass of `fiftyone.types.BaseDataset`)


*******************************************************************************
usage: fiftyone datasets delete [-h] NAME

Tools for deleting FiftyOne datasets.

    Examples::

        # Delete the dataset with the given name
        fiftyone datasets delete <name>

positional arguments:
  NAME        the name of the dataset

optional arguments:
  -h, --help  show this help message and exit


*******************************************************************************
usage: fiftyone dashboard [-h] [--all-help] {launch,view,connect} ...

Tools for working with the FiftyOne Dashboard.

optional arguments:
  -h, --help            show this help message and exit
  --all-help            show help recurisvely and exit

available commands:
  {launch,view,connect}
    launch              Launch the FiftyOne Dashboard.
    view                View datasets in the FiftyOne Dashboard without persisting them to the
    connect             Connect to a remote FiftyOne Dashboard.


*******************************************************************************
usage: fiftyone dashboard launch [-h] [-p PORT] [-r] NAME

Launch the FiftyOne Dashboard.

    Examples::

        # Launches the dashboard with the given dataset
        fiftyone dashboard launch <name>

        # Launches a remote dashboard session
        fiftyone dashboard launch <name> --remote

positional arguments:
  NAME                  the name of the dataset to open

optional arguments:
  -h, --help            show this help message and exit
  -p PORT, --port PORT  the port number to use
  -r, --remote          whether to launch a remote dashboard session


*******************************************************************************
usage: fiftyone dashboard view [-h] [-n NAME] [-d DATASET_DIR] [-t TYPE]
                               [-z NAME] [-s SPLITS [SPLITS ...]]
                               [-j JSON_PATH] [-p PORT] [-r]

View datasets in the FiftyOne Dashboard without persisting them to the
    database.

    Examples::

        # View a dataset stored on disk in the dashboard
        fiftyone dashboard view --dataset-dir <dataset-dir> --type <type>

        # View a zoo dataset in the dashboard
        fiftyone dashboard view --zoo-dataset <name> --splits <split1> ...

        # View a dataset stored in JSON format on disk in the dashboard
        fiftyone dashboard view --json-path <json-path>

        # View the dataset in a remote dashboard session
        fiftyone dashboard view ... --remote

optional arguments:
  -h, --help            show this help message and exit
  -n NAME, --name NAME  a name for the dataset
  -d DATASET_DIR, --dataset-dir DATASET_DIR
                        the directory containing the dataset to view
  -t TYPE, --type TYPE  the dataset type (a subclass of `fiftyone.types.BaseDataset`)
  -z NAME, --zoo-dataset NAME
                        the name of a zoo dataset to view
  -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                        the dataset splits to load
  -j JSON_PATH, --json-path JSON_PATH
                        the path to a samples JSON file to view
  -p PORT, --port PORT  the port number to use
  -r, --remote          whether to launch a remote dashboard session


*******************************************************************************
usage: fiftyone dashboard connect [-h] [-d DESTINATION] [-p PORT]

Connect to a remote FiftyOne Dashboard.

    Examples::

        # Connect to a remote dashboard with port forwarding already configured
        fiftyone dashboard connect

        # Connects to a remote dashboard session
        fiftyone dashboard connect --destination <destination> --port <port>

optional arguments:
  -h, --help            show this help message and exit
  -d DESTINATION, --destination DESTINATION
                        the destination to connect to, e.g., [username@]hostname
  -p PORT, --port PORT  the remote port to connect to


*******************************************************************************
usage: fiftyone zoo [-h] [--all-help] {list,info,download,load} ...

Tools for working with the FiftyOne Dataset Zoo.

optional arguments:
  -h, --help            show this help message and exit
  --all-help            show help recurisvely and exit

available commands:
  {list,info,download,load}
    list                Listi datasets in the FiftyOne Dataset Zoo.
    info                Print information about downloaded zoo datasets.
    download            Download zoo datasets.
    load                Load zoo datasets as persistent FiftyOne datasets.


*******************************************************************************
usage: fiftyone zoo list [-h] [-b BASE_DIR]

Listi datasets in the FiftyOne Dataset Zoo.

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


*******************************************************************************
usage: fiftyone zoo info [-h] [-b BASE_DIR] NAME

Print information about downloaded zoo datasets.

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


*******************************************************************************
usage: fiftyone zoo download [-h] [-s SPLITS [SPLITS ...]] [-d DATASET_DIR]
                             NAME

Download zoo datasets.

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


*******************************************************************************
usage: fiftyone zoo load [-h] [-s SPLITS [SPLITS ...]] [-d DATASET_DIR] NAME

Load zoo datasets as persistent FiftyOne datasets.

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
