FiftyOne Command-Line Interface (CLI)
=====================================

.. default-role:: code

Installing FiftyOne automatically installs `fiftyone`, a command-line interface
(CLI) for interacting with FiftyOne. This utility provides access to many
useful features, including creating and inspecting datasets, visualizing
datasets in the App, exporting datasets and converting dataset formats,
and downloading datasets from the FiftyOne Dataset Zoo.

Quickstart
----------

To see the available top-level commands, type:

.. code-block:: text

    fiftyone --help

You can learn more about any available subcommand via:

.. code-block:: text

    fiftyone <command> --help

For example, to see your current FiftyOne config, you can execute
`fiftyone config`.

Tab completion
~~~~~~~~~~~~~~

To enable tab completion in `bash`, add the following line to your `~/.bashrc`:

.. code-block:: shell

    eval "$(register-python-argcomplete fiftyone)"

To enable tab completion in `zsh`, add these lines to your `~/.zshrc`:

.. code-block:: shell

    autoload bashcompinit
    bashcompinit
    eval "$(register-python-argcomplete fiftyone)"

To enable tab completion in `tcsh`, add these lines to your `~/.tcshrc`:

.. code-block:: shell

    eval `register-python-argcomplete --shell tcsh fiftyone`

FiftyOne CLI
------------

The FiftyOne command-line interface.

.. code-block:: text

    fiftyone [-h] [-v] [--all-help] {quickstart,config,constants,convert,datasets,app,zoo} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -v, --version         show version info
      --all-help            show help recurisvely and exit

    available commands:
      {config,constants,convert,datasets,app,zoo}
        quickstart          Launch a FiftyOne quickstart.
        config              Tools for working with your FiftyOne config.
        constants           Print constants from `fiftyone.constants`.
        convert             Convert datasets on disk between supported formats.
        datasets            Tools for working with FiftyOne datasets.
        app                 Tools for working with the FiftyOne App.
        zoo                 Tools for working with the FiftyOne Dataset Zoo.

.. _cli-fiftyone-quickstart:

FiftyOne quickstart
-------------------

Launch a FiftyOne quickstart.

.. code-block:: text

    fiftyone quickstart [-h]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help    show this help message and exit

**Examples**

.. code:: shell

    # Launch the quickstart
    fiftyone quickstart

.. _cli-fiftyone-config:

FiftyOne config
---------------

Tools for working with your FiftyOne config.

.. code-block:: text

    fiftyone config [-h] [-l] [FIELD]

**Arguments**

.. code-block:: text

    positional arguments:
      FIELD         a config field to print

    optional arguments:
      -h, --help    show this help message and exit
      -l, --locate  print the location of your config on disk

**Examples**

.. code:: shell

    # Print your entire config
    fiftyone config

.. code:: shell

    # Print a specific config field
    fiftyone config <field>

.. code:: shell

    # Print the location of your config
    fiftyone config --locate

.. _cli-fiftyone-constants:

Print constants
---------------

Print constants from `fiftyone.constants`.

.. code-block:: text

    fiftyone constants [-h] [CONSTANT]

**Arguments**

.. code-block:: text

    positional arguments:
      CONSTANT    the constant to print

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Print all constants
    fiftyone constants

.. code-block:: shell

    # Print a specific constant
    fiftyone constants <CONSTANT>

.. _cli-fiftyone-convert:

Convert dataset formats
-----------------------

Convert datasets on disk between supported formats.

.. code-block:: text

    fiftyone convert [-h] [--input-dir INPUT_DIR] [--input-type INPUT_TYPE]
                     [--output-dir OUTPUT_DIR] [--output-type OUTPUT_TYPE]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --input-dir INPUT_DIR
                            the directory containing the dataset
      --input-type INPUT_TYPE
                            the fiftyone.types.Dataset type of the input dataset
      --output-dir OUTPUT_DIR
                            the directory to which to write the output dataset
      --output-type OUTPUT_TYPE
                            the fiftyone.types.Dataset type to output

**Examples**

.. code-block:: shell

    # Convert an image classification directory tree to TFRecords format
    fiftyone convert \
        --input-dir /path/to/image-classification-directory-tree \
        --input-type fiftyone.types.ImageClassificationDirectoryTree \
        --output-dir /path/for/tf-image-classification-dataset \
        --output-type fiftyone.types.TFImageClassificationDataset

.. code-block:: shell

    # Convert a COCO detection dataset to CVAT image format
    fiftyone convert \
        --input-dir /path/to/coco-detection-dataset \
        --input-type fiftyone.types.COCODetectionDataset \
        --output-dir /path/for/cvat-image-dataset \
        --output-type fiftyone.types.CVATImageDataset

.. _cli-fiftyone-datasets:

FiftyOne datasets
-----------------

Tools for working with FiftyOne datasets.

.. code-block:: text

    fiftyone datasets [-h] [--all-help]
                      {list,info,create,head,tail,stream,export,delete} ...

**Arguments**

.. code-block:: text

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
        export              Export FiftyOne datasets to disk in supported formats.
        draw                Writes annotated versions of samples in FiftyOne datasets to disk.
        rename              Rename FiftyOne datasets.
        delete              Delete FiftyOne datasets.

.. _cli-fiftyone-datasets-list:

List datasets
~~~~~~~~~~~~~

List FiftyOne datasets.

.. code-block:: text

    fiftyone datasets list [-h]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # List available datasets
    fiftyone datasets list

.. _cli-fiftyone-datasets-info:

Print dataset information
~~~~~~~~~~~~~~~~~~~~~~~~~

Print information about FiftyOne datasets.

.. code-block:: text

    fiftyone datasets info [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the dataset

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Print information about the given dataset
    fiftyone datasets info <name>

.. _cli-fiftyone-datasets-create:

Create datasets
~~~~~~~~~~~~~~~

Tools for creating FiftyOne datasets.

.. code-block:: text

    fiftyone datasets create [-h] [-n NAME] [-d DATASET_DIR] [-j JSON_PATH] [-t TYPE]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -n NAME, --name NAME  a name for the dataset
      -d DATASET_DIR, --dataset-dir DATASET_DIR
                            the directory containing the dataset
      -j JSON_PATH, --json-path JSON_PATH
                            the path to a samples JSON file to load
      -t TYPE, --type TYPE  the fiftyone.types.Dataset type of the dataset

**Examples**

.. code-block:: shell

    # Create a dataset from the given data on disk
    fiftyone datasets create \
        --name <name> --dataset-dir <dataset-dir> --type <type>

.. code:: shell

    # Create a dataset from the given samples JSON file
    fiftyone datasets create --json-path <json-path>

.. _cli-fiftyone-datasets-head:

Print dataset head
~~~~~~~~~~~~~~~~~~

Prints the first few samples in a FiftyOne dataset.

.. code-block:: text

    fiftyone datasets head [-h] [-n NUM_SAMPLES] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -n NUM_SAMPLES, --num-samples NUM_SAMPLES
                            the number of samples to print

**Examples**

.. code-block:: shell

    # Prints the first few samples in a dataset
    fiftyone datasets head <name>

.. code-block:: shell

    # Prints the given number of samples from the head of a dataset
    fiftyone datasets head <name> --num-samples <num-samples>

.. _cli-fiftyone-datasets-tail:

Print dataset tail
~~~~~~~~~~~~~~~~~~

Prints the last few samples in a FiftyOne dataset.

.. code-block:: text

    fiftyone datasets tail [-h] [-n NUM_SAMPLES] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -n NUM_SAMPLES, --num-samples NUM_SAMPLES
                            the number of samples to print

**Examples**

.. code-block:: shell

    # Print the last few samples in a dataset
    fiftyone datasets tail <name>

.. code-block:: shell

    # Print the given number of samples from the tail of a dataset
    fiftyone datasets tail <name> --num-samples <num-samples>

.. _cli-fiftyone-datasets-stream:

Stream samples to the terminal
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Stream samples in a FiftyOne dataset to the terminal.

.. code-block:: text

    fiftyone datasets stream [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the dataset

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Stream the samples of the dataset to the terminal
    fiftyone datasets stream <name>

.. _cli-fiftyone-datasets-export:

Export datasets
~~~~~~~~~~~~~~~

Export FiftyOne datasets to disk in supported formats.

.. code-block:: text

    fiftyone datasets export [-h] [-d EXPORT_DIR] [-j JSON_PATH] [-f LABEL_FIELD]
                             [-t TYPE] NAME

**Arguments**

.. code-block:: text

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
      -t TYPE, --type TYPE  the fiftyone.types.Dataset type in which to export

**Examples**

.. code-block:: shell

    # Export the dataset to disk in the specified format
    fiftyone datasets export <name> \
        --export-dir <export-dir> --type <type> --label-field <label-field>

.. code:: shell

    # Export the dataset to disk in JSON format
    fiftyone datasets export <name> --json-path <json-path>

.. _cli-fiftyone-datasets-draw:

Drawing labels on samples
~~~~~~~~~~~~~~~~~~~~~~~~~

Writes annotated versions of samples in FiftyOne datasets to disk.

.. code-block:: text

    fiftyone datasets draw [-h] [-d ANNO_DIR] [-f LABEL_FIELDs] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset to annotate

    optional arguments:
      -h, --help            show this help message and exit
      -d ANNO_DIR, --anno-dir ANNO_DIR
                            the directory in which to write the annotated data
      -f LABEL_FIELDs, --label-fields LABEL_FIELDs
                            a comma-separated list of label fields to export

**Examples**

.. code-block:: shell

    # Write annotated versions of the samples in the dataset with the
    # specified labels overlaid to disk
    fiftyone datasets draw <name> \
        --anno-dir <anno-dir> --label-fields <label-fields>

.. _cli-fiftyone-datasets-rename:

Rename datasets
~~~~~~~~~~~~~~~

Rename FiftyOne datasets.

.. code-block:: text

    fiftyone datasets rename [-h] NAME NEW_NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the dataset
      NEW_NAME    a new name for the dataset

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Rename the dataset
    fiftyone datasets rename <old-name> <new-name>

.. _cli-fiftyone-datasets-delete:

Delete datasets
~~~~~~~~~~~~~~~

Delete FiftyOne datasets.

.. code-block:: text

    fiftyone datasets delete [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the dataset

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Delete the dataset with the given name
    fiftyone datasets delete <name>

.. _cli-fiftyone-app:

FiftyOne App
------------

Tools for working with the FiftyOne App.

.. code-block:: text

    fiftyone app [-h] [--all-help] {launch,view,connect} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {launch,view,connect}
        launch              Launch the FiftyOne App.
        view                View datasets in the App without persisting them to the database
        connect             Connect to a remote FiftyOne App.

.. _cli-fiftyone-app-launch:

Launch the App
~~~~~~~~~~~~~~

Launch the FiftyOne App.

.. code-block:: text

    fiftyone app launch [-h] [-p PORT] [-r] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset to open

    optional arguments:
      -h, --help            show this help message and exit
      -p PORT, --port PORT  the port number to use
      -r, --remote          whether to launch a remote App session

**Examples**

.. code-block:: shell

    # Launch the App with the given dataset
    fiftyone app launch <name>

.. code-block:: shell

    # Launch a remote App session
    fiftyone app launch <name> --remote

.. _cli-fiftyone-app-view:

View datasets in App
~~~~~~~~~~~~~~~~~~~~

View datasets in the FiftyOne App without persisting them to the database.

.. code-block:: text

    fiftyone app view [-h] [-n NAME] [-d DATASET_DIR] [-t TYPE] [-z NAME]
                      [-s SPLITS [SPLITS ...]] [--images-dir IMAGES_DIR]
                      [--images-patt IMAGES_PATT] [-j JSON_PATH] [-p PORT]
                      [-r]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -n NAME, --name NAME  a name for the dataset
      -d DATASET_DIR, --dataset-dir DATASET_DIR
                            the directory containing the dataset to view
      -t TYPE, --type TYPE  the fiftyone.types.Dataset type of the dataset
      -z NAME, --zoo-dataset NAME
                            the name of a zoo dataset to view
      -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                            the dataset splits to load
      --images-dir IMAGES_DIR
                            the path to a directory of images
      --images-patt IMAGES_PATT
                            a glob pattern of images
      -j JSON_PATH, --json-path JSON_PATH
                            the path to a samples JSON file to view
      -p PORT, --port PORT  the port number to use
      -r, --remote          whether to launch a remote app session

**Examples**

.. code-block:: shell

    # View a dataset stored on disk in the App
    fiftyone app view --dataset-dir <dataset-dir> --type <type>

.. code-block:: shell

    # View a zoo dataset in the App
    fiftyone app view --zoo-dataset <name> --splits <split1> ...

.. code-block:: shell

    # View a directory of images in the app
    fiftyone app view --images-dir <images-dir>

.. code-block:: shell

    # View a glob pattern of images in the app
    fiftyone app view --images-patt <images-patt>

.. code-block:: shell

    # View a dataset stored in JSON format on disk in the App
    fiftyone app view --json-path <json-path>

.. code-block:: shell

    # View the dataset in a remote App session
    fiftyone app view ... --remote

.. _cli-fiftyone-app-connect:

Connect to remote App
~~~~~~~~~~~~~~~~~~~~~

Connect to a remote FiftyOne App.

.. code-block:: text

    fiftyone app connect [-h] [-d DESTINATION] [-p PORT]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -d DESTINATION, --destination DESTINATION
                            the destination to connect to, e.g., [username@]hostname
      -p PORT, --port PORT  the remote port to connect to

**Examples**

.. code-block:: shell

    # Connect to a remote App with port forwarding already configured
    fiftyone app connect

.. code-block:: shell

    # Connect to a remote App session
    fiftyone app connect --destination <destination> --port <port>

.. _cli-fiftyone-zoo:

FiftyOne Dataset Zoo
--------------------

Tools for working with the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo [-h] [--all-help] {list,find,info,download,load} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recurisvely and exit

    available commands:
      {list,find,info,download,load}
        list                List datasets in the FiftyOne Dataset Zoo.
        find                Locate the downloaded zoo dataset on disk.
        info                Print information about downloaded zoo datasets.
        download            Download zoo datasets.
        load                Load zoo datasets as persistent FiftyOne datasets.

.. _cli-fiftyone-zoo-list:

List datasets in zoo
~~~~~~~~~~~~~~~~~~~~

List datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo list [-h] [-b BASE_DIR]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -b BASE_DIR, --base-dir BASE_DIR
                            a custom base directory in which to search for downloaded datasets

**Examples**

.. code-block:: shell

    # List available datasets
    fiftyone zoo list

.. code-block:: shell

    # List available datasets, using the specified base directory to search for downloaded datasets
    fiftyone zoo list --base-dir <base-dir>

.. _cli-fiftyone-zoo-find:

Find zoo datasets on disk
~~~~~~~~~~~~~~~~~~~~~~~~~

Locate the downloaded zoo dataset on disk.

.. code-block:: text

    fiftyone zoo find [-h] [-s SPLIT] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLIT, --split SPLIT

**Examples**

.. code-block:: shell

    # Print the location of the downloaded zoo dataset on disk
    fiftyone zoo find <name>

    # Print the location of a specific split of the dataset
    fiftyone zoo find <name> --split <split>

.. _cli-fiftyone-zoo-info:

Show zoo dataset info
~~~~~~~~~~~~~~~~~~~~~

Print information about datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo info [-h] [-b BASE_DIR] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -b BASE_DIR, --base-dir BASE_DIR
                            a custom base directory in which to search for downloaded datasets

**Examples**

.. code-block:: shell

    # Print information about a downloaded zoo dataset
    fiftyone zoo info <name>

.. code-block:: shell

    # Print information about the zoo dataset downloaded to the specified base directory
    fiftyone zoo info <name> --base-dir <base-dir>

.. _cli-fiftyone-zoo-download:

Download zoo datasets
~~~~~~~~~~~~~~~~~~~~~

Download datasets from the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo download [-h] [-s SPLITS [SPLITS ...]] [-d DATASET_DIR] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                            the dataset splits to download
      -d DATASET_DIR, --dataset-dir DATASET_DIR
                            a custom directory to which to download the dataset

**Examples**

.. code-block:: shell

    # Download the entire zoo dataset
    fiftyone zoo download <name>

.. code-block:: shell

    # Download the specified split(s) of the zoo dataset
    fiftyone zoo download <name> --splits <split1> ...

.. code-block:: shell

    # Download to the zoo dataset to a custom directory
    fiftyone zoo download <name> --dataset-dir <dataset-dir>

.. _cli-fiftyone-zoo-load:

Load zoo datasets
~~~~~~~~~~~~~~~~~

Load zoo datasets as persistent FiftyOne datasets.

.. code-block:: text

    fiftyone zoo load [-h] [-s SPLITS [SPLITS ...]] [-n DATASET_NAME]
                         [-d DATASET_DIR]
                         NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                            the dataset splits to load
      -n DATASET_NAME, --dataset-name DATASET_NAME
                        a custom name to give the FiftyOne dataset
      -d DATASET_DIR, --dataset-dir DATASET_DIR
                            a custom directory in which the dataset is downloaded

**Examples**

.. code-block:: shell

    # Load the zoo dataset with the given name
    fiftyone zoo load <name>

.. code-block:: shell

    # Load the specified split(s) of the zoo dataset
    fiftyone zoo load <name> --splits <split1> ...

.. code-block:: shell

    # Load the zoo dataset with a custom name
    fiftyone zoo load <name> --dataset-name <dataset-name>

.. code-block:: shell

    # Load the zoo dataset from a custom directory
    fiftyone zoo load <name> --dataset-dir <dataset-dir>
