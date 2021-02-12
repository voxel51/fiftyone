"""
Base evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import json

import eta.core.utils as etau

from fiftyone.core.config import Config, Configurable
from fiftyone.core.odm.evaluation import EvaluationDocument
import fiftyone.core.view as fov


class EvaluationInfo(Config):
    """Information about an evaluation that has been run on a dataset.

    Args:
        name: the name of the evaluation
        gt_field: the name of the ground truth field
        pred_field: the name of the predicted field
        config: the :class:`EvaluationConfig` for the evaluation
    """

    def __init__(self, name, gt_field, pred_field, config):
        self.name = name
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.config = config

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            name=doc.name,
            gt_field=doc.gt_field,
            pred_field=doc.pred_field,
            config=EvaluationConfig.from_dict(doc.config),
        )


class EvaluationConfig(Config):
    """Base class for configuring :class:`EvaluationMethod` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    def __init__(self, **kwargs):
        if kwargs:
            raise ValueError(
                "%s has no parameters %s"
                % (self.__class__, set(kwargs.keys()))
            )

    @property
    def method(self):
        """The name of the evaluation method."""
        raise NotImplementedError("subclass must implement method")

    @property
    def cls(self):
        """The fully-qualified name of this :class:`EvaluationConfig` class."""
        return etau.get_class_name(self)

    @property
    def method_cls(self):
        """The :class:`EvaluationMethod` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def build(self):
        """Builds the :class:`EvaluationMethod` associated with this config.

        Returns:
            an :class:`EvaluationMethod` instance
        """
        return self.method_cls(self)

    def attributes(self):
        """Returns the list of class attributes that will be serialized by
        :meth:`serialize`.

        Returns:
            a list of attributes
        """
        return ["method", "cls"] + super().attributes()

    @classmethod
    def from_dict(cls, d):
        """Constructs an :class:`EvaluationConfig` from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            an :class:`EvaluationConfig`
        """
        d = copy(d)
        d.pop("method")
        config_cls = etau.get_class(d.pop("cls"))
        return config_cls(**d)


class EvaluationMethod(Configurable):
    """Base class for evaluation methods.

    Args:
        config: an :class:`EvaluationConfig`
    """

    pass


class EvaluationResults(object):
    """Base class for evaluation results."""

    pass


def list_evaluations(samples):
    """Returns a list of all evaluation keys for the given collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a list of evaluation keys
    """
    return sorted(samples._dataset._doc.evaluations.keys())


def get_evaluation_info(samples, eval_key):
    """Returns an :class:`EvaluationInfo` instance describing the evaluation
    with the given key.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: the ``eval_key`` value for the evaluation

    Returns:
        an :class:`EvaluationInfo`
    """
    evaluation = _get_evaluation(samples, eval_key)
    return EvaluationInfo._from_doc(evaluation)


def load_evaluation_view(samples, eval_key):
    """Loads the :class:`fiftyone.core.view.DatasetView` on which the specified
    evaluation was performed.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: the ``eval_key`` value for the evaluation

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    evaluation = _get_evaluation(samples, eval_key)
    stage_dicts = [json.loads(s) for s in evaluation.view_stages]
    return fov.DatasetView._build(samples._dataset, stage_dicts)


def delete_evaluation(samples, eval_key):
    """Deletes the evaluation results associated with the given evaluation key
    from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: the ``eval_key`` value for the evaluation
    """
    eval_info = get_evaluation_info(samples, eval_key)
    config = eval_info.config

    from .classification import (
        ClassificationEvaluationConfig,
        delete_classification_evaluation,
    )
    from .detection import (
        DetectionEvaluationConfig,
        delete_detection_evaluation,
    )

    if isinstance(config, ClassificationEvaluationConfig):
        delete_classification_evaluation(samples, eval_key)
    elif isinstance(config, DetectionEvaluationConfig):
        delete_detection_evaluation(samples, eval_key)
    else:
        raise ValueError(
            "Unrecognized EvaluationConfig class %s" % config.__class__
        )


def delete_evaluations(samples):
    """Deletes all evaluation results from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
    """
    for eval_key in list_evaluations(samples):
        delete_evaluation(samples, eval_key)


def _get_evaluation(samples, eval_key):
    evaluation = samples._dataset._doc.evaluations.get(eval_key, None)
    if evaluation is None:
        raise ValueError(
            "Evaluation '%s' not found on collection '%s'"
            % (eval_key, samples.name)
        )

    return evaluation


def _record_evaluation(samples, eval_key, pred_field, gt_field, config):
    view_stages = [json.dumps(s) for s in samples.view()._serialize()]
    samples._dataset._doc.evaluations[eval_key] = EvaluationDocument(
        name=eval_key,
        pred_field=pred_field,
        gt_field=gt_field,
        config=config.serialize(),
        view_stages=view_stages,
    )
    samples._dataset.save()


def _delete_evaluation(samples, eval_key):
    samples._dataset._doc.evaluations.pop(eval_key, None)
    samples._dataset.save()
