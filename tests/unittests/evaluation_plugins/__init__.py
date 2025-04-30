"""
Evaluation tests operators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
import fiftyone.operators as foo
from fiftyone.operators import types


class CustomEvaluationMetric(foo.EvaluationMetric):
    @property
    def config(self):
        return foo.EvaluationMetricConfig(
            name="custom_evaluation_metric",
            label="Custom evaluation metric",
            aggregate_key="example",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str(
            "value",
            label="Example value",
            description="The example value to store/return",
            default="foo",
            required=True,
        )
        return types.Property(inputs)

    def compute(self, samples, results, value="foo"):
        dataset = samples._dataset
        eval_key = results.key
        metric_field = f"{eval_key}_{self.config.name}"
        dataset.add_sample_field(metric_field, fo.StringField)
        samples.set_field(metric_field, value).save()

        return value

    def get_fields(self, samples, config, eval_key):
        return [f"{eval_key}_{self.config.name}"]


def register(p):
    p.register(CustomEvaluationMetric)
