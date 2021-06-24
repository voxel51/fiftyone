"""
Utilities for working with datasets in
`VOC format <http://host.robots.ox.ac.uk/pascal/VOC>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import jinja2

import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class VOCDetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in
    `VOC detection format <http://host.robots.ox.ac.uk/pascal/VOC>`_.

    This implementation supports samples that are
    ``(image_or_path, annotations_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``annotations_or_path`` is either a JSON dictionary of annotations
          in the following format::

            {
                "annotation": {
                    ...
                    "object": [
                        {
                            "name": "chair",
                            "pose": "Frontal",
                            "truncated": "0",
                            "difficult": "0",
                            "occluded": "0",
                            "bndbox": {
                                "xmin": "263",
                                "ymin": "211",
                                "xmax": "324",
                                "ymax": "339"
                            },
                            ...
                        },
                        ...
                    ],
                    ...
                }
            }

          or the path to a VOC annotations XML file on disk. Or, for unlabeled
          images, ``annotations_or_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.VOCDetectionDataset` for more
    format details.
    """

    def __init__(self):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            attributes_field=None,
            classes=None,
            normalized=True,  # True b/c image is not required to parse label
        )

    def _parse_label(self, target, img=None):
        if target is None:
            return None

        if etau.is_str(target):
            annotation = VOCAnnotation.from_xml(target)
        else:
            annotation = VOCAnnotation.from_dict(target)

        return annotation.to_detections()


class VOCDetectionDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for VOC detection datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.VOCDetectionDataset` for format
    details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location of the labels in ``dataset_dir``
            -   an absolute folder path to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels/``
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.include_all_data = include_all_data

        self._image_paths_map = None
        self._labels_paths_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        labels_path = self._labels_paths_map.get(uuid, None)
        if labels_path:
            # Labeled image

            annotation = load_voc_detection_annotations(labels_path)

            # Use image filename from annotation file if possible
            if annotation.filename:
                _uuid = os.path.splitext(annotation.filename)[0]
            elif annotation.path:
                _uuid = os.path.splitext(os.path.basename(annotation.path))[0]
            else:
                _uuid = None

            if _uuid not in self._image_paths_map:
                _uuid = uuid

            if uuid in self._image_paths_map:
                image_path = self._image_paths_map[uuid]
            elif annotation.path and os.path.isfile(annotation.path):
                image_path = annotation.path
            else:
                raise ValueError("No image found for sample '%s'" % _uuid)

            if annotation.metadata is None:
                annotation.metadata = fom.ImageMetadata.build_for(image_path)

            image_metadata = annotation.metadata

            detections = annotation.to_detections()
        else:
            # Unlabeled image
            image_path = self._image_paths_map[uuid]
            image_metadata = fom.ImageMetadata.build_for(image_path)
            detections = None

        return image_path, image_metadata, detections

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True
        )

        if self.labels_path is not None and os.path.isdir(self.labels_path):
            self._labels_paths_map = {
                os.path.splitext(os.path.basename(p))[0]: p
                for p in etau.list_files(self.labels_path, abs_paths=True)
            }
        else:
            self._labels_paths_map = {}

        uuids = set(self._labels_paths_map.keys())

        if self.include_all_data:
            uuids.update(self._image_paths_map.keys())

        self._uuids = self._preprocess_list(sorted(uuids))
        self._num_samples = len(self._uuids)


class VOCDetectionDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes VOC detection datasets to disk.

    See :class:`fiftyone.types.dataset_types.VOCDetectionDataset` for format
    details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute folder path to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default folder name
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir, labels_path=labels_path, default="labels/",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.image_format = image_format

        self._writer = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._writer = VOCAnnotationWriter()
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

        etau.ensure_dir(self.labels_path)

    def export_sample(self, image_or_path, detections, metadata=None):
        if metadata is None and detections is not None:
            metadata = fom.ImageMetadata.build_for(image_or_path)

        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if detections is None:
            return

        out_anno_path = os.path.join(self.labels_path, uuid + ".xml")

        annotation = VOCAnnotation.from_labeled_image(
            out_image_path, metadata, detections
        )
        self._writer.write(annotation, out_anno_path)

    def close(self, *args):
        self._media_exporter.close()


class VOCAnnotation(object):
    """Class representing a VOC annotations file.

    Args:
        path (None): the path to the image on disk
        folder (None): the name of the folder containing the image
        filename (None): the image filename
        segmented (None): whether the objects are segmented
        metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
            instance
        objects (None): a list of :class:`VOCObject` instances
    """

    def __init__(
        self,
        path=None,
        folder=None,
        filename=None,
        segmented=None,
        metadata=None,
        objects=None,
    ):
        if folder is None and path:
            folder = os.path.basename(os.path.dirname(path))

        if filename is None and path:
            filename = os.path.basename(path)

        self.path = path
        self.folder = folder
        self.filename = filename
        self.segmented = segmented
        self.metadata = metadata
        self.objects = objects or []

    def to_detections(self):
        """Returns a :class:`fiftyone.core.labels.Detections` representation of
        the objects in the annotation.

        Returns:
            a :class:`fiftyone.core.labels.Detections`
        """
        if self.metadata is None:
            raise ValueError(
                "Must have metadata in order to convert to `Detections` format"
            )

        frame_size = (self.metadata.width, self.metadata.height)
        detections = [obj.to_detection(frame_size) for obj in self.objects]
        return fol.Detections(detections=detections)

    @classmethod
    def from_labeled_image(cls, image_path, metadata, detections):
        """Creates a :class:`VOCAnnotation` instance for the given labeled
        image data.

        Args:
            image_path: the path to the image on disk
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` instance
                for the image
            detections: a :class:`fiftyone.core.labels.Detections`

        Returns:
            a :class:`VOCAnnotation`
        """
        objects = []
        for detection in detections.detections:
            obj = VOCObject.from_detection(detection, metadata)
            objects.append(obj)

        return cls(path=image_path, metadata=metadata, objects=objects)

    @classmethod
    def from_xml(cls, xml_path):
        """Creates a :class:`VOCAnnotation` instance from an XML annotations
        file.

        Args:
            xml_path: the path to the XML file

        Returns:
            a :class:`VOCAnnotation`
        """
        d = fou.load_xml_as_json_dict(xml_path)
        return cls.from_dict(d)

    @classmethod
    def from_dict(cls, d):
        """Creates a :class:`VOCAnnotation` instance from a JSON dict
        representation.

        Args:
            d: a JSON dict

        Returns:
            a :class:`VOCAnnotation`
        """
        annotation = d["annotation"]

        path = annotation.get("path", None)
        folder = annotation.get("folder", None)
        filename = annotation.get("filename", None)
        segmented = annotation.get("segmented", None)

        if "size" in annotation:
            size = annotation["size"]
            metadata = fom.ImageMetadata(
                width=int(size["width"]),
                height=int(size["height"]),
                num_channels=int(size["depth"]),
            )
        else:
            metadata = None

        _objects = _ensure_list(annotation.get("object", []))
        objects = [VOCObject.from_annotation_dict(do) for do in _objects]

        return cls(
            path=path,
            folder=folder,
            filename=filename,
            segmented=segmented,
            metadata=metadata,
            objects=objects,
        )


class VOCObject(object):
    """An object in VOC detection format.

    Args:
        name: the object label
        bndbox: a :class:`VOCBoundingBox`
        pose (None): the pose of the object
        truncated (None): whether the object is truncated
        difficult (None): whether the object is difficult
        occluded (None): whether the object is occluded
    """

    def __init__(
        self,
        name,
        bndbox,
        pose=None,
        truncated=None,
        difficult=None,
        occluded=None,
    ):
        self.name = name
        self.bndbox = bndbox
        self.pose = pose
        self.truncated = truncated
        self.difficult = difficult
        self.occluded = occluded

    @classmethod
    def from_annotation_dict(cls, d):
        """Creates a :class:`VOCObject` from a VOC annotation dict.

        Args:
            d: an annotation dict

        Returns:
            a :class:`VOCObject`
        """
        name = d["name"]
        bndbox = VOCBoundingBox.from_bndbox_dict(d["bndbox"])
        pose = d.get("pose", None)
        truncated = d.get("truncated", None)
        difficult = d.get("difficult", None)
        occluded = d.get("occluded", None)
        return cls(
            name,
            bndbox,
            pose=pose,
            truncated=truncated,
            difficult=difficult,
            occluded=occluded,
        )

    @classmethod
    def from_detection(cls, detection, metadata):
        """Creates a :class:`VOCObject` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` instance
                for the image

        Returns:
            a :class:`VOCObject`
        """
        name = detection.label

        frame_size = (metadata.width, metadata.height)
        bndbox = VOCBoundingBox.from_detection_format(
            detection.bounding_box, frame_size
        )

        pose = detection.get_attribute_value("pose", None)
        truncated = detection.get_attribute_value("truncated", None)
        difficult = detection.get_attribute_value("difficult", None)
        occluded = detection.get_attribute_value("occluded", None)

        return cls(
            name,
            bndbox,
            pose=pose,
            truncated=truncated,
            difficult=difficult,
            occluded=occluded,
        )

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the object.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.name
        bounding_box = self.bndbox.to_detection_format(frame_size)
        detection = fol.Detection(label=label, bounding_box=bounding_box)

        if self.pose is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["pose"] = fol.CategoricalAttribute(
                value=self.pose
            )

        if self.truncated is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["truncated"] = fol.CategoricalAttribute(
                value=self.truncated
            )

        if self.difficult is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["difficult"] = fol.CategoricalAttribute(
                value=self.difficult
            )

        if self.occluded is not None:
            # pylint: disable=unsupported-assignment-operation
            detection.attributes["occluded"] = fol.CategoricalAttribute(
                value=self.occluded
            )

        return detection


class VOCBoundingBox(object):
    """A bounding box in VOC detection format.

    Args:
        xmin: the top-left x coordinate
        ymin: the top-left y coordinate
        xmax: the bottom-right x coordinate
        ymax: the bottom-right y coordinate
    """

    def __init__(self, xmin, ymin, xmax, ymax):
        self.xmin = xmin
        self.ymin = ymin
        self.xmax = xmax
        self.ymax = ymax

    @classmethod
    def from_bndbox_dict(cls, d):
        """Creates a :class:`VOCBoundingBox` from a ``bndbox`` dict.

        Args:
            d: a ``bndbox`` dict

        Returns:
            a :class:`VOCBoundingBox`
        """
        return cls(
            int(d["xmin"]), int(d["ymin"]), int(d["xmax"]), int(d["ymax"])
        )

    @classmethod
    def from_detection_format(cls, bounding_box, frame_size):
        """Creates a :class:`VOCBoundingBox` from a bounding box stored in
        :class:`fiftyone.core.labels.Detection` format.

        Args:
            bounding_box: ``[x-top-left, y-top-left, width, height]``
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`VOCBoundingBox`
        """
        x, y, w, h = bounding_box
        width, height = frame_size
        return cls(
            int(width * x),
            int(height * y),
            int(width * (x + w)),
            int(height * (y + h)),
        )

    def to_detection_format(self, frame_size):
        """Returns a representation of the bounding box suitable for storing in
        the ``bounding_box`` field of a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            ``[x-top-left, y-top-left, width, height]``
        """
        width, height = frame_size
        x = self.xmin / width
        y = self.ymin / height
        w = (self.xmax - self.xmin) / width
        h = (self.ymax - self.ymin) / height
        return [x, y, w, h]


class VOCAnnotationWriter(object):
    """Class for writing annotations in VOC format.

    See :class:`fiftyone.types.dataset_types.VOCDetectionDataset` for format
    details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template("voc_annotation_template.xml")

    def write(self, annotation, xml_path):
        """Writes the annotations to disk.

        Args:
            annotation: a :class:`VOCAnnotation` instance
            xml_path: the path to write the annotation XML file
        """
        if annotation.metadata is not None:
            metadata = annotation.metadata
        else:
            metadata = fom.ImageMetadata()

        xml_str = self.template.render(
            {
                "path": annotation.path,
                "filename": annotation.filename,
                "folder": annotation.folder,
                "width": metadata.width,
                "height": metadata.height,
                "depth": metadata.num_channels,
                "database": None,
                "segmented": annotation.segmented,
                "objects": annotation.objects,
            }
        )
        etau.write_file(xml_str, xml_path)


def load_voc_detection_annotations(xml_path):
    """Loads the VOC detection annotations from the given XML file.

    See :class:`fiftyone.types.dataset_types.VOCDetectionDataset` for format
    details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a :class:`VOCAnnotation` instance
    """
    return VOCAnnotation.from_xml(xml_path)


VOC_DETECTION_CLASSES = [
    "aeroplane",
    "bicycle",
    "bird",
    "boat",
    "bottle",
    "bus",
    "car",
    "cat",
    "chair",
    "cow",
    "diningtable",
    "dog",
    "horse",
    "motorbike",
    "person",
    "pottedplant",
    "sheep",
    "sofa",
    "train",
    "tvmonitor",
]


def _ensure_list(value):
    if value is None:
        return []

    if isinstance(value, list):
        return value

    return [value]
