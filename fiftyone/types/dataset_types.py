"""
FiftyOne dataset types.

| Copyright 2017-2020, Voxel51, Inc.
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
            "Dataset type '%s' does not provide a default DatasetImporter"
            % etau.get_class_name(self)
        )

    def get_dataset_exporter_cls(self):
        """Returns the :class:`fiftyone.utils.data.exporters.DatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.DatasetExporter` class
        """
        raise TypeError(
            "Dataset type '%s' does not provide a default DatasetExporter"
            % etau.get_class_name(self)
        )


class UnlabeledDataset(Dataset):
    """Base type for datasets that represent an unlabeled collection of data
    samples.
    """

    pass


class UnlabeledImageDataset(UnlabeledDataset):
    """Base type for datasets that represent an unlabeled collection of images.
    """

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.UnlabeledImageDatasetImporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_importer_cls()"
        )

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_exporter_cls()"
        )


class UnlabeledVideoDataset(UnlabeledDataset):
    """Base type for datasets that represent an unlabeled collection of videos.
    """

    def get_dataset_importer_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
        class for importing datasets of this type from disk.

        Returns:
            a :class:`fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_importer_cls()"
        )

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_exporter_cls()"
        )


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
        raise NotImplementedError(
            "subclass must implement get_dataset_importer_cls()"
        )

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.LabeledImageDatasetExporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_exporter_cls()"
        )


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
        raise NotImplementedError(
            "subclass must implement get_dataset_importer_cls()"
        )

    def get_dataset_exporter_cls(self):
        """Returns the
        :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
        class for exporting datasets of this type to disk.

        Returns:
            a :class:`fiftyone.utils.data.exporters.LabeledVideoDatasetExporter`
            class
        """
        raise NotImplementedError(
            "subclass must implement get_dataset_exporter_cls()"
        )


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
    of associated object detections.
    """

    pass


class VideoDetectionDataset(LabeledVideoDataset):
    """Base type for datasets that represent a collection of videos and a set
    of associated video object detections.
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


class ImageDirectory(UnlabeledImageDataset):
    """A directory of images.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <filename1>.<ext>
            <filename2>.<ext>
            ...

    When reading datasets of this type, subfolders are recursively traversed,
    and files with non-image MIME types are omitted.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageDirectoryExporter


class VideoDirectory(UnlabeledImageDataset):
    """A directory of videos.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <filename1>.<ext>
            <filename2>.<ext>
            ...

    When reading datasets of this type, subfolders are recursively traversed,
    and files with non-video MIME types are omitted.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoDirectoryImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.VideoDirectoryExporter


class FiftyOneImageClassificationDataset(ImageClassificationDataset):
    """A labeled dataset consisting of images and their associated
    classification labels stored in a simple JSON format.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "classes": [
                <labelA>,
                <labelB>,
                ...
            ],
            "labels": {
                <uuid1>: <target1>,
                <uuid2>: <target2>,
                ...
            }
        }

    If the ``classes`` field is provided, the ``target`` values are class IDs
    that are mapped to class label strings via ``classes[target]``. If no
    ``classes`` field is provided, then the ``target`` values directly store
    the label strings.

    The target value in ``labels`` for unlabeled images is ``None``.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            ...

    Unlabeled images are stored in a subdirectory named ``_unlabeled``.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageClassificationDirectoryTreeImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.ImageClassificationDirectoryTreeExporter


class VideoClassificationDirectoryTree(VideoClassificationDataset):
    """A directory tree whose subfolders define a video classification dataset.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            <classA>/
                <video1>.<ext>
                <video2>.<ext>
                ...
            <classB>/
                <video1>.<ext>
                <video2>.<ext>
                ...
            ...

    Unlabeled videos are stored in a subdirectory named ``_unlabeled``.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            tf.records-?????-of-?????

    where the features of the (possibly sharded) TFRecords are stored in the
    following format::

        {
            # Image dimensions
            "height": tf.io.FixedLenFeature([], tf.int64),
            "width": tf.io.FixedLenFeature([], tf.int64),
            "depth": tf.io.FixedLenFeature([], tf.int64),

            # Image filename
            "filename": tf.io.FixedLenFeature([], tf.int64),

            # Encoded image bytes
            "image_bytes": tf.io.FixedLenFeature([], tf.string),

            # Class label string
            "label": tf.io.FixedLenFeature([], tf.string),
        }

    For unlabeled samples, the TFRecords do not contain ``label`` features.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "classes": [
                <labelA>,
                <labelB>,
                ...
            ],
            "labels": {
                <uuid1>: [
                    {
                        "label": <target>,
                        "bounding_box": [
                            <top-left-x>, <top-left-y>, <width>, <height>
                        ],
                        "confidence": <optional-confidence>,
                        "attributes": {
                            <optional-name>: <optional-value>,
                            ...
                        }
                    },
                    ...
                ],
                <uuid2>: [
                    ...
                ],
                ...
            }
        }

    and where the bounding box coordinates are expressed as relative values in
    ``[0, 1] x [0, 1]``.

    If the ``classes`` field is provided, the ``target`` values are class IDs
    that are mapped to class label strings via ``classes[target]``. If no
    ``classes`` field is provided, then the ``target`` values directly store
    the label strings.

    The target value in ``labels`` for unlabeled images is ``None``.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageDetectionDatasetExporter


class COCODetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in
    `COCO Object Detection Format <https://cocodataset.org/#format-data>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <filename0>.<ext>
                <filename1>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        {
            "info": {
                "year": "",
                "version": "",
                "description": "Exported from FiftyOne",
                "contributor": "",
                "url": "https://voxel51.com/fiftyone",
                "date_created": "2020-06-19T09:48:27"
            },
            "licenses": [],
            "categories": [
                ...
                {
                    "id": 2,
                    "name": "cat",
                    "supercategory": "animal"
                },
                ...
            ],
            "images": [
                {
                    "id": 0,
                    "license": null,
                    "file_name": "<filename0>.<ext>",
                    "height": 480,
                    "width": 640,
                    "date_captured": null
                },
                ...
            ],
            "annotations": [
                {
                    "id": 0,
                    "image_id": 0,
                    "category_id": 2,
                    "bbox": [260, 177, 231, 199],
                    "segmentation": [...],
                    "area": 45969,
                    "iscrowd": 0
                },
                ...
            ]
        }

    See `this page <https://cocodataset.org/#format-data>`_ for a full
    specification of the ``segmentation`` field.

    For unlabeled datasets, ``labels.json`` does not contain an ``annotations``
    field.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.xml
                <uuid2>.xml
                ...

    where the labels XML files are in the following format::

        <annotation>
            <folder>data</folder>
            <filename>image.ext</filename>
            <path>/path/to/dataset-dir/data/image.ext</path>
            <source>
                <database></database>
            </source>
            <size>
                <width>640</width>
                <height>480</height>
                <depth>3</depth>
            </size>
            <segmented></segmented>
            <object>
                <name>cat</name>
                <pose></pose>
                <truncated>0</truncated>
                <difficult>0</difficult>
                <occluded>0</occluded>
                <bndbox>
                    <xmin>256</xmin>
                    <ymin>200</ymin>
                    <xmax>450</xmax>
                    <ymax>400</ymax>
                </bndbox>
            </object>
            <object>
                <name>dog</name>
                <pose></pose>
                <truncated>1</truncated>
                <difficult>1</difficult>
                <occluded>1</occluded>
                <bndbox>
                    <xmin>128</xmin>
                    <ymin>100</ymin>
                    <xmax>350</xmax>
                    <ymax>300</ymax>
                </bndbox>
            </object>
            ...
        </annotation>

    When writing datasets in this format, samples with no values for certain
    attributes (like ``pose`` in the above example) are left empty.

    Unlabeled images have no corresponding file in ``labels/``.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.txt
                <uuid2>.txt
                ...

    where the labels TXT files are space-delimited files where each row
    corresponds to an object and the 15 (and optional 16th score) columns have
    the following meanings:

    +---------+------------+----------------------------------------+---------+
    | \\#      | Name       | Description                            | Default |
    | cols    |            |                                        |         |
    +=========+============+========================================+=========+
    | 1       | type       | The object label                       |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | truncated  | A float in ``[0, 1]``, where 0 is      | 0       |
    |         |            | non-truncated and 1 is fully truncated.|         |
    |         |            | Here, truncation refers to the object  |         |
    |         |            | leaving image boundaries               |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | occluded   | An int in ``(0, 1, 2, 3)`` indicating  | 0       |
    |         |            | occlusion state, where:                |         |
    |         |            |                                        |         |
    |         |            | - 0 = fully visible                    |         |
    |         |            | - 1 = partly occluded                  |         |
    |         |            | - 2 = largely occluded                 |         |
    |         |            | - 3 = unknown                          |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | alpha      | Observation angle of the object, in    | 0       |
    |         |            | ``[-pi, pi]``                          |         |
    +---------+------------+----------------------------------------+---------+
    | 4       | bbox       | 2D bounding box of object in the image |         |
    |         |            | in pixels, in the format               |         |
    |         |            | ``[xtl, ytl, xbr, ybr]``               |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | dimensions | 3D object dimensions, in meters, in    | 0       |
    |         |            | the format ``[height, width, length]`` |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | location   | 3D object location ``(x, y, z)`` in    | 0       |
    |         |            | camera coordinates (in meters)         |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | rotation_y | Rotation around the y-axis in camera   | 0       |
    |         |            | coordinates, in ``[-pi, pi]``          |         |
    +---------+------------+----------------------------------------+---------+
    | 1       | score      | ``(optional)`` A float confidence for  |         |
    |         |            | the detection                          |         |
    +---------+------------+----------------------------------------+---------+

    The ``default`` column above indicates the default value that will be used
    when writing datasets in this type whose samples do not contain the
    necessary field(s).

    When reading datasets of this type, all columns after the four ``bbox``
    columns may be omitted.

    Unlabeled images have no corresponding file in ``labels/``.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.kitti as fouk

        return fouk.KITTIDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.kitti as fouk

        return fouk.KITTIDetectionDatasetExporter


class YOLODataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections saved in `YOLO format <https://github.com/AlexeyAB/darknet>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            obj.names
            images.txt
            data/
                <uuid1>.<ext>
                <uuid1>.txt
                <uuid2>.<ext>
                <uuid2>.txt
                ...

    where ``obj.names`` contains the object class labels::

        <label-0>
        <label-1>
        ...

    and ``images.txt`` contains the list of images in ``data/``::

        data/<uuid1>.<ext>
        data/<uuid2>.<ext>
        ...

    and the TXT files in ``data/`` are space-delimited files where each row
    corresponds to an object in the image of the same name, in the following
    format::

        <target> <x-center> <y-center> <width> <height>

    where ``<target>`` is the zero-based integer index of the object class
    label from ``obj.names`` and the bounding box coordinates are expressed as
    relative coordinates in ``[0, 1] x [0, 1]``.

    Unlabeled images have no corresponding TXT file in ``data/``.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLODatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.yolo as fouy

        return fouy.YOLODatasetExporter


class TFObjectDetectionDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated object
    detections stored as TFRecords in
    `TF Object Detection API format <https://github.com/tensorflow/models/blob/master/research/object_detection>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            tf.records-?????-of-?????

    where the features of the (possibly sharded) TFRecords are stored in the
    following format::

        {
            # Image dimensions
            "image/height": tf.io.FixedLenFeature([], tf.int64),
            "image/width": tf.io.FixedLenFeature([], tf.int64),

            # Image filename is used for both of these when writing
            "image/filename": tf.io.FixedLenFeature([], tf.string),
            "image/source_id": tf.io.FixedLenFeature([], tf.string),

            # Encoded image bytes
            "image/encoded": tf.io.FixedLenFeature([], tf.string),

            # Image format, either `jpeg` or `png`
            "image/format": tf.io.FixedLenFeature([], tf.string),

            # Normalized bounding box coordinates in `[0, 1]`
            "image/object/bbox/xmin": tf.io.FixedLenSequenceFeature([], tf.float32, allow_missing=True),
            "image/object/bbox/xmax": tf.io.FixedLenSequenceFeature([], tf.float32, allow_missing=True),
            "image/object/bbox/ymin": tf.io.FixedLenSequenceFeature([], tf.float32, allow_missing=True),
            "image/object/bbox/ymax": tf.io.FixedLenSequenceFeature([], tf.float32, allow_missing=True),

            # Class label string
            "image/object/class/text": tf.io.FixedLenSequenceFeature([], tf.string, allow_missing=True),

            # Integer class ID
            "image/object/class/label": tf.io.FixedLenSequenceFeature([], tf.int64, allow_missing=True)
        }

    The TFRecords for unlabeled samples do not contain ``image/object/*``
    features.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFObjectDetectionDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.tf as fout

        return fout.TFObjectDetectionDatasetExporter


class CVATImageDataset(ImageDetectionDataset):
    """A labeled dataset consisting of images and their associated labels
    stored in `CVAT image format <https://github.com/opencv/cvat>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels.xml

    where ``labels.xml`` is an XML file in the following format::

        <?xml version="1.0" encoding="utf-8"?>
        <annotations>
            <version>1.1</version>
            <meta>
                <task>
                    <id>0</id>
                    <name>task-name</name>
                    <size>51</size>
                    <mode>annotation</mode>
                    <overlap></overlap>
                    <bugtracker></bugtracker>
                    <flipped>False</flipped>
                    <created>2017-11-20 11:51:51.000000+00:00</created>
                    <updated>2017-11-20 11:51:51.000000+00:00</updated>
                    <labels>
                        <label>
                            <name>car</name>
                            <attributes>
                                <attribute>
                                    <name>type</name>
                                    <values>coupe\\nsedan\\ntruck</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        <label>
                            <name>traffic_line</name>
                            <attributes>
                                <attribute>
                                    <name>color</name>
                                    <values>white\\nyellow</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        ...
                    </labels>
                </task>
                <segments>
                    <segment>
                        <id>0</id>
                        <start>0</start>
                        <stop>50</stop>
                        <url></url>
                    </segment>
                </segments>
                <owner>
                    <username></username>
                    <email></email>
                </owner>
                <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
            </meta>
            <image id="0" name="<uuid1>.<ext>" width="640" height="480">
                <box label="car" xtl="100" ytl="50" xbr="325" ybr="190" occluded="0">
                    <attribute name="type">sedan</attribute>
                    ...
                </box>
                ...
                <polygon label="car" points="561.30,916.23;561.30,842.77;...;560.20,966.67" occluded="0">
                    <attribute name="make">Honda</attribute>
                    ...
                </polygon>
                ...
                <polyline label="traffic_line" points="462.10,0.00;126.80,1200.00" occluded="0">
                    <attribute name="color">yellow</attribute>
                    ...
                </polyline>
                ...
                <points label="wheel" points="574.90,939.48;1170.16,907.90;...;600.16,459.48" occluded="0">
                    <attribute name="location">front_driver_side</attribute>
                    ...
                </points>
                ...
            </image>
            ...
            <image id="50" name="<uuid51>.<ext>" width="640" height="480">
                ...
            </image>
        </annotations>

    Unlabeled images have no corresponding ``image`` tag in ``labels.xml``.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.xml
                <uuid2>.xml
                ...

    where the labels XML files are stored in the following format::

        <?xml version="1.0" encoding="utf-8"?>
        <annotations>
            <version>1.1</version>
            <meta>
                <task>
                    <id>task-id</id>
                    <name>task-name</name>
                    <size>51</size>
                    <mode>interpolation</mode>
                    <overlap></overlap>
                    <bugtracker></bugtracker>
                    <flipped>False</flipped>
                    <created>2017-11-20 11:51:51.000000+00:00</created>
                    <updated>2017-11-20 11:51:51.000000+00:00</updated>
                    <labels>
                        <label>
                            <name>car</name>
                            <attributes>
                                <attribute>
                                    <name>type</name>
                                    <values>coupe\\nsedan\\ntruck</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        <label>
                            <name>traffic_line</name>
                            <attributes>
                                <attribute>
                                    <name>color</name>
                                    <values>white\\nyellow</values>
                                </attribute>
                                ...
                            </attributes>
                        </label>
                        ...
                    </labels>
                </task>
                <segments>
                    <segment>
                        <id>0</id>
                        <start>0</start>
                        <stop>50</stop>
                        <url></url>
                    </segment>
                </segments>
                <owner>
                    <username></username>
                    <email></email>
                </owner>
                <original_size>
                    <width>640</width>
                    <height>480</height>
                </original_size>
                <dumped>2017-11-20 11:51:51.000000+00:00</dumped>
            </meta>
            <track id="0" label=car">
                <box frame="0" xtl="100" ytl="50" xbr="325" ybr="190" outside="0" occluded="0", keyframe="1">
                    <attribute name="type">sedan</attribute>
                    ...
                </box>
                ...
            </track>
            <track id="1" label=car">
                <polygon frame="0" points="561.30,916.23;561.30,842.77;...;560.20,966.67" outside="0" occluded="0", keyframe="1">
                    <attribute name="make">Honda</attribute>
                    ...
                </polygon>
                ...
            </track>
            ...
            <track id="10" label="traffic_line">
                <polyline frame="10" points="462.10,0.00;126.80,1200.00" outside="0" occluded="0", keyframe="1">
                    <attribute name="color">yellow</attribute>
                    ...
                </polyline>
                ...
            </track>
            ...
            <track id="88" label="wheel">
                <points frame="176" points="574.90,939.48;1170.16,907.90;...;600.16,459.48" outside="0" occluded="0", keyframe="1">
                    <attribute name="location">front_driver_side</attribute>
                    ...
                </points>
                ...
            </track>
            ...
        </annotations>

    Unlabeled videos have no corresponding XML file in ``labels/``.
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

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.json
                <uuid2>.json
                ...
            manifest.json

    where ``manifest.json`` is a JSON file in the following format::

        {
            "type": "eta.core.datasets.LabeledImageDataset",
            "description": "",
            "index": [
                {
                    "data": "data/<uuid1>.<ext>",
                    "labels": "labels/<uuid1>.json"
                },
                {
                    "data": "data/<uuid2>.<ext>",
                    "labels": "labels/<uuid2>.json"
                },
                ...
            ]
        }

    and where each labels JSON file is stored in ``eta.core.image.ImageLabels``
    format. See
    `this guide <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_
    for more details.

    For unlabeled images, an empty ``eta.core.image.ImageLabels`` file is
    stored.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageLabelsDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneImageLabelsDatasetExporter


class BDDDataset(ImageLabelsDataset):
    """A labeled dataset consisting of images and their associated multitask
    predictions saved in
    `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <filename0>.<ext>
                <filename1>.<ext>
                ...
            labels.json

    where ``labels.json`` is a JSON file in the following format::

        [
            {
                "name": "<filename0>.<ext>",
                "attributes": {
                    "scene": "city street",
                    "timeofday": "daytime",
                    "weather": "overcast"
                },
                "labels": [
                    {
                        "id": 0,
                        "category": "traffic sign",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "occluded": false,
                            "trafficLightColor": "none",
                            "truncated": false
                        },
                        "box2d": {
                            "x1": 1000.698742,
                            "x2": 1040.626872,
                            "y1": 281.992415,
                            "y2": 326.91156
                        }
                    },
                    ...
                    {
                        "id": 34,
                        "category": "drivable area",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "areaType": "direct"
                        },
                        "poly2d": [
                            {
                                "types": "LLLLCCC",
                                "closed": true,
                                "vertices": [
                                    [241.143645, 697.923453],
                                    [541.525255, 380.564983],
                                    ...
                                ]
                            }
                        ]
                    },
                    ...
                    {
                        "id": 109356,
                        "category": "lane",
                        "attributes": {
                            "laneDirection": "parallel",
                            "laneStyle": "dashed",
                            "laneType": "single white"
                        },
                        "manualShape": true,
                        "manualAttributes": true,
                        "poly2d": [
                            {
                                "types": "LL",
                                "closed": false,
                                "vertices": [
                                    [492.879546, 331.939543],
                                    [0, 471.076658],
                                    ...
                                ]
                            }
                        ],
                    },
                    ...
                }
            }
            ...
        ]

    Unlabeled images have no corresponding entry in ``labels.json``.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.bdd as foub

        return foub.BDDDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.bdd as foub

        return foub.BDDDatasetExporter


class FiftyOneVideoLabelsDataset(VideoLabelsDataset):
    """A labeled dataset consisting of videos and their associated labels
    stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    Datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <uuid1>.<ext>
                <uuid2>.<ext>
                ...
            labels/
                <uuid1>.json
                <uuid2>.json
                ...
            manifest.json

    where ``manifest.json`` is a JSON file in the following format::

        {
            "type": "eta.core.datasets.LabeledVideoDataset",
            "description": "",
            "index": [
                {
                    "data": "data/<uuid1>.<ext>",
                    "labels": "labels/<uuid1>.json"
                },
                {
                    "data": "data/<uuid2>.<ext>",
                    "labels": "labels/<uuid2>.json"
                },
                ...
            ]
        }

    and where each labels JSON file is stored in ``eta.core.image.VideoLabels``
    format. See
    `this guide <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_
    for more details.

    For unlabeled videos, an empty ``eta.core.image.VideoLabels`` file is
    stored.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneVideoLabelsDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneVideoLabelsDatasetExporter


class FiftyOneDataset(Dataset):
    """A disk representation of a :class:`fiftyone.core.dataset.Dataset`,
    including its :class:`fiftyone.core.sample.Sample` instances stored in a
    serialized JSON format, and the associated source data.

    Non-video datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <filename1>.<ext>
                <filename2>.<ext>
                ...
            metadata.json
            samples.json

    where ``metadata.json`` is an optional JSON file containing metadata
    associated with the dataset, and ``samples.json`` is a JSON file containing
    a serialized representation of the samples in the dataset generated by
    :meth:`fiftyone.core.sample.Sample.to_dict`.

    Video datasets of this type are read/written in the following format::

        <dataset_dir>/
            data/
                <filename1>.<ext>
                <filename2>.<ext>
                ...
            frames/
                <filename1>.json
                <filename2>.json
                ...
            metadata.json
            samples.json

    where the additional ``frames/`` directory contains a serialized
    representation of the frame labels for each video in the dataset.
    """

    def get_dataset_importer_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneDatasetImporter

    def get_dataset_exporter_cls(self):
        import fiftyone.utils.data as foud

        return foud.FiftyOneDatasetExporter
