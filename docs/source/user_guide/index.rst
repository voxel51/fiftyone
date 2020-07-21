FiftyOne User Guide
===================

.. include:: ../substitutions.rst

Welcome to the FiftyOne User Guide!

Each section in this guide provides an example-centric deep dive into a core
feature of FiftyOne, with the goal of getting you up-and-running with FiftyOne
on your data quickly and easily.

FiftyOne Dataset basics
-----------------------

:doc:`Learn the basics <basics>` of the FiftyOne |Dataset| class and its
relation to |Sample|, |Field|, tags and |DatasetView|.

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

Creating FiftyOne Datasets
--------------------------

:doc:`Learn how to get your data into FiftyOne <dataset_creation/index>` using
standard formats, custom formats, or from open-source datasets via the Dataset
Zoo.

.. code-block:: python
   :linenos:

   dataset = fo.Dataset.from_dir(
       dataset_dir="/path/to/dataset",
       dataset_type=fo.types.COCODetectionDataset,
       name="my-coco-format-dataset",
   )

Using datasets
--------------

:doc:`Using FiftyOne datasets <using_datasets>` to search, sort, and modify
your data.

.. code-block:: python
   :linenos:

   view = (
       dataset.view()
       .match({"tags": "test"})
       .exists("metadata")
       .sort_by("filepath")
       .limit(5)
   )

Exporting datasets
------------------

:doc:`Export datasets <export_datasets>` to disk in any number of formats.

.. code-block:: python
   :linenos:

   dataset.export(
       export_dir=export_dir, dataset_type=fo.types.COCODetectionDataset
   )

Visualizing datasets in the App
-------------------------------

:doc:`Visualizing your datasets in the FiftyOne App <app>` and interactively
search, sort, and filter them.

.. image:: ../images/dog.png
   :alt: App
   :align: center

The FiftyOne Brain
------------------

:doc:`Use the FiftyOne Brain <brain>` to automatically get insights into your
datasets.

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.view().sort_by("uniqueness")

Configuring FiftyOne
--------------------

:doc:`Configure FiftyOne's default behavior <config>` to suit your needs.

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
