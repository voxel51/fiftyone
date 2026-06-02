"""
Training runs framework.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import copy

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
    """Live recorder + read handle for a training run."""

    # --- read-only convenience properties (expose self.config.XXX) ---
    @property
    def status(self):
        return self.config.status

    @property
    def train_key(self):
        return self.config.train_key

    @property
    def eval_key(self):
        return self.config.eval_key

    @property
    def checkpoint_uri(self):
        return self.config.checkpoint_uri

    @checkpoint_uri.setter
    def checkpoint_uri(self, value):
        if self.config.status in ("completed", "failed"):
            raise RuntimeError("cannot set checkpoint_uri after finish()")
        self.config.checkpoint_uri = value
        self.save_config()

    @property
    def project_url(self):
        return self.config.project_url

    @property
    def auto_eval(self):
        return self.config.auto_eval

    @property
    def train_config(self):
        return copy.deepcopy(self.config.train_config)

    # --- live views (RD7): delegate to the _dataset-backed config props ---
    @property
    def train_view(self):
        return self.config.train_view

    @property
    def val_view(self):
        return self.config.val_view

    @property
    def test_view(self):
        return self.config.test_view

    @property
    def eval_results(self):
        key = self.config.eval_key
        return self.samples.load_evaluation_results(key) if key else None

    @property
    def eval_view(self):
        key = self.config.eval_key
        return self.samples.load_evaluation_view(key) if key else None

    # --- internals ---
    def _all_view_ids(self):
        """Union of ALL provided view snapshots (train + val + test), dedup
        preserving order. Train is eligible for evaluation."""
        ids = list(self.config.train_view_ids or [])
        ids += list(self.config.val_view_ids or [])
        ids += list(self.config.test_view_ids or [])
        return list(dict.fromkeys(ids))

    def _data_driven_view(self):
        """The union of all provided snapshots restricted to samples that
        actually have predictions in pred_field."""
        return self.samples.select(self._all_view_ids()).exists(
            self.config.pred_field
        )

    def evaluate(self, samples=None, eval_key=None, **eval_kwargs):
        """Run a single FO evaluation and link it back to this run.

        ``samples`` given -> evaluate exactly that view (manual path).
        ``samples=None`` -> data-driven: the union of all provided
        snapshots restricted to populated predictions (train included iff
        populated). ``eval_key`` defaults to ``train_key``. Evaluated
        samples are recoverable via ``dataset.load_evaluation_view(eval_key)``.
        """
        import fiftyone.utils.training as fout

        if self.config.gt_field is None or self.config.pred_field is None:
            raise ValueError(
                "gt_field and pred_field are required to evaluate a "
                "training run"
            )

        view = samples if samples is not None else self._data_driven_view()
        kind = fout.resolve_eval_kind(view, self.config.gt_field)
        eval_key = eval_key or self.config.train_key
        results = fout._EVAL_DISPATCH[kind](
            view,
            self.config.pred_field,
            gt_field=self.config.gt_field,
            eval_key=eval_key,
            # back-pointer: a future eval-module refactor MUST preserve this
            # train_key attribute on the produced EvaluationConfig.
            train_key=self.config.train_key,
            **eval_kwargs,
        )
        self.config.eval_key = eval_key
        self.save_config()
        return results

    def finish(self, checkpoint_uri=None, eval_kwargs=None):
        """Finalize: optionally set checkpoint, run data-driven eval if
        auto_eval and not already evaluated and predictions exist, stamp
        status=completed.

        Each split's evaluate_* persists its results before we touch
        status, so a completed eval survives. On eval failure, mark failed,
        store the full (never-truncated) traceback, persist, and re-raise.
        """
        from datetime import datetime, timezone

        if checkpoint_uri is not None:
            self.config.checkpoint_uri = checkpoint_uri

        results = None
        if (
            self.config.auto_eval
            and self.config.eval_key is None
            and self._data_driven_view().count() > 0
        ):
            try:
                results = self.evaluate(samples=None, **(eval_kwargs or {}))
            except Exception:
                import traceback

                self.config.status = "failed"
                self.config.error = traceback.format_exc()
                self.config.finished_at = datetime.now(timezone.utc)
                self.save_config()
                raise

        self.config.status = "completed"
        self.config.finished_at = datetime.now(timezone.utc)
        self.save_config()
        return results

    def log_predictions(self, predictions, metrics=None):
        """Write a batch of predictions (dict[sample_id, fo.Label]) to
        ``pred_field``, last-write-wins per sample. ``metrics`` is an
        optional dict[sample_id, dict[metric_key, value]] stored as
        top-level fields ``<train_key>_<metric_key>``."""
        if self.config.status in ("completed", "failed"):
            raise RuntimeError("log_predictions() cannot be called after finish()")

        if self.config.pred_field is None:
            raise ValueError("pred_field must be set to log predictions")

        # predictions may target any provided view (train/val/test)
        allowed = set(self._all_view_ids())
        bad = next((sid for sid in predictions if sid not in allowed), None)
        if bad is not None:
            raise ValueError(
                f"sample_id {bad!r} is not in any provided view "
                "(train/val/test)"
            )

        self.samples.set_values(
            self.config.pred_field, dict(predictions), key_field="id"
        )

        if metrics:
            # top-level <train_key>_<metric_key> fields (train_key is already
            # a valid identifier; no slugging). Invert {sid: {mk: v}} ->
            # per metric_key {sid: v}.
            metric_keys = {mk for d in metrics.values() for mk in d}
            for mk in metric_keys:
                field = f"{self.config.train_key}_{mk}"
                values = {
                    sid: d[mk] for sid, d in metrics.items() if mk in d
                }
                self.samples.set_values(field, values, key_field="id")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        from datetime import datetime, timezone

        if exc_type is None:
            # Only finalize if not already finalized (the user may have
            # called finish() manually inside the with-block).
            if self.config.status not in ("completed", "failed"):
                self.finish()
            return False

        import traceback

        self.config.status = "failed"
        self.config.error = "".join(
            traceback.format_exception(exc_type, exc_val, exc_tb)
        )
        self.config.finished_at = datetime.now(timezone.utc)
        try:
            self.save_config()
        except Exception:
            # Intentionally broad: a persistence failure here must not
            # replace the user's original exception that __exit__ re-raises.
            import logging

            logging.getLogger(__name__).exception(
                "failed to persist failed-run status for %r", self.train_key
            )
        return False  # re-raise
