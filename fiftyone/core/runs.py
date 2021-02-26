"""
Dataset runs framework.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import datetime
import json

import eta.core.serial as etas
import eta.core.utils as etau

from fiftyone.core.config import Config, Configurable
from fiftyone.core.odm.runs import RunDocument


class RunInfo(Config):
    """Information about a run on a dataset.

    Args:
        key: the run key
        timestamp (None): the UTC ``datetime`` of the run
        config (None): the :class:`RunConfig` for the run
    """

    def __init__(self, key, timestamp=None, config=None):
        self.key = key
        self.timestamp = timestamp
        self.config = config

    @classmethod
    def config_cls(cls):
        """The :class:`RunConfig` class associated with this class."""
        raise NotImplementedError("subclass must implement config_cls")

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            key=doc.key,
            timestamp=doc.timestamp,
            config=cls.config_cls().from_dict(doc.config),
        )


class RunConfig(Config):
    """Base class for configuring :class:`Run` instances.

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
        """The name of the method."""
        raise NotImplementedError("subclass must implement method")

    @property
    def cls(self):
        """The fully-qualified name of this :class:`RunConfig` class."""
        return etau.get_class_name(self)

    @property
    def run_cls(self):
        """The :class:`Run` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def build(self):
        """Builds the :class:`Run` instance associated with this config.

        Returns:`
            a :class:`Run` instance
        """
        return self.run_cls(self)

    def attributes(self):
        """Returns the list of class attributes that will be serialized by
        :meth:`serialize`.

        Returns:
            a list of attributes
        """
        return ["method", "cls"] + super().attributes()

    @classmethod
    def from_dict(cls, d):
        """Constructs a :class:`RunConfig` from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`RunConfig`
        """
        d = copy(d)
        d.pop("method")
        config_cls = etau.get_class(d.pop("cls"))
        return config_cls(**d)


class Run(Configurable):
    """Base class for methods that can be run on a dataset.

    Subclasses will typically declare an interface method that handles
    performing the actual run. The function of this base class is to declare
    how to validate that a run is valid and how to cleanup after a run.

    Args:
        config: a :class:`RunConfig`
    """

    @classmethod
    def run_info_cls(cls):
        """The :class:`RunInfo` class associated with this class."""
        raise NotImplementedError("subclass must implement run_info_cls()")

    @classmethod
    def _run_info_field(cls):
        """The :class:`fiftyone.core.odm.dataset.DatasetDocument` field in
        which the info for these runs are stored.
        """
        raise NotImplementedError("subclass must implement _run_info_field()")

    @classmethod
    def _run_results_field(cls):
        """The :class:`fiftyone.core.odm.dataset.DatasetDocument` field in
        which the results for these runs are stored.
        """
        raise NotImplementedError(
            "subclass must implement _run_results_field()"
        )

    @classmethod
    def _run_str(cls):
        """A string to use when referring to these runs in log messages."""
        raise NotImplementedError("subclass must implement _run_str()")

    def get_fields(self, samples, key):
        """Gets the fields that were involved and populated by the given run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            a list of fields
        """
        raise NotImplementedError("subclass must implement get_fields()")

    def cleanup(self, samples, key):
        """Deletes any results for the run with the given key from the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
        """
        raise NotImplementedError("subclass must implement cleanup()")

    def register_run(self, samples, key):
        """Registers a run of this method under the given key on the given
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
        """
        if key is None:
            return

        self.validate_run(samples, key)
        timestamp = datetime.datetime.utcnow()
        run_info_cls = self.run_info_cls()
        run_info = run_info_cls(key, timestamp=timestamp, config=self.config)
        self.save_run_info(samples, run_info)

    def validate_run(self, samples, key):
        """Validates that the collection can accept this run.

        The run may be invalid if, for example, a run of a different type has
        already been run under the same key and thus overwriting it would cause
        ambiguity on how to cleanup the results.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
        """
        if not etau.is_str(key) or not key.isidentifier():
            raise ValueError(
                "Invalid %s key '%s'. Keys must be valid variable names"
                % (self._run_str(), key)
            )

        if key not in self.list_runs(samples):
            return

        existing_info = self.get_run_info(samples, key)

        if self.config.__class__ != existing_info.config.__class__:
            raise ValueError(
                "Cannot overwrite existing %s '%s' of type %s with one of "
                "type %s; please choose a different key or delete the "
                "existing one first"
                % (
                    self._run_str(),
                    key,
                    existing_info.config.__class__,
                    self.config.__class__,
                )
            )

        self._validate_run(samples, key, existing_info)

    def _validate_run(self, samples, key, existing_info):
        """Subclass-specific validation when a run with the given key already
        exists.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            existing_info: a :class:`RunInfo`
        """
        pass

    def _validate_fields_match(self, key, field_name, existing_info):
        new_field = getattr(self.config, field_name)
        existing_field = getattr(existing_info.config, field_name)
        if new_field != existing_field:
            raise ValueError(
                "Cannot overwrite existing %s '%s' where %s=%s with one where "
                "%s=%s. Please choose a different key or delete the existing "
                "one first"
                % (
                    self._run_str(),
                    key,
                    field_name,
                    existing_field,
                    field_name,
                    new_field,
                )
            )

    @classmethod
    def list_runs(cls, samples):
        """Returns the list of run keys on the given collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a list of run keys
        """
        run_docs = getattr(samples._dataset._doc, cls._run_info_field())
        return sorted(run_docs.keys())

    @classmethod
    def get_run_info(cls, samples, key):
        """Gets the :class:`RunInfo` for the given key on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            a :class:`RunInfo`
        """
        run_doc = cls._get_run_doc(samples, key)
        run_info_cls = cls.run_info_cls()
        return run_info_cls._from_doc(run_doc)

    @classmethod
    def save_run_info(cls, samples, run_info):
        """Saves the run information on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            run_info: a :class:`RunInfo`
        """
        key = run_info.key
        view_stages = [json.dumps(s) for s in samples.view()._serialize()]
        run_docs = getattr(samples._dataset._doc, cls._run_info_field())
        run_docs[key] = RunDocument(
            key=key,
            timestamp=run_info.timestamp,
            config=run_info.config.serialize(),
            view_stages=view_stages,
        )
        samples._dataset.save()

    @classmethod
    def save_run_results(cls, samples, key, run_results):
        """Saves the run results on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            run_results: a :class:`RunResults`, or None
        """
        if key is None:
            return

        if run_results is not None:
            run_results = run_results.serialize()

        results = getattr(samples._dataset._doc, cls._run_results_field())
        results[key] = run_results
        samples._dataset.save()

    @classmethod
    def load_run_results(cls, samples, key):
        """Loads the :class:`RunResults` for the given key on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            a :class:`RunResults`, or None if the run did not save results
        """
        results_dict = cls._get_run_results_dict(samples, key)
        if results_dict is None:
            return None

        view = cls.load_run_view(samples, key)
        return RunResults.from_dict(results_dict, view)

    @classmethod
    def load_run_view(cls, samples, key, select_fields=False):
        """Loads the :class:`fiftyone.core.view.DatasetView` on which the
        specified run was performed.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            select_fields (False): whether to select only the fields involved
                in the run

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        import fiftyone.core.view as fov

        run_doc = cls._get_run_doc(samples, key)
        stage_dicts = [json.loads(s) for s in run_doc.view_stages]
        view = fov.DatasetView._build(samples._dataset, stage_dicts)

        if not select_fields:
            return view

        #
        # Select run fields
        #

        fields = cls._get_run_fields(samples, key)
        root_fields = [f for f in fields if "." not in f]
        _select_fields = root_fields
        for field in fields:
            if not any(f.startswith(field) for f in root_fields):
                _select_fields.append(field)

        view = view.select_fields(_select_fields)

        #
        # Hide any ancillary info on the same fields
        #

        _exclude_fields = []
        for _key in cls.list_runs(samples):
            if _key == key:
                continue

            for field in cls._get_run_fields(samples, _key):
                if "." in field and field.startswith(root_fields):
                    _exclude_fields.append(field)

        if _exclude_fields:
            view = view.exclude_fields(_exclude_fields)

        return view

    @classmethod
    def delete_run(cls, samples, key):
        """Deletes the results associated with the given run key from the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
        """
        run_info = cls.get_run_info(samples, key)
        run = run_info.config.build()
        run.cleanup(samples, key)
        run_docs = getattr(samples._dataset._doc, cls._run_info_field())
        run_docs.pop(key, None)
        run_results = getattr(samples._dataset._doc, cls._run_results_field())
        run_results.pop(key, None)
        samples._dataset.save()

    @classmethod
    def delete_runs(cls, samples):
        """Deletes all runs from the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
        """
        for key in cls.list_runs(samples):
            cls.delete_run(samples, key)

    @classmethod
    def _get_run_doc(cls, samples, key):
        run_docs = getattr(samples._dataset._doc, cls._run_info_field())
        run_doc = run_docs.get(key, None)
        if run_doc is None:
            raise ValueError(
                "Info for %s key '%s' not found on collection '%s'"
                % (cls._run_str(), key, samples.name)
            )

        return run_doc

    @classmethod
    def _get_run_results_dict(cls, samples, key):
        run_results = getattr(samples._dataset._doc, cls._run_results_field())
        results_dict = run_results.get(key, None)
        if results_dict is None:
            raise ValueError(
                "Results for %s key '%s' not found on collection '%s'"
                % (cls._run_str(), key, samples.name)
            )

        return results_dict

    @classmethod
    def _get_run_fields(cls, samples, key):
        run_info = cls.get_run_info(samples, key)
        run = run_info.config.build()
        return run.get_fields(samples, key)


class RunResults(etas.Serializable):
    """Base class for storing the results of a run."""

    @property
    def cls(self):
        """The fully-qualified name of this :class:`RunResults` class."""
        return etau.get_class_name(self)

    def attributes(self):
        """Returns the list of class attributes that will be serialized by
        :meth:`serialize`.

        Returns:
            a list of attributes
        """
        return ["cls"] + super().attributes()

    @classmethod
    def from_dict(cls, d, samples):
        """Builds a :class:`RunResults` from a JSON dict representation of it.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run

        Returns:
            a :class:`RunResults`
        """
        run_results_cls = etau.get_class(d["cls"])
        return run_results_cls._from_dict(d, samples)

    @classmethod
    def _from_dict(cls, d, samples):
        """Subclass implementation of :meth:`from_dict`.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run

        Returns:
            a :class:`RunResults`
        """
        raise NotImplementedError("subclass must implement _from_dict()")
