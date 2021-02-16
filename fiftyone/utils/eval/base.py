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
        eval_key: the evaluation key
        pred_field (None): the name of the predicted field
        gt_field (None): the name of the ground truth field
        config (None): the :class:`EvaluationConfig` for the evaluation
    """

    def __init__(self, eval_key, pred_field=None, gt_field=None, config=None):
        self.eval_key = eval_key
        self.pred_field = pred_field
        self.gt_field = gt_field
        self.config = config

    @classmethod
    def from_dict(cls, d):
        """Creates an :class:`EvaluationInfo` from a JSON dict representation
        of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`EvaluationInfo`
        """
        config = d.get("config", None)
        if config is not None:
            config = EvaluationConfig.from_dict(config)

        return cls(
            d["eval_key"],
            pred_field=d.get("pred_field", None),
            gt_field=d.get("gt_field", None),
            config=config,
        )

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            eval_key=doc.eval_key,
            pred_field=doc.pred_field,
            gt_field=doc.gt_field,
            config=EvaluationConfig.from_dict(doc.config),
        )


class EvaluationConfig(Config):
    """Base class for configuring :class:`Evaluation` instances.

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
        """The :class:`Evaluation` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def build(self):
        """Builds the :class:`Evaluation` associated with this config.

        Returns:
            an :class:`Evaluation` instance
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


class Evaluation(Configurable):
    """Base class for evaluation methods.

    Subclasses will typically declare an interface method that handles
    performing evaluation on an image, video, or entire collection.

    Args:
        config: an :class:`EvaluationConfig`
    """

    def get_fields(self, samples, eval_key):
        """Gets the evaluation fields that were populated by the given
        evaluation.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: an evaluation key

        Returns:
            a list of fields
        """
        raise NotImplementedError("subclass must implement get_fields()")

    def cleanup(self, samples, eval_key):
        """Deletes any results for the evaluation with the given key from the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: an evaluation key
        """
        raise NotImplementedError("subclass must implement cleanup()")


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
    """Returns information about the evaluation with the given key on the given
    collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: an evaluation key

    Returns:
        an :class:`EvaluationInfo`
    """
    eval_doc = _get_evaluation_doc(samples, eval_key)
    return EvaluationInfo._from_doc(eval_doc)


def validate_evaluation(samples, eval_info):
    """Validates that the collection can accept the evaluation specified by the
    given info.

    The evaluation may be invalid if, for example, an evaluation of a different
    type has already been run under the same evaluation key and thus

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_info: an :class:`EvaluationInfo`
    """
    eval_key = eval_info.eval_key
    if eval_key not in list_evaluations(samples):
        return

    existing_info = get_evaluation_info(samples, eval_key)

    if eval_info.config.__class__ != existing_info.config.__class__:
        raise ValueError(
            "Cannot overwrite existing evaluation '%s' of type %s with an "
            "evaluation of type %s; please choose a different ``eval_key`` or "
            "delete the existing evaluation first"
            % (
                eval_key,
                existing_info.config.__class__,
                eval_info.config.__class__,
            )
        )


def save_evaluation_info(samples, eval_info):
    """Saves the evaluation information on the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_info: an :class:`EvaluationInfo`
    """
    eval_key = eval_info.eval_key
    view_stages = [json.dumps(s) for s in samples.view()._serialize()]
    samples._dataset._doc.evaluations[eval_key] = EvaluationDocument(
        eval_key=eval_key,
        pred_field=eval_info.pred_field,
        gt_field=eval_info.gt_field,
        config=eval_info.config.serialize(),
        view_stages=view_stages,
    )
    samples._dataset.save()


def load_evaluation_view(samples, eval_key, select_fields=False):
    """Loads the :class:`fiftyone.core.view.DatasetView` on which the specified
    evaluation was performed.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: an evaluation key
        select_fields (False): whether to select only the fields involved
            in the evaluation. If true, only the predicted and ground truth
            fields involved in the evaluation will be selected, and any
            ancillary fields populated on those samples by other evaluations
            will be excluded

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    eval_doc = _get_evaluation_doc(samples, eval_key)
    stage_dicts = [json.loads(s) for s in eval_doc.view_stages]
    view = fov.DatasetView._build(samples._dataset, stage_dicts)

    if select_fields:
        select = []
        exclude = []
        for _eval_key in list_evaluations(samples):
            eval_info = get_evaluation_info(samples, _eval_key)
            eval_method = eval_info.config.build()
            eval_fields = eval_method.get_fields(samples, _eval_key)
            if _eval_key == eval_key:
                gt = eval_info.gt_field
                pred = eval_info.pred_field
                select.extend([gt, pred])

                # We don't need to select embedded fields of `gt` and `pred`
                skip_prefixes = (pred + ".", gt + ".")
                for field in eval_fields:
                    if not field.startswith(skip_prefixes):
                        select.append(field)
            else:
                exclude.extend(eval_fields)

        view = view.exclude_fields(exclude).select_fields(select)

    return view


def delete_evaluation(samples, eval_key):
    """Deletes the evaluation results associated with the given evaluation key
    from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        eval_key: an evaluation key
    """
    eval_info = get_evaluation_info(samples, eval_key)
    eval_method = eval_info.config.build()
    eval_method.cleanup(samples, eval_key)
    samples._dataset._doc.evaluations.pop(eval_key, None)
    samples._dataset.save()


def delete_evaluations(samples):
    """Deletes all evaluation results from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
    """
    for eval_key in list_evaluations(samples):
        delete_evaluation(samples, eval_key)


def _get_evaluation_doc(samples, eval_key):
    evaluation = samples._dataset._doc.evaluations.get(eval_key, None)
    if evaluation is None:
        raise ValueError(
            "Evaluation '%s' not found on collection '%s'"
            % (eval_key, samples.name)
        )

    return evaluation
