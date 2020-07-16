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
import logging
import os

import numpy as np
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

import fiftyone as fo
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.coco as fouc


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

    image_id = 0
    anno_id = 0
    det_id = 0

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
                detection.attributes["coco_id"] = \
                    fo.core.labels.NumericAttribute(value=anno_id)
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
                detection.attributes["coco_id"] = \
                    fo.core.labels.NumericAttribute(value=det_id)
                obj.id = det_id
                obj.image_id = image_id
                obj.score = detection.confidence
                predictions.append(obj.__dict__)

            sample.save()
            
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
    _accumulate_coco(cocoEval, dataset, sample_id_map, prediction_field)
    del cocoEval
    del cocoDt
    del cocoGt


def _accumulate_coco(cocoEval, dataset, sample_id_map, prediction_field):
    '''Accumulate per image evaluation results and store the results in each
    sample of the given FiftyOne Dataset

    Modification of code from:
    github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py

    Args:
        cocoEval: the coco eval object containing evaluation data
        dataset: the FiftyOne Dataset to store results in
        sample_id_map: a dictionary mapping FiftyOne Dataset sample ids to
            cocoEval image ids
    '''
    # allows input customized parameters
    p = cocoEval.params
    p.catIds = p.catIds if p.useCats == 1 else [-1]
    T           = len(p.iouThrs)
    R           = len(p.recThrs)
    K           = len(p.catIds) if p.useCats else 1
    A           = len(p.areaRng)
    sample_p    = -np.ones((len(p.imgIds),T,R,K,A))
    sample_r    = -np.ones((len(p.imgIds),T,K,A))
    sample_s    = -np.ones((len(p.imgIds),T,R,K,A))
    maxDet = 100

    # image id: dtid: {gtid for iou 5, gtid for iou 75 , gtid for iou 95} 
    matches = {}

    # create dictionary for future indexing
    _pe = cocoEval._paramsEval
    catIds = _pe.catIds if _pe.useCats else [-1]
    setK = set(catIds)
    setA = set(map(tuple, _pe.areaRng))
    setI = set(_pe.imgIds)
    # get inds to evaluate
    k_list = [n for n, k in enumerate(p.catIds)  if k in setK]
    a_list = [n for n, a in enumerate(map(lambda x: tuple(x), p.areaRng)) 
            if a in setA]
    i_list = [n for n, i in enumerate(p.imgIds)  if i in setI]
    I0 = len(_pe.imgIds)
    A0 = len(_pe.areaRng)
    # retrieve E at each category, area range, and max number of detections
    logger.info('Processing sample AP for each category')
    with fou.ProgressBar() as pb:
        for k, k0 in pb(enumerate(k_list)):
            Nk = k0*A0*I0
            for a, a0 in enumerate(a_list):
                Na = a0*I0
                E = [cocoEval.evalImgs[Nk + Na + i] for i in i_list]
                E = [e for e in E if not e is None]
                if len(E) == 0:
                    continue
                
                # Compute AP for every individual image
                for e in E:
                    if a == 0:
                        image_id = e['image_id']
                        if image_id not in matches.keys():
                            matches[image_id] = {}
                        for dt_ind, dt_id in enumerate(e['dtIds']):
                            dt_matches = e['dtMatches']
                            matches[image_id][dt_id-1] = {}
                            matches[image_id][dt_id-1]["gtId_5"] = \
                                dt_matches[0, dt_ind] 
                            matches[image_id][dt_id-1]["gtId_75"] = \
                                dt_matches[5, dt_ind] 
                            matches[image_id][dt_id-1]["gtId_95"] = \
                                dt_matches[-1, dt_ind] 

                    dtScores = np.array(e['dtScores'][0:maxDet])

                    # different sorting method generates slightly different 
                    # results. mergesort is used to be consistent as Matlab 
                    # implementation.
                    inds = np.argsort(-dtScores, kind='mergesort')
                    dtScoresSorted = dtScores[inds]

                    dtm  = np.array(e['dtMatches'][:,0:maxDet][:,inds])
                    dtIg = np.array(e['dtIgnore'][:,0:maxDet][:,inds])
                    gtIg = np.array(e['gtIgnore'])
                    npig = np.count_nonzero(gtIg==0 )
                    tps = np.logical_and(dtm, np.logical_not(dtIg))
                    fps = np.logical_and(np.logical_not(dtm), 
                            np.logical_not(dtIg))

                    tp_sum = np.cumsum(tps, axis=1).astype(dtype=np.float)
                    fp_sum = np.cumsum(fps, axis=1).astype(dtype=np.float)
                    for t, (tp, fp) in enumerate(zip(tp_sum, fp_sum)):
                        tp = np.array(tp)
                        fp = np.array(fp)
                        nd = len(tp)
                        if npig==0:
                            rc = np.zeros(tp.shape)
                        else:
                            rc = tp / npig
                        pr = tp / (fp+tp+np.spacing(1))
                        q  = np.zeros((R,))
                        ss = np.zeros((R,))

                        if nd:
                            sample_r[e['image_id']-1,t,k,a] = rc[-1]
                        else:
                            sample_r[e['image_id']-1,t,k,a] = 0

                        # numpy is slow without cython optimization for 
                        # accessing elements use python array gets 
                        # significant speed improvement
                        pr = pr.tolist(); q = q.tolist()

                        for i in range(nd-1, 0, -1):
                            if pr[i] > pr[i-1]:
                                pr[i-1] = pr[i]

                        inds = np.searchsorted(rc, p.recThrs, side='left')
                        try:
                            for ri, pi in enumerate(inds):
                                q[ri] = pr[pi]
                                ss[ri] = dtScoresSorted[pi]
                        except:
                            pass

                        sample_p[e['image_id']-1,t,:,k,a] = np.array(q)
                        sample_s[e['image_id']-1,t,:,k,a] = np.array(ss)

    logger.info("Adding evaluation results to dataset")
    with fou.ProgressBar() as pb:
        # Write sample-wise metrics to database
        for image_id in pb(p.imgIds):
            sample = dataset[sample_id_map[image_id]]
            # AP, AP@0.5, AP@0.75, AP small, AP med, AP large 
            # areaRng = ["all", "small", "medium", "large"]
            # maxDets = [1,10,100]
            # iouThrs = [0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95] 

            aind = 0 # "all"
            s_AP = sample_p[image_id-1,:,:,:,aind]
            if len(s_AP[s_AP>-1])>0:
                sample["AP"] = np.mean(s_AP[s_AP>-1])

            iouind = 0 # 0.5
            s_AP_0_5 = sample_p[image_id-1,iouind,:,:,aind]
            if len(s_AP_0_5[s_AP_0_5>-1])>0:
                sample["AP_0_5"] = np.mean(s_AP_0_5[s_AP_0_5>-1])

            iouind = 5 # 0.75
            s_AP_0_75 = sample_p[image_id-1,iouind,:,:,aind]
            if len(s_AP_0_75[s_AP_0_75>-1])>0:
                sample["AP_0_75"] = np.mean(s_AP_0_75[s_AP_0_75>-1])

            aind = 1 # "small"
            s_AP_small = sample_p[image_id-1,:,:,:,aind]
            if len(s_AP_small[s_AP_small>-1])>0:
                sample["AP_small"] = np.mean(s_AP_small[s_AP_small>-1])

            aind = 2 # "medium"
            s_AP_medium = sample_p[image_id-1,:,:,:,aind]
            if len(s_AP_medium[s_AP_medium>-1])>0:
                sample["AP_medium"] = np.mean(s_AP_medium[s_AP_medium>-1])

            aind = 3 # "large"
            s_AP_large = sample_p[image_id-1,:,:,:,aind]
            if len(s_AP_large[s_AP_large>-1])>0:
                sample["AP_large"] = np.mean(s_AP_large[s_AP_large>-1])

            for det in sample[prediction_field].detections:
                det_id = det.attributes["coco_id"].value-1
                gtId_5 = matches[image_id][det_id]["gtId_5"] 
                gtId_75 = matches[image_id][det_id]["gtId_75"] 
                gtId_95 = matches[image_id][det_id]["gtId_95"] 
                det.attributes["gtId_5"] = \
                    fo.core.labels.NumericAttribute(value=gtId_5)
                det.attributes["gtId_75"] = \
                    fo.core.labels.NumericAttribute(value=gtId_75)
                det.attributes["gtId_95"] = \
                    fo.core.labels.NumericAttribute(value=gtId_95)

            sample.save()
