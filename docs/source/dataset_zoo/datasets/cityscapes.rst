.. _dataset-zoo-cityscapes:

Cityscapes
----------

Cityscapes is a large-scale dataset that contains a diverse set of
stereo video sequences recorded in street scenes from 50 different cities,
with high quality pixel-level annotations of 5,000 frames in addition to a
larger set of 20,000 weakly annotated frames.

The dataset is intended for:

-   Assessing the performance of vision algorithms for major tasks of
    semantic urban scene understanding: pixel-level, instance-level, and
    panoptic semantic labeling
-   Supporting research that aims to exploit large volumes of (weakly)
    annotated data, e.g. for training deep neural networks

.. note::

    In order to load the Cityscapes dataset, you must download the source data
    manually. The directory should be organized in the following format:

    .. code-block:: text

        source_dir/
            leftImg8bit_trainvaltest.zip
            gtFine_trainvaltest.zip             # optional
            gtCoarse.zip                        # optional
            gtBbox_cityPersons_trainval.zip     # optional

    You can register at https://www.cityscapes-dataset.com/register in order
    to get links to download the data.

**Details**

-   Dataset name: ``cityscapes``
-   Dataset source: https://www.cityscapes-dataset.com
-   Dataset license: https://www.cityscapes-dataset.com/license
-   Dataset size: 11.80 GB
-   Tags: ``image, multilabel, automotive, manual``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`CityscapesDataset <fiftyone.zoo.datasets.base.CityscapesDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        # The path to the source files that you manually downloaded
        source_dir = "/path/to/dir-with-cityscapes-files"

        dataset = foz.load_zoo_dataset(
            "cityscapes",
            split="validation",
            source_dir=source_dir,
        )

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        # The path to the source files that you manually downloaded
        SOURCE_DIR="/path/to/dir-with-cityscapes-files"

        fiftyone zoo datasets load cityscapes --split validation \
            --kwargs "source_dir=${SOURCE_DIR}"

        fiftyone app launch cityscapes-validation

.. image:: /images/dataset_zoo/cityscapes-validation.png
   :alt: cityscapes-validation
   :align: center
