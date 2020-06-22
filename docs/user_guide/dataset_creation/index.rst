Loading a Dataset
=================

.. default-role:: code

FiftyOne supports automatic loading of `Datasets` stored in various common
formats. If your labeled data is stored in a custom format, don't worry, FiftyOne provides support for easily loading your custom data as well.


There are three overarching categories for any data that is to be loaded into
FiftyOne:

* **Common Datasets**: Datasets that are stored on disk in a format following a
  commonly used dataset or structure. 

* **Zoo Datasets**: Popular image datasets that exist in `Tensorflow` or
  `TorchVision` are available in FiftyOne through the use of a single line of
  code.

* **Custom Datasets**: Any label format for an image dataset can be loaded into
  FiftyOne by providing the samples and their fields in a variety of formats.



**Quick Start**: Load and view a directory of images in FiftyOne by entering the
following commands into Python::

    import fiftyone as fo

    name = "my-images-dir"
    dataset_dir = "/path/to/images-dir"

    # Create the dataset
    dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory,
    name=name)

    # Visualize the dataset
    session = fo.launch_dashboard(dataset=dataset)


.. toctree::
   :maxdepth: 1
   :hidden:
   
   Common Datasets <disk_datasets>
   Zoo Datasets <zoo_datasets>
   Custom Datasets <custom_datasets>
