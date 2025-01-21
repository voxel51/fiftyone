"""
Regression evaluation.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
import inspect
import itertools
import logging

import numpy as np
import sklearn.metrics as skm

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.plots as fop
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

from .base import (
    BaseEvaluationMethodConfig,
    BaseEvaluationMethod,
    BaseEvaluationResults,
)


logger = logging.getLogger(__name__)


def evaluate_regressions(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    missing=None,
    method=None,
    custom_metrics=None,
    progress=None,
    **kwargs,
):
    """Evaluates the regression predictions in the given collection with
    respect to the specified ground truth values.

    You can customize the evaluation method by passing additional
    parameters for the method's config class as ``kwargs``.

    The natively provided ``method`` values and their associated configs are:

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
        method (None): a string specifying the evaluation method to use. The
            supported values are
            ``fo.evaluation_config.regression_backends.keys()`` and the default
            is ``fo.evaluation_config.default_regression_backend``
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        **kwargs: optional keyword arguments for the constructor of the
            :class:`RegressionEvaluationConfig` being used

    Returns:
        a :class:`RegressionResults`
    """
    fov.validate_non_grouped_collection(samples)
    fov.validate_collection_label_fields(
        samples, (pred_field, gt_field), fol.Regression, same_type=True
    )

    config = _parse_config(
        pred_field,
        gt_field,
        method,
        custom_metrics=custom_metrics,
        **kwargs,
    )
    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key)

    results = eval_method.evaluate_samples(
        samples, eval_key=eval_key, missing=missing, progress=progress
    )
    eval_method.compute_custom_metrics(samples, eval_key, results)
    eval_method.save_run_results(samples, eval_key, results)

    return results


class RegressionEvaluationConfig(BaseEvaluationMethodConfig):
    """Base class for configuring :class:`RegressionEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.Regression` instances
        gt_field ("ground_truth"): the name of the field containing the ground
            truth :class:`fiftyone.core.labels.Regression` instances
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(self, pred_field, gt_field, custom_metrics=None, **kwargs):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field
        self.custom_metrics = custom_metrics

    @property
    def type(self):
        return "regression"


class RegressionEvaluation(BaseEvaluationMethod):
    """Base class for regression evaluation methods.

    Args:
        config: a :class:`RegressionEvaluationConfig`
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
        is_frame_field = samples._is_frame_field(self.config.gt_field)

        if is_frame_field:
            dataset.add_sample_field(eval_key, fof.FloatField)
            dataset.add_frame_field(eval_key, fof.FloatField)
        else:
            dataset.add_sample_field(eval_key, fof.FloatField)

    def evaluate_samples(
        self, samples, eval_key=None, missing=None, progress=None
    ):
        """Evaluates the regression predictions in the given samples with
        respect to the specified ground truth values.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key (None): an evaluation key for this evaluation
            missing (None): a missing value. Any None-valued regressions are
                given this value for results purposes
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`RegressionResults` instance
        """
        pass

    def get_fields(self, samples, eval_key):
        fields = [eval_key]

        if samples._is_frame_field(self.config.gt_field):
            prefix = samples._FRAMES_PREFIX + eval_key
            fields.append(prefix)

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

        fields = [eval_key]

        dataset.delete_sample_fields(fields, error_level=1)
        if dataset._is_frame_field(self.config.gt_field):
            dataset.delete_frame_fields(fields, error_level=1)

        self.cleanup_custom_metrics(samples, eval_key)

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
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        metric="squared_error",
        custom_metrics=None,
        **kwargs,
    ):
        super().__init__(
            pred_field, gt_field, custom_metrics=custom_metrics, **kwargs
        )
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

    def evaluate_samples(
        self, samples, eval_key=None, missing=None, progress=None
    ):
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
            samples,
            self.config,
            eval_key,
            _ytrue,
            _ypred,
            confs=_confs,
            ids=_ids,
            missing=missing,
            backend=self,
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

        if is_frame_field:
            frame_errors = [
                list(map(compute_error, yp, yt))
                for yp, yt in zip(ypred, ytrue)
            ]
            sample_errors = [_safe_mean(e) for e in frame_errors]

            eval_frame = samples._FRAMES_PREFIX + eval_key

            # Sample-level errors
            samples.set_values(eval_key, sample_errors)

            # Per-frame errors
            samples.set_values(eval_frame, frame_errors)
        else:
            errors = list(map(compute_error, ypred, ytrue))

            # Per-sample errors
            samples.set_values(eval_key, errors)

        return results


class RegressionResults(BaseEvaluationResults):
    """Class that stores the results of a regression evaluation.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`RegressionEvaluationConfig` used
        eval_key: the evaluation key
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
        custom_metrics (None): an optional dict of custom metrics
        backend (None): a :class:`RegressionEvaluation` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        ytrue,
        ypred,
        confs=None,
        ids=None,
        missing=None,
        custom_metrics=None,
        backend=None,
    ):
        super().__init__(
            samples,
            config,
            eval_key,
            custom_metrics=custom_metrics,
            backend=backend,
        )

        ytrue, ypred, confs, ids = _parse_values(
            ytrue, ypred, confs, ids, missing=missing
        )

        self.ytrue = ytrue
        self.ypred = ypred
        self.confs = confs
        self.ids = ids
        self.missing = missing

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

        Also includes any custom metrics from :attr:`custom_metrics`.

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

        metrics = {
            "mean_squared_error": mse,
            "root_mean_squared_error": rmse,
            "mean_absolute_error": mae,
            "median_absolute_error": median_absolute_error,
            "r2_score": r2_score,
            "explained_variance_score": ev_score,
            "max_error": max_error,
            "support": support,
        }

        metrics.update(self._get_custom_metrics())

        return metrics

    def print_metrics(self, weights=None, digits=2):
        """Prints the metrics computed via :meth:`metrics`.

        Args:
            weights (None): an optional list of weights for each example
            digits (2): the number of digits of precision to print
        """
        metrics = self.metrics(weights=weights)
        self._print_metrics(metrics, digits=digits)

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
            samples=self.samples,
            ids=self.ids,
            labels=labels,
            sizes=sizes,
            gt_field=self.config.gt_field,
            pred_field=self.config.pred_field,
            backend=backend,
            **kwargs,
        )

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        ytrue = d["ytrue"]
        ypred = d["ypred"]
        confs = d.get("confs", None)
        ids = d.get("ids", None)
        missing = d.get("missing", None)
        custom_metrics = d.get("custom_metrics", None)
        return cls(
            samples,
            config,
            eval_key,
            ytrue,
            ypred,
            confs=confs,
            ids=ids,
            missing=missing,
            custom_metrics=custom_metrics,
            **kwargs,
        )


def _parse_config(pred_field, gt_field, method, **kwargs):
    if method is None:
        method = fo.evaluation_config.default_regression_backend

    custom_metrics = kwargs.get("custom_metrics", None)
    if etau.is_str(custom_metrics):
        kwargs["custom_metrics"] = [custom_metrics]

    if inspect.isclass(method):
        return method(pred_field, gt_field, **kwargs)

    backends = fo.evaluation_config.regression_backends

    if method not in backends:
        raise ValueError(
            "Unsupported regression evaluation method '%s'. The available "
            "methods are %s" % (method, sorted(backends.keys()))
        )

    params = deepcopy(backends[method])

    config_cls = kwargs.pop("config_cls", None)

    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError(
            "Regression evaluation method '%s' has no `config_cls`" % method
        )

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(pred_field, gt_field, **params)


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
