"""
FiftyOne dataset types.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.utils as etau


class Dataset(object):
    """Base type for datasets."""

    def get_dataset_importer_cls(self):
        """Returns the :class:`fiftyone.utils.data.importers.DatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.DatasetImporter` class
        """
        raise TypeError(
            "Dataset type '%s' does not support imports"
            % etau.get_class_name(self)
        )

    def get_dataset_exporter_cls(self):
        """Returns the :class:`fiftyone.utils.data.exporters.DatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.DatasetExporter` class
        """
        raise TypeError(
            "Dataset type '%s' does not support exports"
            % etau.get_class_name(self)
        )


class UnlabeledDataset(Dataset):
    """Base type for datasets that represent an unlabeled collection of data
    samples.
    """

    pass


class UnlabeledImageDataset(UnlabeledDataset):
    """Base type for datasets that represent an unlabeled collection of images."""

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
            class
        """
        return super().get_dataset_importer_cls()

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
            class
        """
        return super().get_dataset_exporter_cls()


class UnlabeledVideoDataset(UnlabeledDataset):
    """Base type for datasets that represent an unlabeled collection of videos."""

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
            class
        """
        return super().get_dataset_importer_cls()

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
            class
        """
        return super().get_dataset_exporter_cls()


class LabeledDataset(Dataset):
    """Base type for datasets that represent a collection of data samples and
    their associated labels.
    """

    pass


class LabeledImageDataset(LabeledDataset):
    """Base type for datasets that represent a collection of images and their
    associated labels.
    """

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter`
            class
        """
        return super().get_dataset_importer_cls()

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
            class
        """
        return super().get_dataset_exporter_cls()


class LabeledVideoDataset(LabeledDataset):
    """Base type for datasets that represent a collection of videos and their
    associated labels.
    """

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`
            class
        """
        return super().get_dataset_importer_cls()

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
            class
        """
        return super().get_dataset_exporter_cls()


class ImageClassificationDataset(LabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated classification labels.
    """

    pass


class VideoClassificationDataset(LabeledVideoDataset):
    """Base type for datasets that represent a collection of videos and a set
    of associated classification labels.
    """

    pass


class ImageDetectionDataset(LabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated detections.
    """

    pass


class VideoDetectionDataset(LabeledVideoDataset):
    """Base type for datasets that represent a collection of videos and a set
    of associated video detections.
    """

    pass


class ImageSegmentationDataset(LabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated semantic segmentations.
    """

    pass


class ImageLabelsDataset(LabeledImageDataset):
    """Base type for datasets that represent a collection of images and a set
    of associated multitask predictions.
    """

    pass


class VideoLabelsDataset(LabeledVideoDataset):
    """Base type for datasets that represent a collection of videos and a set
    of associated multitask predictions.
    """

    pass


class GroupDataset(Dataset):
    """Base type for datasets that contain grouped samples of any type(s)."""

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.GroupDatasetImporter` class for
        importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.GroupDatasetImporter` class
        """
        return super().get_dataset_importer_cls()

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.GroupDatasetExporter` class for
        exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.GroupDatasetExporter` class
        """
        return super().get_dataset_exporter_cls()


class ImageDirectory(UnlabeledImageDataset):
    """A directory of images.

    See :ref:`this page <ImageDirectory-import>` for importing datasets of this
    type, and see :ref:`this page <ImageDirectory-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageDirectoryExporter


class VideoDirectory(UnlabeledImageDataset):
    """A directory of videos.

    See :ref:`this page <VideoDirectory-import>` for importing datasets of this
    type, and see :ref:`this page <VideoDirectory-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoDirectoryExporter


class MediaDirectory(UnlabeledDataset):
    """A directory of media files.

    See :ref:`this page <MediaDirectory-import>` for importing datasets of this
    type, and see :ref:`this page <MediaDirectory-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.MediaDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.MediaDirectoryExporter


class FiftyOneImageClassificationDataset(ImageClassificationDataset):
    """A labeled dataset consisting of images and their associated
    classification labels stored in a simple JSON format.

    See :ref:`this page <FiftyOneImageClassificationDataset-import>` for
    importing datasets of this type, and see
    :ref:`this page <FiftyOneImageClassificationDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageClassificationDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageClassificationDatasetExporter


class ImageClassificationDirectoryTree(ImageClassificationDataset):
    """A directory tree whose subfolders define an image classification
    dataset.

    See :ref:`this page <ImageClassificationDirectoryTree-import>` for
    importing datasets of this type, and see
    :ref:`this page <ImageClassificationDirectoryTree-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageClassificationDirectoryTreeImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageClassificationDirectoryTreeExporter


class VideoClassificationDirectoryTree(VideoClassificationDataset):
    """A directory tree whose subfolders define a video classification dataset.

    See :ref:`this page <VideoClassificationDirectoryTree-import>` for
    importing datasets of this type, and see
    :ref:`this page <VideoClassificationDirectoryTree-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoClassificationDirectoryTreeImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoClassificationDirectoryTreeExporter


class TFImageClassificationDataset(ImageClassificationDataset):
    """A labeled dataset consisting of images and their associated
    classification labels stored as
    `TFRecords <https://www.tensorflow.org/tutorials/load_data/tfrecord>`_.

    See :ref:`this page <TFImageClassificationDataset-import>` for importing
    datasets of this type, and see
    :ref:`this page <TFImageClassificationDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFImageClassificationDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFImageClassificationDatasetExporter


class FiftyOneImageDetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored in a simple JSON format.

    See :ref:`this page <FiftyOneImageDetectionDataset-import>` for importing
    datasets of this type, and see
    :ref:`this page <FiftyOneImageDetectionDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageDetectionDatasetExporter


class FiftyOneTemporalDetectionDataset(VideoDetectionDataset):
    """A labeled dataset consisting of videos and their associated temporal
    detections stored in a simple JSON format.

    See :ref:`this page <FiftyOneTemporalDetectionDataset-import>` for
    importing datasets of this type, and see
    :ref:`this page <FiftyOneTemporalDetectionDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneTemporalDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneTemporalDetectionDatasetExporter


class COCODetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in
    `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

    See :ref:`this page <COCODetectionDataset-import>` for importing datasets
    of this type, and see :ref:`this page <COCODetectionDataset-export>` for
    exporting datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.coco as fouc

        return fouc.COCODetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.coco as fouc

        return fouc.COCODetectionDatasetExporter


class VOCDetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in `VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.

    See :ref:`this page <VOCDetectionDataset-import>` for importing datasets of
    this type, and see :ref:`this page <VOCDetectionDataset-export>` for
    exporting datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.voc as fouv

        return fouv.VOCDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.voc as fouv

        return fouv.VOCDetectionDatasetExporter


class KITTIDetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in
    `KITTI format <http://www.cvlibs.net/datasets/kitti/eval_object.php>`_.

    See :ref:`this page <KITTIDetectionDataset-import>` for importing datasets
    of this type, and see :ref:`this page <KITTIDetectionDataset-export>` for
    exporting datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.kitti as fouk

        return fouk.KITTIDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.kitti as fouk

        return fouk.KITTIDetectionDatasetExporter


class OpenImagesV6Dataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated annotations
    saved in
    `Open Images format <https://storage.googleapis.com/openimages/web/download.html>`_.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.openimages as fouo

        return fouo.OpenImagesV6DatasetImporter


class OpenImagesV7Dataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated annotations
    saved in
    `Open Images format <https://storage.googleapis.com/openimages/web/download.html>`_.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.openimages as fouo

        return fouo.OpenImagesV7DatasetImporter


class FIWDataset(Dataset):
    """A labeled dataset consisting of images and their associated annotations
    saved in
    `Families in the Wild format <https://github.com/visionjo/pykinship#db-contents-and-structure>`_.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.fiw as fouf

        return fouf.FIWDatasetImporter


class OpenLABELImageDataset(ImageLabelsDataset):
    def get_dataset_importer_cls(self):
        import fiftyone.utils.openlabel as fouo

        return fouo.OpenLABELImageDatasetImporter


class OpenLABELVideoDataset(VideoLabelsDataset):
    def get_dataset_importer_cls(self):
        import fiftyone.utils.openlabel as fouo

        return fouo.OpenLABELVideoDatasetImporter


class YOLOv4Dataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in `YOLOv4 format <https://github.com/AlexeyAB/darknet>`_.

    See :ref:`this page <YOLOv4Dataset-import>` for importing datasets of this
    type, and see :ref:`this page <YOLOv4Dataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLOv4DatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLOv4DatasetExporter


class YOLOv5Dataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in
    `YOLOv5 format <https://github.com/ultralytics/yolov5>`_.

    See :ref:`this page <YOLOv5Dataset-import>` for importing datasets of this
    type, and see :ref:`this page <YOLOv5Dataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLOv5DatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLOv5DatasetExporter


class TFObjectDetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored as TFRecords in
    `TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_.

    See :ref:`this page <TFObjectDetectionDataset-import>` for importing
    datasets of this type, and see
    :ref:`this page <TFObjectDetectionDataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFObjectDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFObjectDetectionDatasetExporter


class ImageSegmentationDirectory(ImageSegmentationDataset):
    """An labeled dataset consisting of images and their associated semantic
    segmentations stored as images on disk.

    See :ref:`this page <ImageSegmentationDirectory-import>` for importing
    datasets of this type, and see
    :ref:`this page <ImageSegmentationDirectory-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageSegmentationDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageSegmentationDirectoryExporter


class CVATImageDataset(ImageLabelsDataset):
    """A labeled dataset consisting of images and their associated labels
    stored in `CVAT image format <https://github.com/opencv/cvat>`_.

    See :ref:`this page <CVATImageDataset-import>` for importing datasets of
    this type, and see :ref:`this page <CVATImageDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.cvat as fouc

        return fouc.CVATImageDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.cvat as fouc

        return fouc.CVATImageDatasetExporter


class CVATVideoDataset(VideoLabelsDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored in `CVAT video format <https://github.com/opencv/cvat>`_.

    See :ref:`this page <CVATVideoDataset-import>` for importing datasets of
    this type, and see :ref:`this page <CVATVideoDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.cvat as fouc

        return fouc.CVATVideoDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.cvat as fouc

        return fouc.CVATVideoDatasetExporter


class FiftyOneImageLabelsDataset(ImageLabelsDataset):
    """A labeled dataset consisting of images and their associated multitask
    predictions stored in
    `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

    See :ref:`this page <FiftyOneImageLabelsDataset-import>` for importing
    datasets of this type, and see
    :ref:`this page <FiftyOneImageLabelsDataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageLabelsDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageLabelsDatasetExporter


class FiftyOneVideoLabelsDataset(VideoLabelsDataset):
    """A labeled dataset consisting of videos and their associated labels
    stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    See :ref:`this page <FiftyOneVideoLabelsDataset-import>` for importing
    datasets of this type, and see
    :ref:`this page <FiftyOneVideoLabelsDataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneVideoLabelsDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneVideoLabelsDatasetExporter


class BDDDataset(ImageLabelsDataset):
    """A labeled dataset consisting of images and their associated multitask
    predictions saved in
    `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

    See :ref:`this page <BDDDataset-import>` for importing datasets of this
    type, and see :ref:`this page <BDDDataset-export>` for exporting datasets
    of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.bdd as foub

        return foub.BDDDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.bdd as foub

        return foub.BDDDatasetExporter


class DICOMDataset(ImageLabelsDataset):
    """An image dataset whose image data and optional properties
    are stored in `DICOM format <https://en.wikipedia.org/wiki/DICOM>`_.

    See :ref:`this page <DICOMDataset-import>` for importing datasets of this
    type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.dicom as foud

        return foud.DICOMDatasetImporter


class ActivityNetDataset(FiftyOneTemporalDetectionDataset):
    """A video dataset composed of temporal activity detections from the
    `ActivityNet dataset <http://activity-net.org/download.html>`_.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.activitynet as foua

        return foua.ActivityNetDatasetImporter


class GeoJSONDataset(LabeledDataset):
    """An image or video dataset whose geolocation data and optional properties
    are stored in `GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_.

    See :ref:`this page <GeoJSONDataset-import>` for importing datasets of this
    type, and see :ref:`this page <GeoJSONDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.geojson as foug

        return foug.GeoJSONDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.geojson as foug

        return foug.GeoJSONDatasetExporter


class GeoTIFFDataset(ImageLabelsDataset):
    """An image dataset whose image and geolocation data are stored in
    `GeoTIFF format <https://en.wikipedia.org/wiki/GeoTIFF>`_.

    See :ref:`this page <GeoTIFFDataset-import>` for importing datasets of this
    type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.geotiff as foug

        return foug.GeoTIFFDatasetImporter


class CSVDataset(Dataset):
    """A flexible CSV format that represents slice(s) of field values of a
    dataset as columns of a CSV file.

    See :ref:`this page <CSVDataset-import>` for importing datasets of this
    type, and see :ref:`this page <CSVDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.csv as fouc

        return fouc.CSVDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.csv as fouc

        return fouc.CSVDatasetExporter


class FiftyOneDataset(Dataset):
    """A disk representation of an entire
    :class:`fiftyone.core.dataset.Dataset` stored on disk in a serialized JSON
    format along with its source media.

    See :ref:`this page <FiftyOneDataset-import>` for importing datasets of
    this type, and see :ref:`this page <FiftyOneDataset-export>` for exporting
    datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneDatasetExporter


class LegacyFiftyOneDataset(Dataset):
    """Legacy disk representation of an entire
    :class:`fiftyone.core.dataset.Dataset` stored on disk in a serialized JSON
    format along with its source media.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            metadata.json
            samples.json
            data/
                <filename1>.<ext>
                <filename2>.<ext>
                ...
            annotations/
                <anno_key1>.json
                <anno_key2>.json
                ...
            brain/
                <brain_key1>.json
                <brain_key2>.json
                ...
            evaluations/
                <eval_key1>.json
                <eval_key2>.json
                ...

    where ``metadata.json`` is a JSON file containing metadata associated with
    the dataset, ``samples.json`` is a JSON file containing a serialized
    representation of the samples in the dataset, ``annotations/`` contains any
    serialized :class:`fiftyone.core.annotations.AnnotationResults`, ``brain/``
    contains any serialized :class:`fiftyone.core.brain.BrainResults`, and
    ``evaluations/`` contains any serialized
    :class:`fiftyone.core.evaluations.EvaluationResults`.

    Video datasets have an additional ``frames/`` directory that contains a
    serialized representation of the frame labels for each video in the
    dataset.

    .. note::

        See :class:`fiftyone.utils.data.importers.LegacyFiftyOneDatasetImporter` for
        parameters that can be passed to methods like
        :meth:`Dataset.from_dir() <fiftyone.core.dataset.Dataset.from_dir>` to
        customize the import of datasets of this type.

    .. note::

        See :class:`fiftyone.utils.data.exporters.LegacyFiftyOneDatasetExporter` for
        parameters that can be passed to methods like
        :meth:`SampleCollection.export() <fiftyone.core.collections.SampleCollection.export>`
        to customize the export of datasets of this type.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.LegacyFiftyOneDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.LegacyFiftyOneDatasetExporter
