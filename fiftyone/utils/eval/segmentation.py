"""
Segmentation evaluation.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import warnings

import numpy as np
import sklearn.metrics as skm

import eta.core.image as etai

import fiftyone.core.evaluation as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

from .base import BaseEvaluationResults


logger = logging.getLogger(__name__)


def evaluate_segmentations(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    mask_targets=None,
    method="simple",
    **kwargs,
):
    """Evaluates the specified semantic segmentation masks in the given
    collection with respect to the specified ground truth masks.

    If the size of a predicted mask does not match the ground truth mask, it
    is resized to match the ground truth.

    By default, this method simply performs pixelwise evaluation of the full
    masks, but other strategies such as boundary-only evaluation can be
    configured by passing additional parameters for the method's config class
    as ``kwargs``.

    The supported ``method`` values and their associated configs are:

    -   ``"simple"``: :class:`SimpleEvaluationConfig`

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

        The mask values ``0`` and ``#000000`` are treated as a background class
        for the purposes of computing evaluation metrics like precision and
        recall.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Segmentation` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Segmentation` instances
        eval_key (None): an evaluation key to use to refer to this evaluation
        mask_targets (None): a dict mapping pixel values or RGB hex strings to
            labels. If not provided, the observed values are used as labels
        method ("simple"): a string specifying the evaluation method to use.
            Supported values are ``("simple")``
        **kwargs: optional keyword arguments for the constructor of the
            :class:`SegmentationEvaluationConfig` being used

    Returns:
        a :class:`SegmentationResults`
    """
    fov.validate_collection_label_fields(
        samples, (pred_field, gt_field), fol.Segmentation, same_type=True
    )

    config = _parse_config(pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key)

    results = eval_method.evaluate_samples(
        samples, eval_key=eval_key, mask_targets=mask_targets
    )
    eval_method.save_run_results(samples, eval_key, results)

    return results


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

    def register_samples(self, samples, eval_key):
        """Registers the collection on which evaluation will be performed.

        This method will be called before calling :meth:`evaluate_samples`.
        Subclasses can extend this method to perform any setup required for an
        evaluation run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: the evaluation key for this evaluation
        """
        if eval_key is None:
            return

        dataset = samples._dataset
        processing_frames = samples._is_frame_field(self.config.gt_field)

        acc_field = "%s_accuracy" % eval_key
        pre_field = "%s_precision" % eval_key
        rec_field = "%s_recall" % eval_key

        dataset.add_sample_field(acc_field, fof.FloatField)
        dataset.add_sample_field(pre_field, fof.FloatField)
        dataset.add_sample_field(rec_field, fof.FloatField)

        if processing_frames:
            dataset.add_frame_field(acc_field, fof.FloatField)
            dataset.add_frame_field(pre_field, fof.FloatField)
            dataset.add_frame_field(rec_field, fof.FloatField)

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
        processing_frames = samples._is_frame_field(self.config.gt_field)

        fields = [
            "%s_accuracy" % eval_key,
            "%s_precision" % eval_key,
            "%s_recall" % eval_key,
        ]

        if processing_frames:
            prefix = samples._FRAMES_PREFIX + eval_key
            fields.extend(
                [
                    "%s_accuracy" % prefix,
                    "%s_precision" % prefix,
                    "%s_recall" % prefix,
                ]
            )

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

    def cleanup(self, samples, eval_key):
        dataset = samples._dataset
        processing_frames = samples._is_frame_field(self.config.gt_field)

        fields = [
            "%s_accuracy" % eval_key,
            "%s_precision" % eval_key,
            "%s_recall" % eval_key,
        ]

        dataset.delete_sample_fields(fields, error_level=1)

        if processing_frames:
            dataset.delete_frame_fields(fields, error_level=1)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class SimpleEvaluationConfig(SegmentationEvaluationConfig):
    """Class for configuring :class:`SimpleEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Segmentation` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Segmentation` instances
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
    """Stardard pixelwise segmentation evaluation.

    This class can optionally be configured to evaluate along only the
    boundaries of the ground truth segmentation masks.

    Args:
        config: a :class:`SimpleEvaluationConfig`
    """

    def evaluate_samples(self, samples, eval_key=None, mask_targets=None):
        pred_field = self.config.pred_field
        gt_field = self.config.gt_field

        if mask_targets is not None:
            if fof.is_rgb_mask_targets(mask_targets):
                mask_targets = {
                    _hex_to_int(k): v for k, v in mask_targets.items()
                }

            values, classes = zip(*sorted(mask_targets.items()))
        else:
            logger.info("Computing possible mask values...")
            values, classes = _get_mask_values(samples, pred_field, gt_field)

        _samples = samples.select_fields([gt_field, pred_field])
        pred_field, processing_frames = samples._handle_frame_field(pred_field)
        gt_field, _ = samples._handle_frame_field(gt_field)

        nc = len(values)
        confusion_matrix = np.zeros((nc, nc), dtype=int)

        bandwidth = self.config.bandwidth
        average = self.config.average

        if eval_key is not None:
            acc_field = "%s_accuracy" % eval_key
            pre_field = "%s_precision" % eval_key
            rec_field = "%s_recall" % eval_key

        logger.info("Evaluating segmentations...")
        for sample in _samples.iter_samples(progress=True):
            if processing_frames:
                images = sample.frames.values()
            else:
                images = [sample]

            sample_conf_mat = np.zeros((nc, nc), dtype=int)
            for image in images:
                gt_seg = image[gt_field]
                if gt_seg is None or not gt_seg.has_mask:
                    msg = "Skipping sample with missing ground truth mask"
                    warnings.warn(msg)
                    continue

                pred_seg = image[pred_field]
                if pred_seg is None or not pred_seg.has_mask:
                    msg = "Skipping sample with missing prediction mask"
                    warnings.warn(msg)
                    continue

                image_conf_mat = _compute_pixel_confusion_matrix(
                    pred_seg.get_mask(),
                    gt_seg.get_mask(),
                    values,
                    bandwidth=bandwidth,
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

        if nc > 0:
            missing = classes[0] if values[0] in (0, "#000000") else None
        else:
            missing = None

        return SegmentationResults(
            samples,
            self.config,
            eval_key,
            confusion_matrix,
            classes,
            missing=missing,
            backend=self,
        )


class SegmentationResults(BaseEvaluationResults):
    """Class that stores the results of a segmentation evaluation.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`SegmentationEvaluationConfig` used
        eval_key: the evaluation key
        pixel_confusion_matrix: a pixel value confusion matrix
        classes: a list of class labels corresponding to the confusion matrix
        missing (None): a missing (background) class
        backend (None): a :class:`SegmentationEvaluation` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        pixel_confusion_matrix,
        classes,
        missing=None,
        backend=None,
    ):
        pixel_confusion_matrix = np.asarray(pixel_confusion_matrix)
        ytrue, ypred, weights = self._parse_confusion_matrix(
            pixel_confusion_matrix, classes
        )

        super().__init__(
            samples,
            config,
            eval_key,
            ytrue,
            ypred,
            weights=weights,
            classes=classes,
            missing=missing,
            backend=backend,
        )

        self.pixel_confusion_matrix = pixel_confusion_matrix

    def attributes(self):
        return ["cls", "pixel_confusion_matrix", "classes", "missing"]

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        return cls(
            samples,
            config,
            eval_key,
            d["pixel_confusion_matrix"],
            d["classes"],
            missing=d.get("missing", None),
            **kwargs,
        )

    @staticmethod
    def _parse_confusion_matrix(confusion_matrix, classes):
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

        return ytrue, ypred, weights


def _parse_config(pred_field, gt_field, method, **kwargs):
    if method is None:
        method = "simple"

    if method == "simple":
        return SimpleEvaluationConfig(pred_field, gt_field, **kwargs)

    raise ValueError("Unsupported evaluation method '%s'" % method)


def _compute_pixel_confusion_matrix(
    pred_mask, gt_mask, values, bandwidth=None
):
    if pred_mask.ndim == 3:
        pred_mask = _rgb_array_to_int(pred_mask)

    if gt_mask.ndim == 3:
        gt_mask = _rgb_array_to_int(gt_mask)

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
    results = SegmentationResults(
        None, None, None, confusion_matrix, values, missing=missing
    )
    metrics = results.metrics(average=average)
    if metrics["support"] == 0:
        return None, None, None

    return metrics["accuracy"], metrics["precision"], metrics["recall"]


def _get_mask_values(samples, pred_field, gt_field):
    _samples = samples.select_fields([gt_field, pred_field])
    pred_field, processing_frames = samples._handle_frame_field(pred_field)
    gt_field, _ = samples._handle_frame_field(gt_field)

    values = set()
    is_rgb = False

    for sample in _samples.iter_samples(progress=True):
        if processing_frames:
            images = sample.frames.values()
        else:
            images = [sample]

        for image in images:
            for field in (pred_field, gt_field):
                seg = image[field]
                if seg is not None and seg.has_mask:
                    mask = seg.get_mask()
                    if mask.ndim == 3:
                        is_rgb = True
                        mask = _rgb_array_to_int(mask)

                    values.update(mask.ravel())

    values = sorted(values)

    if is_rgb:
        classes = [_int_to_hex(v) for v in values]
    else:
        classes = [str(v) for v in values]

    return values, classes


def _rgb_array_to_int(mask):
    return (
        np.left_shift(mask[:, :, 0], 16, dtype=int)
        + np.left_shift(mask[:, :, 1], 8, dtype=int)
        + mask[:, :, 2]
    )


def _hex_to_int(hex_str):
    r = int(hex_str[1:3], 16)
    g = int(hex_str[3:5], 16)
    b = int(hex_str[5:7], 16)
    return (r << 16) + (g << 8) + b


def _int_to_hex(value):
    r = (value >> 16) & 255
    g = (value >> 8) & 255
    b = value & 255
    return "#%02x%02x%02x" % (r, g, b)
