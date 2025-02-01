"""
Model evaluation panel.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict, Counter
import os
import traceback

from bson import ObjectId
import numpy as np

from fiftyone import ViewField as F
import fiftyone.core.fields as fof
from fiftyone.operators.categories import Categories
from fiftyone.operators.panel import Panel, PanelConfig
from fiftyone.core.plots.plotly import _to_log_colorscale
import fiftyone.operators.types as types


STORE_NAME = "model_evaluation_panel_builtin"
STATUS_LABELS = {
    "needs_review": "needs review",
    "in_review": "in review",
    "reviewed": "reviewed",
}
EVALUATION_TYPES_WITH_CONFIDENCE = ["detection", "classification"]
EVALUATION_TYPES_WITH_IOU = ["detection"]
TRUTHY_VALUES = ["true", "True", "1", 1]
ENABLE_CACHING = (
    os.environ.get("FIFTYONE_DISABLE_EVALUATION_CACHING") not in TRUTHY_VALUES
)
CACHE_TTL = 30 * 24 * 60 * 60  # 30 days in seconds
SUPPORTED_EVALUATION_TYPES = ["classification", "detection", "segmentation"]


class EvaluationPanel(Panel):
    @property
    def config(self):
        return PanelConfig(
            name=STORE_NAME,
            label="Model Evaluation",
            icon="ssid_chart",
            category=Categories.ANALYZE,
            beta=True,
        )

    def get_dataset_id(self, ctx):
        return str(ctx.dataset._doc.id)

    def get_store(self, ctx):
        return ctx.store(STORE_NAME)

    def get_evaluation_id(self, dataset, eval_key):
        try:
            return str(dataset._doc.evaluations[eval_key].id)
        except Exception as e:
            return None

    def get_permissions(self, ctx):
        return {
            "can_evaluate": True,
            "can_edit_note": True,
            "can_edit_status": True,
        }

    def can_evaluate(self, ctx):
        return self.get_permissions(ctx).get("can_evaluate", False)

    def can_edit_note(self, ctx):
        return self.get_permissions(ctx).get("can_edit_note", False)

    def can_edit_status(self, ctx):
        return self.get_permissions(ctx).get("can_edit_status", False)

    def on_load(self, ctx):
        store = self.get_store(ctx)
        statuses = store.get("statuses") or {}
        notes = store.get("notes") or {}
        permissions = self.get_permissions(ctx)
        # To start, on load we populate the first menu with our current datasets evaluation keys
        view_state = ctx.panel.get_state("view") or {}
        evaluations = []
        for key in ctx.dataset.list_evaluations():
            if self.has_evaluation_results(ctx.dataset, key):
                evaluation = {
                    "key": key,
                    "id": self.get_evaluation_id(ctx.dataset, key),
                }
                evaluations.append(evaluation)
        ctx.panel.set_state("evaluations", evaluations)
        initialized = view_state.get("init", False)
        if not initialized:
            ctx.panel.set_state("view", {"page": "overview", "init": True})
        ctx.panel.set_data("statuses", statuses)
        ctx.panel.set_data("notes", notes)
        ctx.panel.set_data("permissions", permissions)
        self.load_pending_evaluations(ctx)

    def get_avg_confidence(self, per_class_metrics):
        count = 0
        total = 0
        for metrics in per_class_metrics.values():
            count += 1
            if "confidence" in metrics:
                total += metrics["confidence"]
        return total / count if count > 0 else None

    def get_tp_fp_fn(self, info, results):
        # Binary classification
        if (
            info.config.type == "classification"
            and info.config.method == "binary"
        ):
            neg_label, pos_label = results.classes
            tp_count = np.count_nonzero(
                (results.ytrue == pos_label) & (results.ypred == pos_label)
            )
            fp_count = np.count_nonzero(
                (results.ytrue != pos_label) & (results.ypred == pos_label)
            )
            fn_count = np.count_nonzero(
                (results.ytrue == pos_label) & (results.ypred != pos_label)
            )
            return tp_count, fp_count, fn_count

        # Object detection
        if info.config.type == "detection":
            tp_count = np.count_nonzero(results.ytrue == results.ypred)
            fp_count = np.count_nonzero(results.ytrue == results.missing)
            fn_count = np.count_nonzero(results.ypred == results.missing)
            return tp_count, fp_count, fn_count

        return None, None, None

    def get_map(self, results):
        try:
            return results.mAP()
        except Exception as e:
            return None

    def get_mar(self, results):
        try:
            return results.mAR()
        except Exception as e:
            return None

    def get_custom_metrics(self, results):
        try:
            return results.custom_metrics
        except Exception:
            return None

    def set_status(self, ctx):
        if not self.can_edit_status(ctx):
            ctx.ops.notify(
                "You do not have permission to update the status of this evaluation",
                variant="error",
            )
            return
        status = ctx.params.get("status", None)
        store = self.get_store(ctx)
        statuses = store.get("statuses") or {}
        view_state = ctx.panel.get_state("view") or {}
        eval_id = view_state.get("id")
        statuses[eval_id] = status
        store.set("statuses", statuses)
        ctx.panel.set_data("statuses", statuses)
        ctx.ops.notify(
            f"Status updated to {STATUS_LABELS[status]} successfully!",
            variant="success",
        )

    def set_note(self, ctx):
        if not self.can_edit_note(ctx):
            ctx.ops.notify(
                "You do not have permission to update the note of this evaluation",
                variant="error",
            )
            return
        note = ctx.params.get("note", None)
        store = self.get_store(ctx)
        notes = store.get("notes") or {}
        view_state = ctx.panel.get_state("view") or {}
        eval_id = view_state.get("id")
        notes[eval_id] = note
        store.set("notes", notes)
        ctx.panel.set_data("notes", notes)
        ctx.ops.notify(f"Note updated successfully!", variant="success")

    def load_evaluation_view(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        view = ctx.dataset.load_evaluation_view(computed_eval_key)
        ctx.ops.set_view(view)

    def compute_avg_confs(self, results):
        counts = defaultdict(int)
        sums = defaultdict(float)
        for yp, conf in zip(results.ypred, results.confs):
            counts[yp] += 1
            sums[yp] += conf if conf is not None else 0.0

        avg_confs = {}
        for c in results.classes:
            avg_confs[c] = sums[c] / counts[c] if counts[c] > 0 else 0.0

        return avg_confs

    def compute_avg_ious(self, results):
        counts = defaultdict(int)
        sums = defaultdict(float)
        for yp, conf in zip(results.ypred, results.ious):
            counts[yp] += 1
            sums[yp] += conf if conf is not None else 0.0

        avg_ious = {}
        for c in results.classes:
            avg_ious[c] = sums[c] / counts[c] if counts[c] > 0 else 0.0

        return avg_ious

    def get_per_class_metrics(self, info, results):
        evaluation_type = info.config.type
        avg_confs = (
            self.compute_avg_confs(results)
            if evaluation_type in EVALUATION_TYPES_WITH_CONFIDENCE
            else None
        )
        ious = (
            self.compute_avg_ious(results)
            if evaluation_type in EVALUATION_TYPES_WITH_IOU
            else None
        )
        report = results.report()
        per_class_metrics = {}
        for c in results.classes:
            c_report = report.get(c, {})
            per_class_metrics[c] = {}
            if avg_confs:
                per_class_metrics[c]["confidence"] = avg_confs[c]
            if ious:
                per_class_metrics[c]["iou"] = ious[c]
            if "precision" in c_report:
                per_class_metrics[c]["precision"] = c_report["precision"]
            if "recall" in c_report:
                per_class_metrics[c]["recall"] = c_report["recall"]
            if "f1-score" in c_report:
                per_class_metrics[c]["f1-score"] = c_report["f1-score"]
            if "support" in c_report:
                per_class_metrics[c]["support"] = c_report["support"]
        return per_class_metrics

    def get_confusion_matrix_colorscale(self, matrix):
        maxval = matrix.max()
        colorscale = _to_log_colorscale("oranges", maxval)
        return colorscale

    def get_confusion_matrices(self, results):
        default_classes = results.classes.tolist()
        freq = Counter(results.ytrue)
        if results.missing in freq:
            freq.pop(results.missing)
        az_classes = sorted(default_classes)
        za_classes = sorted(default_classes, reverse=True)
        mc_classes = sorted(freq, key=freq.get, reverse=True)
        lc_classes = sorted(freq, key=freq.get)
        default_matrix, _default_classes, _ = results._confusion_matrix(
            include_other=False,
            include_missing=True,
            tabulate_ids=False,
        )
        az_matrix, _az_classes, _ = results._confusion_matrix(
            classes=az_classes,
            include_other=False,
            include_missing=True,
            tabulate_ids=False,
        )
        za_matrix, _za_classes, _ = results._confusion_matrix(
            classes=za_classes,
            include_other=False,
            include_missing=True,
            tabulate_ids=False,
        )
        mc_matrix, _mc_classes, _ = results._confusion_matrix(
            classes=mc_classes,
            include_other=False,
            include_missing=True,
            tabulate_ids=False,
        )
        lc_matrix, _lc_classes, _ = results._confusion_matrix(
            classes=lc_classes,
            include_other=False,
            include_missing=True,
            tabulate_ids=False,
        )
        default_colorscale = self.get_confusion_matrix_colorscale(
            default_matrix
        )
        az_colorscale = self.get_confusion_matrix_colorscale(az_matrix)
        za_colorscale = self.get_confusion_matrix_colorscale(za_matrix)
        mc_colorscale = self.get_confusion_matrix_colorscale(mc_matrix)
        lc_colorscale = self.get_confusion_matrix_colorscale(lc_matrix)
        return {
            "default_classes": _default_classes,
            "az_classes": _az_classes,
            "za_classes": _za_classes,
            "mc_classes": _mc_classes,
            "lc_classes": _lc_classes,
            "default_matrix": default_matrix.tolist(),
            "az_matrix": az_matrix.tolist(),
            "za_matrix": za_matrix.tolist(),
            "mc_matrix": mc_matrix.tolist(),
            "lc_matrix": lc_matrix.tolist(),
            "default_colorscale": default_colorscale,
            "az_colorscale": az_colorscale,
            "za_colorscale": za_colorscale,
            "mc_colorscale": mc_colorscale,
            "lc_colorscale": lc_colorscale,
        }

    def get_correct_incorrect(self, results):
        correct = np.count_nonzero(results.ypred == results.ytrue)
        incorrect = np.count_nonzero(results.ypred != results.ytrue)
        return correct, incorrect

    def load_evaluation(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        eval_id = view_state.get("id")
        computed_eval_id = ctx.params.get("id", eval_id)
        store = self.get_store(ctx)
        evaluation_data = (
            store.get(computed_eval_id) if ENABLE_CACHING else None
        )
        if evaluation_data is None:
            info = ctx.dataset.get_evaluation_info(computed_eval_key)
            evaluation_type = info.config.type
            serialized_info = info.serialize()
            if evaluation_type not in SUPPORTED_EVALUATION_TYPES:
                ctx.panel.set_data(
                    f"evaluation_{computed_eval_key}_error",
                    {"error": "unsupported", "info": serialized_info},
                )
                return

            results = ctx.dataset.load_evaluation_results(computed_eval_key)
            gt_field = info.config.gt_field
            mask_targets = None

            if evaluation_type == "segmentation":
                mask_targets = _get_mask_targets(ctx.dataset, gt_field)
                _init_segmentation_results(ctx.dataset, results, gt_field)

            metrics = results.metrics()
            per_class_metrics = self.get_per_class_metrics(info, results)
            metrics["average_confidence"] = self.get_avg_confidence(
                per_class_metrics
            )
            metrics["tp"], metrics["fp"], metrics["fn"] = self.get_tp_fp_fn(
                info, results
            )
            metrics["mAP"] = self.get_map(results)
            metrics["mAR"] = self.get_mar(results)

            if (
                info.config.type == "classification"
                and info.config.method != "binary"
            ):
                (
                    metrics["num_correct"],
                    metrics["num_incorrect"],
                ) = self.get_correct_incorrect(results)

            evaluation_data = {
                "metrics": metrics,
                "custom_metrics": self.get_custom_metrics(results),
                "info": serialized_info,
                "confusion_matrices": self.get_confusion_matrices(results),
                "per_class_metrics": per_class_metrics,
                "mask_targets": mask_targets,
            }
            ctx.panel.set_state("missing", results.missing)

            if ENABLE_CACHING:
                # Cache the evaluation data
                try:
                    store.set(computed_eval_id, evaluation_data, ttl=CACHE_TTL)
                except Exception:
                    traceback.print_exc()

        ctx.panel.set_data(f"evaluation_{computed_eval_key}", evaluation_data)

    def on_change_view(self, ctx):
        # Used only for triggering re-renders when the view changes
        pass

    def has_evaluation_results(self, dataset, eval_key):
        try:
            return bool(dataset._doc.evaluations[eval_key].results)
        except Exception:
            return False

    def load_pending_evaluations(self, ctx, skip_update=False):
        pending_evaluations = []
        eval_keys = ctx.dataset.list_evaluations()
        store = self.get_store(ctx)
        dataset_id = self.get_dataset_id(ctx)
        pending_evaluations_in_store = store.get("pending_evaluations") or {}
        pending_evaluations_for_dataset_in_store = (
            pending_evaluations_in_store.get(dataset_id, [])
        )
        updated_pending_evaluations_for_dataset_in_stored = []
        update_store = False
        for pending in pending_evaluations_for_dataset_in_store:
            pending_eval_key = pending.get("eval_key")
            if pending_eval_key in eval_keys:
                update_store = True
            else:
                pending_evaluations.append(pending)
                updated_pending_evaluations_for_dataset_in_stored.append(
                    pending
                )
        for key in eval_keys:
            if not self.has_evaluation_results(ctx.dataset, key):
                pending_evaluations.append({"eval_key": key})
        if update_store:
            pending_evaluations_in_store[
                dataset_id
            ] = updated_pending_evaluations_for_dataset_in_stored
            store.set("pending_evaluations", pending_evaluations_in_store)
        ctx.panel.set_data("pending_evaluations", pending_evaluations)

    def on_evaluate_model_success(self, ctx):
        dataset_id = self.get_dataset_id(ctx)
        store = self.get_store(ctx)
        result = ctx.params.get("result", {})
        doc_id = result.get("id")
        delegated_eval_key = (
            result.get("context", {}).get("params", {}).get("eval_key")
        )
        eval_key = result.get("eval_key", delegated_eval_key)
        pending = {}
        if doc_id is None:
            pending["eval_key"] = eval_key
        else:
            pending["doc_id"] = str(doc_id)
            pending["eval_key"] = eval_key

        pending_evaluations = store.get("pending_evaluations") or {}
        if dataset_id not in pending_evaluations:
            pending_evaluations[dataset_id] = []
        pending_evaluations[dataset_id].append(pending)
        store.set("pending_evaluations", pending_evaluations)
        self.load_pending_evaluations(ctx)

    def on_evaluate_model(self, ctx):
        if not self.can_evaluate(ctx):
            ctx.ops.notify(
                "You do not have permission to evaluate models",
                variant="error",
            )
            return
        # Called when you click the "Evaluate Model" button
        ctx.prompt(
            "@voxel51/operators/evaluate_model_async",
            on_success=self.on_evaluate_model_success,
        )
        # ctx.panel.state.view = "eval"

    def load_view(self, ctx):
        view_type = ctx.params.get("type", None)

        if view_type == "clear":
            ctx.ops.clear_view()
            return

        view_state = ctx.panel.get_state("view") or {}
        view_options = ctx.params.get("options", {})

        eval_key = view_state.get("key")
        eval_key = view_options.get("key", eval_key)
        eval_view = ctx.dataset.load_evaluation_view(eval_key)
        info = ctx.dataset.get_evaluation_info(eval_key)
        pred_field = info.config.pred_field
        gt_field = info.config.gt_field

        eval_key2 = view_state.get("compareKey", None)
        pred_field2 = None
        gt_field2 = None
        if eval_key2:
            info2 = ctx.dataset.get_evaluation_info(eval_key2)
            pred_field2 = info2.config.pred_field
            if info2.config.gt_field != gt_field:
                gt_field2 = info2.config.gt_field

        x = view_options.get("x", None)
        y = view_options.get("y", None)
        field = view_options.get("field", None)
        missing = ctx.panel.get_state("missing", "(none)")

        view = None
        if info.config.type == "classification":
            if view_type == "class":
                # All GT/predictions of class `x`
                expr = F(f"{gt_field}.label") == x
                expr |= F(f"{pred_field}.label") == x
                if gt_field2 is not None:
                    expr |= F(f"{gt_field2}.label") == x
                if pred_field2 is not None:
                    expr |= F(f"{pred_field2}.label") == x
                view = eval_view.match(expr)
            elif view_type == "matrix":
                # Specific confusion matrix cell (including FP/FN)
                expr = F(f"{gt_field}.label") == y
                expr &= F(f"{pred_field}.label") == x
                view = eval_view.match(expr)
            elif view_type == "field":
                if info.config.method == "binary":
                    # All TP/FP/FN
                    expr = F(f"{eval_key}") == field.upper()
                    view = eval_view.match(expr)
                else:
                    # Correct/incorrect
                    expr = F(f"{eval_key}") == field
                    view = eval_view.match(expr)
        elif info.config.type == "detection":
            _, gt_root = ctx.dataset._get_label_field_path(gt_field)
            _, pred_root = ctx.dataset._get_label_field_path(pred_field)
            if gt_field2 is not None:
                _, gt_root2 = ctx.dataset._get_label_field_path(gt_field2)
            if pred_field2 is not None:
                _, pred_root2 = ctx.dataset._get_label_field_path(pred_field2)

            if view_type == "class":
                # All GT/predictions of class `x`
                view = eval_view.filter_labels(
                    gt_field, F("label") == x, only_matches=False
                )
                expr = F(gt_root).length() > 0
                view = view.filter_labels(
                    pred_field, F("label") == x, only_matches=False
                )
                expr |= F(pred_root).length() > 0
                if gt_field2 is not None:
                    view = view.filter_labels(
                        gt_field2, F("label") == x, only_matches=False
                    )
                    expr |= F(gt_root2).length() > 0
                if pred_field2 is not None:
                    view = view.filter_labels(
                        pred_field2, F("label") == x, only_matches=False
                    )
                    expr |= F(pred_root2).length() > 0
                view = view.match(expr)
            elif view_type == "matrix":
                if y == missing:
                    # False positives of class `x`
                    expr = (F("label") == x) & (F(eval_key) == "fp")
                    view = eval_view.filter_labels(
                        pred_field, expr, only_matches=True
                    )
                elif x == missing:
                    # False negatives of class `y`
                    expr = (F("label") == y) & (F(eval_key) == "fn")
                    view = eval_view.filter_labels(
                        gt_field, expr, only_matches=True
                    )
                else:
                    # All class `y` GT and class `x` predictions in same sample
                    view = eval_view.filter_labels(
                        gt_field, F("label") == y, only_matches=False
                    )
                    expr = F(gt_root).length() > 0
                    view = view.filter_labels(
                        pred_field, F("label") == x, only_matches=False
                    )
                    expr &= F(pred_root).length() > 0
                    view = view.match(expr)
            elif view_type == "field":
                if field == "tp":
                    # All true positives
                    view = eval_view.filter_labels(
                        gt_field, F(eval_key) == field, only_matches=False
                    )
                    view = view.filter_labels(
                        pred_field, F(eval_key) == field, only_matches=True
                    )
                elif field == "fn":
                    # All false negatives
                    view = eval_view.filter_labels(
                        gt_field, F(eval_key) == field, only_matches=True
                    )
                else:
                    # All false positives
                    view = eval_view.filter_labels(
                        pred_field, F(eval_key) == field, only_matches=True
                    )
        elif info.config.type == "segmentation":
            results = ctx.dataset.load_evaluation_results(eval_key)
            _init_segmentation_results(ctx.dataset, results, gt_field)
            if results.ytrue_ids is None or results.ypred_ids is None:
                # Legacy format segmentations
                return

            if eval_key2:
                if gt_field2 is None:
                    gt_field2 = gt_field

                results2 = ctx.dataset.load_evaluation_results(eval_key2)
                _init_segmentation_results(ctx.dataset, results2, gt_field2)
                if results2.ytrue_ids is None or results2.ypred_ids is None:
                    # Legacy format segmentations
                    return
            else:
                results2 = None

            _, gt_id = ctx.dataset._get_label_field_path(gt_field, "_id")
            _, pred_id = ctx.dataset._get_label_field_path(pred_field, "_id")
            if gt_field2 is not None:
                _, gt_id2 = ctx.dataset._get_label_field_path(gt_field2, "_id")
            if pred_field2 is not None:
                _, pred_id2 = ctx.dataset._get_label_field_path(
                    pred_field2, "_id"
                )

            if view_type == "class":
                # All GT/predictions that contain class `x`
                ytrue_ids, ypred_ids = _get_segmentation_class_ids(results, x)
                expr = F(gt_id).is_in(ytrue_ids)
                expr |= F(pred_id).is_in(ypred_ids)
                if results2 is not None:
                    ytrue_ids2, ypred_ids2 = _get_segmentation_class_ids(
                        results2, x
                    )
                    expr |= F(gt_id2).is_in(ytrue_ids2)
                    expr |= F(pred_id2).is_in(ypred_ids2)

                view = eval_view.match(expr)
            elif view_type == "matrix":
                # Specific confusion matrix cell
                ytrue_ids, ypred_ids = _get_segmentation_conf_mat_ids(
                    results, x, y
                )
                expr = F(gt_id).is_in(ytrue_ids)
                expr &= F(pred_id).is_in(ypred_ids)
                view = eval_view.match(expr)
            elif view_type == "field":
                if field == "tp":
                    # All true positives
                    ytrue_ids, ypred_ids = _get_segmentation_tp_fp_fn_ids(
                        results, field
                    )
                    expr = F(gt_id).is_in(ytrue_ids)
                    expr &= F(pred_id).is_in(ypred_ids)
                    view = eval_view.match(expr)
                elif field == "fn":
                    # All false negatives
                    ytrue_ids, _ = _get_segmentation_tp_fp_fn_ids(
                        results, field
                    )
                    expr = F(gt_id).is_in(ytrue_ids)
                    view = eval_view.match(expr)
                else:
                    # All false positives
                    _, ypred_ids = _get_segmentation_tp_fp_fn_ids(
                        results, field
                    )
                    expr = F(pred_id).is_in(ypred_ids)
                    view = eval_view.match(expr)

        if view is not None:
            ctx.ops.set_view(view)

    def render(self, ctx):
        panel = types.Object()
        return types.Property(
            panel,
            view=types.View(
                component="NativeModelEvaluationView",
                composite_view=True,
                on_change_view=self.on_change_view,
                on_evaluate_model=self.on_evaluate_model,
                load_evaluation=self.load_evaluation,
                load_evaluation_view=self.load_evaluation_view,
                set_status=self.set_status,
                set_note=self.set_note,
                load_view=self.load_view,
            ),
        )


def _get_mask_targets(dataset, gt_field):
    mask_targets = dataset.mask_targets.get(gt_field, None)
    if mask_targets:
        return mask_targets

    if dataset.default_mask_targets:
        return dataset.default_mask_targets

    return None


def _init_segmentation_results(dataset, results, gt_field):
    if results.ytrue_ids is None or results.ypred_ids is None:
        # Legacy format segmentations
        return

    if getattr(results, "_classes_map", None):
        # Already initialized
        return

    #
    # Ensure the dataset singleton is cached so that subsequent callbacks on
    # this panel will use the same `dataset` and hence `results`
    #

    import fiftyone.server.utils as fosu

    fosu.cache_dataset(dataset)

    #
    # `results.classes` and App callbacks could contain any of the
    # following:
    #  1. stringified pixel values
    #  2. RGB hex strings
    #  3. label strings
    #
    # so we must construct `classes_map` that can map any of these possible
    # values to integer indexes
    #
    classes_map = {c: i for i, c in enumerate(results.classes)}

    mask_targets = _get_mask_targets(dataset, gt_field)
    if mask_targets is not None:
        # `str()` handles cases 1 and 2, and `.get(c, c)` handles case 3
        mask_targets = {str(k): v for k, v in mask_targets.items()}
        classes = [mask_targets.get(c, c) for c in results.classes]
        classes_map.update({c: i for i, c in enumerate(classes)})

    #
    # Generate mapping from `(i, j)` to ID lists for use in App callbacks
    #

    ytrue_ids_dict = {}
    ypred_ids_dict = {}
    for ytrue, ypred, ytrue_id, ypred_id in zip(
        results.ytrue, results.ypred, results.ytrue_ids, results.ypred_ids
    ):
        i = classes_map[ytrue]
        j = classes_map[ypred]
        index = (i, j)

        if index not in ytrue_ids_dict:
            ytrue_ids_dict[index] = []
        ytrue_ids_dict[index].append(ytrue_id)

        if index not in ypred_ids_dict:
            ypred_ids_dict[index] = []
        ypred_ids_dict[index].append(ypred_id)

    results._classes_map = classes_map
    results._ytrue_ids_dict = ytrue_ids_dict
    results._ypred_ids_dict = ypred_ids_dict


def _get_segmentation_class_ids(results, x):
    k = results._classes_map[x]
    nrows, ncols = results.pixel_confusion_matrix.shape

    ytrue_ids = []
    for j in range(ncols):
        _ytrue_ids = results._ytrue_ids_dict.get((k, j), None)
        if _ytrue_ids is not None:
            ytrue_ids.extend(_ytrue_ids)

    ypred_ids = []
    for i in range(nrows):
        _ypred_ids = results._ypred_ids_dict.get((i, k), None)
        if _ypred_ids is not None:
            ypred_ids.extend(_ypred_ids)

    return _to_object_ids(ytrue_ids), _to_object_ids(ypred_ids)


def _get_segmentation_conf_mat_ids(results, x, y):
    i = results._classes_map[x]
    j = results._classes_map[y]
    ytrue_ids = _to_object_ids(results._ytrue_ids_dict.get((i, j), []))
    ypred_ids = _to_object_ids(results._ypred_ids_dict.get((i, j), []))
    return ytrue_ids, ypred_ids


def _get_segmentation_tp_fp_fn_ids(results, field):
    if field == "tp":
        # True positives
        inds = results.ytrue == results.ypred
        ytrue_ids = _to_object_ids(results.ytrue_ids[inds])
        ypred_ids = _to_object_ids(results.ypred_ids[inds])
        return ytrue_ids, ypred_ids
    elif field == "fn":
        # False negatives
        inds = results.ypred == results.missing
        ytrue_ids = _to_object_ids(results.ytrue_ids[inds])
        return ytrue_ids, None
    else:
        # False positives
        inds = results.ytrue == results.missing
        ypred_ids = _to_object_ids(results.ypred_ids[inds])
        return None, ypred_ids


def _to_object_ids(ids):
    return [ObjectId(_id) for _id in ids]
