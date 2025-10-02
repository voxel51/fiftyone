.. _dataset-zoo-open-images-v6:

Open Images V6
--------------

Open Images V6 is a dataset of ~9 million images, roughly 2 million of which
are annotated and available via this zoo dataset.

The dataset contains annotations for classification, detection, segmentation,
and visual relationship tasks for the 600 boxable classes.

.. note::

    We've collaborated with the
    `Open Images Team at Google <https://storage.googleapis.com/openimages/web/download.html>`_
    to make FiftyOne a recommended tool for downloading, visualizing, and
    evaluating on the Open Images Dataset!

    Check out :ref:`this guide <open-images>` for more details on using
    FiftyOne to work with Open Images.

**Details**

-   Dataset name: ``open-images-v6``
-   Dataset source: https://storage.googleapis.com/openimages/web/index.html
-   Dataset license: CC-BY-2.0
-   Dataset size: 561 GB
-   Tags: ``image, detection, segmentation, classification``
-   Supported splits: ``train, test, validation``
-   ZooDataset class:
    :class:`OpenImagesV6Dataset <fiftyone.zoo.datasets.base.OpenImagesV6Dataset>`

**Notes**

-   Not all images contain all types of labels
-   All images have been rescaled so that their largest side is at most
    1024 pixels

**Full split stats**

-   Train split: 1,743,042 images (513 GB)
-   Test split: 125,436 images (36 GB)
-   Validation split: 41,620 images (12 GB)

**Partial downloads**

Open Images is a massive dataset, so FiftyOne provides parameters that can be
used to efficiently download specific subsets of the dataset to suit your
needs. When new subsets are specified, FiftyOne will use existing downloaded
data first if possible before resorting to downloading additional data from the
web.

The following parameters are available to configure a partial download of Open
Images V6 by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are
    ``("detections", "classifications", "relationships", "segmentations")``.
    By default, all labels types are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded. You can use
    :func:`get_classes() <fiftyone.utils.openimages.get_classes>` and
    :func:`get_segmentation_classes() <fiftyone.utils.openimages.get_segmentation_classes>`
    to see the available classes and segmentation classes, respectively

-   **attrs** (*None*): a string or list of strings specifying required
    relationship attributes to load. This parameter is only applicable if
    ``label_types`` contains ``"relationships"``. If provided, only samples
    containing at least one instance of a specified attribute will be loaded.
    You can use
    :func:`get_attributes() <fiftyone.utils.openimages.get_attributes>`
    to see the available attributes

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` or ``<image-id>`` strings.
    Alternatively, you can provide the path to a TXT (newline-separated), JSON,
    or CSV file containing the list of image IDs to load in either of the first
    two formats

-   **include_id** (*True*): whether to include the Open Images ID of each
    sample in the loaded labels

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types``, ``classes``, and/or ``attrs`` are also specified, first
    priority will be given to samples that contain all of the specified label
    types, classes, and/or attributes, followed by samples that contain at
    least one of the specified labels types or classes. The actual number of
    samples loaded may be less than this maximum value if the dataset does not
    contain sufficient samples matching your requirements

.. note::

    See
    :class:`OpenImagesV6Dataset <fiftyone.zoo.datasets.base.OpenImagesV6Dataset>`
    and :class:`OpenImagesV6DatasetImporter <fiftyone.utils.openimages.OpenImagesV6DatasetImporter>`
    for complete descriptions of the optional keyword arguments that you can
    pass to :func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`.

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load detections and classifications for 25 samples from the
        # validation split that contain fedoras and pianos
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            label_types=["detections", "classifications"],
            classes=["Fedora", "Piano"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load detections
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "open-images-v6",
            split="validation",
            label_types=["detections"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, all label types are loaded
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch open-images-v6-validation-50

        #
        # Load detections and classifications for 25 samples from the
        # validation split that contain fedoras and pianos
        #
        # Images that contain all `label_types` and `classes` will be
        # prioritized first, followed by images that contain at least one of
        # the required `classes`. If there are not enough images matching
        # `classes` in the split to meet `max_samples`, only the available
        # images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation \
            --kwargs \
                label_types=segmentations,classifications \
                classes=Fedora,Piano \
                max_samples=25

        fiftyone app launch open-images-v6-validation-25

        #
        # Download the entire validation split and load detections
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load open-images-v6 \
            --split validation

        fiftyone app launch open-images-v6-validation

.. image:: /images/dataset_zoo/open-images-v6.png
   :alt: open-images-v6
   :align: center