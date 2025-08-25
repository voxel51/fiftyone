import ray
import torch

import fiftyone.core.ray.base as foray
import fiftyone.core.collections as foc
from fiftyone.core.ray.base import FiftyOneActor


@ray.remote
class LabelWriter(FiftyOneActor):
    def __init__(
        self,
        serialized_samples,
        label_field,
        confidence_thresh=None,
        post_processor=None,
        **kwargs
    ):
        super().__init__(serialized_samples, **kwargs)
        self.label_field = label_field
        self.confidence_thresh = confidence_thresh
        self.post_processor = post_processor
        self.ctx = foc.SaveContext(self.samples)

    def run(self, ids, payloads):
        samples_batch = self.samples.select(ids)

        if self.post_processor is not None:
            payloads = self.post_processor(
                *payloads, confidence_thresh=self.confidence_thresh
            )

        with self.ctx:
            for sample, payload in zip(samples_batch, payloads):
                sample.add_labels(
                    payload,
                    label_field=self.label_field,
                    confidence_thresh=self.confidence_thresh,
                )
                self.ctx.save(sample)
