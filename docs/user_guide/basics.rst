FiftyOne Dataset Basics
=======================

.. default-role:: code

Fiftyone `Datasets` allow you to easily :doc:`load <dataset_creation/index>`,
:doc:`view <app>`, and :doc:`modify <using_dataset>` your image datasets along
with any related labels (classification, detection, segmentation, etc).

`Datasets` can be visualized in the :doc:`FiftyOne App <app>`.

.. image:: ../images/dog.png
   :alt: App
   :align: center
   :target: app.html

Datasets
________

`Datasets` are composed of `Samples` which contain `Fields`, all of which can
be dynamically created, modified and deleted.
`Datasets` do not store all images in memory, instead storing image paths and
then caching data as needed.

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

If `Datasets` are a table where `Samples` are the rows, then `Fields` are the
columns. Every attribute that a `Sample` contains is a `Field`.

`Fields` can be dynamically created, modified, and deleted.
When a new `Field` is added to a `Sample` in a `Dataset`, then all other
`Samples` are updated to include this new `Field` with a `null` value.

Tags
____

`Tags` are simply a list of strings. This field is automatically included on
all `Samples` (defaulting to an empty list):

.. code-block:: python

    sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
    sample.tags += ["my_tag"]
    print(sample.tags)

.. code-block:: plain

    Out: ["train", "my_tag"]

DatasetViews
____________

`DatasetViews` are ways of taking your `Dataset` and looking at subsets of it
without worrying about augmenting the `Dataset` itself.
