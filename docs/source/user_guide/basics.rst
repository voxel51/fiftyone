FiftyOne Dataset Basics
=======================

.. |Dataset| replace:: ``Dataset``
.. _Dataset: ../user_guide/using_dataset.html#datasets 

.. |DatasetView| replace:: ``DatasetView``
.. _DatasetView: ../user_guide/using_dataset.html#datasetviews 

.. |Sample| replace:: ``Sample``
.. _Sample: ../user_guide/using_dataset.html#samples

.. |Field| replace:: ``Field``
.. _Field: ../user_guide/using_dataset.html#fields



A FiftyOne |Dataset| is the understood format that can be visualized in the
:doc:`FiftyOne App <app>`.

.. image:: ../images/dog.png
   :alt: App
   :align: center
   :target: app.html

Datasets
________

What is a fiftyone.Dataset and what can it do for me?
------------------------------------------------------

The FiftyOne |Dataset|_ class allows you to easily
:doc:`load <dataset_creation/index>`, :doc:`modify <using_dataset>` and
:doc:`visualize <app>` your data along with any related labels
(classification, detection, segmentation, etc).
It provides a way to easily load images, annotations, and model predictions
into a format that can be visualized in the FiftyOne App. 


If you have your own collection of data, loading it as a |Dataset|_ will allow
you to easily search and sort your samples. 
You can use FiftyOne to identify unique samples as well as possible mistakes in
|Sample|_ labels.

If you are training a model, the output predictions and logits can be loaded
into your |Dataset|_. 
The FiftyOne App makes it easy to visually debug what
your model has learned, even for complex label types like detection and
segmentation masks.  
With this knowledge, you can update your |Dataset|_ to include more
representative samples and samples that your model found difficult into your
training set.


.. note::
    Checkout out our :doc:`dataset loading guide <dataset_creation/index>` to load
    your dataset into FiftyOne.

Dataset Details
---------------

A |Dataset|_ is composed of multiple |Sample|_ objects which contain 
|Field|_ attributes, all of which can
be dynamically created, modified and deleted.
FiftyOne uses a lightweight non-relational database to store a |Dataset|_, so
usage is easy on your computer's memory and scalable.

A |Dataset|_ should be thought of as an unordered collection. Samples can be
added to it and they can be accessed by key. However, slicing and sorting
of a |Dataset|_ is done through the use of a |DatasetView|_. A |DatasetView|_ allows
for an ordered look into the |Dataset|_ or a subset of the |Dataset|_ along user
specified axes.

Samples
_______

A |Sample|_ is the elements of a |Dataset|_ that store all the information related
to a given image. Any |Sample|_ must include a file path to an image:

.. code-block:: python

   import fiftyone as fo

   sample = fo.Sample(filepath="/path/to/image.png")

Fields
______

A |Field|_ is a special attribute of a |Sample|_ that is shared across all
samples in a |Dataset|_.
If a |Dataset|_ were a table where each row is a |Sample|_, then each column
would be a |Field|_.

Fields can be dynamically created, modified, and deleted. When a new |Field|
is assigned for a |Sample|_ in a |Dataset|_, it is automatically added to the
dataset's schema and thus accessible on each other |Sample|_ in the |Dataset|_.
When unset, the default |Field|_ value will be ``None``.

Tags
____

``Sample.tags`` is a default |Field|_ of any |Sample|_. Tags are simply a list of
strings and can be used to tag a |Sample|_ as part of a train/test split or any
other tagging that you would like:

.. code-block:: python

    sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
    sample.tags += ["my_favorite_samples"]

    print(sample.tags)
    # ["train", "my_favorite_samples"]

DatasetViews
____________

A |DatasetView|_ is a powerful and fast tool for taking your |Dataset|_ and
looking at subsets of it without worrying about augmenting the |Dataset|
itself.
