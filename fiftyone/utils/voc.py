"""
Utilities for working with datasets in PASCAL VOC format.

The VOC dataset: http://host.robots.ox.ac.uk/pascal/VOC.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import defaultdict
import logging
import os

import jinja2

import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class VOCDetectionSampleParser(foud.ImageDetectionSampleParser):
    """Parser for samples in PASCAL VOC Detection format.

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

          or the path to a VOC annotations XML file on disk.

    See :class:`fiftyone.types.VOCDetectionDataset` for more format details.
    """

    def __init__(self):
        super().__init__(
            label_field=None, bounding_box_field=None, confidence_field=None
        )

    def _parse_label(self, target, img=None):
        if etau.is_str(target):
            annotation = VOCAnnotation.from_xml(target)
        else:
            annotation = VOCAnnotation.from_dict(target)

        return annotation.to_detections()


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
    def from_labeled_image(cls, img_path, metadata, detections):
        """Creates a :class:`VOCAnnotation` instance for the given labeled
        image data.

        Args:
            img_path: the path to the image on disk
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

        return cls(path=img_path, metadata=metadata, objects=objects)

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

        folder = annotation.get("folder", None)
        filename = annotation.get("filename", None)
        path = annotation["path"]

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

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.
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


def parse_voc_detection_dataset(dataset_dir):
    """Parses the VOC detection dataset stored in the given directory.

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.

    Args:
        dataset_dir: the dataset directory

    Returns:
        a list of ``(img_path, image_metadata, detections)`` tuples
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_dir = os.path.join(dataset_dir, "labels")

    img_uuids_to_paths = {
        os.path.splitext(f)[0]: os.path.join(data_dir, f)
        for f in etau.list_files(data_dir, abs_paths=False)
    }

    anno_paths = etau.list_files(labels_dir, abs_paths=True)

    samples = []
    for anno_path in anno_paths:
        annotation = load_voc_detection_annotations(anno_path)

        #
        # Use image filename from annotation file if possible. Otherwise, use
        # the filename to locate the corresponding image
        #

        if annotation.filename:
            uuid = os.path.splitext(annotation.filename)[0]
        elif annotation.path:
            uuid = os.path.splitext(os.path.basename(annotation.path))[0]
        else:
            uuid = None

        if uuid not in img_uuids_to_paths:
            uuid = os.path.splitext(os.path.basename(anno_path))[0]

        img_path = img_uuids_to_paths[uuid]

        if annotation.metadata is None:
            annotation.metadata = fom.ImageMetadata.build_for(img_path)

        metadata = annotation.metadata

        detections = annotation.to_detections()
        samples.append((img_path, metadata, detections))

    return samples


def load_voc_detection_annotations(xml_path):
    """Loads the VOC detection annotations from the given XML file.

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a :class:`VOCAnnotation` instance
    """
    return VOCAnnotation.from_xml(xml_path)


def export_voc_detection_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as a VOC detection dataset.

    See :class:`fiftyone.types.VOCDetectionDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.Detections`
            field of the samples to export
        dataset_dir: the directory to which to write the dataset
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_dir = os.path.join(dataset_dir, "labels")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.VOCDetectionDataset),
    )

    etau.ensure_dir(data_dir)
    etau.ensure_dir(labels_dir)

    writer = VOCAnnotationWriter()
    data_filename_counts = defaultdict(int)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            out_img_path = os.path.join(data_dir, name + ext)
            out_anno_path = os.path.join(labels_dir, name + ".xml")

            etau.copy_file(img_path, out_img_path)

            metadata = sample.metadata
            if metadata is None:
                metadata = fom.ImageMetadata.build_for(img_path)

            label = sample[label_field]
            annotation = VOCAnnotation.from_labeled_image(
                out_img_path, metadata, label
            )
            writer.write(annotation, out_anno_path)

    logger.info("Dataset created")


def _ensure_list(value):
    return [value] if not isinstance(value, list) else value


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
