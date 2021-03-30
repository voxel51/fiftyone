"""
Detection evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging

import numpy as np

import fiftyone.core.evaluation as foe
import fiftyone.core.utils as fou

from .classification import ClassificationResults


logger = logging.getLogger(__name__)


def evaluate_detections(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    classes=None,
    missing=None,
    method="coco",
    iou=0.50,
    classwise=True,
    config=None,
    **kwargs
):
    """Evaluates the predicted detections in the given samples with respect to
    the specified ground truth detections.

    By default, this method uses COCO-style evaluation, but this can be
    configued via the ``method`` and ``config`` parameters.

    If an ``eval_key`` is provided, a number of fields are populated at the
    detection- and sample-level recording the results of the evaluation:

    -   True positive (TP), false positive (FP), and false negative (FN) counts
        for the each sample are saved in top-level fields of each sample::

            TP: sample.<eval_key>_tp
            FP: sample.<eval_key>_fp
            FN: sample.<eval_key>_fn

        In addition, when evaluating frame-level objects, TP/FP/FN counts are
        recorded for each frame::

            TP: frame.<eval_key>_tp
            FP: frame.<eval_key>_fp
            FN: frame.<eval_key>_fn

    -   The fields listed below are populated on each individual
        :class:`fiftyone.core.labels.Detection` instance; these fields tabulate
        the TP/FP/FN status of the object, the ID of the matching object
        (if any), and the matching IoU::

            TP/FP/FN: detection.<eval_key>
                  ID: detection.<eval_key>_id
                 IoU: detection.<eval_key>_iou

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` to evaluate
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Detections`
        eval_key (None): an evaluation key to use to refer to this evaluation
        classes (None): the list of possible classes. If not provided, classes
            are loaded from :meth:`fiftyone.core.dataset.Dataset.classes` or
            :meth:`fiftyone.core.dataset.Dataset.default_classes` if
            possible, or else the observed ground truth/predicted labels are
            used
        missing (None): a missing label string. Any unmatched objects are given
            this label for results purposes
        method ("coco"): a string specifying the evaluation method to use.
            Supported values are ``("coco")``
        iou (0.50): the IoU threshold to use to determine matches
        classwise (True): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        config (None): an :class:`DetectionEvaluationConfig` specifying the
            evaluation method to use. If a ``config`` is provided, the
            ``method``, ``iou``, ``classwise``, and ``kwargs`` parameters are
            ignored
        **kwargs: optional keyword arguments for the constructor of the
            :class:`DetectionEvaluationConfig` being used

    Returns:
        a :class:`DetectionResults`
    """
    if classes is None:
        if pred_field in samples.classes:
            classes = samples.classes[pred_field]
        elif gt_field in samples.classes:
            classes = samples.classes[gt_field]
        elif samples.default_classes:
            classes = samples.default_classes

    config = _parse_config(
        config,
        pred_field,
        gt_field,
        method,
        iou=iou,
        classwise=classwise,
        **kwargs,
    )
    eval_method = config.build()
    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples)

    processing_frames = samples._is_frame_field(pred_field)

    iter_samples = samples.select_fields([gt_field, pred_field])

    matches = []
    logger.info("Evaluating detections...")
    with fou.ProgressBar() as pb:
        for sample in pb(iter_samples):
            if processing_frames:
                images = sample.frames.values()
            else:
                images = [sample]

            sample_tp = 0
            sample_fp = 0
            sample_fn = 0
            for image in images:
                image_matches = eval_method.evaluate_image(
                    image, eval_key=eval_key
                )
                matches.extend(image_matches)
                tp, fp, fn = _tally_matches(image_matches)
                sample_tp += tp
                sample_fp += fp
                sample_fn += fn

                if processing_frames and eval_key is not None:
                    image["%s_tp" % eval_key] = tp
                    image["%s_fp" % eval_key] = fp
                    image["%s_fn" % eval_key] = fn

            if eval_key is not None:
                sample["%s_tp" % eval_key] = sample_tp
                sample["%s_fp" % eval_key] = sample_fp
                sample["%s_fn" % eval_key] = sample_fn
                sample.save()

    results = eval_method.generate_results(
        samples, matches, eval_key=eval_key, classes=classes, missing=missing
    )
    eval_method.save_run_results(samples, eval_key, results)

    return results


class DetectionEvaluationConfig(foe.EvaluationMethodConfig):
    """Base class for configuring :class:`DetectionEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Detections` instances
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
    """

    def __init__(
        self, pred_field, gt_field, iou=None, classwise=None, **kwargs
    ):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field
        self.iou = iou
        self.classwise = classwise


class DetectionEvaluation(foe.EvaluationMethod):
    """Base class for detection evaluation methods.

    Args:
        config: a :class:`DetectionEvaluationConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self.gt_field = None
        self.pred_field = None

    def register_samples(self, samples):
        """Registers the sample collection on which evaluation will be
        performed.

        This method will be called before the first call to
        :meth:`evaluate_image`. Subclasses can extend this method to perform
        any setup required for an evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
        """
        self.gt_field, _ = samples._handle_frame_field(self.config.gt_field)
        self.pred_field, _ = samples._handle_frame_field(
            self.config.pred_field
        )

    def evaluate_image(self, sample_or_frame, eval_key=None):
        """Evaluates the ground truth and predicted objects in an image.

        Args:
            sample_or_frame: a :class:`fiftyone.core.Sample` or
                :class:`fiftyone.core.frame.Frame`
            eval_key (None): the evaluation key for this evaluation

        Returns:
            a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
            tuples
        """
        raise NotImplementedError("subclass must implement evaluate_image()")

    def generate_results(
        self, samples, matches, eval_key=None, classes=None, missing=None
    ):
        """Generates aggregate evaluation results for the samples.

        Subclasses may perform additional computations here such as IoU sweeps
        in order to generate mAP, PR curves, etc.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            matches: a list of
                ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
                matches. Either label can be ``None`` to indicate an unmatched
                object
            eval_key (None): the evaluation key for this evaluation
            classes (None): the list of possible classes. If not provided, the
                observed ground truth/predicted labels are used for results
                purposes
            missing (None): a missing label string. Any unmatched objects are
                given this label for results purposes

        Returns:
            a :class:`DetectionResults`
        """
        return DetectionResults(
            matches,
            gt_field=self.config.gt_field,
            pred_field=self.config.pred_field,
            classes=classes,
            missing=missing,
        )

    def get_fields(self, samples, eval_key):
        fields = [
            "%s_tp" % eval_key,
            "%s_fp" % eval_key,
            "%s_fn" % eval_key,
            "%s.detections.%s" % (self.config.pred_field, eval_key),
            "%s.detections.%s_id" % (self.config.pred_field, eval_key),
            "%s.detections.%s_iou" % (self.config.pred_field, eval_key),
            "%s.detections.%s" % (self.config.gt_field, eval_key),
            "%s.detections.%s_id" % (self.config.gt_field, eval_key),
            "%s.detections.%s_iou" % (self.config.gt_field, eval_key),
        ]

        if samples._is_frame_field(self.config.gt_field):
            fields.extend(
                [
                    "frames.%s_tp" % eval_key,
                    "frames.%s_fp" % eval_key,
                    "frames.%s_fn" % eval_key,
                ]
            )

        return fields

    def cleanup(self, samples, eval_key):
        pred_field, is_frame_field = samples._handle_frame_field(
            self.config.pred_field
        )
        gt_field, _ = samples._handle_frame_field(self.config.gt_field)

        fields = [
            "%s_tp" % eval_key,
            "%s_fp" % eval_key,
            "%s_fn" % eval_key,
            "%s.detections.%s" % (pred_field, eval_key),
            "%s.detections.%s_id" % (pred_field, eval_key),
            "%s.detections.%s_iou" % (pred_field, eval_key),
            "%s.detections.%s" % (gt_field, eval_key),
            "%s.detections.%s_id" % (gt_field, eval_key),
            "%s.detections.%s_iou" % (gt_field, eval_key),
        ]

        if is_frame_field:
            samples._dataset.delete_sample_fields(
                ["%s_tp" % eval_key, "%s_fp" % eval_key, "%s_fn" % eval_key],
                error_level=1,
            )
            samples._dataset.delete_frame_fields(fields, error_level=1)
        else:
            samples._dataset.delete_sample_fields(fields, error_level=1)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class DetectionResults(ClassificationResults):
    """Class that stores the results of a detection evaluation.

    Args:
        matches: a list of
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            matches. Either label can be ``None`` to indicate an unmatched
            object
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing (None): a missing label string. Any unmatched objects are given
            this label for evaluation purposes
    """

    def __init__(
        self,
        matches,
        gt_field=None,
        pred_field=None,
        classes=None,
        missing=None,
    ):
        ytrue, ypred, ious, confs, ytrue_ids, ypred_ids = zip(*matches)
        super().__init__(
            ytrue,
            ypred,
            confs=confs,
            gt_field=gt_field,
            pred_field=pred_field,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
        )
        self.ious = np.array(ious)

    @classmethod
    def _from_dict(cls, d, samples, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        ious = d["ious"]

        confs = d.get("confs", None)
        if confs is None:
            confs = itertools.repeat(None)

        ytrue_ids = d.get("ytrue_ids", None)
        if ytrue_ids is None:
            ytrue_ids = itertools.repeat(None)

        ypred_ids = d.get("ypred_ids", None)
        if ypred_ids is None:
            ypred_ids = itertools.repeat(None)

        gt_field = d.get("gt_field", None)
        pred_field = d.get("pred_field", None)
        classes = d.get("classes", None)
        missing = d.get("missing", None)

        matches = list(zip(ytrue, ypred, ious, confs, ytrue_ids, ypred_ids))
        return cls(
            matches,
            gt_field=gt_field,
            pred_field=pred_field,
            classes=classes,
            missing=missing,
            **kwargs,
        )


def _parse_config(config, pred_field, gt_field, method, **kwargs):
    if config is not None:
        return config

    if method is None:
        method = "coco"

    if method == "coco":
        from .coco import COCOEvaluationConfig

        return COCOEvaluationConfig(pred_field, gt_field, **kwargs)

    raise ValueError("Unsupported evaluation method '%s'" % method)


def _tally_matches(matches):
    tp = 0
    fp = 0
    fn = 0
    for match in matches:
        gt_label = match[0]
        pred_label = match[1]
        if gt_label is None:
            fp += 1
        elif pred_label is None:
            fn += 1
        else:
            tp += 1

    return tp, fp, fn
