"""
Evaluation metric operators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .operator import Operator, OperatorConfig


class EvaluationMetricConfig(OperatorConfig):
    """Configuration class for evaluation metrics.

    Args:
        name: the name of the evaluation metric
        label (name): a label for the evaluation metric
        description (None): a description of the evaluation metric
        eval_types (None): an optional list of evaluation method types that
            this metric supports
        aggregate_key (None): an optional key under which to store the metric's
            aggregate value. This is used, for example, by
            :meth:`metrics() <fiftyone.utils.eval.base.BaseEvaluationResults.metrics>`.
            By default, the metric's ``name`` is used as its key
        lower_is_better (True): whether lower values of the metric are better
        **kwargs: other kwargs for :class:`fiftyone.operators.OperatorConfig`
    """

    def __init__(
        self,
        name,
        label=None,
        description=None,
        eval_types=None,
        aggregate_key=None,
        lower_is_better=True,
        **kwargs,
    ):
        super().__init__(name, label=label, description=description, **kwargs)
        self.eval_types = eval_types
        self.aggregate_key = aggregate_key
        self.lower_is_better = lower_is_better


class EvaluationMetric(Operator):
    """Base class for evaluation metric operators."""

    def resolve_input(self, ctx):
        """Defines any necessary properties to collect this evaluation metric's
        parameters from a user during prompting.

        Args:
            ctx: an :class:`fiftyone.operators.ExecutionContext`

        Returns:
            a :class:`fiftyone.operators.types.Property`, or None
        """
        return None

    def parse_parameters(self, ctx, params):
        """Performs any necessary execution-time formatting to this evaluation
        metric's parameters.

        Args:
            ctx: an :class:`fiftyone.operators.ExecutionContext`
            params: a params dict
        """
        pass

    def compute(self, samples, results, **kwargs):
        """Computes the evaluation metric for the given collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            results: an :class:`fiftyone.core.evaluation.EvaluationResults`
            **kwargs: arbitrary metric-specific parameters

        Returns:
            an optional aggregate metric value to store on the results
        """
        raise NotImplementedError("Subclass must implement compute()")

    def get_fields(self, samples, config, eval_key):
        """Lists the fields that were populated by the evaluation metric with
        the given key, if any.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            config: an :class:`fiftyone.core.evaluation.EvaluationMethodConfig`
            eval_key: an evaluation key

        Returns:
            a list of fields
        """
        return []

    def rename(self, samples, config, eval_key, new_eval_key):
        """Performs any necessary operations required to rename this evaluation
        metric's key.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            config: an :class:`fiftyone.core.evaluation.EvaluationMethodConfig`
            eval_key: an evaluation key
            new_eval_key: a new evaluation key
        """
        dataset = samples._dataset
        for metric_field in self.get_fields(samples, config, eval_key):
            metric_field, is_frame_field = samples._handle_frame_field(
                metric_field
            )
            new_metric_field = metric_field.replace(eval_key, new_eval_key, 1)
            if is_frame_field:
                dataset.rename_frame_field(metric_field, new_metric_field)
            else:
                dataset.rename_sample_field(metric_field, new_metric_field)

    def cleanup(self, samples, config, eval_key):
        """Cleans up the results of the evaluation metric with the given key
        from the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            config: an :class:`fiftyone.core.evaluation.EvaluationMethodConfig`
            eval_key: an evaluation key
        """
        dataset = samples._dataset
        for metric_field in self.get_fields(samples, config, eval_key):
            metric_field, is_frame_field = samples._handle_frame_field(
                metric_field
            )
            if is_frame_field:
                dataset.delete_frame_field(metric_field, error_level=1)
            else:
                dataset.delete_sample_field(metric_field, error_level=1)
