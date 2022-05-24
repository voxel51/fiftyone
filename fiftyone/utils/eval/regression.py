"""
Regression evaluation.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import itertools
import numbers

import numpy as np
import sklearn.metrics as skm
from tabulate import tabulate

import eta.core.utils as etau

import fiftyone.core.evaluation as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.plots as fop
import fiftyone.core.validation as fov


logger = logging.getLogger(__name__)


def evaluate_regressions(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    missing=None,
    method="simple",
    **kwargs,
):
    """Evaluates the regression predictions in the given collection with
    respect to the specified ground truth values.

    You can customize the evaluation method by passing additional
    parameters for the method's config class as ``kwargs``.

    The supported ``method`` values and their associated configs are:

    -   ``"simple"``: :class:`SimpleEvaluationConfig`

    If an ``eval_key`` is specified, then this method will record some
    statistics on each sample:

    -   When evaluating sample-level fields, an ``eval_key`` field will be
        populated on each sample recording the error of that sample's
        prediction.

    -   When evaluating frame-level fields, an ``eval_key`` field will be
        populated on each frame recording the error of that frame's
        prediction. In addition, an ``eval_key`` field will be populated on
        each sample that records the average error of the frame predictions
        of the sample.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Regression` instances
        gt_field ("ground_truth"): the name of the field containing the
            ground truth :class:`fiftyone.core.labels.Regression` instances
        eval_key (None): a string key to use to refer to this evaluation
        missing (None): a missing value. Any None-valued regressions are
            given this value for results purposes
        method ("simple"): a string specifying the evaluation method to use.
            Supported values are ``("simple")``
        **kwargs: optional keyword arguments for the constructor of the
            :class:`RegressionEvaluationConfig` being used

    Returns:
        a :class:`RegressionResults`
    """
    fov.validate_collection_label_fields(
        samples, (pred_field, gt_field), fol.Regression, same_type=True
    )

    config = _parse_config(pred_field, gt_field, method, **kwargs)
    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)

    results = eval_method.evaluate_samples(
        samples, eval_key=eval_key, missing=missing
    )
    eval_method.save_run_results(samples, eval_key, results)

    return results


class RegressionEvaluationConfig(foe.EvaluationMethodConfig):
    """Base class for configuring :class:`RegressionEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Regression` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Regression` instances
    """

    def __init__(self, pred_field, gt_field, **kwargs):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field


class RegressionEvaluation(foe.EvaluationMethod):
    """Base class for regression evaluation methods.

    Args:
        config: a :class:`RegressionEvaluationConfig`
    """

    def evaluate_samples(self, samples, eval_key=None, missing=None):
        """Evaluates the regression predictions in the given samples with
        respect to the specified ground truth values.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key (None): an evaluation key for this evaluation
            missing (None): a missing value. Any None-valued regressions are
                given this value for results purposes

        Returns:
            a :class:`RegressionResults` instance
        """
        pass

    def get_fields(self, samples, eval_key):
        fields = [eval_key]

        if samples._is_frame_field(self.config.gt_field):
            prefix = samples._FRAMES_PREFIX + eval_key
            fields.append(prefix)

        return fields

    def cleanup(self, samples, eval_key):
        fields = [eval_key]

        samples._dataset.delete_sample_fields(fields, error_level=1)
        if samples._is_frame_field(self.config.gt_field):
            samples._dataset.delete_frame_fields(fields, error_level=1)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class SimpleEvaluationConfig(RegressionEvaluationConfig):
    """Base class for configuring :class:`SimpleEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Regression` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.Regression` instances
        metric ("squared_error"): the error metric to use to populate
            sample/frame-level error data. Supported values are
            ``("squared_error", "absolute_error")`` or any function that
            accepts two scalar arguments ``(ypred, ytrue)``
    """

    def __init__(self, pred_field, gt_field, metric="squared_error", **kwargs):
        super().__init__(pred_field, gt_field, **kwargs)
        self._metric = metric

    @property
    def method(self):
        return "simple"

    @property
    def metric(self):
        return self._metric if etau.is_str(self._metric) else "custom"

    def attributes(self):
        return super().attributes() + ["metric"]


class SimpleEvaluation(RegressionEvaluation):
    """Simple regression evaluation.

    Args:
        config: a :class:`SimpleEvaluationConfig`
    """

    def evaluate_samples(self, samples, eval_key=None, missing=None):
        metric = self.config._metric

        if metric == "squared_error":
            error_fcn = lambda yp, yt: (yp - yt) ** 2
        elif metric == "absolute_error":
            error_fcn = lambda yp, yt: abs(yp - yt)
        elif callable(metric):
            error_fcn = metric
        else:
            raise ValueError(
                "Unsupported metric '%s'. The supported values are %s or a "
                "function that accepts two scalar arguments `(ypred, ytrue)`"
                % (metric, ("squared_error", "absolute_error"))
            )

        pred_field = self.config.pred_field
        gt_field = self.config.gt_field
        is_frame_field = samples._is_frame_field(gt_field)

        gt = gt_field + ".value"
        pred = pred_field + ".value"
        pred_conf = pred_field + ".confidence"
        _id = "id" if not is_frame_field else "frames.id"

        ytrue, ypred, confs, ids = samples.values([gt, pred, pred_conf, _id])

        if is_frame_field:
            _ytrue = list(itertools.chain.from_iterable(ytrue))
            _ypred = list(itertools.chain.from_iterable(ypred))
            _confs = list(itertools.chain.from_iterable(confs))
            _ids = list(itertools.chain.from_iterable(ids))
        else:
            _ytrue = ytrue
            _ypred = ypred
            _confs = confs
            _ids = ids

        results = RegressionResults(
            _ytrue,
            _ypred,
            confs=_confs,
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            ids=_ids,
            missing=missing,
            samples=samples,
        )

        if eval_key is None:
            return results

        def compute_error(yp, yt):
            if missing is not None:
                if yp is None:
                    yp = missing

                if yt is None:
                    yt = missing

            try:
                return error_fcn(yp, yt)
            except:
                return None

        # note: fields are manually declared so they'll exist even when
        # `samples` is empty
        dataset = samples._dataset
        if is_frame_field:
            frame_errors = [
                list(map(compute_error, yp, yt))
                for yp, yt in zip(ypred, ytrue)
            ]
            sample_errors = [_safe_mean(e) for e in frame_errors]

            eval_frame = samples._FRAMES_PREFIX + eval_key

            # Sample-level errors
            dataset.add_sample_field(eval_key, fof.FloatField)
            samples.set_values(eval_key, sample_errors)

            # Per-frame errors
            dataset.add_frame_field(eval_key, fof.FloatField)
            samples.set_values(eval_frame, frame_errors)
        else:
            errors = list(map(compute_error, ypred, ytrue))

            # Per-sample errors
            dataset.add_sample_field(eval_key, fof.FloatField)
            samples.set_values(eval_key, errors)

        return results


class RegressionResults(foe.EvaluationResults):
    """Class that stores the results of a regression evaluation.

    Args:
        ytrue: a list of ground truth values
        ypred: a list of predicted values
        confs (None): an optional list of confidences for the predictions
        eval_key (None): the evaluation key of the evaluation
        gt_field (None): the name of the ground truth field
        pred_field (None): the name of the predictions field
        ids (None): a list of sample or frame IDs corresponding to the
            regressions
        missing (None): a missing value. Any None-valued regressions are
            given this value for results purposes
        samples (None): the :class:`fiftyone.core.collections.SampleCollection`
            for which the results were computed
    """

    def __init__(
        self,
        ytrue,
        ypred,
        confs=None,
        eval_key=None,
        gt_field=None,
        pred_field=None,
        ids=None,
        missing=None,
        samples=None,
    ):
        ytrue, ypred, confs, ids = _parse_values(
            ytrue, ypred, confs, ids, missing=missing
        )

        self.ytrue = ytrue
        self.ypred = ypred
        self.confs = confs
        self.eval_key = eval_key
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.ids = ids
        self.missing = missing

        self._samples = samples

    def metrics(self, weights=None):
        """Computes various popular regression metrics for the results.

        The computed metrics are:

        -   Mean squared error: :func:`sklearn:sklearn.metrics.mean_squared_error`
        -   Root mean squared error: :func:`sklearn:sklearn.metrics.mean_squared_error`
        -   Mean absolute error: :func:`sklearn:sklearn.metrics.mean_absolute_error`
        -   Median absolute error: :func:`sklearn:sklearn.metrics.median_absolute_error`
        -   R^2 score: :func:`sklearn:sklearn.metrics.r2_score`
        -   Explained variance score: :func:`sklearn:sklearn.metrics.explained_variance_score`
        -   Max error: :func:`sklearn:sklearn.metrics.max_error`
        -   Support: the number of examples

        Args:
            weights (None): an optional list of weights for each example

        Returns:
            a dict
        """
        yt = self.ytrue
        yp = self.ypred
        w = weights

        if yt.size > 0:
            mse = skm.mean_squared_error(yt, yp, sample_weight=w)
            rmse = np.sqrt(mse)
            mae = skm.mean_absolute_error(yt, yp, sample_weight=w)
            median_absolute_error = skm.median_absolute_error(yt, yp)
            r2_score = skm.r2_score(yt, yp, sample_weight=w)
            ev_score = skm.explained_variance_score(yt, yp, sample_weight=w)
            max_error = skm.max_error(yt, yp)
            support = len(yt)
        else:
            mse = 0.0
            rmse = 0.0
            mae = 0.0
            median_absolute_error = 0.0
            r2_score = 0.0
            ev_score = 0.0
            max_error = 0.0
            support = 0

        return {
            "mean_squared_error": mse,
            "root_mean_squared_error": rmse,
            "mean_absolute_error": mae,
            "median_absolute_error": median_absolute_error,
            "r2_score": r2_score,
            "explained_variance_score": ev_score,
            "max_error": max_error,
            "support": support,
        }

    def print_metrics(self, weights=None, digits=2):
        """Prints the regression metrics computed via :meth:`metrics`.

        Args:
            weights (None): an optional list of weights for each example
            digits (2): the number of digits of precision to print
        """
        metrics = self.metrics(weights=weights)
        _print_dict_as_table(metrics, digits)

    def plot_results(
        self, labels=None, sizes=None, backend="plotly", **kwargs
    ):
        """Plots the regression results.

        You can use the ``labels`` parameters to define a coloring for the
        points, and you can use the ``sizes`` parameter to scale the sizes of
        the points.

        You can attach plots generated by this method to an App session via its
        :attr:`fiftyone.core.session.Session.plots` attribute, which will
        automatically sync the session's view with the currently selected
        points in the plot.

        Args:
            labels (None): data to use to color the points. Can be any of the
                following:

                -   the name of a sample field or ``embedded.field.name`` of
                    from which to extract numeric or string values
                -   a :class:`fiftyone.core.expressions.ViewExpression`
                    defining numeric or string values to extract via
                    :meth:`fiftyone.core.collections.SampleCollection.values`
                -   a list or array-like of numeric or string values (or lists
                    of lists for frame-level regressions)
            sizes (None): data to use to scale the sizes of the points. Can be
                any of the following:

                -   the name of a sample field or ``embedded.field.name`` from
                    which to extract numeric values
                -   a :class:`fiftyone.core.expressions.ViewExpression`
                    defining numeric values to extract via
                    :meth:`fiftyone.core.collections.SampleCollection.values`
                -   a list or array-like of numeric values (or lists of lists
                    for frame-level regressions)
            backend ("plotly"): the plotting backend to use. Supported values
                are ``("plotly", "matplotlib")``
            **kwargs: keyword arguments for the backend plotting method:

                -   "plotly" backend: :meth:`fiftyone.core.plots.plotly.plot_regressions`
                -   "matplotlib" backend: :meth:`fiftyone.core.plots.matplotlib.plot_regressions`

        Returns:
            an :class:`fiftyone.core.plots.base.InteractivePlot`
        """
        return fop.plot_regressions(
            self.ytrue,
            self.ypred,
            samples=self._samples,
            ids=self.ids,
            labels=labels,
            sizes=sizes,
            gt_field=self.gt_field,
            pred_field=self.pred_field,
            backend=backend,
            **kwargs,
        )

    @classmethod
    def _from_dict(cls, d, samples, config, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d.get("confs", None)
        eval_key = d.get("eval_key", None)
        gt_field = d.get("gt_field", None)
        pred_field = d.get("pred_field", None)
        ids = d.get("ids", None)
        missing = d.get("missing", None)
        return cls(
            ytrue,
            ypred,
            confs=confs,
            eval_key=eval_key,
            gt_field=gt_field,
            pred_field=pred_field,
            ids=ids,
            missing=missing,
            samples=samples,
            **kwargs,
        )


def _parse_config(pred_field, gt_field, method, **kwargs):
    if method is None:
        method = "simple"

    if method == "simple":
        return SimpleEvaluationConfig(pred_field, gt_field, **kwargs)

    raise ValueError("Unsupported evaluation method '%s'" % method)


def _safe_mean(values):
    values = [v for v in values if v is not None]
    return np.mean(values) if values else None


def _parse_values(ytrue, ypred, *args, missing=None):
    _ytrue = []
    _ypred = []
    _valid = []
    missing_count = 0

    for yt, yp in zip(ytrue, ypred):
        v = yt is not None and yp is not None

        if missing is None:
            _valid.append(v)

        if v:
            _ytrue.append(yt)
            _ypred.append(yp)
        else:
            missing_count += 1
            if missing is not None:
                if yt is None:
                    yt = missing

                if yp is None:
                    yp = missing

                _ytrue.append(yt)
                _ypred.append(yp)

    found_missing = missing_count > 0

    _ytrue = np.array(_ytrue)
    _ypred = np.array(_ypred)

    if found_missing and missing is None:
        logger.warning(
            "Ignoring %d examples with either missing ground truth or "
            "predictions",
            missing_count,
        )

        valid = np.array(_valid)
        args = [np.asarray(a)[valid] if a is not None else a for a in args]
    else:
        args = [np.asarray(a) if a is not None else a for a in args]

    return (_ytrue, _ypred, *args)


def _print_dict_as_table(d, digits):
    fmt = "%%.%df" % digits
    records = []
    for k, v in d.items():
        k = k.replace("_", " ")
        if isinstance(v, numbers.Integral):
            v = str(v)
        else:
            v = fmt % v

        records.append((k, v))

    print(tabulate(records, tablefmt="plain", numalign="left"))
