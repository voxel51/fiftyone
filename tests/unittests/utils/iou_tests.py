import unittest

from bson import ObjectId

import fiftyone as fo
from fiftyone.utils.iou import compute_ious


class ComputeIouTests(unittest.TestCase):
    def test_compute_iou_bbox_sparse_nonoverlapping(self):
        iscrowd = None
        classwise = False
        sparse = True
        eval_results = {
            "mask": None,
            "mask_path": None,
            "confidence": None,
            "index": None,
            "eval_iou": None,
            "eval_id": "",
        }
        ids = [ObjectId() for _ in range(4)]
        gt = [
            fo.Detection(
                id=ids[0],
                label="test",
                bounding_box=[0.1, 0.1, 0.1, 0.1],
                **eval_results
            )
        ]
        preds = [
            fo.Detection(
                id=ids[1],
                label="test",
                bounding_box=[0.1, 0.1, 0.5, 0.5],
                **eval_results
            ),
            fo.Detection(
                id=ids[2],
                label="test",
                bounding_box=[0.0, 0.0, 0.1, 0.1],
                **eval_results
            ),
            fo.Detection(
                id=ids[3],
                label="test",
                bounding_box=[0.9, 0.9, 0.1, 0.1],
                **eval_results
            ),
        ]
        detections_with_intersection = [str(ids[1]), str(ids[2])]

        results = compute_ious(
            preds, gt, iscrowd=iscrowd, classwise=classwise, sparse=sparse
        )

        for pred in preds:
            assert pred.id in results
            if pred.id in detections_with_intersection:
                assert results[pred.id][0][0] == gt[0].id
                assert results[pred.id][0][1] >= 0.0
            else:
                assert not results[pred.id]
