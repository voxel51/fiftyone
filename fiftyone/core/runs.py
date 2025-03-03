"""
Dataset runs framework.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy, deepcopy
import datetime
import logging

from bson import json_util, DBRef

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.constants as foc
from fiftyone.core.config import Config, Configurable
from fiftyone.core.odm import patch_runs
from fiftyone.core.odm.runs import RunDocument


logger = logging.getLogger(__name__)


class BaseRunInfo(Config):
    """Information about a run on a dataset.

    Args:
        key: the run key
        version (None): the version of FiftyOne when the run was executed
        timestamp (None): the UTC ``datetime`` of the run
        config (None): the :class:`BaseRunConfig` for the run
    """

    def __init__(self, key, version=None, timestamp=None, config=None):
        self.key = key
        self.version = version
        self.timestamp = timestamp
        self.config = config

    @classmethod
    def config_cls(cls):
        """The :class:`BaseRunConfig` class associated with this class."""
        raise NotImplementedError("subclass must implement config_cls")

    @classmethod
    def _from_doc(cls, doc):
        return cls(
            key=doc.key,
            version=doc.version,
            timestamp=doc.timestamp,
            config=cls.config_cls().from_dict(deepcopy(doc.config)),
        )


class BaseRunConfig(Config):
    """Base class for configuring :class:`BaseRun` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    @property
    def type(self):
        """The type of run."""
        raise NotImplementedError("subclass must implement type")

    @property
    def method(self):
        """The name of the method."""
        raise NotImplementedError("subclass must implement method")

    @property
    def cls(self):
        """The fully-qualified name of this :class:`BaseRunConfig` class."""
        return etau.get_class_name(self)

    @property
    def run_cls(self):
        """The :class:`BaseRun` class associated with this config."""
        return etau.get_class(self.cls[: -len("Config")])

    def load_credentials(self, **kwargs):
        """Loads any necessary credentials from the given keyword arguments or
        the relevant FiftyOne config.

        Args:
            **kwargs: subclass-specific credentials
        """
        pass

    def build(self):
        """Builds the :class:`BaseRun` instance associated with this config.

        Returns:
            a :class:`BaseRun` instance
        """
        return self.run_cls(self)

    def attributes(self):
        """Returns the list of class attributes that will be serialized by
        :meth:`serialize`.

        Returns:
            a list of attributes
        """
        return ["cls", "type", "method"] + super().attributes()

    @classmethod
    def _virtual_attributes(cls):
        """A list of attributes that are serialized but should *not* be treated
        as parameters when loading the config class from the database.
        """
        return ["cls", "type", "method"]

    @classmethod
    def from_dict(cls, d):
        """Constructs a :class:`BaseRunConfig` from a serialized JSON dict
        representation of it.

        Args:
            d: a JSON dict

        Returns:
            a :class:`BaseRunConfig`
        """
        config_cls = d.get("cls", None)
        type = d.get("type", None)

        try:
            config_cls = etau.get_class(config_cls)
        except Exception as e:
            logger.warning(
                f"Unable to load {config_cls}; falling back to base class",
                exc_info=True,
            )
            config_cls = cls.base_config_cls(type)

        for key in config_cls._virtual_attributes():
            d.pop(key, None)

        return config_cls(**d)

    @staticmethod
    def base_config_cls(type):
        """Returns the config class for the given run type.

        Args:
            type: a :attr:`BaseRunConfig.type`

        Returns:
            a :class:`BaseRunConfig` subclass
        """
        import fiftyone.core.annotation as foa
        import fiftyone.core.brain as fob
        import fiftyone.core.evaluation as foe
        import fiftyone.utils.eval as foue

        # pylint: disable=import-error,no-name-in-module
        import fiftyone.brain.similarity as fbs
        import fiftyone.brain.visualization as fbv
        import fiftyone.brain.internal.core.hardness as fbh
        import fiftyone.brain.internal.core.mistakenness as fbm
        import fiftyone.brain.internal.core.uniqueness as fbu

        if type == "annotation":
            return foa.AnnotationMethodConfig
        if type == "brain":
            return fob.BrainMethodConfig
        if type == "evaluation":
            return foe.EvaluationMethodConfig
        if type == "run":
            return RunConfig

        if type == "regression":
            return foue.RegressionEvaluationConfig
        if type == "classification":
            return foue.ClassificationEvaluationConfig
        if type == "detection":
            return foue.DetectionEvaluationConfig
        if type == "segmentation":
            return foue.SegmentationEvaluationConfig

        if type == "similarity":
            return fbs.SimilarityConfig
        if type == "visualization":
            return fbv.VisualizationConfig
        if type == "hardness":
            return fbh.HardnessConfig
        if type == "mistakenness":
            return fbm.MistakennessMethodConfig
        if type == "uniqueness":
            return fbu.UniquenessConfig

        logger.debug("Unrecognized run type '%s'", type)
        return RunConfig


class BaseRun(Configurable):
    """Base class for methods that can be run on a dataset.

    Subclasses will typically declare an interface method that handles
    performing the actual run. The function of this base class is to declare
    how to validate that a run is valid and how to cleanup after a run.

    Args:
        config: a :class:`BaseRunConfig`
    """

    @classmethod
    def run_info_cls(cls):
        """The :class:`BaseRunInfo` class associated with this class."""
        raise NotImplementedError("subclass must implement run_info_cls()")

    @classmethod
    def _runs_field(cls):
        """The :class:`fiftyone.core.odm.dataset.DatasetDocument` field in
        which these runs are stored.
        """
        raise NotImplementedError("subclass must implement _runs_field()")

    @classmethod
    def _run_str(cls):
        """A string to use when referring to these runs in log messages."""
        raise NotImplementedError("subclass must implement _run_str()")

    @classmethod
    def _patch_function(cls):
        """A function that can patch any ReferenceField issues with a dataset's
        runs.
        """
        raise NotImplementedError("subclass must implement _patch_function()")

    @classmethod
    def _results_cache_field(cls):
        """The :class:`fiftyone.core.dataset.Dataset` field that stores the
        results cache for these runs.
        """
        raise NotImplementedError(
            "subclass must implement _results_cache_field()"
        )

    def ensure_requirements(self):
        """Ensures that any necessary packages to execute this run are
        installed.

        Runs should respect ``fiftyone.config.requirement_error_level`` when
        handling errors.
        """
        pass

    def ensure_usage_requirements(self):
        """Ensures that any necessary packages to use existing results for this
        run are installed.

        Runs should respect ``fiftyone.config.requirement_error_level`` when
        handling errors.
        """
        pass

    def get_fields(self, samples, key):
        """Gets the fields that were involved in the given run.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            a list of fields
        """
        return []

    def rename(self, samples, key, new_key):
        """Performs any necessary operations required to rename this run's key.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            new_key: a new run key
        """
        pass

    def cleanup(self, samples, key):
        """Cleans up the results of the run with the given key from the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
        """
        pass

    def register_run(self, samples, key, overwrite=True, cleanup=True):
        """Registers a run of this method under the given key on the given
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            overwrite (True): whether to allow overwriting an existing run of
                the same type
            cleanup (True): whether to execute an existing run's
                :meth:`BaseRun.cleanup` method when overwriting it
        """
        if key is None:
            return

        self.validate_run(samples, key, overwrite=overwrite)
        version = foc.VERSION
        timestamp = datetime.datetime.utcnow()
        run_info_cls = self.run_info_cls()
        run_info = run_info_cls(
            key, version=version, timestamp=timestamp, config=self.config
        )
        self.save_run_info(
            samples, run_info, overwrite=overwrite, cleanup=cleanup
        )

    def validate_run(self, samples, key, overwrite=True):
        """Validates that the collection can accept this run.

        The run may be invalid if, for example, a run of a different type has
        already been run under the same key and thus overwriting it would cause
        ambiguity on how to cleanup the results.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            overwrite (True): whether to allow overwriting an existing run of
                the same type

        Raises:
            ValueError: if the run is invalid
        """
        if not etau.is_str(key) or not key.isidentifier():
            raise ValueError(
                "Invalid %s key '%s'. Keys must be valid variable names"
                % (self._run_str(), key)
            )

        if key not in self.list_runs(samples):
            return

        if not overwrite:
            raise ValueError(
                "%s with key '%s' already exists"
                % (self._run_str().capitalize(), key)
            )

        try:
            existing_info = self.get_run_info(samples, key)
        except:
            # If the old info can't be loaded, always let the user overwrite it
            return

        if type(self.config) != type(existing_info.config):
            raise ValueError(
                "Cannot overwrite existing %s '%s' of type %s with one of "
                "type %s; please choose a different key or delete the "
                "existing one first"
                % (
                    self._run_str(),
                    key,
                    type(existing_info.config),
                    type(self.config),
                )
            )

        self._validate_run(samples, key, existing_info)

    def _validate_run(self, samples, key, existing_info):
        """Subclass-specific validation when a run with the given key already
        exists.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            existing_info: a :class:`BaseRunInfo`

        Raises:
            ValueError: if the run is invalid
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
    def list_runs(cls, samples, type=None, method=None, **kwargs):
        """Returns the list of run keys on the given collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            type (None): a specific run type to match, which can be:

                -   a string :attr:`fiftyone.core.runs.BaseRunConfig.type`
                -   a :class:`fiftyone.core.runs.BaseRun` class or its
                    fully-qualified class name string

            method (None): a specific
                :attr:`fiftyone.core.runs.BaseRunConfig.method` string to match
            **kwargs: optional config parameters to match

        Returns:
            a list of run keys
        """
        run_docs = cls._get_run_docs(samples)

        if etau.is_str(type):
            try:
                type = etau.get_class(type)
            except:
                pass

        if type is None and method is None and not kwargs:
            return sorted(run_docs.keys())

        keys = []
        for key in run_docs.keys():
            try:
                run_info = cls.get_run_info(samples, key)
                config = run_info.config
            except:
                logger.warning(
                    "Failed to load info for %s with key '%s'",
                    cls._run_str(),
                    key,
                )
                continue

            if type is not None:
                if etau.is_str(type):
                    if config.type != type:
                        continue
                else:
                    if not issubclass(config.run_cls, type):
                        continue

            if method is not None:
                if config.method != method:
                    continue

            if kwargs and any(
                getattr(config, key, None) != value
                for key, value in kwargs.items()
            ):
                continue

            keys.append(key)

        return sorted(keys)

    @classmethod
    def update_run_key(cls, samples, key, new_key):
        """Replaces the key for the given run with a new key.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            new_key: a new run key
        """
        if new_key in cls.list_runs(samples):
            raise ValueError(
                "A %s with key '%s' already exists" % (cls._run_str(), new_key)
            )

        try:
            # Execute rename() method
            run_info = cls.get_run_info(samples, key)
            run = run_info.config.build()
            run.rename(samples, key, new_key)
        except Exception as e:
            logger.warning(
                "Failed to run rename() for the %s with key '%s': %s",
                cls._run_str(),
                key,
                str(e),
            )

        dataset = samples._root_dataset

        # Update run doc
        run_docs = getattr(dataset._doc, cls._runs_field())
        # DON'T use pop()! https://github.com/voxel51/fiftyone/issues/4322
        run_doc = run_docs[key]
        del run_docs[key]
        run_doc.key = new_key
        run_docs[new_key] = run_doc
        run_doc.save()
        dataset.save()

        # Update results cache
        results_cache = getattr(dataset, cls._results_cache_field())
        run_results = results_cache.pop(key, None)
        if run_results is not None:
            run_results._key = new_key
            results_cache[new_key] = run_results

    @classmethod
    def get_run_info(cls, samples, key):
        """Gets the :class:`BaseRunInfo` for the given key on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            a :class:`BaseRunInfo`
        """
        run_doc = cls._get_run_doc(samples, key)
        run_info_cls = cls.run_info_cls()

        try:
            return run_info_cls._from_doc(run_doc)
        except Exception as e:
            if run_doc.version == foc.VERSION:
                raise e

            raise ValueError(
                "Failed to load info for %s with key '%s'. The %s used "
                "fiftyone==%s but you are currently using fiftyone==%s. We "
                "recommend that you re-run the method with your current "
                "FiftyOne version"
                % (
                    cls._run_str(),
                    key,
                    cls._run_str(),
                    run_doc.version or "????",
                    foc.VERSION,
                )
            ) from e

    @classmethod
    def save_run_info(cls, samples, run_info, overwrite=True, cleanup=True):
        """Saves the run information on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            run_info: a :class:`BaseRunInfo`
            overwrite (True): whether to overwrite an existing run with the
                same key
            cleanup (True): whether to execute an existing run's
                :meth:`BaseRun.cleanup` method when overwriting it
        """
        import fiftyone.core.view as fov

        key = run_info.key

        if key in cls.list_runs(samples):
            if overwrite:
                cls.delete_run(samples, key, cleanup=cleanup)
            else:
                raise ValueError(
                    "%s with key '%s' already exists"
                    % (cls._run_str().capitalize(), key)
                )

        dataset = samples._root_dataset
        run_docs = getattr(dataset._doc, cls._runs_field())

        if isinstance(samples, fov.DatasetView):
            view_stages = [
                json_util.dumps(s)
                for s in samples._serialize(include_uuids=False)
            ]
        else:
            view_stages = None

        run_doc = RunDocument(
            dataset_id=dataset._doc.id,
            key=key,
            version=run_info.version,
            timestamp=run_info.timestamp,
            config=deepcopy(run_info.config.serialize()),
            view_stages=view_stages,
            results=None,
        )
        run_doc.save(upsert=True)

        run_docs[key] = run_doc
        dataset.save()

    @classmethod
    def update_run_config(cls, samples, key, config):
        """Updates the :class:`BaseRunConfig` for the given run on the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            config: a :class:`BaseRunConfig`
        """
        if key is None:
            return

        run_doc = cls._get_run_doc(samples, key)
        run_doc.config = deepcopy(config.serialize())
        run_doc.save()

    @classmethod
    def save_run_results(
        cls, samples, key, run_results, overwrite=True, cache=True
    ):
        """Saves the run results on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            run_results: a :class:`BaseRunResults`, or None
            overwrite (True): whether to overwrite an existing result with the
                same key
            cache (True): whether to cache the results on the collection
        """
        if key is None:
            return

        dataset = samples._root_dataset
        run_doc = cls._get_run_doc(samples, key)

        if run_doc.results:
            if overwrite:
                # Must manually delete existing result from GridFS
                run_doc.results.delete()
            else:
                raise ValueError(
                    "%s with key '%s' already has results"
                    % (cls._run_str().capitalize(), key)
                )

        if run_results is None:
            run_doc.results = None
        else:
            # Write run result to GridFS
            # We use `json_util.dumps` so that run results may contain BSON
            results_bytes = json_util.dumps(run_results.serialize()).encode()
            run_doc.results.put(results_bytes, content_type="application/json")

        # Cache the results for future use in this session
        if cache:
            results_cache = getattr(dataset, cls._results_cache_field())
            results_cache[key] = run_results

        run_doc.save()

    @classmethod
    def load_run_results(
        cls, samples, key, cache=True, load_view=True, **kwargs
    ):
        """Loads the :class:`BaseRunResults` for the given key on the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            cache (True): whether to cache the results on the collection
            load_view (True): whether to load the run view in the results
                (True) or the full dataset (False)
            **kwargs: keyword arguments for the run's
                :meth:`BaseRunConfig.load_credentials` method

        Returns:
            a :class:`BaseRunResults`, or None if the run did not save results
        """
        dataset = samples._root_dataset

        if cache:
            results_cache = getattr(dataset, cls._results_cache_field())

            # Returned cached results if available
            if key in results_cache:
                return results_cache[key]

        run_doc = cls._get_run_doc(samples, key)

        if not run_doc.results:
            return None

        # Load run config
        run_info = cls.get_run_info(samples, key)
        config = run_info.config
        config.load_credentials(**kwargs)

        if load_view:
            run_samples = cls.load_run_view(samples, key)
        else:
            run_samples = dataset

        # Load run result from GridFS
        run_doc.results.seek(0)
        d = json_util.loads(run_doc.results.read().decode())

        try:
            run_results = BaseRunResults.from_dict(d, run_samples, config, key)
        except Exception as e:
            if run_doc.version == foc.VERSION:
                raise e

            raise ValueError(
                "Failed to load results for %s with key '%s'. The %s used "
                "fiftyone==%s but you are currently using fiftyone==%s. We "
                "recommend that you re-run the method with your current "
                "FiftyOne version"
                % (
                    cls._run_str(),
                    key,
                    cls._run_str(),
                    run_doc.version or "????",
                    foc.VERSION,
                )
            ) from e

        # Cache the results for future use in this session
        if cache:
            results_cache[key] = run_results

        return run_results

    @classmethod
    def has_cached_run_results(cls, samples, key):
        """Determines whether :class:`BaseRunResults` for the given key are
        cached on the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key

        Returns:
            True/False
        """
        dataset = samples._root_dataset
        results_cache = getattr(dataset, cls._results_cache_field())
        return key in results_cache

    @classmethod
    def load_run_view(cls, samples, key, select_fields=False):
        """Loads the view on which the specified run was performed.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            select_fields (False): whether to exclude fields involved in other
                runs of the same type

        Returns:
            a :class:`fiftyone.core.collections.SampleCollection`
        """
        import fiftyone.core.view as fov

        run_doc = cls._get_run_doc(samples, key)

        if run_doc.view_stages is not None:
            stage_dicts = [json_util.loads(s) for s in run_doc.view_stages]
            view = fov.DatasetView._build(samples._root_dataset, stage_dicts)
        else:
            view = samples._root_dataset

        if not select_fields:
            return view

        fields = cls._get_run_fields(samples, key)
        root_fields = samples._get_root_fields(fields)

        exclude_fields = []
        for _key in cls.list_runs(samples):
            if _key == key:
                continue

            _fields = cls._get_run_fields(samples, _key)
            _root_fields = samples._get_root_fields(_fields)

            # Exclude top-level fields involved in other runs
            for field in _root_fields:
                if field not in root_fields:
                    exclude_fields.append(field)

            # Exclude nested fields from other runs on this run's fields
            for field in _fields:
                if any(field.startswith(r + ".") for r in root_fields):
                    exclude_fields.append(field)

        if exclude_fields:
            view = view.exclude_fields(exclude_fields)

        return view

    @classmethod
    def delete_run(cls, samples, key, cleanup=True):
        """Deletes the results associated with the given run key from the
        collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            key: a run key
            cleanup (True): whether to execute the run's
                :meth:`BaseRun.cleanup` method
        """
        run_doc = cls._get_run_doc(samples, key)

        if cleanup:
            try:
                # Execute cleanup() method
                run_info = cls.get_run_info(samples, key)
                run = run_info.config.build()
                run.cleanup(samples, key)
            except Exception as e:
                logger.warning(
                    "Failed to run cleanup() for the %s with key '%s': %s",
                    cls._run_str(),
                    key,
                    str(e),
                )

        dataset = samples._root_dataset

        # Delete run from dataset
        run_docs = getattr(dataset._doc, cls._runs_field())
        try:
            # DON'T use pop()! https://github.com/voxel51/fiftyone/issues/4322
            del run_docs[key]
        except KeyError:
            pass
        results_cache = getattr(dataset, cls._results_cache_field())
        run_results = results_cache.pop(key, None)
        if run_results is not None:
            run_results._key = None

        if not isinstance(run_doc, DBRef):
            # Must manually delete run result, which is stored via GridFS
            if run_doc.results:
                run_doc.results.delete()

            run_doc.delete()

        dataset.save()

    @classmethod
    def delete_runs(cls, samples, cleanup=True):
        """Deletes all runs from the collection.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            cleanup (True): whether to execute the run's
                :meth:`BaseRun.cleanup` methods
        """
        for key in cls.list_runs(samples):
            cls.delete_run(samples, key, cleanup=cleanup)

    @classmethod
    def _get_run_docs(cls, samples):
        dataset = samples._root_dataset
        run_docs = {}
        for key, run_doc in getattr(dataset._doc, cls._runs_field()).items():
            if not isinstance(run_doc, DBRef):
                run_docs[key] = run_doc
            else:
                logger.warning(
                    "This dataset's %s references are corrupted. Run %s('%s') "
                    "and dataset.reload() to resolve",
                    cls._run_str(),
                    etau.get_function_name(cls._patch_function()),
                    dataset._doc.name,
                )

        return run_docs

    @classmethod
    def _get_run_doc(cls, samples, key):
        run_docs = cls._get_run_docs(samples)
        run_doc = run_docs.get(key, None)
        if run_doc is None:
            raise ValueError(
                "Dataset has no %s key '%s'" % (cls._run_str(), key)
            )

        return run_doc

    @classmethod
    def _get_run_fields(cls, samples, key):
        run_info = cls.get_run_info(samples, key)
        run = run_info.config.build()
        return run.get_fields(samples, key)


class BaseRunResults(etas.Serializable):
    """Base class for storing the results of a run.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`BaseRunConfig` used
        key: the key for the run
        backend (None): a :class:`BaseRun` instance. If not provided, one is
            instantiated from ``config``
    """

    def __init__(self, samples, config, key, backend=None):
        if backend is None and config is not None:
            backend = config.build()
            backend.ensure_usage_requirements()

        self._samples = samples
        self._config = config
        self._backend = backend
        self._key = key

    @property
    def cls(self):
        """The fully-qualified name of this :class:`BaseRunResults` class."""
        return etau.get_class_name(self)

    @property
    def samples(self):
        """The :class:`fiftyone.core.collections.SampleCollection` associated
        with these results.
        """
        return self._samples

    @property
    def config(self):
        """The :class:`BaseRunConfig` for these results."""
        return self._config

    @property
    def backend(self):
        """The :class:`BaseRun` for these results."""
        return self._backend

    @property
    def key(self):
        """The run key for these results."""
        return self._key

    def save(self):
        """Saves the results to the database."""
        # Only cache if the results are already cached
        cache = self.backend.has_cached_run_results(self.samples, self.key)

        self.backend.save_run_results(
            self.samples,
            self.key,
            self,
            overwrite=True,
            cache=cache,
        )

    def save_config(self):
        """Saves these results config to the database."""
        self.backend.update_run_config(self.samples, self.key, self.config)

    def attributes(self):
        """Returns the list of class attributes that will be serialized by
        :meth:`serialize`.

        Returns:
            a list of attributes
        """
        return ["cls"] + super().attributes()

    @classmethod
    def from_dict(cls, d, samples, config, key):
        """Builds a :class:`BaseRunResults` from a JSON dict representation of
        it.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run
            config: the :class:`BaseRunConfig` for the run
            key: the run key

        Returns:
            a :class:`BaseRunResults`
        """
        if d is None:
            return None

        run_results_cls = d.pop("cls", None)
        try:
            run_results_cls = etau.get_class(run_results_cls)
        except:
            logger.debug(
                "Unable to load '%s'; falling back to base class",
                run_results_cls,
            )
            run_results_cls = cls.base_results_cls(config.type)

        return run_results_cls._from_dict(d, samples, config, key)

    @classmethod
    def _from_dict(cls, d, samples, config, key):
        """Subclass implementation of :meth:`from_dict`.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run
            config: the :class:`BaseRunConfig` for the run
            key: the run key

        Returns:
            a :class:`BaseRunResults`
        """
        raise NotImplementedError("subclass must implement _from_dict()")

    @staticmethod
    def base_results_cls(type):
        """Returns the results class for the given run type.

        Args:
            type: a :attr:`BaseRunConfig.type`

        Returns:
            a :class:`BaseRunResults` subclass
        """
        import fiftyone.core.annotation as foa
        import fiftyone.core.brain as fob
        import fiftyone.core.evaluation as foe
        import fiftyone.utils.eval as foue

        # pylint: disable=import-error,no-name-in-module
        import fiftyone.brain.similarity as fbs
        import fiftyone.brain.visualization as fbv

        if type == "annotation":
            return foa.AnnotationResults
        if type == "brain":
            return fob.BrainResults
        if type == "evaluation":
            return foe.EvaluationResults
        if type == "run":
            return RunResults

        if type == "regression":
            return foue.RegressionResults
        if type == "classification":
            return foue.ClassificationResults
        if type == "detection":
            return foue.DetectionResults
        if type == "segmentation":
            return foue.SegmentationResults

        if type == "similarity":
            return fbs.SimilarityIndex
        if type == "visualization":
            return fbv.VisualizationResults
        if type == "hardness":
            return None
        if type == "mistakenness":
            return None
        if type == "uniqueness":
            return None

        logger.debug("Unrecognized run type '%s'", type)
        return RunResults


class RunInfo(BaseRunInfo):
    """Information about a run on a dataset.

    Args:
        key: the run key
        timestamp (None): the UTC ``datetime`` when the run was initiated
        config (None): the :class:`RunConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return RunConfig


class RunConfig(BaseRunConfig):
    """Class for configuring :class:`Run` instances.

    Args:
        **kwargs: JSON serializable config parameters
    """

    def __init__(self, **kwargs):
        method = None
        for name, value in kwargs.items():
            if name == "method":
                method = value
            else:
                setattr(self, name, value)

        self._method = method

    @property
    def type(self):
        return "run"

    @property
    def method(self):
        return self._method

    @method.setter
    def method(self, method):
        self._method = method

    @classmethod
    def _virtual_attributes(cls):
        return ["cls", "type"]


class Run(BaseRun):
    """Class for runs.

    Args:
        config: a :class:`RunConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return RunInfo

    @classmethod
    def _runs_field(cls):
        return "runs"

    @classmethod
    def _run_str(cls):
        return "run"

    @classmethod
    def _results_cache_field(cls):
        return "_run_cache"

    @classmethod
    def _patch_function(cls):
        return patch_runs


class RunResults(BaseRunResults):
    """Class for run results.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`RunConfig` used
        key: the key for the run
        backend (None): a :class:`Run` instance. If not provided, one is
            instantiated from ``config``
        **kwargs: JSON serializable data to store on the results
    """

    def __init__(self, samples, config, key, backend=None, **kwargs):
        super().__init__(samples, config, key, backend=backend)
        for name, value in kwargs.items():
            setattr(self, name, value)

    @classmethod
    def _from_dict(cls, d, samples, config, key):
        return cls(samples, config, key, **d)
