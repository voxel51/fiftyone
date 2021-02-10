"""
Base evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy

import eta.core.utils as etau

from fiftyone.core.config import Config


class EvaluationConfig(Config):
    """Base class for evaluation configs."""

    @property
    def method(self):
        """The name of the evaluation method."""
        raise NotImplementedError("subclass must implement method")

    @property
    def cls(self):
        """The fully-qualified name of this :class:`EvaluationConfig` class."""
        return etau.get_class_name(self)

    def attributes(self):
        return ["method", "cls"] + super().attributes()

    @classmethod
    def from_dict(cls, d):
        d = copy(d)
        d.pop("method")
        config_cls = etau.get_class(d.pop("cls"))
        return config_cls(**d)


def list_evaluations(samples):
    """Returns a list of all evaluation keys for the given collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a list of evaluation keys
    """
    eval_info = samples._dataset.info.get("eval", {})
    return sorted(eval_info.keys())


def clear_evaluation(samples, eval_key):
    """Clears the evaluation results associated with the given evaluation key
    from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: the ``eval_key`` value for the evaluation
    """
    _, _, config = _get_eval_info(samples, eval_key)

    from .classification import (
        ClassificationEvaluationConfig,
        clear_classification_evaluation,
    )
    from .detection import (
        DetectionEvaluationConfig,
        clear_detection_evaluation,
    )

    if isinstance(config, ClassificationEvaluationConfig):
        clear_classification_evaluation(samples, eval_key)
    elif isinstance(config, DetectionEvaluationConfig):
        clear_detection_evaluation(samples, eval_key)
    else:
        raise ValueError(
            "Unrecognized EvaluationConfig class %s" % config.__class__
        )


def clear_evaluations(samples):
    """Clears all evaluation results from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
    """
    for eval_key in list_evaluations(samples):
        clear_evaluation(samples, eval_key)


def _get_eval_info(samples, eval_key):
    eval_info = samples._dataset.info.get("eval", {}).get(eval_key, None)
    if eval_info is None:
        raise ValueError(
            "Evaluation '%s' not found on collection '%s'"
            % (eval_key, samples.name)
        )

    pred_field = eval_info["pred_field"]
    gt_field = eval_info["gt_field"]
    config = EvaluationConfig.from_dict(eval_info["config"])
    return pred_field, gt_field, config


def _record_eval_info(samples, eval_key, pred_field, gt_field, config):
    eval_info = samples._dataset.info.get("eval", {})
    eval_info[eval_key] = {
        "pred_field": pred_field,
        "gt_field": gt_field,
        "config": config.serialize(),
    }
    samples._dataset.info["eval"] = eval_info
    samples._dataset.save()


def _delete_eval_info(samples, eval_key):
    samples._dataset.info["eval"].pop(eval_key)
    samples._dataset.save()
