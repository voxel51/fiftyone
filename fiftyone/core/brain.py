"""
Brain methods.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import datetime
import json

import eta.core.utils as etau

from fiftyone.core.config import Config, Configurable
from fiftyone.core.odm.brain import BrainDocument


class BrainInfo(Config):
    """Information about a brain method that has been run on a dataset.

    Args:
        brain_key: the brain key
        timestamp (None): the UTC ``datetime`` at which the brain method was
            run. If not specified, the current time is used
        config (None): the :class:`BrainMethodConfig` for the brain method
    """

    def __init__(self, brain_key, timestamp=None, config=None):
        if timestamp is None:
            timestamp = datetime.datetime.utcnow()

        self.brain_key = brain_key
        self.timestamp = timestamp
        self.config = config

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            brain_key=doc.brain_key,
            timestamp=doc.timestamp,
            config=BrainMethodConfig.from_dict(doc.config),
        )


class BrainMethodConfig(Config):
    """Base class for configuring :class:`BrainMethod` instances.

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
    def cls(self):
        """The fully-qualified name of this :class:`BrainMethodConfig` class.
        """
        return etau.get_class_name(self)

    @property
    def method(self):
        """The name of the brain method."""
        raise NotImplementedError("subclass must implement method")

    @property
    def method_cls(self):
        """The :class:`BrainMethod` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def build(self):
        """Builds the :class:`BrainMethod` associated with this config.

        Returns:
            an :class:`BrainMethod` instance
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
        """Constructs an :class:`BrainMethodConfig` from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            an :class:`BrainMethodConfig`
        """
        d = copy(d)
        d.pop("method")
        config_cls = etau.get_class(d.pop("cls"))
        return config_cls(**d)


class BrainMethod(Configurable):
    """Base class for brain methods.

    Args:
        config: an :class:`BrainMethodConfig`
    """

    def get_fields(self, samples, brain_key):
        """Gets the fields that were involved in the given brain method run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            brain_key: a brain key

        Returns:
            a list of fields
        """
        raise NotImplementedError("subclass must implement get_fields()")

    def cleanup(self, samples, brain_key):
        """Deletes any results for the brain method run with the given key from
        the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            brain_key: a brain key
        """
        raise NotImplementedError("subclass must implement cleanup()")

    def validate_run(self, samples, brain_key):
        """Validates that the collection can accept this brain method run.

        The brain method may be invalid if, for example, a brain method of a
        different type has already been run under the same brain key and thus
        overwriting it would cause ambiguity on how to cleanup the results.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            brain_key: a brain key
        """
        if brain_key is None:
            return

        if not etau.is_str(brain_key) or not brain_key.isidentifier():
            raise ValueError(
                "Invalid brain_key '%s'. Brain keys must be valid variable "
                "names" % brain_key
            )

        if brain_key not in list_brain_keys(samples):
            return

        existing_info = get_brain_info(samples, brain_key)

        if self.config.__class__ != existing_info.config.__class__:
            raise ValueError(
                "Cannot overwrite existing brain method run '%s' of type %s "
                "with a run of type %s; please choose a different `brain_key` "
                "or delete the existing brain method run first"
                % (
                    brain_key,
                    existing_info.config.__class__,
                    self.config.__class__,
                )
            )

        self._validate_run(samples, brain_key, existing_info)

    def _validate_run(self, samples, brain_key, existing_info):
        """Subclass-specific validation when a run with the given key already
        exists.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            brain_key: a brain key
            existing_info: an :class:`BrainInfo`
        """
        pass

    def _validate_fields_match(self, brain_key, field_name, existing_info):
        new_field = getattr(self.config, field_name)
        existing_field = getattr(existing_info.config, field_name)
        if new_field != existing_field:
            raise ValueError(
                "Cannot overwrite existing brain run '%s' where %s=%s with a "
                "run where %s=%s. Please choose a different `brain_key` or "
                "delete the existing run first"
                % (
                    brain_key,
                    field_name,
                    existing_field,
                    field_name,
                    new_field,
                )
            )


class BrainResults(object):
    """Base class for brain method results."""

    pass


def list_brain_keys(samples):
    """Returns a list of all brain keys for the given collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a list of brain keys
    """
    return sorted(samples._dataset._doc.brain_methods.keys())


def get_brain_info(samples, brain_key):
    """Returns information about the brain method run with the given key on the
    given collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        brain_key: a brain key

    Returns:
        an :class:`BrainInfo`
    """
    brain_doc = _get_brain_doc(samples, brain_key)
    return BrainInfo._from_doc(brain_doc)


def save_brain_info(samples, brain_info):
    """Saves the brain information on the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        brain_info: an :class:`BrainInfo`
    """
    brain_key = brain_info.brain_key
    view_stages = [json.dumps(s) for s in samples.view()._serialize()]
    samples._dataset._doc.brain_methods[brain_key] = BrainDocument(
        brain_key=brain_key,
        timestamp=brain_info.timestamp,
        config=brain_info.config.serialize(),
        view_stages=view_stages,
    )
    samples._dataset.save()


def load_brain_view(samples, brain_key, select_fields=False):
    """Loads the :class:`fiftyone.core.view.DatasetView` on which the specified
    brain method run was performed.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        brain_key: a brain key
        select_fields (False): whether to select only the fields involved
            in the brain method run

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    import fiftyone.core.view as fov

    brain_doc = _get_brain_doc(samples, brain_key)
    stage_dicts = [json.loads(s) for s in brain_doc.view_stages]
    view = fov.DatasetView._build(samples._dataset, stage_dicts)

    if not select_fields:
        return view

    #
    # Select brain fields
    #

    fields = _get_brain_fields(samples, brain_key)
    root_fields = [f for f in fields if "." not in f]
    _select_fields = root_fields
    for field in fields:
        if not any(f.startswith(field) for f in root_fields):
            _select_fields.append(field)

    view = view.select_fields(_select_fields)

    #
    # Hide any ancillary brain runs on the same fields
    #

    _exclude_fields = []
    for _brain_key in list_brain_keys(samples):
        if _brain_key == brain_key:
            continue

        for field in _get_brain_fields(samples, _brain_key):
            if "." in field and field.startswith(root_fields):
                _exclude_fields.append(field)

    if _exclude_fields:
        view = view.exclude_fields(_exclude_fields)

    return view


def _get_brain_fields(samples, brain_key):
    brain_info = get_brain_info(samples, brain_key)
    brain_method = brain_info.config.build()
    return brain_method.get_fields(samples, brain_key)


def delete_brain_result(samples, brain_key):
    """Deletes the results associated with the given brain key from the
    collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        brain_key: a brain key
    """
    brain_info = get_brain_info(samples, brain_key)
    brain_method = brain_info.config.build()
    brain_method.cleanup(samples, brain_key)
    samples._dataset._doc.brain_methods.pop(brain_key, None)
    samples._dataset.save()


def delete_brain_results(samples):
    """Deletes all brain results from the collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
    """
    for brain_key in list_brain_keys(samples):
        delete_brain_result(samples, brain_key)


def _get_brain_doc(samples, brain_key):
    brain_doc = samples._dataset._doc.brain_methods.get(brain_key, None)
    if brain_doc is None:
        raise ValueError(
            "Brain key '%s' not found on collection '%s'"
            % (brain_key, samples.name)
        )

    return brain_doc
