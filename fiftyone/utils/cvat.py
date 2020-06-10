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
from datetime import datetime
import logging
import os

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class CVATImageSampleParser(foud.LabeledImageSampleParser):
    """Parser for samples in CVAT image format.

    This implementation supports samples that are
    ``(image_or_path, annotations)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``annotations`` is a JSON dictionary of annotations in the following
          format::

            {
                ...
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
            a :class:`fiftyone.core.labels.ImageLabels` instance
        """
        d = sample[1]

        width = d["@width"]
        height = d["@height"]
        frame_size = (width, height)

        image_labels = etai.ImageLabels()
        for box in _ensure_list(d.get("box", [])):
            label = box["@label"]
            bounding_box = etag.BoundingBox.from_abs_coords(
                box["@xtl"],
                box["@ytl"],
                box["@xbr"],
                box["@ybr"],
                frame_size=frame_size,
            )
            obj = etao.DetectedObject(label=label, bounding_box=bounding_box)
            image_labels.add_object(obj)

        return fol.ImageLabels(labels=image_labels)


def load_cvat_image_annotations(xml_path):
    """Loads the CVAT image annotations from the given XML file.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        schema: the ``eta.core.image.ImageLabelsSchema`` for the annotations
        annotations: a list of image annotation dicts
    """
    d = fou.load_xml_as_json_dict(xml_path)

    # Load label schema
    labels = _ensure_list(
        d.get("annotations", {})
        .get("meta", {})
        .get("task", {})
        .get("labels", {})
        .get("label", [])
    )
    schema = etai.ImageLabelsSchema()
    for label in labels:
        _obj_label = label["name"]
        schema.add_object_label(_obj_label)
        if label.get("attributes", None):
            for attribute in label["attributes"]:
                _attr_name = attribute["name"]
                _attr_values = attribute["values"].split(",")
                for val in _attr_values:
                    _attr = etad.CategoricalAttribute(_attr_name, val.strip())
                    schema.add_object_attribute(_obj_label, _attr)

    # Load annotations
    annotations = _ensure_list(d.get("annotations", {}).get("image", []))

    return schema, annotations


def export_cvat_image_dataset(samples, label_field, dataset_dir):
    """Exports the given samples to disk as a CVAT image dataset.

    See :class:`fiftyone.types.CVATImageDataset` for format details.

    The raw images are directly copied to their destinations, maintaining their
    original formats and names, unless a name conflict would occur, in which
    case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances
        label_field: the name of the :class:`fiftyone.core.labels.Detections`
            or :class:`fiftyone.core.labels.ImageLabels` field of the samples
            to export
        dataset_dir: the directory to which to write the dataset
    """
    data_dir = os.path.join(dataset_dir, "data")
    labels_path = os.path.join(dataset_dir, "labels.xml")

    logger.info(
        "Writing samples to '%s' in '%s' format...",
        dataset_dir,
        etau.get_class_name(fot.CVATImageDataset),
    )

    etau.ensure_dir(data_dir)

    writer = None  # @todo implement this
    images = []
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

            etau.copy_file(img_path, out_img_path)

            metadata = sample.metadata
            if metadata is None:
                metadata = fom.ImageMetadata.build_for(img_path)

            label = sample[label_field]
            images.append(
                writer.write_annotation(label, metadata, out_img_path)
            )

    # Write task schema
    d = {
        "annotations": {
            "version": "1.1",
            "meta": {
                "task": {
                    "size": len(images),
                    "mode": "annotation",
                    "labels": None,  # @todo implement this
                },
                "dumped": datetime.now().isoformat(),
            },
            "image": images,
        }
    }

    # @todo convert to XML and save to disk

    logger.info("Dataset created")


def _ensure_list(value):
    return [value] if not isinstance(value, list) else value
