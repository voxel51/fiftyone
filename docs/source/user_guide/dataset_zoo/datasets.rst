
.. _dataset-zoo-datasets:

Available Datasets
==================

.. default-role:: code

This page lists all of the datasets available in the Dataset Zoo.

.. note::

    Check out the :ref:`API reference <dataset-zoo-api>` for complete
    instructions for using the Dataset Zoo library.

.. _dataset-zoo-bdd100k:

BDD100K
-------

Description
~~~~~~~~~~~

The Berkeley Deep Drive (BDD) dataset is one of the largest and most diverse
video datasets for autonomous vehicles.

The BDD100K dataset contains 100,000 video clips collected from more than
50,000 rides covering New York, San Francisco Bay Area, and other regions.
The dataset contains diverse scene types such as city streets, residential
areas, and highways. Furthermore, the videos were recorded in diverse
weather conditions at different times of the day.

The videos are split into training (70K), validation (10K) and testing
(20K) sets. Each video is 40 seconds long with 720p resolution and a frame
rate of 30fps. The frame at the 10th second of each video is annotated for
image classification, detection, and segmentation tasks.

This version of the dataset contains only the 100K images extracted from
the videos as described above, together with the image classification,
detection, and segmentation labels.

.. note::

    In order to load the BDD100K dataset, you must download the source data
    manually. The directory should be organized in the following format:

    .. code-block:: text

        source_dir/
            labels/
                bdd100k_labels_images_train.json
                bdd100k_labels_images_val.json
            images/
                100k/
                    train/
                    test/
                    val/

    You can register at https://bdd-data.berkeley.edu in order to get links
    to download the data.

Details
~~~~~~~

-   Dataset source: https://bdd-data.berkeley.edu

-   Dataset size: 7.1GB

-   Tags: ``image, multilabel, automotive, manual``

-   Supported splits: ``train, validation, test``

Example usage
~~~~~~~~~~~~~

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # The path to the source files that you manually downloaded
    SOURCE_DIR="/path/to/dir-with-bdd100k-files"

    # First parse the manually downloaded files
    foz.download_zoo_dataset("bdd100k", source_dir=SOURCE_DIR)

    # Now load into FiftyOne
    dataset = foz.load_zoo_dataset("bdd100k", split="validation")

    # View dataset in the App
    session = fo.launch_app(dataset)
