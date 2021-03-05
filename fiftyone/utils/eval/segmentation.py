"""
Segmentation evaluation.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import warnings

import numpy as np
import sklearn.metrics as skm

import eta.core.image as etai

import fiftyone.core.evaluation as foe
import fiftyone.core.utils as fou

from .classification import ClassificationResults


logger = logging.getLogger(__name__)


def evaluate_segmentations(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    mask_targets=None,
    method="simple",
    config=None,
    **kwargs,
):
    """Evaluates the specified semantic segmentation masks in the given
    collection with respect to the specified ground truth masks.

    If the size of a predicted mask does not match the ground truth mask, it
    is resized to match the ground truth.

    If an ``eval_key`` is provided, the accuracy, precision, and recall of each
    sample is recorded in top-level fields of each sample::

         Accuracy: sample.<eval_key>_accuracy
        Precision: sample.<eval_key>_precision
           Recall: sample.<eval_key>_recall

    In addition, when evaluating frame-level masks, the accuracy, precision,
    and recall of each frame if recorded in the following frame-level fields::

         Accuracy: frame.<eval_key>_accuracy
        Precision: frame.<eval_key>_precision
           Recall: frame.<eval_key>_recall

    .. note::

        The mask value ``0`` is treated as a background class for the purposes
        of computing evaluation metrics like precision and recall.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Segmentation` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Segmentation` instances
        eval_key (None): an evaluation key to use to refer to this evaluation
        mask_targets (None): a dict mapping mask values to labels. May contain
            a subset of the possible classes if you wish to evaluate a subset
            of the semantic classes. If not provided, mask targets are loaded
            from :meth:`fiftyone.core.dataset.Dataset.mask_targets` or
            :meth:`fiftyone.core.dataset.Dataset.default_mask_targets` if
            possible, or else the observed pixel values are used
        method ("simple"): a string specifying the evaluation method to use.
            Supported values are ``("simple")``
        config (None): a :class:`SegmentationEvaluationConfig` specifying the
            evaluation method to use. If a ``config`` is provided, the
            ``method`` and ``kwargs`` parameters are ignored
        **kwargs: optional keyword arguments for the constructor of the
            :class:`SegmentationEvaluationConfig` being used

    Returns:
        a :class:`SegmentationResults`
    """
    if mask_targets is None:
        if pred_field in samples.mask_targets:
            mask_targets = samples.mask_targets[pred_field]
        elif gt_field in samples.mask_targets:
            mask_targets = samples.mask_targets[gt_field]
        elif samples.default_mask_targets:
            mask_targets = samples.default_mask_targets

    config = _parse_config(config, pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.register_run(samples, eval_key)
    return eval_method.evaluate_samples(
        samples, eval_key=eval_key, mask_targets=mask_targets
    )


class SegmentationEvaluationConfig(foe.EvaluationMethodConfig):
    """Base class for configuring :class:`SegmentationEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Segmentation` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Segmentation` instances
    """

    def __init__(self, pred_field, gt_field, **kwargs):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field


class SegmentationEvaluation(foe.EvaluationMethod):
    """Base class for segmentation evaluation methods.

    Args:
        config: a :class:`SegmentationEvaluationConfig`
    """

    def evaluate_samples(self, samples, eval_key=None, mask_targets=None):
        """Evaluates the predicted segmentation masks in the given samples with
        respect to the specified ground truth masks.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key (None): an evaluation key for this evaluation
            mask_targets (None): a dict mapping mask values to labels. May
                contain a subset of the possible classes if you wish to
                evaluate a subset of the semantic classes. By default, the
                observed pixel values are used as labels

        Returns:
            a :class:`SegmentationResults` instance
        """
        pass

    def get_fields(self, samples, eval_key):
        fields = [
            "%s_tp" % eval_key,
            "%s_fp" % eval_key,
            "%s_fn" % eval_key,
        ]

        if samples._is_frame_field(self.config.gt_field):
            prefix = samples._FRAMES_PREFIX + eval_key
            fields.extend(
                ["%s_tp" % prefix, "%s_fp" % prefix, "%s_fn" % prefix]
            )

        return fields

    def cleanup(self, samples, eval_key):
        fields = [
            "%s_accuracy" % eval_key,
            "%s_precision" % eval_key,
            "%s_recall" % eval_key,
        ]

        samples._dataset.delete_sample_fields(fields, error_level=1)
        if samples._is_frame_field(self.config.gt_field):
            samples._dataset.delete_frame_fields(fields, error_level=1)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class SimpleEvaluationConfig(SegmentationEvaluationConfig):
    """Base class for configuring :class:`SimpleEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Segmentation` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Segmentation` instances
        bandwidth (None): an optional bandwidth along the contours of the
            ground truth masks to which to restrict attention when computing
            accuracies. A typical value for this parameter is 5 pixels. By
            default, the entire masks are evaluated
        average ("micro"): the averaging strategy to use when populating
            precision and recall numbers on each sample
    """

    @property
    def method(self):
        return "simple"

    def __init__(
        self, pred_field, gt_field, bandwidth=None, average="micro", **kwargs
    ):
        super().__init__(pred_field, gt_field, **kwargs)
        self.bandwidth = bandwidth
        self.average = average


class SimpleEvaluation(SegmentationEvaluation):
    """Base class for segmentation evaluation methods.

    Args:
        config: a :class:`SegmentationEvaluationConfig`
    """

    def evaluate_samples(self, samples, eval_key=None, mask_targets=None):
        pred_field = self.config.pred_field
        gt_field = self.config.gt_field

        if mask_targets is not None:
            values, classes = zip(*sorted(mask_targets.items()))
        else:
            logger.info("Computing possible mask values...")
            values = _get_mask_values(samples, pred_field, gt_field)
            classes = [str(v) for v in values]

        pred_field, processing_frames = samples._handle_frame_field(pred_field)
        gt_field, _ = samples._handle_frame_field(gt_field)

        if not processing_frames:
            iter_samples = samples.select_fields([gt_field, pred_field])
        else:
            iter_samples = samples

        nc = len(values)
        confusion_matrix = np.zeros((nc, nc), dtype=int)

        bandwidth = self.config.bandwidth
        average = self.config.average

        if eval_key is not None:
            acc_field = "%s_accuracy" % eval_key
            pre_field = "%s_precision" % eval_key
            rec_field = "%s_recall" % eval_key

        logger.info("Evaluating segmentations...")
        with fou.ProgressBar() as pb:
            for sample in pb(iter_samples):
                if processing_frames:
                    images = sample.frames.values()
                else:
                    images = [sample]

                sample_conf_mat = np.zeros((nc, nc), dtype=int)
                for image in images:
                    pred_mask = image[pred_field].mask
                    gt_mask = image[gt_field].mask

                    if gt_mask is None:
                        msg = "Skipping sample with missing ground truth mask"
                        warnings.warn(msg)
                        continue

                    if pred_mask is None:
                        msg = "Skipping sample with missing prediction mask"
                        warnings.warn(msg)
                        continue

                    image_conf_mat = _compute_pixel_confusion_matrix(
                        pred_mask, gt_mask, values, bandwidth=bandwidth
                    )
                    sample_conf_mat += image_conf_mat

                    # Record frame stats, if requested
                    if processing_frames and eval_key is not None:
                        facc, fpre, frec = _compute_accuracy_precision_recall(
                            image_conf_mat, values, average
                        )
                        image[acc_field] = facc
                        image[pre_field] = fpre
                        image[rec_field] = frec

                confusion_matrix += sample_conf_mat

                # Record sample stats, if requested
                if eval_key is not None:
                    sacc, spre, srec = _compute_accuracy_precision_recall(
                        sample_conf_mat, values, average
                    )
                    sample[acc_field] = sacc
                    sample[pre_field] = spre
                    sample[rec_field] = srec
                    sample.save()

        missing = classes[0] if values[0] == 0 else None
        return SegmentationResults(confusion_matrix, classes, missing=missing)


class SegmentationResults(ClassificationResults):
    """Class that stores the results of a segmentation evaluation.

    Args:
        confusion_matrix: a pixel value confusion matrix
        classes: a list of class labels corresponding to the confusion matrix
        missing (None): a missing (background) class
    """

    def __init__(self, confusion_matrix, classes, missing=None):
        ytrue = []
        ypred = []
        weights = []
        nrows, ncols = confusion_matrix.shape
        for i in range(nrows):
            for j in range(ncols):
                cij = confusion_matrix[i, j]
                if cij > 0:
                    ytrue.append(classes[i])
                    ypred.append(classes[j])
                    weights.append(cij)

        super().__init__(
            ytrue,
            ypred,
            None,
            weights=weights,
            classes=classes,
            missing=missing,
        )


def _parse_config(config, pred_field, gt_field, method, **kwargs):
    if config is not None:
        return config

    if method is None:
        method = "simple"

    if method == "simple":
        return SimpleEvaluationConfig(pred_field, gt_field, **kwargs)

    raise ValueError("Unsupported evaluation method '%s'" % method)


def _compute_pixel_confusion_matrix(
    pred_mask, gt_mask, values, bandwidth=None
):
    if pred_mask.shape != gt_mask.shape:
        msg = (
            "Resizing predicted mask with shape %s to match ground truth mask "
            "with shape %s"
        ) % (pred_mask.shape, gt_mask.shape)
        warnings.warn(msg)

        pred_mask = etai.render_frame_mask(pred_mask, img=gt_mask)

    if bandwidth is not None:
        pred_mask, gt_mask = _extract_contour_band_values(
            pred_mask, gt_mask, bandwidth
        )

    try:
        return skm.confusion_matrix(
            gt_mask.ravel(), pred_mask.ravel(), labels=values
        )
    except ValueError:
        # Assume that no `values` appear in `gt_mask`, which causes
        # `skm.confusion_matrix` to raise an error
        num_classes = len(values)
        return np.zeros((num_classes, num_classes), dtype=int)


def _extract_contour_band_values(pred_mask, gt_mask, bandwidth):
    band_mask = etai.get_contour_band_mask(gt_mask, bandwidth)
    return pred_mask[band_mask], gt_mask[band_mask]


def _compute_accuracy_precision_recall(confusion_matrix, values, average):
    missing = 0 if values[0] == 0 else None
    results = SegmentationResults(confusion_matrix, values, missing=missing)
    metrics = results.metrics(average=average)
    return metrics["accuracy"], metrics["precision"], metrics["recall"]


def _get_mask_values(samples, pred_field, gt_field):
    pred_field, processing_frames = samples._handle_frame_field(pred_field)
    gt_field, _ = samples._handle_frame_field(gt_field)

    if not processing_frames:
        iter_samples = samples.select_fields([gt_field, pred_field])
    else:
        iter_samples = samples

    values = set()

    with fou.ProgressBar() as pb:
        for sample in pb(iter_samples):
            if processing_frames:
                images = sample.frames.values()
            else:
                images = [sample]

            for image in images:
                pred_mask = image[pred_field].mask
                if pred_mask is not None:
                    values.update(pred_mask.ravel())

                gt_mask = image[gt_field].mask
                if gt_mask is not None:
                    values.update(gt_mask.ravel())

    return sorted(values)
