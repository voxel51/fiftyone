"""
Detection evaluation.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import inspect
import itertools
import logging

import numpy as np

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

from .base import (
    BaseEvaluationMethod,
    BaseEvaluationMethodConfig,
    BaseClassificationResults,
)


logger = logging.getLogger(__name__)


def evaluate_detections(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    classes=None,
    missing=None,
    method=None,
    iou=0.50,
    use_masks=False,
    use_boxes=False,
    classwise=True,
    dynamic=True,
    custom_metrics=None,
    progress=None,
    **kwargs,
):
    """Evaluates the predicted detections in the given samples with respect to
    the specified ground truth detections.

    This method supports evaluating the following spatial data types:

    -   Object detections in :class:`fiftyone.core.labels.Detections` format
    -   Instance segmentations in :class:`fiftyone.core.labels.Detections`
        format with their ``mask`` attributes populated
    -   Polygons in :class:`fiftyone.core.labels.Polylines` format
    -   Keypoints in :class:`fiftyone.core.labels.Keypoints` format
    -   Temporal detections in :class:`fiftyone.core.labels.TemporalDetections`
        format

    For spatial object detection evaluation, this method uses COCO-style
    evaluation by default.

    When evaluating keypoints, "IoUs" are computed via
    `object keypoint similarity <https://cocodataset.org/#keypoints-eval>`_.

    For temporal segment detection, this method uses ActivityNet-style
    evaluation by default.

    You can use the ``method`` parameter to select a different method, and you
    can optionally customize the method by passing additional parameters for
    the method's config class as ``kwargs``.

    The natively provided ``method`` values and their associated configs are:

    -   ``"coco"``: :class:`fiftyone.utils.eval.coco.COCOEvaluationConfig`
    -   ``"open-images"``: :class:`fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig`
    -   ``"activitynet"``: :class:`fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig`

    If an ``eval_key`` is provided, a number of fields are populated at the
    object- and sample-level recording the results of the evaluation:

    -   True positive (TP), false positive (FP), and false negative (FN) counts
        for each sample are saved in top-level fields of each sample::

            TP: sample.<eval_key>_tp
            FP: sample.<eval_key>_fp
            FN: sample.<eval_key>_fn

        In addition, when evaluating frame-level objects, TP/FP/FN counts are
        recorded for each frame::

            TP: frame.<eval_key>_tp
            FP: frame.<eval_key>_fp
            FN: frame.<eval_key>_fn

    -   The fields listed below are populated on each individual object; these
        fields tabulate the TP/FP/FN status of the object, the ID of the
        matching object (if any), and the matching IoU::

            TP/FP/FN: object.<eval_key>
                  ID: object.<eval_key>_id
                 IoU: object.<eval_key>_iou

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`,
            :class:`fiftyone.core.labels.Keypoints`,
            or :class:`fiftyone.core.labels.TemporalDetections`
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`,
            :class:`fiftyone.core.labels.Keypoints`,
            or :class:`fiftyone.core.labels.TemporalDetections`
        eval_key (None): an evaluation key to use to refer to this evaluation
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing (None): a missing label string. Any unmatched objects are given
            this label for results purposes
        method (None): a string specifying the evaluation method to use. The
            supported values are
            ``fo.evaluation_config.detection_backends.keys()`` and the default
            is ``fo.evaluation_config.default_detection_backend``
        iou (0.50): the IoU threshold to use to determine matches
        use_masks (False): whether to compute IoUs using the instances masks in
            the ``mask`` attribute of the provided objects, which must be
            :class:`fiftyone.core.labels.Detection` instances
        use_boxes (False): whether to compute IoUs using the bounding boxes
            of the provided :class:`fiftyone.core.labels.Polyline` instances
            rather than using their actual geometries
        classwise (True): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        dynamic (True): whether to declare the dynamic object-level attributes
            that are populated on the dataset's schema
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        **kwargs: optional keyword arguments for the constructor of the
            :class:`DetectionEvaluationConfig` being used

    Returns:
        a :class:`DetectionResults`
    """
    fov.validate_non_grouped_collection(samples)
    fov.validate_collection_label_fields(
        samples,
        (pred_field, gt_field),
        (fol.Detections, fol.Polylines, fol.Keypoints, fol.TemporalDetections),
        same_type=True,
    )

    label_type = samples._get_label_field_type(gt_field)
    is_temporal = issubclass(label_type, fol.TemporalDetections)

    if is_temporal:
        fov.validate_video_collection(samples)
    else:
        kwargs.update(dict(use_masks=use_masks, use_boxes=use_boxes))

    config = _parse_config(
        pred_field,
        gt_field,
        method,
        is_temporal,
        iou=iou,
        classwise=classwise,
        custom_metrics=custom_metrics,
        **kwargs,
    )

    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key, dynamic=dynamic)

    processing_frames = samples._is_frame_field(pred_field)
    save = eval_key is not None

    if save:
        tp_field = "%s_tp" % eval_key
        fp_field = "%s_fp" % eval_key
        fn_field = "%s_fn" % eval_key

    if config.requires_additional_fields:
        _samples = samples
    else:
        _samples = samples.select_fields([gt_field, pred_field])

    matches = []
    logger.info("Evaluating detections...")
    for sample in _samples.iter_samples(progress=progress, autosave=save):
        if processing_frames:
            docs = sample.frames.values()
        else:
            docs = [sample]

        sample_tp = 0
        sample_fp = 0
        sample_fn = 0
        for doc in docs:
            doc_matches = eval_method.evaluate(doc, eval_key=eval_key)
            matches.extend(doc_matches)
            tp, fp, fn = _tally_matches(doc_matches)
            sample_tp += tp
            sample_fp += fp
            sample_fn += fn

            if processing_frames and save:
                doc[tp_field] = tp
                doc[fp_field] = fp
                doc[fn_field] = fn

        if save:
            sample[tp_field] = sample_tp
            sample[fp_field] = sample_fp
            sample[fn_field] = sample_fn

    results = eval_method.generate_results(
        samples,
        matches,
        eval_key=eval_key,
        classes=classes,
        missing=missing,
        progress=progress,
    )
    eval_method.compute_custom_metrics(samples, eval_key, results)
    eval_method.save_run_results(samples, eval_key, results)

    return results


class DetectionEvaluationConfig(BaseEvaluationMethodConfig):
    """Base class for configuring :class:`DetectionEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`, or
            :class:`fiftyone.core.labels.Keypoints`
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polylines`, or
            :class:`fiftyone.core.labels.Keypoints`
        iou (None): the IoU threshold to use to determine matches
        classwise (None): whether to only match objects with the same class
            label (True) or allow matches between classes (False)
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        iou=None,
        classwise=None,
        custom_metrics=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field
        self.iou = iou
        self.classwise = classwise
        self.custom_metrics = custom_metrics

    @property
    def type(self):
        return "detection"

    @property
    def requires_additional_fields(self):
        """Whether fields besides ``pred_field`` and ``gt_field`` are required
        in order to perform evaluation.

        If True then the entire samples will be loaded rather than using
        :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
        to optimize.
        """
        return False


class DetectionEvaluation(BaseEvaluationMethod):
    """Base class for detection evaluation methods.

    Args:
        config: a :class:`DetectionEvaluationConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self.gt_field = None
        self.pred_field = None

    def register_samples(self, samples, eval_key, dynamic=True):
        """Registers the collection on which evaluation will be performed.

        This method will be called before the first call to :meth:`evaluate`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
            dynamic (True): whether to declare the dynamic object-level
                attributes that are populated on the dataset's schema
        """
        _gt_field = self.config.gt_field
        _pred_field = self.config.pred_field

        self.gt_field, _ = samples._handle_frame_field(_gt_field)
        self.pred_field, _ = samples._handle_frame_field(_pred_field)

        if eval_key is None:
            return

        processing_frames = samples._is_frame_field(_pred_field)
        dataset = samples._dataset

        tp_field = "%s_tp" % eval_key
        fp_field = "%s_fp" % eval_key
        fn_field = "%s_fn" % eval_key

        dataset.add_sample_field(tp_field, fof.IntField)
        dataset.add_sample_field(fp_field, fof.IntField)
        dataset.add_sample_field(fn_field, fof.IntField)

        if processing_frames:
            dataset.add_frame_field(tp_field, fof.IntField)
            dataset.add_frame_field(fp_field, fof.IntField)
            dataset.add_frame_field(fn_field, fof.IntField)

        if not dynamic:
            return

        id_key = "%s_id" % eval_key
        iou_key = "%s_iou" % eval_key

        _, gt_prefix = samples._get_label_field_path(_gt_field)
        gt_prefix, _ = samples._handle_frame_field(gt_prefix)

        gt_eval = gt_prefix + "." + eval_key
        gt_id = gt_prefix + "." + id_key
        gt_iou = gt_prefix + "." + iou_key

        _, pred_prefix = samples._get_label_field_path(_pred_field)
        pred_prefix, _ = samples._handle_frame_field(pred_prefix)

        pred_eval = pred_prefix + "." + eval_key
        pred_id = pred_prefix + "." + id_key
        pred_iou = pred_prefix + "." + iou_key

        if processing_frames:
            dataset.add_frame_field(gt_eval, fof.StringField)
            dataset.add_frame_field(gt_id, fof.StringField)
            dataset.add_frame_field(gt_iou, fof.FloatField)
            dataset.add_frame_field(pred_eval, fof.StringField)
            dataset.add_frame_field(pred_id, fof.StringField)
            dataset.add_frame_field(pred_iou, fof.FloatField)
        else:
            dataset.add_sample_field(gt_eval, fof.StringField)
            dataset.add_sample_field(gt_id, fof.StringField)
            dataset.add_sample_field(gt_iou, fof.FloatField)
            dataset.add_sample_field(pred_eval, fof.StringField)
            dataset.add_sample_field(pred_id, fof.StringField)
            dataset.add_sample_field(pred_iou, fof.FloatField)

    def evaluate(self, doc, eval_key=None):
        """Evaluates the ground truth and predictions in the given document.

        Args:
            doc: a :class:`fiftyone.core.document.Document`
            eval_key (None): the evaluation key for this evaluation

        Returns:
            a list of matched ``(gt_label, pred_label, iou, pred_confidence)``
            tuples
        """
        raise NotImplementedError("subclass must implement evaluate()")

    def generate_results(
        self,
        samples,
        matches,
        eval_key=None,
        classes=None,
        missing=None,
        progress=None,
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`DetectionResults`
        """
        return DetectionResults(
            samples,
            self.config,
            eval_key,
            matches,
            classes=classes,
            missing=missing,
            backend=self,
        )

    def get_fields(self, samples, eval_key):
        pred_field = self.config.pred_field
        pred_type = samples._get_label_field_type(pred_field)
        pred_key = "%s.%s.%s" % (
            pred_field,
            pred_type._LABEL_LIST_FIELD,
            eval_key,
        )

        gt_field = self.config.gt_field
        gt_type = samples._get_label_field_type(gt_field)
        gt_key = "%s.%s.%s" % (gt_field, gt_type._LABEL_LIST_FIELD, eval_key)

        fields = [
            "%s_tp" % eval_key,
            "%s_fp" % eval_key,
            "%s_fn" % eval_key,
            pred_key,
            "%s_id" % pred_key,
            "%s_iou" % pred_key,
            gt_key,
            "%s_id" % gt_key,
            "%s_iou" % gt_key,
        ]

        if samples._is_frame_field(gt_field):
            prefix = samples._FRAMES_PREFIX + eval_key
            fields.extend(
                ["%s_tp" % prefix, "%s_fp" % prefix, "%s_fn" % prefix]
            )

        fields.extend(self.get_custom_metric_fields(samples, eval_key))

        return fields

    def rename(self, samples, eval_key, new_eval_key):
        dataset = samples._dataset

        in_fields = self.get_fields(dataset, eval_key)
        out_fields = self.get_fields(dataset, new_eval_key)

        in_sample_fields, in_frame_fields = fou.split_frame_fields(in_fields)
        out_sample_fields, out_frame_fields = fou.split_frame_fields(
            out_fields
        )

        if in_sample_fields:
            fields = dict(zip(in_sample_fields, out_sample_fields))
            dataset.rename_sample_fields(fields)

        if in_frame_fields:
            fields = dict(zip(in_frame_fields, out_frame_fields))
            dataset.rename_frame_fields(fields)

        self.rename_custom_metrics(samples, eval_key, new_eval_key)

    def cleanup(self, samples, eval_key):
        dataset = samples._dataset

        fields = [
            "%s_tp" % eval_key,
            "%s_fp" % eval_key,
            "%s_fn" % eval_key,
        ]

        try:
            pred_field, _ = dataset._handle_frame_field(self.config.pred_field)
            pred_type = dataset._get_label_field_type(self.config.pred_field)
            pred_key = "%s.%s.%s" % (
                pred_field,
                pred_type._LABEL_LIST_FIELD,
                eval_key,
            )
            fields.extend([pred_key, "%s_id" % pred_key, "%s_iou" % pred_key])
        except ValueError:
            # Field no longer exists, nothing to cleanup
            pass

        try:
            gt_field, _ = dataset._handle_frame_field(self.config.gt_field)
            gt_type = dataset._get_label_field_type(self.config.gt_field)
            gt_key = "%s.%s.%s" % (
                gt_field,
                gt_type._LABEL_LIST_FIELD,
                eval_key,
            )
            fields.extend([gt_key, "%s_id" % gt_key, "%s_iou" % gt_key])
        except ValueError:
            # Field no longer exists, nothing to cleanup
            pass

        if dataset._is_frame_field(self.config.pred_field):
            dataset.delete_sample_fields(
                ["%s_tp" % eval_key, "%s_fp" % eval_key, "%s_fn" % eval_key],
                error_level=1,
            )
            dataset.delete_frame_fields(fields, error_level=1)
        else:
            dataset.delete_sample_fields(fields, error_level=1)

        self.cleanup_custom_metrics(samples, eval_key)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class DetectionResults(BaseClassificationResults):
    """Class that stores the results of a detection evaluation.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`DetectionEvaluationConfig` used
        eval_key: the evaluation key
        matches: a list of
            ``(gt_label, pred_label, iou, pred_confidence, gt_id, pred_id)``
            matches. Either label can be ``None`` to indicate an unmatched
            object
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted labels are used
        missing (None): a missing label string. Any unmatched objects are given
            this label for evaluation purposes
        custom_metrics (None): an optional dict of custom metrics
        backend (None): a :class:`DetectionEvaluation` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        matches,
        classes=None,
        missing=None,
        custom_metrics=None,
        backend=None,
    ):
        if matches:
            ytrue, ypred, ious, confs, ytrue_ids, ypred_ids = zip(*matches)
        else:
            ytrue, ypred, ious, confs, ytrue_ids, ypred_ids = (
                [],
                [],
                [],
                [],
                [],
                [],
            )

        super().__init__(
            samples,
            config,
            eval_key,
            ytrue,
            ypred,
            confs=confs,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            custom_metrics=custom_metrics,
            backend=backend,
        )

        self.ious = np.array(ious)

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
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

        classes = d.get("classes", None)
        missing = d.get("missing", None)
        custom_metrics = d.get("custom_metrics", None)

        matches = list(zip(ytrue, ypred, ious, confs, ytrue_ids, ypred_ids))

        return cls(
            samples,
            config,
            eval_key,
            matches,
            classes=classes,
            missing=missing,
            custom_metrics=custom_metrics,
            **kwargs,
        )


def _parse_config(pred_field, gt_field, method, is_temporal, **kwargs):
    if method is None:
        if is_temporal:
            # @todo expose this in `fo.evaluation_config`?
            method = "activitynet"
        else:
            method = fo.evaluation_config.default_detection_backend

    custom_metrics = kwargs.get("custom_metrics", None)
    if etau.is_str(custom_metrics):
        kwargs["custom_metrics"] = [custom_metrics]

    if inspect.isclass(method):
        return method(pred_field, gt_field, **kwargs)

    backends = fo.evaluation_config.detection_backends

    if method not in backends:
        raise ValueError(
            "Unsupported detection evaluation method '%s'. The available "
            "methods are %s" % (method, sorted(backends.keys()))
        )

    params = deepcopy(backends[method])

    config_cls = kwargs.pop("config_cls", None)

    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError(
            "Detection evaluation method '%s' has no `config_cls`" % method
        )

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(pred_field, gt_field, **params)


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
        elif gt_label != pred_label:
            fp += 1
            fn += 1
        else:
            tp += 1

    return tp, fp, fn
