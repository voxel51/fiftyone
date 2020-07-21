FiftyOne User Guide
===================

.. include:: ../substitutions.rst

Welcome to the FiftyOne User Guide!

Each section in this guide provides an example-centric deep dive into a core
feature of FiftyOne, with the goal of getting you up-and-running with FiftyOne
on your data quickly and easily.

:doc:`FiftyOne Dataset basics <basics>`
---------------------------------------

Learn the basics of the FiftyOne |Dataset| class and its relation to |Sample|,
|Field|, tags and |DatasetView|.

:doc:`>> Learn more about dataset basics! <basics>`

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")
    sample = fo.Sample(filepath="path/to/img.png")
    dataset.add_sample(sample)
    sample.tags += ["train"]
    sample["custom_field"] = 51
    view = (
        dataset.view()
        .match_tag("test")
        .sort_by("custom_field", reverse=True)
        .limit(1)
    )
    for sample in view:
        print(sample)

:doc:`Creating FiftyOne Datasets <dataset_creation/index>`
----------------------------------------------------------

Learn how to get your data into FiftyOne using standard formats, custom
formats, or from open-source datasets via the Dataset Zoo.

:doc:`>> Learn more about creating FiftyOne datasets! <dataset_creation/index>`

.. code-block:: python
   :linenos:

   dataset = fo.Dataset.from_dir(
       dataset_dir="/path/to/dataset",
       dataset_type=fo.types.COCODetectionDataset,
       name="my-coco-format-dataset",
   )

:doc:`Using datasets <using_datasets>`
--------------------------------------

Use FiftyOne datasets to search, sort, and modify your data.

:doc:`>> Learn more about using datasets! <using_datasets>`

.. code-block:: python
   :linenos:

   view = (
       dataset.view()
       .match({"tags": "test"})
       .exists("metadata")
       .sort_by("filepath")
       .limit(5)
   )

:doc:`Exporting datasets <export_datasets>`
-------------------------------------------

Export datasets to disk in any number of formats.

:doc:`>> Learn more about exporting datasets! <export_datasets>`

.. code-block:: python
   :linenos:

   dataset.export(
       export_dir=export_dir, dataset_type=fo.types.COCODetectionDataset
   )

:doc:`Visualizing datasets in the App <app>`
--------------------------------------------

Visualizing your datasets in the FiftyOne App and interactively search, sort,
and filter them.

:doc:`>> Learn more about visualizing datasets! <app>`

.. image:: ../images/dog.png
   :alt: App
   :align: center

:doc:`The FiftyOne Brain <brain>`
---------------------------------

Use the FiftyOne Brain to automatically get insights into your datasets.

:doc:`>> Learn more about the FiftyOne Brain! <brain>`

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.view().sort_by("uniqueness")

:doc:`Configuring FiftyOne <config>`
------------------------------------

Configure FiftyOne's default behavior to suit your needs.

:doc:`>> Learn how to configure FiftyOne! <config>`

.. code-block:: shell
   :linenos:

   export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow

.. toctree::
    :maxdepth: 1
    :hidden:

    Dataset basics<basics>
    Creating datasets<dataset_creation/index>
    Using datasets<using_datasets>
    Exporting datasets<export_datasets>
    Viewing datasets in the App<app>
    FiftyOne Brain<brain>
    Configuring FiftyOne<config>
