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
to a given image. Any `Sample` must include a file path to an image.::

    sample = fo.Sample(filepath="/path/to/image.png")


Fields
______


Tags
____


Views
_____
