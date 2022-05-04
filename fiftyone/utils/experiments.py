"""
Experiment utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import logging

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.experiment as foe


logger = logging.getLogger(__name__)


def register_experiment(
    samples,
    exp_key,
    label_fields=None,
    backend=None,
    **kwargs,
):
    config = _parse_config(backend, label_fields, **kwargs)
    exp_backend = config.build()
    exp_backend.ensure_requirements()

    results = exp_backend.construct_experiment()

    #
    # Don't allow overwriting an existing run with same `exp_key`, since we
    # need the existing run in order to perform workflows like automatically
    # cleaning up the backend's tasks
    #
    exp_backend.register_run(samples, exp_key, overwrite=False)

    results = exp_backend.get_results(samples)

    return results


def add_model_run(samples, exp_key, run_key, predictions):

    results = foe.ExperimentMethod.load_run_results(samples, exp_key)
    results.add_model_run(run_key, predictions)

    # Every time a new model run is added, the config must be updated
    exp_backend = results.backend
    config = results.config
    exp_backend.update_run_config(samples, exp_key, config)

    exp_backend.save_run_results(samples, exp_key, results)

    return results


def _parse_config(backend, label_fields, **kwargs):
    if backend is None:
        backend = "manual"

    if backend == "manual":
        return ManualExperimentBackendConfig(label_fields, **kwargs)

    # if backend == "mlflow":
    #    return MLFlowExperimentBackendConfig(label_fields, **kwargs)

    raise ValueError("Unsupported experiment backend '%s'" % backend)


class ExperimentBackendConfig(foe.ExperimentMethodConfig):
    def __init__(self, name, label_fields, **kwargs):
        super().__init__(**kwargs)

        self.name = name
        self.label_fields = label_fields

    @property
    def method(self):
        """The name of the experiment backend."""
        return self.name

    def serialize(self, *args, **kwargs):
        d = super().serialize(*args, **kwargs)
        return d


class ExperimentBackend(foe.ExperimentMethod):
    """Base class for experiment backends.

    Args:
        config: an :class:`ExperimentBackendConfig`
    """

    def cleanup(self, samples, exp_key):
        pass

    def construct_experiment(self, samples):
        raise NotImplementedError(
            "subclass must implement construct_experiment()"
        )


class ExperimentResults(foe.ExperimentResults):
    def __init__(self, samples, config, backend=None):
        if backend is None:
            backend = config.build()
            backend.ensure_requirements()

        self._samples = samples
        self._backend = backend

    @property
    def config(self):
        """The :class:`ExperimentBackendConfig` for these results."""
        return self._backend.config

    @property
    def backend(self):
        """The :class:`ExperimentBackend` for these results."""
        return self._backend

    def add_model_run(self, run_key, predictions):
        pass

    def evaluate(self):
        pass

    def list_notebooks(self):
        raise NotImplementedError("subclass must implement list_notebooks()")

    def launch_notebook(self):
        raise NotImplementedError("subclass must implement launch_notebook()")

    def launch_tracker(self):
        raise NotImplementedError("subclass must implement launch_tracker()")

    def cleanup(self):
        """Deletes all information for this run from the experiment backend."""
        raise NotImplementedError("subclass must implement cleanup()")

    @classmethod
    def _from_dict(cls, d, samples, config):
        """Builds an :class:`ExperimentResults` from a JSON dict representation
        of it.

        Args:
            d: a JSON dict
            samples: the :class:`fiftyone.core.collections.SampleCollection`
                for the run
            config: the :class:`ExperimentBackendConfig` for the run

        Returns:
            an :class:`ExperimentResults`
        """
        raise NotImplementedError("subclass must implement _from_dict()")


class ManualExperimentBackendConfig(ExperimentBackendConfig):
    def __init__(self, label_fields, experiment_id, tracking_uri, **kwargs):
        super().__init__(label_fields, **kwargs)
        self.experiment_id = experiment_id
        self.tracking_uri = tracking_uri


class ManualExperimentBackend(ExperimentBackend):
    def construct_experiment(self, samples):
        return ExperimentResults(samples, self.config, backend=self)


class ManualExperimentResults(ExperimentResults):
    @classmethod
    def _from_dict(cls, d, samples, config):
        return cls(
            samples,
            config,
            **d,
        )
