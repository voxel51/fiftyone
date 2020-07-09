"""
FiftyOne evaluation.

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
import datetime
import inspect
import logging
import numbers
import os

from pycocotools.coco import COCO
#from pycocotools.cocoeval import COCOeval

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.metadata as fom
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
from fiftyone.core.singleton import DatasetSingleton
import fiftyone.core.view as fov
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.utils.coco as fouc
from fiftyone.utils.cocoeval import COCOeval


logger = logging.getLogger(__name__)


def evaluate_detections(dataset, prediction_field, gt_field="ground_truth"):
    """Looks at the type of the ``ground_truth`` field and runs a corresponding
        evaluation protocol with the specified ``predictions``. Loads all
        prediction and ground truth labels into memory, performs predictions,
        and adds sample-wise prediction results back into the dataset.

    Args:
        dataset: the dataset containing the ground truth and predictions
        prediction_field: the name of the field to evaluate over
        gt_field: the name of the field containing the ground truth to use for
            evaluation
    """

    image_id = -1
    anno_id = -1
    det_id = -1

    images = []
    annotations = []
    predictions = []

    _classes = set()

    data_filename_counts = defaultdict(int)

    sample_id_map = {}

    logger.info("Loading labels and predictions into memory")
    with fou.ProgressBar() as pb:
        for sample in pb(dataset):
            img_path = sample.filepath
            name, ext = os.path.splitext(os.path.basename(img_path))
            data_filename_counts[name] += 1

            count = data_filename_counts[name]
            if count > 1:
                name += "-%d" + count

            filename = name + ext

            metadata = sample.metadata
            if metadata is None:
                metadata = fom.ImageMetadata.build_for(img_path)

            image_id += 1
            sample_id_map[image_id] = sample.id
            images.append(
                {
                    "id": image_id,
                    "file_name": filename,
                    "height": metadata.height,
                    "width": metadata.width,
                    "license": None,
                    "coco_url": None,
                }
            )

            gt_annots = sample[gt_field]
            for detection in gt_annots.detections:
                anno_id += 1
                _classes.add(detection.label)
                obj = fouc.COCOObject.from_detection(
                    detection, metadata
                )
                #detection.attributes["coco_id"] = anno_id
                obj.id = anno_id
                obj.image_id = image_id
                annotations.append(obj.__dict__)

            detections = sample[prediction_field]
            for detection in detections.detections:
                det_id += 1
                _classes.add(detection.label)
                obj = fouc.COCOObject.from_detection(
                    detection, metadata
                )
                #detection.attributes["coco_id"] = det_id
                obj.id = det_id
                obj.image_id = image_id
                obj.score = detection.confidence
                predictions.append(obj.__dict__)



    # Populate observed category IDs, if necessary
    classes = sorted(_classes)
    labels_map_rev = {c: i for i, c in enumerate(classes)}
    for anno in annotations:
        anno["category_id"] = labels_map_rev[anno["category_id"]]
    for pred in predictions:
        pred["category_id"] = labels_map_rev[pred["category_id"]]

    categories = [
        {"id": i, "name": l, "supercategory": "none"}
        for i, l in enumerate(classes)
    ]

    labels = {
        "categories": categories,
        "images": images,
        "annotations": annotations,
    }

    cocoGt = COCO()
    cocoGt.dataset = labels
    cocoGt.createIndex()

    cocoDt = COCO()
    cocoDt.dataset["images"] = cocoGt.dataset["images"]
    cocoDt.dataset["annotations"] = predictions
    cocoDt.createIndex()

    cocoEval = COCOeval(cocoGt,cocoDt,"bbox")

    cocoEval.evaluate()
    sample_p, sample_s, sample_r = cocoEval.accumulate(dataset, sample_id_map)

