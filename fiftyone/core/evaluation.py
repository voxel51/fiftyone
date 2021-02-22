"""
Evaluation infrastructure.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import datetime
import json

import eta.core.utils as etau

from fiftyone.core.config import Config, Configurable
from fiftyone.core.odm.evaluation import EvaluationDocument


class EvaluationInfo(Config):
    """Information about an evaluation that has been run on a dataset.

    Args:
        eval_key: the evaluation key
        timestamp (None): the UTC ``datetime`` at which the evaluation was run.
            If not specified, the current time is used
        config (None): the :class:`EvaluationMethodConfig` for the evaluation
    """

    def __init__(self, eval_key, timestamp=None, config=None):
        if timestamp is None:
            timestamp = datetime.datetime.utcnow()

        self.eval_key = eval_key
        self.timestamp = timestamp
        self.config = config

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            eval_key=doc.eval_key,
            timestamp=doc.timestamp,
            config=EvaluationMethodConfig.from_dict(doc.config),
        )


class EvaluationMethodConfig(Config):
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
        """The fully-qualified name of this :class:`EvaluationMethodConfig`
        class.
        """
        return etau.get_class_name(self)

    @property
    def method_cls(self):
        """The :class:`EvaluationMethod` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def build(self):
        """Builds the :class:`EvaluationMethod` associated with this config.

        Returns:`
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
        """Constructs an :class:`EvaluationMethodConfig` from a serialized JSON
        dict representation of it.

        Args:
            d: a JSON dict

        Returns:
            an :class:`EvaluationMethodConfig`
        """
        d = copy(d)
        d.pop("method")
        config_cls = etau.get_class(d.pop("cls"))
        return config_cls(**d)


class EvaluationMethod(Configurable):
    """Base class for evaluation methods.

    Subclasses will typically declare an interface method that handles
    performing evaluation on an image, video, or entire collection.

    Args:
        config: an :class:`EvaluationMethodConfig`
    """

    def get_fields(self, samples, eval_key):
        """Gets the fields that were involved and populated by the given
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

    def validate_run(self, samples, eval_key):
        """Validates that the collection can accept this evaluation run.

        The run may be invalid if, for example, an evaluation of a different
        type has already been run under the same evaluation key and thus
        overwriting it would cause ambiguity on how to cleanup the results.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: an evaluation key
        """
        if eval_key is None:
            return

        if not etau.is_str(eval_key) or not eval_key.isidentifier():
            raise ValueError(
                "Invalid eval_key '%s'. Evaluation keys must be valid "
                "variable names" % eval_key
            )

        if eval_key not in list_evaluations(samples):
            return

        existing_info = get_evaluation_info(samples, eval_key)

        if self.config.__class__ != existing_info.config.__class__:
            raise ValueError(
                "Cannot overwrite existing evaluation '%s' of type %s with an "
                "evaluation of type %s; please choose a different `eval_key` "
                "or delete the existing evaluation first"
                % (
                    eval_key,
                    existing_info.config.__class__,
                    self.config.__class__,
                )
            )

        self._validate_run(samples, eval_key, existing_info)

    def _validate_run(self, samples, eval_key, existing_info):
        """Subclass-specific validation when a run with the given key already
        exists.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            eval_key: an evaluation key
            existing_info: an :class:`EvaluationInfo`
        """
        pass

    def _validate_fields_match(self, eval_key, field_name, existing_info):
        new_field = getattr(self.config, field_name)
        existing_field = getattr(existing_info.config, field_name)
        if new_field != existing_field:
            raise ValueError(
                "Cannot overwrite existing evaluation '%s' where %s=%s with "
                "an evaluation where %s=%s. Please choose a different "
                "`eval_key` or delete the existing evaluation first"
                % (eval_key, field_name, existing_field, field_name, new_field)
            )


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
        timestamp=eval_info.timestamp,
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
            in the evaluation

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    import fiftyone.core.view as fov

    eval_doc = _get_evaluation_doc(samples, eval_key)
    stage_dicts = [json.loads(s) for s in eval_doc.view_stages]
    view = fov.DatasetView._build(samples._dataset, stage_dicts)

    if not select_fields:
        return view

    #
    # Select evaluation fields
    #

    fields = _get_eval_fields(samples, eval_key)
    root_fields = [f for f in fields if "." not in f]
    _select_fields = root_fields
    for field in fields:
        if not any(f.startswith(field) for f in root_fields):
            _select_fields.append(field)

    view = view.select_fields(_select_fields)

    #
    # Hide any ancillary evaluations on the same fields
    #

    _exclude_fields = []
    for _eval_key in list_evaluations(samples):
        if _eval_key == eval_key:
            continue

        for field in _get_eval_fields(samples, _eval_key):
            if "." in field and field.startswith(root_fields):
                _exclude_fields.append(field)

    if _exclude_fields:
        view = view.exclude_fields(_exclude_fields)

    return view


def _get_eval_fields(samples, eval_key):
    eval_info = get_evaluation_info(samples, eval_key)
    eval_method = eval_info.config.build()
    return eval_method.get_fields(samples, eval_key)


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
    eval_doc = samples._dataset._doc.evaluations.get(eval_key, None)
    if eval_doc is None:
        raise ValueError(
            "Evaluation key '%s' not found on collection '%s'"
            % (eval_key, samples.name)
        )

    return eval_doc
