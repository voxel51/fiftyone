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
    view = dataset.match_tag("test").sort_by("custom_field", reverse=True).limit(1)
    for sample in view:
        print(sample)

:doc:`Creating FiftyOne Datasets <dataset_creation/index>`
----------------------------------------------------------

Get your data into FiftyOne using standard formats, custom formats, or
open-source datasets via the Dataset Zoo.

:doc:`>> Learn more about creating FiftyOne datasets! <dataset_creation/index>`

.. code-block:: python
   :linenos:

   dataset = fo.Dataset.from_dir(
       dataset_dir="/path/to/dataset",
       dataset_type=fo.types.COCODetectionDataset,
       name="my-coco-format-dataset",
   )

:doc:`Dataset details <using_datasets>`
--------------------------------------

Get details about how to access and modify samples, fields, and labels in your 
|Dataset|.

:doc:`>> Learn more about datasets, samples, fields, and labels! <using_datasets>`

.. code-block:: python
   :linenos:

   sample = dataset[sample_id]
   sample["ground_truth"] = fo.Classification(label="alligator")
   sample.save()


:doc:`Exploring datasets <using_datasets>`
--------------------------------------

Take a deep dive into FiftyOne datasets and how to use them to search, sort,
and filter your data.

:doc:`>> Learn more about exploring datasets! <using_views>`

.. code-block:: python
   :linenos:

   view = (
       dataset.match_tag("test")
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

:doc:`Drawing labels on samples <draw_labels>`
----------------------------------------------

Render labels on the samples in your FiftyOne dataset with a single line of
code.

:doc:`>> Learn more about drawing labels on samples! <draw_labels>`

.. code-block:: python
   :linenos:

   anno_dir = "/path/for/annotated/images"
   label_fields = ["ground_truth", "predictions"]

   dataset.draw_labels(anno_dir, label_fields=label_fields)

:doc:`Visualizing datasets in the App <app>`
--------------------------------------------

Visualize your datasets in the FiftyOne App and interactively search, sort, and
filter them.

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
   rank_view = dataset.sort_by("uniqueness")

:doc:`Configuring FiftyOne <config>`
------------------------------------

Configure FiftyOne's behavior to suit your needs.

:doc:`>> Learn how to configure FiftyOne! <config>`

.. code-block:: shell
   :linenos:

   export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow

.. toctree::
    :maxdepth: 1
    :hidden:

    Dataset basics<basics>
    Creating datasets<dataset_creation/index>
    Dataset details<using_datasets>
    Dataset views<using_views>
    Exporting datasets<export_datasets>
    Drawing labels on samples<draw_labels>
    Viewing datasets in the App<app>
    FiftyOne Brain<brain>
    Configuring FiftyOne<config>
