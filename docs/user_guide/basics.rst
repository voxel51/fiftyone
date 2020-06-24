FiftyOne Dataset Basics
=======================

.. default-role:: code

Fiftyone `Datasets` allow you to easily :doc:`load <making_dataset>`, :doc:`view <app>`, and :doc:`modify <using_dataset>` your image
datasets along with any related :doc:`classification, detection, segmentation, or custom labels <making_dataset>`.


.. note::
    Checkout out our :doc:`dataset loading guide <dataset_creation/index>` to load
    your dataset into FiftyOne.

`Datasets` can be visualized in the :doc:`FiftyOne App <app>`.

.. image:: ../images/dog.png
   :alt: App 
   :align: center
   :target: app.html


Dataset Properties
_____________________

`Datasets` are composed of `Samples` which contain `Fields`, all of which can
be dynamically created, modified and deleted.
FiftyOne `Datasets` use a lightweight relational database to store data so it is easy on
your system and scalable to the large datasets of today.


`Datasets` should be thought of as unordered collections. `Samples` can be
added to them and they can be accessed by key. However, slicing and sorting
of `Datasets` is done through the use of `Views`. `Views` allow for an ordered
look into the `Dataset` or a subset of the `Dataset` along user specified axes.


Samples
_______

`Samples` are the elements of `Datasets` that store all the information related
to a given image. Any `Sample` must include a file path to an image::
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


`Tags` are simply a list of strings. They are a type of `Field` that every
`Sample` includes by default. Ex::
    sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
    sample.tags += ["my_tag"] 
    print(sample.tags)

    Out: ["train", "my_tag"]




Views
_____

`Views` are ways of taking your `Dataset` and looking at subsets of it without
worrying about augmenting the `Dataset` itself.


