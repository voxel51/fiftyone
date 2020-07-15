FiftyOne Dataset Basics
=======================

.. include:: ../substitutions.rst
.. default-role:: code

FiftyOne Datasets are the core data structure in FiftyOne, allowing you to
represent your data and manipulate it through the Python library and the
:doc:`FiftyOne App <app>`.

.. image:: ../images/dog.png
   :alt: App
   :align: center
   :target: app.html

Datasets
________

.. _what-is-a-fiftyone-dataset:

What is a FiftyOne Dataset?
---------------------------

:ref:`FiftyOne Datasets <using-datasets>` allow you to easily
:doc:`load <dataset_creation/index>`, :doc:`modify <using_datasets>` and
:doc:`visualize <app>` your data along with any related labels
(classification, detection, segmentation, etc).
It provides a way to easily load images, annotations, and model predictions
into a format that can be visualized in the FiftyOne App.

If you have your own collection of data, loading it as a |Dataset| will allow
you to easily search and sort your samples. You can use FiftyOne to identify
unique samples as well as possible mistakes in your labels.

If you are training a model, the output predictions and logits can be loaded
into your |Dataset|. The FiftyOne App makes it easy to visually debug what
your model has learned, even for complex label types like detection and
segmentation masks. With this knowledge, you can update your |Dataset| to
include more representative samples and samples that your model found difficult
into your training set.

.. note::
    Check out the :doc:`dataset loading guide <dataset_creation/index>` to see
    how to load your data into FiftyOne.

A |Dataset| is composed of multiple |Sample| objects which contain |Field|
attributes, all of which can be dynamically created, modified and deleted.
FiftyOne uses a lightweight non-relational database to store datasets, so you
can easily scale to datasets of  with datasets of any size
usage is easy on your computer's memory and scalable.

Datasets should be thought of as an unordered collection. When a |Sample| is
added to a |Dataset|, it is assigned a unique ID that can be used to retrieve
the sample from the dataset.

Slicing and sorting a |Dataset| is done through the use of a
:ref:`DatasetView <using-dataset-views>`. A |DatasetView| provides an ordered
view into the |Dataset|, which can be filtered, sorted, sampled, etc. along
various axes to obtain a desired subset of the samples.

Samples
_______

:ref:`Samples <using-samples>` are the atomic elements of a |Dataset| that
store all the information related to a given piece of data (e.g., an image).
All |Sample| instances store the path to their source data on disk:

.. code-block:: python
   :linenos:

   import fiftyone as fo

   sample = fo.Sample(filepath="/path/to/image.png")

Fields
______

:ref:`Fields <using-fields>` are attributes of |Sample| instances that store
customizable information about the samples. Thinking of a |Dataset| as a table
where each row is a |Sample|, then each column of the table would be a |Field|.

Fields can be dynamically created, modified, and deleted. When a new |Field|
is assigned to a |Sample| in a |Dataset|, it is automatically added to the
dataset's schema and thus accessible on all other samples in the dataset. If
a |Field| is unset on a particular |Sample|, it's value will be ``None``.

Tags
____

:ref:`Tags <using-tags>` are a default |Field| provided on all |Sample|
instances. The `tags` attribute of a |Sample| stores a list of strings that can
be used flexibly to store information about a sample.

A typical use case is to tag the dataset split
(`test`, `train`, `validation`) to which the |Sample| belongs.
However, you are free to use tags however you like:

.. code-block:: python
   :linenos:

   sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
   sample.tags += ["my_favorite_samples"]
   print(sample.tags)
   # ["train", "my_favorite_samples"]

DatasetViews
____________

:ref:`DatasetViews <using-dataset-views>` are a powerful tool for exploring
your datasets. You can use |DatasetView| instances to search, filter, sort, and
manipulate subsets of your datasets to perform the analysis that you need.
