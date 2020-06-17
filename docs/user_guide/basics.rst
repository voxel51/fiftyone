FiftyOne Dataset Basics
=======================

.. default-role:: code

Fiftyone :code:`Datasets` allow you to easily load, view, and modify your image
datasets along with any related classification, detection, segmentation, or
custom labels.

Dataset Properties
_____________________

`Datasets` are composed of :code:`Samples` which contain `Fields`, all of which can
be dynamically created, modified and deleted.

Samples
_______

`Samples` are the elements of `Datasets` that store all the information related
to a given image. Any `Sample` must include a file path to an image::
   sample = fo.Sample(filepath="/path/to/image.png")


Fields
______

If `Datasets` are a table where `Samples` are the rows, then `Fields` are the
columns. Every attribute that a `Sample` contains is a `Field`. 


When a new `Field` is added to a `Sample` in a `Dataset`, then all other
`Samples` are updated to include this new `Field` with a `null` value.


Tags
____


`Tags` are simply a list of strings. They are a type of `Field` that every
`Sample` includes by default::
    sample = fo.Sample(filepath="path/to/image.png", tags=["train"])
    sample.tags += ["my_tag"] 
    print(sample.tags)

    Out: ["train", "my_tag"]




Views
_____

`Views` are ways of taking your `Dataset` and looking at subsets of it without
worrying about augmenting the `Dataset` itself.
