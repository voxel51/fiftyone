"""
Training runs framework.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.runs import (
    BaseRun,
    BaseRunInfo,
    BaseRunConfig,
    BaseRunResults,
)
from fiftyone.core.odm import patch_training_runs


class TrainingInfo(BaseRunInfo):
    """Information about a training run that has been registered on a dataset.

    Args:
        key: the training key
        timestamp (None): the UTC ``datetime`` when the run was registered
        config (None): the :class:`TrainingMethodConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return TrainingMethodConfig


class TrainingMethodConfig(BaseRunConfig):
    """Configuration for a :class:`TrainingMethod`.

    All FO-relevant fields are explicit; ``train_config`` is opaque user
    metadata. View membership is persisted as frozen ID snapshots
    (``*_view_ids``); live views are exposed via the ``train_view`` /
    ``val_view`` / ``test_view`` properties when a dataset is bound.

    Args:
        train_key: the human-readable run identity / run key
        train_view_ids: list of sample IDs frozen at ``init`` time
        val_view_ids (None): list of sample IDs, or ``None``
        test_view_ids (None): list of sample IDs, or ``None``
        gt_field (None): ground-truth field name
        pred_field (None): predictions field name
        auto_eval (False): whether ``finish()`` runs evaluation
        project_url (None): external experiment-tracker URL
        train_config (None): opaque user metadata dict
        status ("declared"): run lifecycle status
        eval_key (None): linked evaluation key
        checkpoint_uri (None): primary checkpoint URI
        error (None): full traceback string if the run failed
        finished_at (None): UTC ``datetime`` when ``finish()`` ran
        do_id (None): delegated-operation id, if applicable
        **kwargs: any leftover keyword arguments
    """

    def __init__(
        self,
        train_key,
        train_view_ids,
        val_view_ids=None,
        test_view_ids=None,
        gt_field=None,
        pred_field=None,
        auto_eval=False,
        project_url=None,
        train_config=None,
        status="declared",
        eval_key=None,
        checkpoint_uri=None,
        error=None,
        finished_at=None,
        do_id=None,
        **kwargs,
    ):
        # Must equal the registered run key (BaseRunInfo.key); kept on the config for recorder convenience and the eval back-pointer.
        self.train_key = train_key
        self.train_view_ids = train_view_ids
        self.val_view_ids = val_view_ids
        self.test_view_ids = test_view_ids
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.auto_eval = auto_eval
        self.project_url = project_url
        self.train_config = train_config
        self.status = status
        self.eval_key = eval_key
        self.checkpoint_uri = checkpoint_uri
        self.error = error
        self.finished_at = finished_at
        self.do_id = do_id
        # Runtime-only dataset back-reference; the "_" prefix excludes it
        # from attributes()/serialize (see runs.py BaseRunConfig.attributes).
        # Injected by Dataset.init_training_run() and
        # SampleCollection.get_training_info().
        self._dataset = None
        super().__init__(**kwargs)

    @property
    def type(self):
        return "training"

    @property
    def method(self):
        return None

    # Live, frozen-membership views materialized from the persisted ID
    # snapshots. Return None if no dataset is bound or no snapshot exists.
    @property
    def train_view(self):
        if self._dataset is None or self.train_view_ids is None:
            return None
        return self._dataset.select(self.train_view_ids)

    @property
    def val_view(self):
        if self._dataset is None or self.val_view_ids is None:
            return None
        return self._dataset.select(self.val_view_ids)

    @property
    def test_view(self):
        if self._dataset is None or self.test_view_ids is None:
            return None
        return self._dataset.select(self.test_view_ids)


class TrainingMethod(BaseRun):
    """Base class for training-run methods.

    Args:
        config: a :class:`TrainingMethodConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return TrainingInfo

    @classmethod
    def _runs_field(cls):
        return "training_runs"

    @classmethod
    def _run_str(cls):
        return "training run"

    @classmethod
    def _results_cache_field(cls):
        return "_training_cache"

    @classmethod
    def _patch_function(cls):
        return patch_training_runs


class TrainingResults(BaseRunResults):
    """Live recorder + read handle for a training run.

    The recorder behavior (init/finish/evaluate/log_predictions/apply_model)
    is added in a later task; this is the framework stub.
    """

    pass
