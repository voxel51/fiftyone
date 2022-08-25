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

.._cli-fiftyone-main:

FiftyOne CLI
------------

The FiftyOne command-line interface.

.. code-block:: text

    fiftyone [-h] [-v] [--all-help]
             {quickstart,annotation,app,config,constants,convert,datasets,migrate,utils,zoo}
             ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -v, --version         show version info
      --all-help            show help recurisvely and exit

    available commands:
      {quickstart,annotation,app,config,constants,convert,datasets,migrate,utils,zoo}
        quickstart          Launch a FiftyOne quickstart.
        annotation          Tools for working with the FiftyOne annotation API.
        app                 Tools for working with the FiftyOne App.
        config              Tools for working with your FiftyOne config.
        constants           Print constants from `fiftyone.constants`.
        convert             Convert datasets on disk between supported formats.
        datasets            Tools for working with FiftyOne datasets.
        migrate             Tools for migrating the FiftyOne database.
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
      -a, --desktop         whether to launch a desktop App instance
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
      --all-help            show help recurisvely and exit

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

    fiftyone datasets info [-h] [-s FIELD] [-r] [NAME]

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of a dataset

    optional arguments:
      -h, --help            show this help message and exit
      -s FIELD, --sort-by FIELD
                            a field to sort the dataset rows by
      -r, --reverse         whether to print the results in reverse order

**Examples**

.. code-block:: shell

    # Print basic information about all datasets
    fiftyone datasets info
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

    fiftyone migrate [-h] [-i] [-a] [-v VERSION]
                     [-n DATASET_NAME [DATASET_NAME ...]] [--verbose]

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
                            the number of worker processes to use. The default
                            is `multiprocessing.cpu_count()`
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
                                    [--max-size MAX_SIZE] [-e EXT] [-f]
                                    [--media-field MEDIA_FIELD]
                                    [--output-field OUTPUT_FIELD]
                                    [-o OUTPUT_DIR] [-r REL_DIR]
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
      -d, --delete-originals
                            whether to delete the original images after transforming
      -n NUM_WORKERS, --num-workers NUM_WORKERS
                            the number of worker processes to use. The default is
                            `multiprocessing.cpu_count()`
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
      {config,launch,view,connect}
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

    fiftyone app launch [-h] [-p PORT] [-A ADDRESS] [-r] [-a] [-w WAIT] [NAME]

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
      -a, --desktop         whether to launch a desktop App instance
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

    # Launch a desktop App session
    fiftyone app launch ... --desktop

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
      -a, --desktop         whether to launch a desktop App instance
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

    # View the dataset using the desktop App
    fiftyone app view ... --desktop

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
      --all-help         show help recurisvely and exit

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
      --all-help            show help recurisvely and exit

    available commands:
      {list,find,info,download,load}
        list                List datasets in the FiftyOne Dataset Zoo.
        find                Locate the downloaded zoo dataset on disk.
        info                Print information about downloaded zoo datasets.
        download            Download zoo datasets.
        load                Load zoo datasets as persistent FiftyOne datasets.

.. _cli-fiftyone-zoo-datasets-list:

List datasets in zoo
~~~~~~~~~~~~~~~~~~~~

List datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets list [-h] [-n] [-d] [-s SOURCE] [-t TAGS]
                               [-b BASE_DIR]

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
      -b BASE_DIR, --base-dir BASE_DIR
                            a custom base directory in which to search for
                            downloaded datasets

**Examples**

.. code-block:: shell

    # List available datasets
    fiftyone zoo datasets list

.. code-block:: shell

    # List available datasets (names only)
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

Locate the downloaded zoo dataset on disk.

.. code-block:: text

    fiftyone zoo datasets find [-h] [-s SPLIT] NAME

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
    fiftyone zoo datasets find <name>

.. code-block:: shell

    # Print the location of a specific split of the dataset
    fiftyone zoo datasets find <name> --split <split>

.. _cli-fiftyone-zoo-datasets-info:

Show zoo dataset info
~~~~~~~~~~~~~~~~~~~~~

Print information about datasets in the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets info [-h] [-b BASE_DIR] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the dataset

    optional arguments:
      -h, --help            show this help message and exit
      -b BASE_DIR, --base-dir BASE_DIR
                            a custom base directory in which to search for
                            downloaded datasets

**Examples**

.. code-block:: shell

    # Print information about a zoo dataset
    fiftyone zoo datasets info <name>

.. _cli-fiftyone-zoo-datasets-download:

Download zoo datasets
~~~~~~~~~~~~~~~~~~~~~

Download datasets from the FiftyOne Dataset Zoo.

.. code-block:: text

    fiftyone zoo datasets download [-h] [-s SPLITS [SPLITS ...]]
                                   [-d DATASET_DIR]
                                   [-k KEY=VAL [KEY=VAL ...]]
                                   NAME

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
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            optional dataset-specific keyword arguments for
                            `fiftyone.zoo.download_zoo_dataset()`

**Examples**

.. code-block:: shell

    # Download the entire zoo dataset
    fiftyone zoo datasets download <name>

.. code-block:: shell

    # Download the specified split(s) of the zoo dataset
    fiftyone zoo datasets download <name> --splits <split1> ...

.. code-block:: shell

    # Download the zoo dataset to a custom directory
    fiftyone zoo datasets download <name> --dataset-dir <dataset-dir>

.. code-block:: shell

    # Download a zoo dataset that requires extra keyword arguments
    fiftyone zoo datasets download <name> \
        --kwargs source_dir=/path/to/source/files

.. _cli-fiftyone-zoo-datasets-load:

Load zoo datasets
~~~~~~~~~~~~~~~~~

Load zoo datasets as persistent FiftyOne datasets.

.. code-block:: text

    fiftyone zoo datasets load [-h] [-s SPLITS [SPLITS ...]]
                               [-n DATASET_NAME] [-d DATASET_DIR]
                               [-k KEY=VAL [KEY=VAL ...]]
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
      -k KEY=VAL [KEY=VAL ...], --kwargs KEY=VAL [KEY=VAL ...]
                            additional dataset-specific keyword arguments for
                            `fiftyone.zoo.load_zoo_dataset()`

**Examples**

.. code-block:: shell

    # Load the zoo dataset with the given name
    fiftyone zoo datasets load <name>

.. code-block:: shell

    # Load the specified split(s) of the zoo dataset
    fiftyone zoo datasets load <name> --splits <split1> ...

.. code-block:: shell

    # Load the zoo dataset with a custom name
    fiftyone zoo datasets load <name> --dataset-name <dataset-name>

.. code-block:: shell

    # Load the zoo dataset from a custom directory
    fiftyone zoo datasets load <name> --dataset-dir <dataset-dir>

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
                        {list,find,info,requirements,download,apply,embed,delete}
                        ...

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      --all-help            show help recurisvely and exit

    available commands:
      {list,find,info,requirements,download,apply,embed,delete}
        list                List datasets in the FiftyOne Model Zoo.
        find                Locate the downloaded zoo model on disk.
        info                Print information about models in the FiftyOne Model Zoo.
        requirements        Handles package requirements for zoo models.
        download            Download zoo models.
        apply               Apply zoo models to datasets.
        embed               Generate embeddings for datasets with zoo models.
        delete              Deletes the local copy of the zoo model on disk.

.. _cli-fiftyone-zoo-models-list:

List models in zoo
~~~~~~~~~~~~~~~~~~

List datasets in the FiftyOne Model Zoo.

.. code-block:: text

    fiftyone zoo models list [-h] [-n] [-d] [-t TAG]

**Arguments**

.. code-block:: text

    optional arguments:
      -h, --help            show this help message and exit
      -n, --names-only      only show model names
      -d, --downloaded-only
                            only show models that have been downloaded
      -t TAGS, --tags TAGS  only show models with the specified tag or list,of,tags

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
      --error-level LEVEL  the error level in {0, 1, 2} to use when installing
                           or ensuring model requirements

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

.. code-block:: text

    fiftyone zoo models download [-h] [-f] NAME

**Arguments**

.. code-block:: text

    positional arguments:
      NAME                  the name of the zoo model

    optional arguments:
      -h, --help            show this help message and exit
      -f, --force           whether to force download the model if it is already
                            downloaded

**Examples**

.. code-block:: shell

    # Download the zoo model
    fiftyone zoo models download <name>

.. _cli-fiftyone-zoo-models-apply:

Apply zoo models to datasets
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Apply zoo models to datasets.

.. code-block:: text

    fiftyone zoo models apply [-h] [-b BATCH_SIZE] [-t THRESH] [-l] [-i]
                              [--error-level LEVEL]
                              MODEL_NAME DATASET_NAME LABEL_FIELD

**Arguments**

.. code-block:: text

    positional arguments:
      MODEL_NAME            the name of the zoo model
      DATASET_NAME          the name of the FiftyOne dataset to process
      LABEL_FIELD           the name of the field in which to store the predictions

    optional arguments:
      -h, --help            show this help message and exit
      -b BATCH_SIZE, --batch-size BATCH_SIZE
                            an optional batch size to use during inference
      -t THRESH, --confidence-thresh THRESH
                            an optional confidence threshold to apply to any
                            applicable labels generated by the model
      -l, --store-logits    store logits for the predictions
      -i, --install         install any requirements for the zoo model
      --error-level LEVEL   the error level in {0, 1, 2} to use when installing
                            or ensuring model requirements

**Examples**

.. code-block:: shell

    # Apply the zoo model to the dataset
    fiftyone zoo models apply <model-name> <dataset-name> <label-field>

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

.. code-block:: text

    fiftyone zoo models embed [-h] [-b BATCH_SIZE] [-i]
                              [--error-level LEVEL]
                              MODEL_NAME DATASET_NAME EMBEDDINGS_FIELD

**Arguments**

.. code-block:: text

    positional arguments:
      MODEL_NAME            the name of the zoo model
      DATASET_NAME          the name of the FiftyOne dataset to process
      EMBEDDINGS_FIELD      the name of the field in which to store the embeddings

    optional arguments:
      -h, --help            show this help message and exit
      -b BATCH_SIZE, --batch-size BATCH_SIZE
                            an optional batch size to use during inference
      -i, --install         install any requirements for the zoo model
      --error-level LEVEL   the error level in {0, 1, 2} to use when installing
                            or ensuring model requirements

**Examples**

.. code-block:: shell

    # Generate embeddings for the dataset with the zoo model
    fiftyone zoo models embed <model-name> <dataset-name> <embeddings-field>

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
