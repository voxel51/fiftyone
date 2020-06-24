FiftyOne Dataset Basics
=======================

.. default-role:: code

The FiftyOne `Dataset` class allows you to easily
:doc:`load <dataset_creation/index>`, :doc:`modify <using_dataset>` and
:doc:`visualize <app>` your data along with any related labels
(classification, detection, segmentation, etc).


.. note::
    Checkout out our :doc:`dataset loading guide <dataset_creation/index>` to load
    your dataset into FiftyOne.


`Dataset` is the understood format that can be visualized in the
:doc:`FiftyOne App <app>`.

.. image:: ../images/dog.png
   :alt: App
   :align: center
   :target: app.html

Datasets
________

`Datasets` are composed of `Samples` which contain `Fields`, all of which can
be dynamically created, modified and deleted.
FiftyOne uses a lightweight non-relational database to store `Datasets`, so
usage is easy on your computer's memory and scalable.

`Datasets` should be thought of as unordered collections. `Samples` can be
added to them and they can be accessed by key. However, slicing and sorting
of `Datasets` is done through the use of `DatasetViews`. `DatasetViews` allow
for an ordered look into the `Dataset` or a subset of the `Dataset` along user
specified axes.

Samples
_______

`Samples` are the elements of `Datasets` that store all the information related
to a given image. Any `Sample` must include a file path to an image:

.. code-block:: python

   import fiftyone as fo

   sample = fo.Sample(filepath="/path/to/image.png")

Fields
______

A `Field` is a special attribute of a `Sample` that is shared across all
`Samples` in a `Dataset`.
If a `Dataset` were a table where each row is a `Sample`, then each column
would be a `Field`.

`Fields` can be dynamically created, modified, and deleted. When a new `Field`
is assigned for a `Sample` in a `Dataset`, it is automatically added to the
`Dataset`'s schema and thus accessible on each other `Sample` in the `Dataset`.
When unset, the default `Field` value will be `None`.

Tags
____

`Sample.tags` is a default `Field` of any `Sample`. Tags are simply a list of
strings and can be used to tag a `Sample` as part of a train/test split or any
other tagging that you would like:

.. code-block:: python

    sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
    sample.tags += ["my_favorite_samples"]
    print(sample.tags)

.. code-block:: text

    ["train", "my_favorite_samples"]

DatasetViews
____________

`DatasetViews` are a powerful and fast tool for taking your `Dataset` and
looking at subsets of it without worrying about augmenting the `Dataset`
itself.
