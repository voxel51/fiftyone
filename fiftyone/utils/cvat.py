"""
Utilities for working with datasets in CVAT format.

The CVAT project: https://github.com/opencv/cvat.

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
from copy import deepcopy
from datetime import datetime
import logging
import os

import jinja2

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class CVATImageSampleParser(foud.LabeledImageSampleParser):
    """Parser for samples in CVAT image format.

    This implementation supports samples that are
    ``(image_or_path, image_tag_dict)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``image_tag_dict`` is a JSON dictionary representation of an
          ``<image>`` tag of a CVAT image annotations file, which should have
          the following format::

            {
                "@id": "0",
                "@name": "filename.jpg",
                "@width": "640",
                "@height": "480",
                "box": [
                    {
                        "@label": "car",
                        "@xtl": "100",
                        "@ytl": "50",
                        "@xbr": "325",
                        "@ybr": "190",
                        "@type": "sedan"
                    },
                    ...
                ],
                ...
            }

    See :class:`fiftyone.types.CVATImageDataset` for more format details.
    """

    def parse_label(self, sample):
        """Parses the labels from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        d = sample[1]
        cvat_image = CVATImage.from_image_dict(d)
        return cvat_image.to_detections()


class CVATImageDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for CVAT image datasets stored on disk.

    See :class:`fiftyone.types.CVATImageDataset` for format details.

    Args:
        dataset_dir: the dataset directory
    """

    def __init__(self, dataset_dir):
        super().__init__(dataset_dir)
        self._data_dir = None
        self._labels_path = None
        self._images_map = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        image_path = os.path.join(self._data_dir, filename)
        cvat_image = self._images_map[filename]
        image_metadata = fom.ImageMetadata(
            width=cvat_image.width, height=cvat_image.height,
        )
        detections = cvat_image.to_detections()

        return image_path, image_metadata, detections

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")
        self._labels_path = os.path.join(self.dataset_dir, "labels.xml")

        _, cvat_images = load_cvat_image_annotations(self._labels_path)

        # Index by filename
        self._images_map = {i.name: i for i in cvat_images}

        self._filenames = etau.list_files(self._data_dir, abs_paths=False)


class CVATImageDatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes CVAT image datasets to disk.

    See :class:`fiftyone.types.CVATImageDataset` for format details.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._data_dir = None
        self._labels_path = None
        self._cvat_images = None
        self._data_filename_counts = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.xml")
        self._cvat_images = []
        self._data_filename_counts = defaultdict(int)

        etau.ensure_dir(self._data_dir)

    def export_sample(self, image_path, detections, metadata=None):
        name, ext = os.path.splitext(os.path.basename(image_path))
        self._data_filename_counts[name] += 1

        count = self._data_filename_counts[name]
        if count > 1:
            name += "-%d" + count

        out_filename = name + ext
        out_image_path = os.path.join(self._data_dir, out_filename)

        etau.copy_file(image_path, out_image_path)

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(image_path)

        cvat_image = CVATImage.from_detections(detections, metadata)

        cvat_image.id = len(self._cvat_images)
        cvat_image.name = out_filename

        self._cvat_images.append(cvat_image)

    def close(self, *args):
        # Build task labels
        cvat_task_labels = CVATTaskLabels.from_cvat_images(self._cvat_images)

        # Write annotations
        logger.info("Writing labels to '%s'", self._labels_path)
        writer = CVATImageAnnotationWriter()
        writer.write(cvat_task_labels, self._cvat_images, self._labels_path)


class CVATTaskLabels(object):
    """Description of the labels in a CVAT image annotation task.

    Args:
        labels (None): a list of label dicts in the following format::

            [
                {
                    "name": "car",
                    "attributes": [
                        {
                            "name": "type"
                            "categories": ["coupe", "sedan", "truck"]
                        },
                        ...
                    }
                },
                ...
            ]
    """

    def __init__(self, labels=None):
        self.labels = labels or []

    @classmethod
    def from_cvat_images(cls, cvat_images):
        """Creates a :class:`CVATTaskLabels` instance that describes the active
        schema of the given annotations.

        Args:
            cvat_images: a list of :class:`CVATImage` instances

        Returns:
            a :class:`CVATTaskLabels`
        """
        schema = etai.ImageLabelsSchema()
        for cvat_image in cvat_images:
            for box in cvat_image.boxes:
                _label = box.label
                schema.add_object_label(_label)
                for attr in box.attributes:
                    _attr = attr.to_eta_attribute()
                    schema.add_object_attribute(_label, _attr)

        return cls.from_schema(schema)

    @classmethod
    def from_labels_dict(cls, d):
        """Creates a :class:`CVATTaskLabels` instance from the ``<labels>``
        tag of a CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<labels>`` tag

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = _ensure_list(d.get("label", []))
        return cls(labels=labels)

    @classmethod
    def from_schema(cls, schema):
        """Creates a :class:`CVATTaskLabels` instance from an
        ``eta.core.image.ImageLabelsSchema``.

        Args:
            schema: an ``eta.core.image.ImageLabelsSchema``

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = []
        obj_schemas = schema.objects
        for label in sorted(obj_schemas.schema):
            obj_schema = obj_schemas.schema[label]
            obj_attr_schemas = obj_schema.attrs
            attributes = []
            for name in sorted(obj_attr_schemas.schema):
                attr_schema = obj_attr_schemas.schema[name]
                if isinstance(attr_schema, etad.CategoricalAttributeSchema):
                    attributes.append(
                        {
                            "name": name,
                            "categories": sorted(attr_schema.categories),
                        }
                    )

            labels.append({"name": label, "attributes": attributes})

        return cls(labels=labels)

    def to_schema(self):
        """Returns an ``eta.core.image.ImageLabelsSchema`` representation of
        the task labels.

        Returns:
            an ``eta.core.image.ImageLabelsSchema``
        """
        schema = etai.ImageLabelsSchema()

        for label in self.labels:
            _label = label["name"]
            schema.add_object_label(_label)
            for attribute in label.get("attributes", []):
                _name = attribute["name"]
                _categories = attribute["categories"]
                for _value in _categories:
                    _attr = etad.CategoricalAttribute(_name, _value)
                    schema.add_object_attribute(_label, _attr)

        return schema


class CVATImage(object):
    """An annotated image in CVAT image format.

    Args:
        id: the int ID of the image
        name: the filename of the image
        width: the width of the image, in pixels
        height: the height of the image, in pixels
        boxes (None): a list of :class:`CVATBox` instances
    """

    def __init__(self, id, name, width, height, boxes=None):
        self.id = id
        self.name = name
        self.width = width
        self.height = height
        self.boxes = boxes or []

    @classmethod
    def from_detections(cls, detections, metadata):
        """Creates a :class:`CVATImage` from a
        :class:`fiftyone.core.labels.Detections`.

        Args:
            detections: a :class:`fiftyone.core.labels.Detections`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImage`
        """
        width = metadata.width
        height = metadata.height

        boxes = [
            CVATBox.from_detection(d, metadata) for d in detections.detections
        ]

        return cls(None, None, width, height, boxes=boxes)

    @classmethod
    def from_image_dict(cls, d):
        """Creates a :class:`CVATImage` from an ``<image>`` tag of a CVAT image
        annotation XML file.

        Args:
            d: a dict representation of an ``<image>`` tag

        Returns:
            a :class:`CVATImage`
        """
        id = d["@id"]
        name = d["@name"]
        width = int(d["@width"])
        height = int(d["@height"])

        boxes = []
        for box in _ensure_list(d.get("box", [])):
            boxes.append(CVATBox.from_box_dict(box))

        return cls(id, name, width, height, boxes=boxes)

    def to_detections(self):
        """Returns a :class:`fiftyone.core.labels.Detections` representation of
        the annotations.

        Returns:
            a :class:`fiftyone.core.labels.Detections`
        """
        frame_size = (self.width, self.height)
        detections = [box.to_detection(frame_size) for box in self.boxes]
        return fol.Detections(detections=detections)


class CVATBox(object):
    """An object bounding box (with attributes) in CVAT image format.

    Args:
        label: the object label string
        xtl: the top-left x-coordinate of the box, in pixels
        ytl: the top-left y-coordinate of the box, in pixels
        xbr: the bottom-right x-coordinate of the box, in pixels
        ybr: the bottom-right y-coordinate of the box, in pixels
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, xtl, ytl, xbr, ybr, attributes=None):
        self.label = label
        self.xtl = xtl
        self.ytl = ytl
        self.xbr = xbr
        self.ybr = ybr
        self.attributes = attributes or []

    @classmethod
    def from_detected_object(cls, dobj, metadata):
        """Creates a :class:`CVATBox` from a
        ``eta.core.objects.DetectedObject``.

        Args:
            dobj: a ``eta.core.objects.DetectedObject``
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATBox`
        """
        label = dobj.label

        frame_size = (metadata.width, metadata.height)
        xtl, ytl, w, h = dobj.bounding_box.coords_in(frame_size=frame_size)
        xbr = xtl + w
        ybr = ytl + h

        attributes = [CVATAttribute.from_eta_attribute(a) for a in dobj.attrs]

        return cls(label, xtl, ytl, xbr, ybr, attributes=attributes)

    @classmethod
    def from_detection(cls, detection, metadata):
        """Creates a :class:`CVATBox` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATBox`
        """
        label = detection.label

        width = metadata.width
        height = metadata.height
        x, y, w, h = detection.bounding_box
        xtl = int(round(x * width))
        ytl = int(round(y * height))
        xbr = int(round((x + w) * width))
        ybr = int(round((y + h) * height))

        return cls(label, xtl, ytl, xbr, ybr)

    @classmethod
    def from_box_dict(cls, d):
        """Creates a :class:`CVATBox` from a ``<box>`` tag of a CVAT image
        annotation XML file.

        Args:
            d: a dict representation of a ``<box>`` tag

        Returns:
            a :class:`CVATBox`
        """
        d = deepcopy(d)

        label = d.pop("@label")

        xtl = int(d.pop("@xtl"))
        ytl = int(d.pop("@ytl"))
        xbr = int(d.pop("@xbr"))
        ybr = int(d.pop("@ybr"))

        attributes = [
            CVATAttribute.from_anno(name, value) for name, value in d.items()
        ]

        return cls(label, xtl, ytl, xbr, ybr, attributes=attributes)

    def to_detected_object(self, frame_size):
        """Returns a ``eta.core.objects.DetectedObject`` representation of the
        box.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a ``eta.core.objects.DetectedObject``
        """
        label = self.label

        bounding_box = etag.BoundingBox.from_abs_coords(
            self.xtl, self.ytl, self.xbr, self.ybr, frame_size=frame_size
        )
        attrs = etad.AttributeContainer(
            attrs=[a.to_eta_attribute() for a in self.attributes]
        )

        return etao.DetectedObject(
            label=label, bounding_box=bounding_box, attrs=attrs
        )

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the box.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.label

        width, height = frame_size
        bounding_box = [
            self.xtl / width,
            self.ytl / height,
            (self.xbr - self.xtl) / width,
            (self.ybr - self.ytl) / height,
        ]

        attributes = {a.name: a.to_eta_attribute() for a in self.attributes}

        return fol.Detection(
            label=label, bounding_box=bounding_box, attributes=attributes,
        )


class CVATAttribute(object):
    """An attribute in CVAT image format.

    Args:
        name: the attribute name
        value: the attribute value
    """

    def __init__(self, name, value):
        self.name = name
        self.value = value

    @classmethod
    def from_anno(cls, name, value):
        """Creates a :class:`CVATAttribute` from the given annotation info.

        Args:
            name: the attribute name
            value: the attribute value

        Returns:
            a :class:`CVATAttribute`
        """
        return cls(name, value)

    @classmethod
    def from_eta_attribute(cls, attr):
        """Creates a :class:`CVATAttribute` from an
        ``eta.core.data.Attribute``.

        Args:
            attr: an ``eta.core.data.Attribute``

        Returns:
            a :class:`CVATAttribute`
        """
        return cls(attr.name, attr.value)

    def to_eta_attribute(self):
        """Returns an ``eta.core.data.Attribute`` representation of the
        attribute.

        Returns:
            an ``eta.core.data.Attribute``
        """
        return etad.CategoricalAttribute(self.name, self.value)


class CVATImageAnnotationWriter(object):
    """Class for writing annotations in CVAT image format.

    See :class:`fiftyone.types.CVATImageDataset` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template(
            "cvat_image_annotation_template.xml"
        )

    def write(self, cvat_task_labels, cvat_images, xml_path):
        """Writes the annotations to disk.

        Args:
            cvat_task_labels: a :class:`CVATTaskLabels` instance
            cvat_images: a list of :class:`CVATImage` instances
            xml_path: the path to write the annotations XML file
        """
        xml_str = self.template.render(
            {
                "version": "1.1",
                "size": len(cvat_images),
                "mode": "annotation",
                "labels": cvat_task_labels.labels,
                "dumped": datetime.now().isoformat(),
                "images": cvat_images,
            }
        )
        etau.write_file(xml_str, xml_path)


def load_cvat_image_annotations(xml_path):
    """Loads the CVAT image annotations from the given XML file.

    See :class:`fiftyone.types.CVATImageDataset` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        cvat_task_labels: a :class:`CVATTaskLabels` instance
        cvat_images: a list of :class:`CVATImage` instances
    """
    d = fou.load_xml_as_json_dict(xml_path)

    # Load task labels
    labels_dict = (
        d.get("annotations", {})
        .get("meta", {})
        .get("task", {})
        .get("labels", {})
    )
    cvat_task_labels = CVATTaskLabels.from_labels_dict(labels_dict)

    # Load annotations
    image_dicts = _ensure_list(d.get("annotations", {}).get("image", []))
    cvat_images = [CVATImage.from_image_dict(id) for id in image_dicts]

    return cvat_task_labels, cvat_images


def _ensure_list(value):
    return [value] if not isinstance(value, list) else value
