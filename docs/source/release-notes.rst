FiftyOne Release Notes
======================

Future changes
--------------

- Added an option to image loaders in :mod:`fiftyone.utils.torch` to convert
  images to RGB
- Fixed an issue where :func:`fiftyone.core.dataset.Dataset.delete_sample_field`
  would not permanently delete fields if they were modified after deletion
- Fixed an issue that could cause launching the app to fail on Windows under
  Python 3.6 and older
- Improved the string representation of :class:`fiftyone.core.stages.ViewStage`
  instances

FiftyOne 0.3.0
--------------
Released June 24, 2020

- Added support for importing and exporting datasets in several common formats:
    - COCO: :class:`fiftyone.types.dataset_types.COCODetectionDataset`
    - VOC: :class:`fiftyone.types.dataset_types.VOCDetectionDataset`
    - KITTI: :class:`fiftyone.types.dataset_types.KITTIDetectionDataset`
    - Image classification TFRecords:
      :class:`fiftyone.types.dataset_types.TFImageClassificationDataset`
    - TF Object Detection API TFRecords:
      :class:`fiftyone.types.dataset_types.TFObjectDetectionDataset`
    - CVAT image: :class:`fiftyone.types.dataset_types.CVATImageDataset`
    - Berkeley DeepDrive: :class:`fiftyone.types.dataset_types.BDDDataset`
- Added :func:`fiftyone.core.dataset.Dataset.add_dir` and
  :func:`fiftyone.core.dataset.Dataset.from_dir` to allow for ingestion of
  datasets on disk in any supported format
- Added :func:`fiftyone.utils.data.convert_dataset` to convert between supported
  dataset formats
- Added support for downloading COCO 2014/2017 through the FiftyOne zoo via the
  Torch backend
- Fixed an issue that could prevent the app from connecting to the FiftyOne
  backend

CLI
^^^
- Added ``fiftyone convert`` to convert datasets on disk between any supported
  formats
- Added ``fiftyone datasets head`` and ``fiftyone datasets tail`` to print the
  head/tail of datasets
- Added ``fiftyone datasets stream`` to stream the samples in a dataset to the
  terminal with a ``less``-like interface
- Added ``fiftyone datasets export`` to export datasets in any available format



FiftyOne 0.2.1
--------------
Released June 19, 2020

- Added preliminary Windows support
- Fixed an issue that could cause port forwarding to hang when initializing a
  remote session
- Changed :func:`fiftyone.core.dataset.Dataset.add_images_dir` to skip
  non-images
- Improved performance of adding samples to datasets

FiftyOne 0.2.0
--------------
Released June 12, 2020

- Added support for persistent datasets
- Added support for creating datasets and launching the dashboard via the `CLI`
- Added a class-based view stage approach, :mod:`fiftyone.core.stages`
- Added support for serializing collections as JSON and reading datasets from
  JSON
- Added support for storing numpy arrays in samples
- Added a config option to control visibility of progress bars
- Added progress reporting to :func:`fiftyone.core.dataset.Dataset.add_samples`
- Added :func:`fiftyone.core.collections.SampleCollection.compute_metadata` to
  enable population of the ``metadata`` fields of samples
- Improved reliability of shutting down the dashboard and database services
- Improved string representations of :class:`fiftyone.core.dataset.Dataset` and
  :class:`fiftyone.core.sample.Sample` objects

App
^^^

- Added distribution graphs for label fields
- Fixed an issue causing cached images from previously-loaded datasets to be
  displayed after loading a new dataset
