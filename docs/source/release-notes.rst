FiftyOne Release Notes
======================

.. default-role:: code
.. include:: substitutions.rst

FiftyOne 0.4.0
--------------
*Released July 21, 2020*

Core
^^^^
- Added support for importing datasets in custom formats via the
  |DatasetImporter| interface
- Added support for exporting datasets to disk in custom formats via the
  |DatasetExporter| interface
- Added support for parsing individual elements of samples in the
  |SampleParser| interface
- Added an option to image loaders in :mod:`fiftyone.utils.torch` to convert
  images to RGB
- Fixed an issue where
  :meth:`Dataset.delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`
  would not permanently delete fields if they were modified after deletion
- Improved the string representation of |ViewStage| instances

App
^^^
- Fixed an issue that could cause launching the App to fail on Windows under
  Python 3.6 and older

Documentation
~~~~~~~~~~~~~
- Added a recipe demonstrating how to
  :doc:`convert datasets </recipes/convert_datasets>` on disk between common
  formats
- Added recipes demonstratings how to write your own
  :doc:`custom dataset importers </recipes/custom_importer>` and
  :doc:`custom dataset exporters </recipes/custom_exporter>`
- Added a :doc:`Configuring FiftyOne </user_guide/config>` page to the User
  Guide that explains how to customize your FiftyOne Config

FiftyOne 0.3.0
--------------
*Released June 24, 2020*

Core
^^^^
- Added support for importing and exporting datasets in several common formats:
    - COCO: :class:`COCODetectionDataset <fiftyone.types.dataset_types.COCODetectionDataset>`
    - VOC: :class:`VOCDetectionDataset <fiftyone.types.dataset_types.VOCDetectionDataset>`
    - KITTI: :class:`KITTIDetectionDataset <fiftyone.types.dataset_types.KITTIDetectionDataset>`
    - Image classification TFRecords:
      :class:`TFImageClassificationDataset <fiftyone.types.dataset_types.TFImageClassificationDataset>`
    - TF Object Detection API TFRecords:
      :class:`TFObjectDetectionDataset <fiftyone.types.dataset_types.TFObjectDetectionDataset>`
    - CVAT image: :class:`CVATImageDataset <fiftyone.types.dataset_types.CVATImageDataset>`
    - Berkeley DeepDrive: :class:`BDDDataset <fiftyone.types.dataset_types.BDDDataset>`
- Added :meth:`Dataset.add_dir() <fiftyone.core.dataset.Dataset.add_dir>` and
  :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to allow
  for importing datasets on disk in any supported format
- Added a :meth:`convert_dataset() <fiftyone.utils.data.converters.convert_dataset>`
  method to convert between supported dataset formats
- Added support for downloading COCO 2014/2017 through the FiftyOne Dataset Zoo
  via the Torch backend

App
^^^
- Fixed an issue that could prevent the App from connecting to the FiftyOne
  backend

CLI
^^^
- Added `fiftyone convert` to convert datasets on disk between any supported
  formats
- Added `fiftyone datasets head` and `fiftyone datasets tail` to print the
  head/tail of datasets
- Added `fiftyone datasets stream` to stream the samples in a dataset to the
  terminal with a `less`-like interface
- Added `fiftyone datasets export` to export datasets in any available format

FiftyOne 0.2.1
--------------
*Released June 19, 2020*

Core
^^^^
- Added preliminary Windows support
- :meth:`Dataset.add_images_dir() <fiftyone.core.dataset.Dataset.add_images_dir>`
  now skips non-images
- Improved performance of adding samples to datasets

CLI
^^^
- Fixed an issue that could cause port forwarding to hang when initializing a
  remote session

FiftyOne 0.2.0
--------------
*Released June 12, 2020*

Core
^^^^
- Added support for persistent datasets
- Added a class-based view stage approach via the |ViewStage| interface
- Added support for serializing collections as JSON and reading datasets from
  JSON
- Added support for storing numpy arrays in samples
- Added a config option to control visibility of progress bars
- Added progress reporting to
  :meth:`Dataset.add_samples() <fiftyone.core.dataset.Dataset.add_samples>`
- Added a :meth:`compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`
  method to enable population of the `metadata` fields of samples
- Improved reliability of shutting down the App and database services
- Improved string representations of |Dataset| and |Sample| objects

App
^^^
- Added distribution graphs for label fields
- Fixed an issue causing cached images from previously-loaded datasets to be
  displayed after loading a new dataset

CLI
^^^
- Added support for creating datasets and launching the App
