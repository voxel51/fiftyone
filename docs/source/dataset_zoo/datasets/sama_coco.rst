.. _dataset-zoo-sama-coco:

Sama-COCO
---------

Sama-COCO is a relabeling of COCO-2017 and is a large-scale object detection
and segmentation dataset. Masks in Sama-COCO are tighter and many crowd
instances have been decomposed into their components.

This version contains images from the COCO-2017 version of the dataset, as well
as annotations in the form of bounding boxes, and segmentation masks provided
by Sama.

**Notes**

-   Sama-COCO defines 91 classes but the data only uses 80 classes (like COCO-2017)
-   Some images from the train and validation sets don't have annotations
-   The test set does not have annotations
-   Sama-COCO has identical splits to COCO-2017

**Details**

-   Dataset name: ``sama-coco``
-   Dataset source: https://www.sama.com/sama-coco-dataset/
-   Dataset license: CC-BY-4.0
-   Dataset size: 25.67 GB
-   Tags: ``image, detection, segmentation``
-   Supported splits: ``train, validation, test``
-   ZooDataset class:
    :class:`SamaCOCODataset <fiftyone.zoo.datasets.base.SamaCOCODataset>`

**Full split stats**

-   Train split: 118,287 images
-   Test split: 40,670 images
-   Validation split: 5,000 images

**Partial downloads**

FiftyOne provides parameters that can be used to efficiently download specific
subsets of the Sama-COCO dataset to suit your needs. When new subsets are
specified, FiftyOne will use existing downloaded data first if possible before
resorting to downloading additional data from the web.

The following parameters are available to configure a partial download of
Sama-COCO by passing them to
:func:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>`:

-   **split** (*None*) and **splits** (*None*): a string or list of strings,
    respectively, specifying the splits to load. Supported values are
    ``("train", "test", "validation")``. If neither is provided, all available
    splits are loaded

-   **label_types** (*None*): a label type or list of label types to load.
    Supported values are ``("detections", "segmentations")``. By default, only
    detections are loaded

-   **classes** (*None*): a string or list of strings specifying required
    classes to load. If provided, only samples containing at least one instance
    of a specified class will be loaded

-   **image_ids** (*None*): a list of specific image IDs to load. The IDs can
    be specified either as ``<split>/<image-id>`` strings or ``<image-id>``
    ints of strings. Alternatively, you can provide the path to a TXT
    (newline-separated), JSON, or CSV file containing the list of image IDs to
    load in either of the first two formats

-   **include_id** (*False*): whether to include the COCO ID of each sample in
    the loaded labels

-   **include_license** (*False*): whether to include the COCO license of each
    sample in the loaded labels, if available. The supported values are:

    -   ``"False"`` (default): don't load the license
    -   ``True``/``"name"``: store the string license name
    -   ``"id"``: store the integer license ID
    -   ``"url"``: store the license URL

-   **only_matching** (*False*): whether to only load labels that match the
    ``classes`` or ``attrs`` requirements that you provide (True), or to load
    all labels for samples that match the requirements (False)

-   **num_workers** (*None*): the number of processes to use when downloading
    individual images. By default, `multiprocessing.cpu_count()` is used

-   **shuffle** (*False*): whether to randomly shuffle the order in which
    samples are chosen for partial downloads

-   **seed** (*None*): a random seed to use when shuffling

-   **max_samples** (*None*): a maximum number of samples to load per split. If
    ``label_types`` and/or ``classes`` are also specified, first priority will
    be given to samples that contain all of the specified label types and/or
    classes, followed by samples that contain at least one of the specified
    labels types or classes. The actual number of samples loaded may be less
    than this maximum value if the dataset does not contain sufficient samples
    matching your requirements

.. note::

    See
    :class:`SamaCOCODataset <fiftyone.zoo.datasets.base.SamaCOCODataset>` and
    :class:`COCODetectionDatasetImporter <fiftyone.utils.coco.COCODetectionDatasetImporter>`
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
        # By default, only detections are loaded
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            max_samples=50,
            shuffle=True,
        )

        session = fo.launch_app(dataset)

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            label_types=["segmentations"],
            classes=["cat", "dog"],
            max_samples=25,
        )

        session.dataset = dataset

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        dataset = foz.load_zoo_dataset(
            "sama-coco",
            split="validation",
            label_types=["detections", "segmentations"],
        )

        session.dataset = dataset

  .. group-tab:: CLI

    .. code-block:: shell

        #
        # Load 50 random samples from the validation split
        #
        # Only the required images will be downloaded (if necessary).
        # By default, only detections are loaded
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                max_samples=50

        fiftyone app launch sama-coco-validation-50

        #
        # Load segmentations for 25 samples from the validation split that
        # contain cats and dogs
        #
        # Images that contain all `classes` will be prioritized first, followed
        # by images that contain at least one of the required `classes`. If
        # there are not enough images matching `classes` in the split to meet
        # `max_samples`, only the available images will be loaded.
        #
        # Images will only be downloaded if necessary
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                label_types=segmentations \
                classes=cat,dog \
                max_samples=25

        fiftyone app launch sama-coco-validation-25

        #
        # Download the entire validation split and load both detections and
        # segmentations
        #
        # Subsequent partial loads of the validation split will never require
        # downloading any images
        #

        fiftyone zoo datasets load sama-coco \
            --split validation \
            --kwargs \
                label_types=detections,segmentations

        fiftyone app launch sama-coco-validation

.. image:: /images/dataset_zoo/sama-coco-validation.png
   :alt: sama-coco-validation
   :align: center
