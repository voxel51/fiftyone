.. _fiftyone-cli:

FiftyOne Command-Line Interface (CLI)
=====================================

.. default-role:: code

Installing FiftyOne automatically installs `fiftyone`, a command-line interface
(CLI) for interacting with FiftyOne. This utility provides access to many
useful features, including creating and inspecting datasets, visualizing
datasets in the App, exporting datasets and converting dataset formats,
and downloading datasets from the FiftyOne Dataset Zoo.

.. _cli-quickstart:

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

.. _cli-fiftyone-main:

FiftyOne CLI
------------

The FiftyOne command-line interface.

.. code-block:: text

    fiftyone [-h] [-v] [--all-help]
             {quickstart,annotation,brain,evaluation,app,config,constants,convert,datasets,migrate,operators,delegated,plugins,utils,zoo}
             ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -v, --version         show version info
      --all-help            show help recursively and exit

    available commands:
      {quickstart,annotation,brain,evaluation,app,config,constants,convert,datasets,migrate,operators,delegated,plugins,utils,zoo}
        quickstart          Launch a FiftyOne quickstart.
        annotation          Tools for working with the FiftyOne annotation API.
        brain               Tools for working with the FiftyOne Brain.
        evaluation          Tools for working with the FiftyOne evaluation API.
        app                 Tools for working with the FiftyOne App.
        config              Tools for working with your FiftyOne config.
        constants           Print constants from `fiftyone.constants`.
        convert             Convert datasets on disk between supported formats.
        datasets            Tools for working with FiftyOne datasets.
        migrate             Tools for migrating the FiftyOne database.
        operators           Tools for working with FiftyOne operators.
        delegated           Tools for working with FiftyOne delegated operations.
        plugins             Tools for working with FiftyOne plugins.
        utils               FiftyOne utilities.
        zoo                 Tools for working with the FiftyOne Zoo.

.. _cli-fiftyone-quickstart:

FiftyOne quickstart
-------------------

Launch a FiftyOne quickstart.

.. code-block:: text

    fiftyone quickstart [-h] [-v] [-p PORT] [-A ADDRESS] [-r] [-a] [-w WAIT]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -v, --video           launch the quickstart with a video dataset
      -p PORT, --port PORT  the port number to use
      -A ADDRESS, --address ADDRESS
                            the address (server name) to use
      -r, --remote          whether to launch a remote App session
      -w WAIT, --wait WAIT  the number of seconds to wait for a new App
                            connection before returning if all connections are
                            lost. If negative, the process will wait forever,
                            regardless of connections

**Examples**

.. code-block:: shell

    # Launch the quickstart
    fiftyone quickstart

.. code-block:: shell

    # Launch the quickstart with a video dataset
    fiftyone quickstart --video

.. code-block:: shell

    # Launch the quickstart as a remote session
    fiftyone quickstart --remote

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

.. code-block:: shell

    # Print your entire config
    fiftyone config

.. code-block:: shell

    # Print a specific config field
    fiftyone config <field>

.. code-block:: shell

    # Print the location of your config on disk (if one exists)
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

    fiftyone convert [-h] --input-type INPUT_TYPE --output-type OUTPUT_TYPE
                     [--input-dir INPUT_DIR]
                     [--input-kwargs KEY=VAL [KEY=VAL ...]]
                     [--output-dir OUTPUT_DIR]
                     [--output-kwargs KEY=VAL [KEY=VAL ...]] [-o]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --input-dir INPUT_DIR
                            the directory containing the dataset
      --input-kwargs KEY=VAL [KEY=VAL ...]
                            additional keyword arguments for
                            `fiftyone.utils.data.convert_dataset(..., input_kwargs=)`
      --output-dir OUTPUT_DIR
                            the directory to which to write the output dataset
      --output-kwargs KEY=VAL [KEY=VAL ...]
                            additional keyword arguments for
                            `fiftyone.utils.data.convert_dataset(..., output_kwargs=)`
      -o, --overwrite       whether to overwrite an existing output directory

    required arguments:
      --input-type INPUT_TYPE
                            the fiftyone.types.Dataset type of the input dataset
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

.. code-block:: shell

    # Perform a customized conversion via optional kwargs
    fiftyone convert \
        --input-dir /path/to/coco-detection-dataset \
        --input-type fiftyone.types.COCODetectionDataset \
        --input-kwargs max_samples=100 shuffle=True \
        --output-dir /path/for/cvat-image-dataset \
        --output-type fiftyone.types.TFObjectDetectionDataset \
        --output-kwargs force_rgb=True \
        --overwrite

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
      --all-help            show help recursively and exit

    available commands:
      {list,info,create,head,tail,stream,export,delete}
        list                List FiftyOne datasets.
        info                Print information about FiftyOne datasets.
        stats               Print stats about FiftyOne datasets on disk.
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

    fiftyone datasets list [-h] [-p PATT] [-t TAG [TAG ...]]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help        show this help message and exit
      -p PATT, --glob-patt PATT
                        an optional glob pattern of dataset names to include
      -t TAG [TAG ...], --tags TAG [TAG ...]
                        only show datasets with the given tag(s)

**Examples**

.. code-block:: shell

    # List available datasets
    fiftyone datasets list

.. code-block:: shell

    # List datasets matching a given pattern
    fiftyone datasets list --glob-patt 'quickstart-*'

.. code-block:: shell

    # List datasets with the given tag(s)
    fiftyone datasets list --tags automotive healthcare

.. _cli-fiftyone-datasets-info:

Print dataset information
~~~~~~~~~~~~~~~~~~~~~~~~~

Print information about FiftyOne datasets.

.. code-block:: text

    fiftyone datasets info [-h] [-p PATT] [-t TAG [TAG ...]] [-s FIELD] [-r] [NAME]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of a dataset

    optional arguments:
      -h, --help            show this help message and exit
      -p PATT, --glob-patt PATT
                            an optional glob pattern of dataset names to include
      -t TAG [TAG ...], --tags TAG [TAG ...]
                            only show datasets with the given tag(s)
      -s FIELD, --sort-by FIELD
                            a field to sort the dataset rows by
      -r, --reverse         whether to print the results in reverse order

**Examples**

.. code-block:: shell

    # Print basic information about multiple datasets
    fiftyone datasets info
    fiftyone datasets info --glob-patt 'quickstart-*'
    fiftyone datasets info --tags automotive healthcare
    fiftyone datasets info --sort-by created_at
    fiftyone datasets info --sort-by name --reverse

.. code-block:: shell

    # Print information about a specific dataset
    fiftyone datasets info <name>

.. _cli-fiftyone-datasets-stats:

Print dataset stats
~~~~~~~~~~~~~~~~~~~

Print stats about FiftyOne datasets on disk.

.. code-block:: text

    fiftyone datasets stats [-h] [-m] [-c] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                 the name of the dataset

    optional arguments:
      -h, --help           show this help message and exit
      -m, --include-media  whether to include stats about the size of the raw
                           media in the dataset
      -c, --compressed     whether to return the sizes of collections in their
                           compressed form on disk

**Examples**

.. code-block:: shell

    # Print stats about the given dataset on disk
    fiftyone datasets stats <name>

.. _cli-fiftyone-datasets-create:

Create datasets
~~~~~~~~~~~~~~~

Tools for creating FiftyOne datasets.

.. code-block:: text

    fiftyone datasets create [-h] [-n NAME] [-d DATASET_DIR] [-j JSON_PATH]
                             [-t TYPE] [-k KEY=VAL [KEY=VAL ...]]

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
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            additional type-specific keyword arguments for
                            `fiftyone.core.dataset.Dataset.from_dir()`

**Examples**

.. code-block:: shell

    # Create a dataset from the given data on disk
    fiftyone datasets create \
        --name <name> --dataset-dir <dataset-dir> --type <type>

.. code-block:: shell

    # Create a dataset from a random subset of the data on disk
    fiftyone datasets create \
        --name <name> --dataset-dir <dataset-dir> --type <type> \
        --kwargs max_samples=50 shuffle=True

.. code-block:: shell

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

    fiftyone datasets export [-h] [-d EXPORT_DIR] [-j JSON_PATH]
                             [-f LABEL_FIELD] [-t TYPE]
                             [--filters KEY=VAL [KEY=VAL ...]]
                             [-k KEY=VAL [KEY=VAL ...]]
                             NAME

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
      --filters KEY=VAL [KEY=VAL ...]
                            specific sample tags or class labels to export. To
                            use sample tags, pass tags as `tags=train,val` and
                            to use label filters, pass label field and values
                            as in ground_truth=car,person,dog
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            additional type-specific keyword arguments for
                            `fiftyone.core.collections.SampleCollection.export()`

**Examples**

.. code-block:: shell

    # Export the dataset to disk in the specified format
    fiftyone datasets export <name> \
        --export-dir <export-dir> --type <type> --label-field <label-field>

.. code-block:: shell

    # Export the dataset to disk in JSON format
    fiftyone datasets export <name> --json-path <json-path>

.. code-block:: shell

    # Only export cats and dogs from the validation split
    fiftyone datasets export <name> \\
        --filters tags=validation ground_truth=cat,dog \\
        --export-dir <export-dir> --type <type> --label-field ground_truth

.. code-block:: shell

    # Perform a customized export of a dataset
    fiftyone datasets export <name> \
        --type <type> \
        --kwargs labels_path=/path/for/labels.json

.. _cli-fiftyone-datasets-draw:

Drawing labels on samples
~~~~~~~~~~~~~~~~~~~~~~~~~

Renders annotated versions of samples in FiftyOne datasets to disk.

.. code-block:: text

    fiftyone datasets draw [-h] [-d OUTPUT_DIR] [-f LABEL_FIELDS] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -d OUTPUT_DIR, --output-dir OUTPUT_DIR
                            the directory to write the annotated media
      -f LABEL_FIELDS, --label-fields LABEL_FIELDS
                            a comma-separated list of label fields to export

**Examples**

.. code-block:: shell

    # Write annotated versions of the media in the dataset with the
    # specified label field(s) overlaid to disk
    fiftyone datasets draw <name> \
        --output-dir <output-dir> --label-fields <list>,<of>,<fields>

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

    fiftyone datasets delete [-h] [-g GLOB_PATT] [--non-persistent]
                             [NAME [NAME ...]]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the dataset name(s) to delete

    optional arguments:
      -h, --help            show this help message and exit
      -g GLOB_PATT, --glob-patt GLOB_PATT
                            a glob pattern of datasets to delete
      --non-persistent      delete all non-persistent datasets

**Examples**

.. code-block:: shell

    # Delete the datasets with the given name(s)
    fiftyone datasets delete <name1> <name2> ...

.. code-block:: shell

    # Delete the datasets whose names match the given glob pattern
    fiftyone datasets delete --glob-patt <glob-patt>

.. code-block:: shell

    # Delete all non-persistent datasets
    fiftyone datasets delete --non-persistent

.. _cli-fiftyone-migrate:

FiftyOne migrations
-------------------

Tools for migrating the FiftyOne database.

See :ref:`this page <database-migrations>` for more information about migrating
FiftyOne deployments.

.. code-block:: text

    fiftyone migrate [-h] [-i] [-a]
                     [-v VERSION]
                     [-n DATASET_NAME [DATASET_NAME ...]]
                     [--error-level LEVEL]
                     [--verbose]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -i, --info            whether to print info about the current revisions
      -a, --all             whether to migrate the database and all datasets
      -v VERSION, --version VERSION
                            the revision to migrate to
      -n DATASET_NAME [DATASET_NAME ...], --dataset-name DATASET_NAME [DATASET_NAME ...]
                            the name of a specific dataset to migrate
      --error-level LEVEL   the error level (0=error, 1=warn, 2=ignore) to use
                            when migrating individual datasets
      --verbose             whether to log incremental migrations that are performed

**Examples**

.. code-block:: shell

    # Print information about the current revisions of all datasets
    fiftyone migrate --info

.. code-block:: shell

    # Migrate the database and all datasets to the current client version
    fiftyone migrate --all

.. code-block:: shell

    # Migrate to a specific revision
    fiftyone migrate --all --version <VERSION>

.. code-block:: shell

    # Migrate a specific dataset
    fiftyone migrate ... --dataset-name <DATASET_NAME>

.. code-block:: shell

    # Update the database version without migrating any existing datasets
    fiftyone migrate

.. _cli-fiftyone-operators:

FiftyOne operators
------------------

Tools for working with FiftyOne operators and panels.

.. code-block:: text

    fiftyone operators [-h] [--all-help] {list,info} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help   show this help message and exit
      --all-help   show help recursively and exit

    available commands:
      {list,info}
        list       List operators and panels that are installed locally.
        info       Prints information about operators and panels that are installed locally.

.. _cli-fiftyone-operators-list:

List operators
~~~~~~~~~~~~~~

List operators and panels that are installed locally.

.. code-block:: text

    fiftyone operators list [-h] [-e] [-d] [-b] [-c] [-o] [-p] [-n]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -e, --enabled         only show enabled operators and panels
      -d, --disabled        only show disabled operators and panels
      -b, --builtins-only   only show builtin operators and panels
      -c, --no-builtins     only show non-builtin operators and panels
      -o, --operators-only  only show operators
      -p, --panels-only     only show panels
      -n, --names-only      only show names

**Examples**

.. code-block:: shell

    # List all available operators and panels
    fiftyone operators list

.. code-block:: shell

    # List enabled operators and panels
    fiftyone operators list --enabled

.. code-block:: shell

    # List disabled operators and panels
    fiftyone operators list --disabled

.. code-block:: shell

    # List non-builtin operators and panels
    fiftyone operators list --no-builtins

.. code-block:: shell

    # List panels
    fiftyone operators list --panels-only

.. _cli-fiftyone-operators-info:

Operator info
~~~~~~~~~~~~~

Prints information about operators and panels that are installed locally.

.. code-block:: text

    fiftyone operators info [-h] URI

**Arguments**

.. code-block:: text

    positional arguments:
      URI         the operator or panel URI

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Prints information about an operator or panel
    fiftyone operators info <uri>

.. _cli-fiftyone-delegated:

FiftyOne delegated operations
-----------------------------

Tools for working with FiftyOne delegated operations.

.. code-block:: text

    fiftyone delegated [-h] [--all-help] {launch,list,info,fail,delete,cleanup} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help   show this help message and exit
      --all-help   show help recursively and exit

    available commands:
      {launch,list,info,fail,delete,cleanup}
        launch              Launches a service for running delegated operations.
        list                List delegated operations.
        info                Prints information about a delegated operation.
        fail                Manually mark delegated as failed.
        delete              Delete delegated operations.
        cleanup             Cleanup delegated operations.

.. _cli-fiftyone-delegated-launch:

Launch delegated service
~~~~~~~~~~~~~~~~~~~~~~~~

Launches a service for running delegated operations.

.. code-block:: text

    fiftyone delegated launch [-h] [-t TYPE]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -t TYPE, --type TYPE  the type of service to launch. The default is 'local'

**Examples**

.. code-block:: shell

    # Launch a local service
    fiftyone delegated launch

.. _cli-fiftyone-delegated-list:

List delegated operations
~~~~~~~~~~~~~~~~~~~~~~~~~

List delegated operations.

.. code-block:: text

    fiftyone delegated list [-h]
                            [-o OPERATOR]
                            [-d DATASET]
                            [-s STATE]
                            [--sort-by SORT_BY]
                            [--reverse]
                            [-l LIMIT]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -o OPERATOR, --operator OPERATOR
                            only list operations for this operator
      -d DATASET, --dataset DATASET
                            only list operations for this dataset
      -s STATE, --state STATE
                            only list operations with this state. Supported
                            values are ('SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')
      --sort-by SORT_BY     how to sort the operations. Supported values are
                            ('SCHEDULED_AT', 'QUEUED_AT', 'STARTED_AT', COMPLETED_AT', 'FAILED_AT', 'OPERATOR')
      --reverse             whether to sort in reverse order
      -l LIMIT, --limit LIMIT
                            a maximum number of operations to show

**Examples**

.. code-block:: shell

    # List all delegated operations
    fiftyone delegated list

.. code-block:: shell

    # List some specific delegated operations
    fiftyone delegated list \
        --dataset quickstart \
        --operator @voxel51/io/export_samples \
        --state COMPLETED \
        --sort-by COMPLETED_AT \
        --limit 10

.. _cli-fiftyone-delegated-info:

Delegated operation info
~~~~~~~~~~~~~~~~~~~~~~~~

Prints information about a delegated operation.

.. code-block:: text

    fiftyone delegated info [-h] ID

**Arguments**

.. code-block:: text

    positional arguments:
      ID          the operation ID

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Print information about a delegated operation
    fiftyone delegated info <id>

.. _cli-fiftyone-delegated-fail:

Mark delegated operations as failed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Manually mark delegated operations as failed.

.. code-block:: text

    fiftyone delegated fail [-h] [IDS ...]

**Arguments**

.. code-block:: text

    positional arguments:
      IDS         an operation ID or list of operation IDs

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Manually mark the specified operation(s) as FAILED
    fiftyone delegated fail <id1> <id2> ...

.. _cli-fiftyone-delegated-delete:

Delete delegated operations
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Delete delegated operations.

.. code-block:: text

    fiftyone delegated delete [-h] [IDS ...]

**Arguments**

.. code-block:: text

    positional arguments:
      IDS         an operation ID or list of operation IDs

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Delete the specified operation(s)
    fiftyone delegated delete <id1> <id2> ...

.. _cli-fiftyone-delegated-cleanup:

Cleanup delegated operations
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Cleanup delegated operations.

.. code-block:: text

    fiftyone delegated cleanup [-h]
                               [-o OPERATOR]
                               [-d DATASET]
                               [-s STATE]
                               [--orphan]
                               [--dry-run]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -o OPERATOR, --operator OPERATOR
                            cleanup operations for this operator
      -d DATASET, --dataset DATASET
                            cleanup operations for this dataset
      -s STATE, --state STATE
                            delete operations in this state. Supported values
                            are ('QUEUED', 'COMPLETED', 'FAILED')
      --orphan              delete all operations associated with non-existent
                            datasets
      --dry-run             whether to print information rather than actually
                            deleting operations

**Examples**

.. code-block:: shell

    # Delete all failed operations associated with a given dataset
    fiftyone delegated cleanup --dataset quickstart --state FAILED

.. code-block:: shell

    # Delete all delegated operations associated with non-existent datasets
    fiftyone delegated cleanup --orphan

.. code-block:: shell

    # Print information about operations rather than actually deleting them
    fiftyone delegated cleanup --orphan --dry-run

.. _cli-fiftyone-plugins:

FiftyOne plugins
----------------

Tools for working with FiftyOne plugins.

.. code-block:: text

    fiftyone plugins [-h] [--all-help] {list,info,download,requirements,create,enable,disable,delete} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {list,info,download,requirements,create,enable,disable,delete}
        list                List plugins that are installed locally.
        info                Prints information about plugins that are installed locally.
        download            Download plugins from the web.
        requirements        Handles package requirements for plugins.
        create              Creates or initializes a plugin.
        enable              Enables the given plugin(s).
        disable             Disables the given plugin(s).
        delete              Delete plugins from your local machine.

.. _cli-fiftyone-plugins-list:

List plugins
~~~~~~~~~~~~

List plugins that are installed locally.

.. code-block:: text

    fiftyone plugins list [-h] [-e] [-d] [-b] [-c] [-n]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help           show this help message and exit
      -e, --enabled        only show enabled plugins
      -d, --disabled       only show disabled plugins
      -b, --builtins-only  only show builtin plugins
      -c, --no-builtins    only show non-builtin plugins
      -n, --names-only     only show plugin names

**Examples**

.. code-block:: shell

    # List all locally available plugins
    fiftyone plugins list

.. code-block:: shell

    # List enabled plugins
    fiftyone plugins list --enabled

.. code-block:: shell

    # List disabled plugins
    fiftyone plugins list --disabled

.. code-block:: shell

    # List non-builtin plugins
    fiftyone plugins list --no-builtins

.. _cli-fiftyone-plugins-info:

Plugin info
~~~~~~~~~~~

List plugins that are installed locally.

.. code-block:: text

    fiftyone plugins info [-h] NAME_OR_DIR

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_DIR  the plugin name or directory

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Prints information about a plugin
    fiftyone plugins info <name>

    # Prints information about a plugin in a given directory
    fiftyone plugins info <dir>

.. _cli-fiftyone-plugins-download:

Download plugins
~~~~~~~~~~~~~~~~

Download plugins from the web.

When downloading plugins from GitHub, you can provide any of the following
formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone plugins download [-h] [-n [PLUGIN_NAMES ...]] [-o] URL_OR_GH_REPO

**Arguments**

.. code-block:: text

    positional arguments:
      URL_OR_GH_REPO        A URL or <user>/<repo>[/<ref>] of a GitHub repository

    optional arguments:
      -h, --help            show this help message and exit
      -n [PLUGIN_NAMES ...], --plugin-names [PLUGIN_NAMES ...]
                            a plugin name or list of plugin names to download
      -o, --overwrite       whether to overwrite existing plugins

**Examples**

.. code-block:: shell

    # Download plugins from a GitHub repository URL
    fiftyone plugins download <github-repo-url>

.. code-block:: shell

    # Download plugins by specifying the GitHub repository details
    fiftyone plugins download <user>/<repo>[/<ref>]

.. code-block:: shell

    # Download specific plugins from a URL
    fiftyone plugins download <url> --plugin-names <name1> <name2> <name3>

.. _cli-fiftyone-plugins-requirements:

Plugin requirements
~~~~~~~~~~~~~~~~~~~

Handles package requirements for plugins.

.. code-block:: text

    fiftyone plugins requirements [-h] [-p] [-i] [-e] [--error-level LEVEL] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                 the plugin name

    optional arguments:
      -h, --help           show this help message and exit
      -p, --print          print the requirements for the plugin
      -i, --install        install any requirements for the plugin
      -e, --ensure         ensure the requirements for the plugin are satisfied
      --error-level LEVEL  the error level (0=error, 1=warn, 2=ignore) to use when installing or ensuring plugin requirements

**Examples**

.. code-block:: shell

    # Print requirements for a plugin
    fiftyone plugins requirements <name> --print

.. code-block:: shell

    # Install any requirements for the plugin
    fiftyone plugins requirements <name> --install

.. code-block:: shell

    # Ensures that the requirements for the plugin are satisfied
    fiftyone plugins requirements <name> --ensure

.. _cli-fiftyone-plugins-create:

Create plugins
~~~~~~~~~~~~~~

Creates or initializes a plugin.

.. code-block:: text

    fiftyone plugins create [-h]
                            [-f [FILES ...]]
                            [-d OUTDIR]
                            [--label LABEL]
                            [--description DESCRIPTION]
                            [--version VERSION]
                            [-o]
                            [--kwargs KEY=VAL [KEY=VAL ...]]
                            [NAME ...]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the plugin name(s)

    optional arguments:
      -h, --help            show this help message and exit
      -f [FILES ...], --from-files [FILES ...]
                            a directory or list of explicit filepaths to include in the plugin
      -d OUTDIR, --outdir OUTDIR
                            a directory in which to create the plugin
      --label LABEL         a display name for the plugin
      --description DESCRIPTION
                            a description for the plugin
      --version VERSION     an optional FiftyOne version requirement for the plugin
      -o, --overwrite       whether to overwrite existing plugins
      --kwargs KEY=VAL [KEY=VAL ...]
                            additional keyword arguments to include in the plugin definition

**Examples**

.. code-block:: text

    # Initialize a new plugin
    fiftyone plugins create <name>

.. code-block:: shell

    # Create a plugin from existing files
    fiftyone plugins create \
        <name> \
        --from-files /path/to/dir \
        --label <label> \
        --description <description>

.. _cli-fiftyone-plugins-enable:

Enable plugins
~~~~~~~~~~~~~~

Enables the given plugin(s).

.. code-block:: text

    fiftyone plugins enable [-h] [-a] [NAME ...]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the plugin name(s)

    optional arguments:
      -h, --help  show this help message and exit
      -a, --all   whether to enable all plugins

**Examples**

.. code-block:: shell

    # Enable a plugin
    fiftyone plugins enable <name>

.. code-block:: shell

    # Enable multiple plugins
    fiftyone plugins enable <name1> <name2> ...

.. code-block:: shell

    # Enable all plugins
    fiftyone plugins enable --all

.. _cli-fiftyone-plugins-disable:

Disable plugins
~~~~~~~~~~~~~~~

Disables the given plugin(s).

.. code-block:: text

    fiftyone plugins disable [-h] [-a] [NAME ...]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the plugin name(s)

    optional arguments:
      -h, --help  show this help message and exit
      -a, --all   whether to disable all plugins

**Examples**

.. code-block:: shell

    # Disable a plugin
    fiftyone plugins disable <name>

.. code-block:: shell

    # Disable multiple plugins
    fiftyone plugins disable <name1> <name2> ...

.. code-block:: shell

    # Disable all plugins
    fiftyone plugins disable --all

.. _cli-fiftyone-plugins-delete:

Delete plugins
~~~~~~~~~~~~~~

Delete plugins from your local machine.

.. code-block:: text

    fiftyone plugins delete [-h] [-a] [NAME ...]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the plugin name(s)

    optional arguments:
      -h, --help  show this help message and exit
      -a, --all   whether to delete all plugins

**Examples**

.. code-block:: shell

    # Delete a plugin from local disk
    fiftyone plugins delete <name>

.. code-block:: shell

    # Delete multiple plugins from local disk
    fiftyone plugins delete <name1> <name2> ...

.. code-block:: shell

    # Delete all plugins from local disk
    fiftyone plugins delete --all

.. _cli-fiftyone-utils:

FiftyOne utilities
------------------

FiftyOne utilities.

.. code-block:: text

    fiftyone utils [-h] [--all-help]
                   {compute-metadata,transform-images,transform-videos} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {compute-metadata,transform-images,transform-videos}
        compute-metadata    Populates the `metadata` field of all samples in the dataset.
        transform-images    Transforms the images in a dataset per the specified parameters.
        transform-videos    Transforms the videos in a dataset per the specified parameters.

.. _cli-fiftyone-utils-compute-metadata:

Compute metadata
~~~~~~~~~~~~~~~~

Populates the `metadata` field of all samples in the dataset.

.. code-block:: text

    fiftyone utils compute-metadata [-h] [-o] [-n NUM_WORKERS] [-s] DATASET_NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -o, --overwrite       whether to overwrite existing metadata
      -n NUM_WORKERS, --num-workers NUM_WORKERS
                            a suggested number of worker processes to use
      -s, --skip-failures   whether to gracefully continue without raising an
                            error if metadata cannot be computed for a sample

**Examples**

.. code-block:: shell

    # Populate all missing `metadata` sample fields
    fiftyone utils compute-metadata <dataset-name>

.. code-block:: shell

    # (Re)-populate the `metadata` field for all samples
    fiftyone utils compute-metadata <dataset-name> --overwrite

.. _cli-fiftyone-utils-transform-images:

Transform images
~~~~~~~~~~~~~~~~

Transforms the images in a dataset per the specified parameters.

.. code-block:: text

    fiftyone utils transform-images [-h] [--size SIZE] [--min-size MIN_SIZE]
                                    [--max-size MAX_SIZE] [-i INTERPOLATION]
                                    [-e EXT] [-f] [--media-field MEDIA_FIELD]
                                    [--output-field OUTPUT_FIELD]
                                    [-o OUTPUT_DIR] [-r REL_DIR]
                                    [--no-update-filepaths]
                                    [-d] [-n NUM_WORKERS] [-s]
                                    DATASET_NAME

**Arguments**

.. code-block:: text

    positional arguments:
      DATASET_NAME          the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      --size SIZE           a `width,height` for each image. A dimension can be
                            -1 if no constraint should be applied
      --min-size MIN_SIZE   a minimum `width,height` for each image. A dimension
                            can be -1 if no constraint should be applied
      --max-size MAX_SIZE   a maximum `width,height` for each image. A dimension
                            can be -1 if no constraint should be applied
      -i INTERPOLATION, --interpolation INTERPOLATION
                            an optional `interpolation` argument for `cv2.resize()`
      -e EXT, --ext EXT     an image format to convert to (e.g., '.png' or '.jpg')
      -f, --force-reencode  whether to re-encode images whose parameters already
                            meet the specified values
      --media-field MEDIA_FIELD
                            the input field containing the image paths to
                            transform
      --output-field OUTPUT_FIELD
                            an optional field in which to store the paths to
                            the transformed images. By default, `media_field`
                            is updated in-place
      -o OUTPUT_DIR, --output-dir OUTPUT_DIR
                            an optional output directory in which to write the
                            transformed images. If none is provided, the images
                            are updated in-place
      -r REL_DIR, --rel-dir REL_DIR
                            an optional relative directory to strip from each
                            input filepath to generate a unique identifier that
                            is joined with `output_dir` to generate an output
                            path for each image
      --no-update-filepaths
                            whether to store the output filepaths on the sample
                            collection
      -d, --delete-originals
                            whether to delete the original images after transforming
      -n NUM_WORKERS, --num-workers NUM_WORKERS
                            a suggested number of worker processes to use
      -s, --skip-failures   whether to gracefully continue without raising an
                            error if an image cannot be transformed

**Examples**

.. code-block:: shell

    # Convert the images in the dataset to PNGs
    fiftyone utils transform-images <dataset-name> --ext .png --delete-originals

.. code-block:: shell

    # Ensure that no images in the dataset exceed 1920 x 1080
    fiftyone utils transform-images <dataset-name> --max-size 1920,1080

.. _cli-fiftyone-utils-transform-videos:

Transform videos
~~~~~~~~~~~~~~~~

Transforms the videos in a dataset per the specified parameters.

.. code-block:: text

    fiftyone utils transform-videos [-h] [--fps FPS] [--min-fps MIN_FPS]
                                    [--max-fps MAX_FPS] [--size SIZE]
                                    [--min-size MIN_SIZE] [--max-size MAX_SIZE]
                                    [-r] [-f]
                                    [--media-field MEDIA_FIELD]
                                    [--output-field OUTPUT_FIELD]
                                    [--output-dir OUTPUT_DIR]
                                    [--rel-dir REL_DIR]
                                    [--no-update-filepaths]
                                    [-d] [-s] [-v]
                                    DATASET_NAME

**Arguments**

.. code-block:: text

    positional arguments:
      DATASET_NAME          the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      --fps FPS             a frame rate at which to resample the videos
      --min-fps MIN_FPS     a minimum frame rate. Videos with frame rate below
                            this value are upsampled
      --max-fps MAX_FPS     a maximum frame rate. Videos with frame rate exceeding
                            this value are downsampled
      --size SIZE           a `width,height` for each frame. A dimension can be -1
                            if no constraint should be applied
      --min-size MIN_SIZE   a minimum `width,height` for each frame. A dimension
                            can be -1 if no constraint should be applied
      --max-size MAX_SIZE   a maximum `width,height` for each frame. A dimension
                            can be -1 if no constraint should be applied
      -r, --reencode        whether to re-encode the videos as H.264 MP4s
      -f, --force-reencode  whether to re-encode videos whose parameters already
                            meet the specified values
      --media-field MEDIA_FIELD
                            the input field containing the video paths to
                            transform
      --output-field OUTPUT_FIELD
                            an optional field in which to store the paths to
                            the transformed videos. By default, `media_field`
                            is updated in-place
      --output-dir OUTPUT_DIR
                            an optional output directory in which to write the
                            transformed videos. If none is provided, the videos
                            are updated in-place
      --rel-dir REL_DIR     an optional relative directory to strip from each
                            input filepath to generate a unique identifier that
                            is joined with `output_dir` to generate an output
                            path for each video
      --no-update-filepaths
                            whether to store the output filepaths on the sample
                            collection
      -d, --delete-originals
                            whether to delete the original videos after transforming
      -s, --skip-failures   whether to gracefully continue without raising an
                            error if a video cannot be transformed
      -v, --verbose         whether to log the `ffmpeg` commands that are executed

**Examples**

.. code-block:: shell

    # Re-encode the videos in the dataset as H.264 MP4s
    fiftyone utils transform-videos <dataset-name> --reencode

.. code-block:: shell

    # Ensure that no videos in the dataset exceed 1920 x 1080 and 30fps
    fiftyone utils transform-videos <dataset-name> \
        --max-size 1920,1080 --max-fps 30.0

.. _cli-fiftyone-annotation:

FiftyOne Annotation
-------------------

Tools for working with the FiftyOne annotation API.

.. code-block:: text

    fiftyone annotation [-h] [--all-help] {config} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {config}
        config              Tools for working with your FiftyOne annotation config.

.. _cli-fiftyone-annotation-config:

Annotation Config
~~~~~~~~~~~~~~~~~

Tools for working with your FiftyOne annotation config.

.. code-block:: text

    fiftyone annotation config [-h] [-l] [FIELD]

**Arguments**

.. code-block:: text

    positional arguments:
      FIELD         an annotation config field to print

    optional arguments:
      -h, --help    show this help message and exit
      -l, --locate  print the location of your annotation config on disk

**Examples**

.. code-block:: shell

    # Print your entire annotation config
    fiftyone annotation config

.. code-block:: shell

    # Print a specific annotation config field
    fiftyone annotation config <field>

.. code-block:: shell

    # Print the location of your annotation config on disk (if one exists)
    fiftyone annotation config --locate

.. _cli-fiftyone-app:

FiftyOne App
------------

Tools for working with the FiftyOne App.

.. code-block:: text

    fiftyone app [-h] [--all-help] {config,launch,view,connect} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {config,launch,view,connect}
        config              Tools for working with your App config.
        launch              Launch the FiftyOne App.
        view                View datasets in the App without persisting them to the database.
        connect             Connect to a remote FiftyOne App.

.. _cli-fiftyone-app-config:

App Config
~~~~~~~~~~

Tools for working with your FiftyOne App config.

.. code-block:: text

    fiftyone app config [-h] [-l] [FIELD]

**Arguments**

.. code-block:: text

    positional arguments:
      FIELD         an App config field to print

    optional arguments:
      -h, --help    show this help message and exit
      -l, --locate  print the location of your App config on disk

**Examples**

.. code-block:: shell

    # Print your entire App config
    fiftyone app config

.. code-block:: shell

    # Print a specific App config field
    fiftyone app config <field>

.. code-block:: shell

    # Print the location of your App config on disk (if one exists)
    fiftyone app config --locate

.. _cli-fiftyone-app-launch:

Launch the App
~~~~~~~~~~~~~~

Launch the FiftyOne App.

.. code-block:: text

    fiftyone app launch [-h] [-p PORT] [-A ADDRESS] [-b BROWSER] [-r] [-a] [-w WAIT] [NAME]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of a dataset to open

    optional arguments:
      -h, --help            show this help message and exit
      -p PORT, --port PORT  the port number to use
      -A ADDRESS, --address ADDRESS
                            the address (server name) to use
      -r, --remote          whether to launch a remote App session
      -b BROWSER, --browser BROWSER
                            the browser to use to open the App
      -w WAIT, --wait WAIT  the number of seconds to wait for a new App
                            connection before returning if all connections are
                            lost. If negative, the process will wait forever,
                            regardless of connections

**Examples**

.. code-block:: shell

    # Launch the App
    fiftyone app launch

.. code-block:: shell

    # Launch the App with the given dataset loaded
    fiftyone app launch <name>

.. code-block:: shell

    # Launch a remote App session
    fiftyone app launch ... --remote

.. code-block:: shell

    # Launch an App session with a specific browser
    fiftyone app launch ... --browser <name>

.. _cli-fiftyone-app-view:

View datasets in App
~~~~~~~~~~~~~~~~~~~~

View datasets in the FiftyOne App without persisting them to the database.

.. code-block:: text

    fiftyone app view [-h] [-n NAME] [-d DATASET_DIR] [-t TYPE] [-z NAME]
                      [-s SPLITS [SPLITS ...]] [--images-dir IMAGES_DIR]
                      [--images-patt IMAGES_PATT] [--videos-dir VIDEOS_DIR]
                      [--videos-patt VIDEOS_PATT] [-j JSON_PATH] [-p PORT]
                      [-A ADDRESS] [-r] [-a] [-w WAIT]
                      [-k KEY=VAL [KEY=VAL ...]]

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
      --videos-dir VIDEOS_DIR
                            the path to a directory of videos
      --videos-patt VIDEOS_PATT
                            a glob pattern of videos
      -j JSON_PATH, --json-path JSON_PATH
                            the path to a samples JSON file to view
      -p PORT, --port PORT  the port number to use
      -A ADDRESS, --address ADDRESS
                            the address (server name) to use
      -r, --remote          whether to launch a remote App session
      -w WAIT, --wait WAIT  the number of seconds to wait for a new App
                            connection before returning if all connections are
                            lost. If negative, the process will wait forever,
                            regardless of connections
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            additional type-specific keyword arguments for
                            `fiftyone.core.dataset.Dataset.from_dir()`

**Examples**

.. code-block:: shell

    # View a dataset stored on disk in the App
    fiftyone app view --dataset-dir <dataset-dir> --type <type>

.. code-block:: shell

    # View a zoo dataset in the App
    fiftyone app view --zoo-dataset <name> --splits <split1> ...

.. code-block:: shell

    # View a directory of images in the App
    fiftyone app view --images-dir <images-dir>

.. code-block:: shell

    # View a glob pattern of images in the App
    fiftyone app view --images-patt <images-patt>

.. code-block:: shell

    # View a directory of videos in the App
    fiftyone app view --videos-dir <videos-dir>

.. code-block:: shell

    # View a glob pattern of videos in the App
    fiftyone app view --videos-patt <videos-patt>

.. code-block:: shell

    # View a dataset stored in JSON format on disk in the App
    fiftyone app view --json-path <json-path>

.. code-block:: shell

    # View the dataset in a remote App session
    fiftyone app view ... --remote

.. code-block:: shell

    # View a random subset of the data stored on disk in the App
    fiftyone app view ... --kwargs max_samples=50 shuffle=True

.. _cli-fiftyone-app-connect:

Connect to remote App
~~~~~~~~~~~~~~~~~~~~~

Connect to a remote FiftyOne App in your web browser.

.. code-block:: text

    fiftyone app connect [-h] [-d DESTINATION] [-p PORT] [-A ADDRESS] [-l PORT]
                         [-i KEY]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -d DESTINATION, --destination DESTINATION
                            the destination to connect to, e.g., [username@]hostname
      -p PORT, --port PORT  the remote port to connect to
      -l PORT, --local-port PORT
                            the local port to use to serve the App
      -i KEY, --ssh-key KEY
                            optional ssh key to use to login

**Examples**

.. code-block:: shell

    # Connect to a remote App with port forwarding already configured
    fiftyone app connect

.. code-block:: shell

    # Connect to a remote App session
    fiftyone app connect --destination <destination> --port <port>

.. code-block:: shell

    # Connect to a remote App session using an ssh key
    fiftyone app connect ... --ssh-key <path/to/key>

.. code-block:: shell

    # Connect to a remote App using a custom local port
    fiftyone app connect ... --local-port <port>

.. _cli-fiftyone-brain:

FiftyOne Brain
--------------

Tools for working with the FiftyOne Brain.

.. code-block:: text

    fiftyone brain [-h] [--all-help] {config} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {config}
        config              Tools for working with your FiftyOne Brain config.

.. _cli-fiftyone-brain-config:

Brain Config
~~~~~~~~~~~~

Tools for working with your FiftyOne Brain config.

.. code-block:: text

    fiftyone brain config [-h] [-l] [FIELD]

**Arguments**

.. code-block:: text

    positional arguments:
      FIELD         a brain config field to print

    optional arguments:
      -h, --help    show this help message and exit
      -l, --locate  print the location of your brain config on disk

**Examples**

.. code-block:: shell

    # Print your entire brain config
    fiftyone brain config

.. code-block:: shell

    # Print a specific brain config field
    fiftyone brain config <field>

.. code-block:: shell

    # Print the location of your brain config on disk (if one exists)
    fiftyone brain config --locate

.. _cli-fiftyone-evaluation:

FiftyOne Evaluation
-------------------

Tools for working with the FiftyOne evaluation API.

.. code-block:: text

    fiftyone evaluation [-h] [--all-help] {config} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {config}
        config              Tools for working with your FiftyOne evaluation config.

.. _cli-fiftyone-evaluation-config:

Evaluation Config
~~~~~~~~~~~~~~~~~

Tools for working with your FiftyOne evaluation config.

.. code-block:: text

    fiftyone evaluation config [-h] [-l] [FIELD]

**Arguments**

.. code-block:: text

    positional arguments:
      FIELD         an evaluation config field to print

    optional arguments:
      -h, --help    show this help message and exit
      -l, --locate  print the location of your evaluation config on disk

**Examples**

.. code-block:: shell

    # Print your entire evaluation config
    fiftyone evaluation config

.. code-block:: shell

    # Print a specific evaluation config field
    fiftyone evaluation config <field>

.. code-block:: shell

    # Print the location of your evaluation config on disk (if one exists)
    fiftyone evaluation config --locate

.. _cli-fiftyone-zoo:

FiftyOne Zoo
------------

Tools for working with the FiftyOne Zoo.

.. code-block:: text

    fiftyone zoo [-h] [--all-help] {datasets,models} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help         show this help message and exit
      --all-help         show help recursively and exit

    available commands:
      {datasets,models}
        datasets         Tools for working with the FiftyOne Dataset Zoo.
        models           Tools for working with the FiftyOne Model Zoo.

.. _cli-fiftyone-zoo-datasets:

FiftyOne Dataset Zoo
--------------------

Tools for working with the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets [-h] [--all-help]
                          {list,find,info,download,load,delete} ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {list,find,info,download,load,delete}
        list                List datasets in the FiftyOne Dataset Zoo.
        find                Locate a downloaded zoo dataset on disk.
        info                Print information about datasets in the FiftyOne Dataset Zoo.
        download            Download zoo datasets.
        load                Load zoo datasets as persistent FiftyOne datasets.
        delete              Deletes the local copy of the zoo dataset on disk.

.. _cli-fiftyone-zoo-datasets-list:

List datasets in zoo
~~~~~~~~~~~~~~~~~~~~

List datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets list [-h] [-n] [-d] [-s SOURCE] [-t TAGS]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -n, --names-only      only show dataset names
      -d, --downloaded-only
                            only show datasets that have been downloaded
      -s SOURCE, --source SOURCE
                            only show datasets available from the specified source
      -t TAGS, --tags TAGS  only show datasets with the specified tag or list,of,tags

**Examples**

.. code-block:: shell

    # List available datasets
    fiftyone zoo datasets list

.. code-block:: shell

    # List available dataset names
    fiftyone zoo datasets list --names-only

.. code-block:: shell

    # List downloaded datasets
    fiftyone zoo datasets list --downloaded-only

.. code-block:: shell

    # List available datasets from the given source
    fiftyone zoo datasets list --source <source>

.. code-block:: shell

    # List available datasets with the given tag
    fiftyone zoo datasets list --tags <tag>

.. _cli-fiftyone-zoo-datasets-find:

Find zoo datasets on disk
~~~~~~~~~~~~~~~~~~~~~~~~~

Locate a downloaded zoo dataset on disk.

.. code-block:: text

    fiftyone zoo datasets find [-h] [-s SPLIT] NAME_OR_URL

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLIT, --split SPLIT

**Examples**

.. code-block:: shell

    # Print the location of a downloaded zoo dataset on disk
    fiftyone zoo datasets find <name>

.. code-block:: shell

    # Print the location of a remotely-sourced zoo dataset on disk
    fiftyone zoo datasets find https://github.com/<user>/<repo>
    fiftyone zoo datasets find <url>

.. code-block:: shell

    # Print the location of a specific split of a dataset
    fiftyone zoo datasets find <name> --split <split>

.. _cli-fiftyone-zoo-datasets-info:

Show zoo dataset info
~~~~~~~~~~~~~~~~~~~~~

Print information about datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets info [-h] NAME_OR_URL

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the dataset

    optional arguments:
      -h, --help            show this help message and exit

**Examples**

.. code-block:: shell

    # Print information about a zoo dataset
    fiftyone zoo datasets info <name>

.. code-block:: shell

    # Print information about a remote zoo dataset
    fiftyone zoo datasets info https://github.com/<user>/<repo>
    fiftyone zoo datasets info <url>

.. _cli-fiftyone-zoo-datasets-download:

Download zoo datasets
~~~~~~~~~~~~~~~~~~~~~

Download zoo datasets.

When downloading remotely-sourced zoo datasets, you can provide any of the
following formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo datasets download [-h] [-s SPLITS [SPLITS ...]]
                                   [-k KEY=VAL [KEY=VAL ...]]
                                   NAME_OR_URL

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the dataset

    optional arguments:

      -h, --help            show this help message and exit
      -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                            the dataset splits to download
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            optional dataset-specific keyword arguments for
                            `fiftyone.zoo.download_zoo_dataset()`

**Examples**

.. code-block:: shell

    # Download a zoo dataset
    fiftyone zoo datasets download <name>

.. code-block:: shell

    # Download a remotely-sourced zoo dataset
    fiftyone zoo datasets download https://github.com/<user>/<repo>
    fiftyone zoo datasets download <url>

.. code-block:: shell

    # Download the specified split(s) of a zoo dataset
    fiftyone zoo datasets download <name> --splits <split1> ...

.. code-block:: shell

    # Download a zoo dataset that requires extra keyword arguments
    fiftyone zoo datasets download <name> \
        --kwargs source_dir=/path/to/source/files

.. _cli-fiftyone-zoo-datasets-load:

Load zoo datasets
~~~~~~~~~~~~~~~~~

Load zoo datasets as persistent FiftyOne datasets.

When loading remotely-sourced zoo datasets, you can provide any of the
following formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo datasets load [-h] [-s SPLITS [SPLITS ...]]
                               [-n DATASET_NAME] [-k KEY=VAL [KEY=VAL ...]]
                               NAME_OR_URL

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLITS [SPLITS ...], --splits SPLITS [SPLITS ...]
                            the dataset splits to load
      -n DATASET_NAME, --dataset-name DATASET_NAME
                            a custom name to give the FiftyOne dataset
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            additional dataset-specific keyword arguments for
                            `fiftyone.zoo.load_zoo_dataset()`

**Examples**

.. code-block:: shell

    # Load the zoo dataset with the given name
    fiftyone zoo datasets load <name>

.. code-block:: shell

    # Load a remotely-sourced zoo dataset
    fiftyone zoo datasets load https://github.com/<user>/<repo>
    fiftyone zoo datasets load <url>

.. code-block:: shell

    # Load the specified split(s) of a zoo dataset
    fiftyone zoo datasets load <name> --splits <split1> ...

.. code-block:: shell

    # Load a zoo dataset with a custom name
    fiftyone zoo datasets load <name> --dataset-name <dataset-name>

.. code-block:: shell

    # Load a zoo dataset that requires custom keyword arguments
    fiftyone zoo datasets load <name> \
        --kwargs source_dir=/path/to/source_files

.. code-block:: shell

    # Load a random subset of a zoo dataset
    fiftyone zoo datasets load <name> \
        --kwargs max_samples=50 shuffle=True

.. _cli-fiftyone-zoo-datasets-delete:

Delete zoo datasets
~~~~~~~~~~~~~~~~~~~

Deletes the local copy of the zoo dataset on disk.

.. code-block:: text

    fiftyone zoo datasets delete [-h] [-s SPLIT] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s SPLIT, --split SPLIT
                            a dataset split

**Examples**

.. code-block:: shell

    # Delete an entire zoo dataset from disk
    fiftyone zoo datasets delete <name>

.. code-block:: shell

    # Delete a specific split of a zoo dataset from disk
    fiftyone zoo datasets delete <name> --split <split>

.. _cli-fiftyone-zoo-models:

FiftyOne Model Zoo
------------------

Tools for working with the FiftyOne Model Zoo.

.. code-block:: text

    fiftyone zoo models [-h] [--all-help]
                        {list,find,info,requirements,download,apply,embed,delete,list-sources,register-source,delete-source}
                        ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recursively and exit

    available commands:
      {list,find,info,requirements,download,apply,embed,delete,register-source,delete-source}
        list                List models in the FiftyOne Model Zoo.
        find                Locate the downloaded zoo model on disk.
        info                Print information about models in the FiftyOne Model Zoo.
        requirements        Handles package requirements for zoo models.
        download            Download zoo models.
        apply               Apply zoo models to datasets.
        embed               Generate embeddings for datasets with zoo models.
        delete              Deletes the local copy of the zoo model on disk.
        list-sources        Lists remote zoo model sources that are registered locally.
        register-source     Registers a remote source of zoo models.
        delete-source       Deletes the remote source and all downloaded models associated with it.

.. _cli-fiftyone-zoo-models-list:

List models in zoo
~~~~~~~~~~~~~~~~~~

List models in the FiftyOne Model Zoo.

.. code-block:: text

    fiftyone zoo models list [-h] [-n] [-d] [-t TAGS] [-s SOURCE]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -n, --names-only      only show model names
      -d, --downloaded-only
                            only show models that have been downloaded
      -t TAGS, --tags TAGS  only show models with the specified tag or list,of,tags
      -s SOURCE, --source SOURCE
                            only show models available from the specified remote source

**Examples**

.. code-block:: shell

    # List available models
    fiftyone zoo models list

.. code-block:: shell

    # List available models (names only)
    fiftyone zoo models list --names-only

.. code-block:: shell

    # List downloaded models
    fiftyone zoo models list --downloaded-only

.. code-block:: shell

    # List available models with the given tag
    fiftyone zoo models list --tags <tag>

.. code-block:: shell

    # List available models from the given remote source
    fiftyone zoo models list --source <source>

.. _cli-fiftyone-zoo-models-find:

Find zoo models on disk
~~~~~~~~~~~~~~~~~~~~~~~

Locate the downloaded zoo model on disk.

.. code-block:: text

    fiftyone zoo models find [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the model

    optional arguments:
      -h, --help            show this help message and exit

**Examples**

.. code-block:: shell

    # Print the location of the downloaded zoo model on disk
    fiftyone zoo models find <name>

.. _cli-fiftyone-zoo-models-info:

Show zoo model info
~~~~~~~~~~~~~~~~~~~

Print information about models in the FiftyOne Model Zoo.

.. code-block:: text

    fiftyone zoo models info [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the model

    optional arguments:
      -h, --help            show this help message and exit

**Examples**

.. code-block:: shell

    # Print information about a zoo model
    fiftyone zoo models info <name>

.. _cli-fiftyone-zoo-models-requirements:

Zoo model requirements
~~~~~~~~~~~~~~~~~~~~~~

Handles package requirements for zoo models.

.. code-block:: text

    fiftyone zoo models requirements [-h] [-p] [-i] [-e]
                                     [--error-level LEVEL]
                                     NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                 the name of the model

    optional arguments:
      -h, --help           show this help message and exit
      -p, --print          print the requirements for the zoo model
      -i, --install        install any requirements for the zoo model
      -e, --ensure         ensure the requirements for the zoo model are satisfied
      --error-level LEVEL  the error level (0=error, 1=warn, 2=ignore) to use
                           when installing or ensuring model requirements

**Examples**

.. code-block:: shell

    # Print requirements for a zoo model
    fiftyone zoo models requirements <name> --print

.. code-block:: shell

    # Install any requirements for the zoo model
    fiftyone zoo models requirements <name> --install

.. code-block:: shell

    # Ensures that the requirements for the zoo model are satisfied
    fiftyone zoo models requirements <name> --ensure

.. _cli-fiftyone-zoo-models-download:

Download zoo models
~~~~~~~~~~~~~~~~~~~

Download zoo models.

When downloading remotely-sourced zoo models, you can provide any of the
following:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo models download [-h] [-n MODEL_NAME] [-o] NAME_OR_URL

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the model

    optional arguments:
      -h, --help            show this help message and exit
      -n MODEL_NAME, --model-name MODEL_NAME
                            the specific model to download, if `name_or_url` is
                            a remote source
      -o, --overwrite       whether to overwrite any existing model files

**Examples**

.. code-block:: shell

    # Download a zoo model
    fiftyone zoo models download <name>

.. code-block:: shell

    # Download a remotely-sourced zoo model
    fiftyone zoo models download https://github.com/<user>/<repo> \
        --model-name <name>
    fiftyone zoo models download <url> --model-name <name>

.. _cli-fiftyone-zoo-models-apply:

Apply zoo models to datasets
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Apply zoo models to datasets.

When applying remotely-sourced zoo models, you can provide any of the following
formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo models apply [-h] [-n MODEL_NAME] [-b BATCH_SIZE] [-t THRESH]
                              [-l] [-i] [--error-level LEVEL]
                              NAME_OR_URL DATASET_NAME LABEL_FIELD

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the zoo model
      DATASET_NAME          the name of the FiftyOne dataset to process
      LABEL_FIELD           the name of the field in which to store the predictions

    optional arguments:
      -h, --help            show this help message and exit
      -n MODEL_NAME, --model-name MODEL_NAME
                            the specific model to apply, if `name_or_url` is a
                            remote source
      -b BATCH_SIZE, --batch-size BATCH_SIZE
                            an optional batch size to use during inference
      -t THRESH, --confidence-thresh THRESH
                            an optional confidence threshold to apply to any
                            applicable labels generated by the model
      -l, --store-logits    store logits for the predictions
      -i, --install         install any requirements for the zoo model
      --error-level LEVEL   the error level (0=error, 1=warn, 2=ignore) to use
                            when installing or ensuring model requirements

**Examples**

.. code-block:: shell

    # Apply a zoo model to a dataset
    fiftyone zoo models apply <model-name> <dataset-name> <label-field>

.. code-block:: shell

    # Apply a remotely-sourced zoo model to a dataset
    fiftyone zoo models apply https://github.com/<user>/<repo> \
        <dataset-name> <label-field> --model-name <model-name>
    fiftyone zoo models apply <url> \
        <dataset-name> <label-field> --model-name <model-name>

.. code-block:: shell

    # Apply a zoo classifier with some customized parameters
    fiftyone zoo models apply \
        <model-name> <dataset-name> <label-field> \
        --confidence-thresh 0.7 \
        --store-logits \
        --batch-size 32

.. _cli-fiftyone-zoo-models-embed:

Generate embeddings with zoo models
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Generate embeddings for datasets with zoo models.

When applying remotely-sourced zoo models, you can provide any of the following
formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo models embed [-h] [-n MODEL_NAME] [-b BATCH_SIZE] [-i]
                              [--error-level LEVEL]
                              NAME_OR_URL DATASET_NAME EMBEDDINGS_FIELD

**Arguments**

.. code-block:: text

    positional arguments:
      NAME_OR_URL           the name or remote location of the zoo model
      DATASET_NAME          the name of the FiftyOne dataset to process
      EMBEDDINGS_FIELD      the name of the field in which to store the embeddings

    optional arguments:
      -h, --help            show this help message and exit
      -n MODEL_NAME, --model-name MODEL_NAME
                            the specific model to apply, if `name_or_url` is a
                            remote source
      -b BATCH_SIZE, --batch-size BATCH_SIZE
                            an optional batch size to use during inference
      -i, --install         install any requirements for the zoo model
      --error-level LEVEL   the error level (0=error, 1=warn, 2=ignore) to use
                            when installing or ensuring model requirements

**Examples**

.. code-block:: shell

    # Generate embeddings for a dataset with a zoo model
    fiftyone zoo models embed <model-name> <dataset-name> <embeddings-field>

.. code-block:: shell

    # Generate embeddings for a dataset with a remotely-sourced zoo model
    fiftyone zoo models embed https://github.com/<user>/<repo> \
        <dataset-name> <embeddings-field> --model-name <model-name>
    fiftyone zoo models embed <url> \
        <dataset-name> <embeddings-field> --model-name <model-name>

.. _cli-fiftyone-zoo-models-delete:

Delete zoo models
~~~~~~~~~~~~~~~~~

Deletes the local copy of the zoo model on disk.

.. code-block:: text

    fiftyone zoo models delete [-h] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME        the name of the model

    optional arguments:
      -h, --help  show this help message and exit

**Examples**

.. code-block:: shell

    # Delete the zoo model from disk
    fiftyone zoo models delete <name>

.. _cli-fiftyone-zoo-models-list-sources:

List zoo model sources
~~~~~~~~~~~~~~~~~~~~~~

Lists remote zoo model sources that are registered locally.

.. code-block:: text

    fiftyone zoo models list-sources [-h]

**Examples**

.. code-block:: shell

    # Lists the registered remote zoo model sources
    fiftyone zoo models list-sources

.. _cli-fiftyone-zoo-models-register-source:

Register zoo model sources
~~~~~~~~~~~~~~~~~~~~~~~~~~

Registers a remote source of zoo models.

You can provide any of the following formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. note::

    To download from a private GitHub repository that you have access to,
    provide your GitHub personal access token by setting the ``GITHUB_TOKEN``
    environment variable.

.. code-block:: text

    fiftyone zoo models register-source [-h] [-o] URL_OR_GH_REPO

**Arguments**

.. code-block:: text

    positional arguments:
      URL_OR_GH_REPO   the remote source to register

    optional arguments:
      -h, --help       show this help message and exit
      -o, --overwrite  whether to overwrite any existing files

**Examples**

.. code-block:: shell

    # Register a remote zoo model source
    fiftyone zoo models register-source https://github.com/<user>/<repo>
    fiftyone zoo models register-source <url>

.. _cli-fiftyone-zoo-models-delete-source:

Delete zoo model sources
~~~~~~~~~~~~~~~~~~~~~~~~

Deletes the remote source and all downloaded models associated with it.

You can provide any of the following formats:

-   a GitHub repo URL like ``https://github.com/<user>/<repo>``
-   a GitHub ref like ``https://github.com/<user>/<repo>/tree/<branch>`` or
    ``https://github.com/<user>/<repo>/commit/<commit>``
-   a GitHub ref string like ``<user>/<repo>[/<ref>]``
-   a publicly accessible URL of an archive (eg zip or tar) file

.. code-block:: text

    fiftyone zoo models delete-source [-h] URL_OR_GH_REPO

**Arguments**

.. code-block:: text

    positional arguments:
      URL_OR_GH_REPO   the remote source to delete

    optional arguments:
      -h, --help       show this help message and exit

**Examples**

.. code-block:: shell

    # Delete a remote zoo model source
    fiftyone zoo models delete-source https://github.com/<user>/<repo>
    fiftyone zoo models delete-source <url>
