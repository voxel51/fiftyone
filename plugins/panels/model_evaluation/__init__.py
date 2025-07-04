"""
Model evaluation panel.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import fiftyone.utils.eval as foue
import numpy as np
import fiftyone.operators.types as types
import fiftyone.core.view as fov

from collections import defaultdict, Counter
from bson import ObjectId
from fiftyone import ViewField as F
from fiftyone.core.plots.plotly import _to_log_colorscale
from fiftyone.operators.categories import Categories
from fiftyone.operators.panel import Panel, PanelConfig
from fiftyone.operators.cache import execution_cache
from plugins.utils.model_evaluation import (
    get_dataset_id,
    get_store,
    get_scenarios,
    get_subsets_from_custom_code,
    set_scenarios,
)


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
CACHE_VERSION = "v1.0.0"
SUPPORTED_EVALUATION_TYPES = ["classification", "detection", "segmentation"]


class EvaluationPanel(Panel):
    @property
    def config(self):
        return PanelConfig(
            name=STORE_NAME,
            label="Model Evaluation",
            icon="ssid_chart",
            category=Categories.ANALYZE,
        )

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
            "can_delete_evaluation": True,
            "can_rename": True,
            "can_create_scenario": True,
            "can_edit_scenario": True,
            "can_delete_scenario": True,
        }

    def can_evaluate(self, ctx):
        return self.get_permissions(ctx).get("can_evaluate", False)

    def can_edit_note(self, ctx):
        return self.get_permissions(ctx).get("can_edit_note", False)

    def can_edit_status(self, ctx):
        return self.get_permissions(ctx).get("can_edit_status", False)

    def can_delete_evaluation(self, ctx):
        return self.get_permissions(ctx).get("can_delete_evaluation", False)

    def can_rename(self, ctx):
        return self.get_permissions(ctx).get("can_rename", False)

    def can_delete_scenario(self, ctx):
        return self.get_permissions(ctx).get("can_delete_scenario", False)

    def can_edit_scenario(self, ctx):
        return self.get_permissions(ctx).get("can__scenario", False)

    def on_load(self, ctx):
        store = get_store(ctx)
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
                    "type": ctx.dataset.get_evaluation_info(key).config.type,
                    "method": ctx.dataset.get_evaluation_info(
                        key
                    ).config.method,
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

    def get_confidences(self, per_class_metrics):
        confidences = []
        for metrics in per_class_metrics.values():
            if "confidence" in metrics:
                confidences.append(metrics["confidence"])
        return confidences

    def get_avg_confidence(self, confidences):
        count = len(confidences)
        total = sum(confidences)
        return total / count if count > 0 else None

    def get_confidence_distribution(self, confidences):
        return {
            "avg": self.get_avg_confidence(confidences),
            "min": min(confidences),
            "max": max(confidences),
            "median": np.median(confidences),
            "std": np.std(confidences),
        }

    def get_avg_iou(self, per_class_metrics):
        count = 0
        total = 0
        for metrics in per_class_metrics.values():
            count += 1
            if "iou" in metrics:
                total += metrics["iou"]
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
        store = get_store(ctx)
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
        store = get_store(ctx)
        notes = store.get("notes") or {}
        view_state = ctx.panel.get_state("view") or {}
        eval_id = view_state.get("id")
        notes[eval_id] = note
        store.set("notes", notes)
        ctx.panel.set_data("notes", notes)
        ctx.ops.notify(f"Note updated successfully!", variant="success")

    def rename_evaluation(self, ctx):
        if not self.can_rename(ctx):
            ctx.ops.notify(
                "You do not have permission to rename this evaluation",
                variant="error",
            )
            return
        old_name = ctx.params.get("old_name", None)
        new_name = ctx.params.get("new_name", None)
        try:
            ctx.dataset.rename_evaluation(old_name, new_name)
            view_state = ctx.panel.get_state("view") or {}
            eval_id = view_state.get("id")
            store = get_store(ctx)
            evaluation_data = store.get(eval_id)
            if evaluation_data:
                evaluation_data["info"]["name"] = new_name
                evaluation_data["info"]["key"] = new_name
                store.set(eval_id, evaluation_data, ttl=CACHE_TTL)
            ctx.ops.notify(
                f"Renamed evaluation '{old_name}' to '{new_name}' successfully!",
                variant="success",
            )
        except Exception as e:
            ctx.ops.notify(
                f"Failed to rename evaluation '{old_name}' to '{new_name}'",
                variant="error",
            )

    def delete_evaluation(self, ctx):
        if not self.can_delete_evaluation(ctx):
            ctx.ops.notify(
                "You do not have permission to delete evaluations",
                variant="error",
            )
            return

        # use eval_id to delete the execution store
        eval_id = ctx.params.get("eval_id", None)
        # use eval_key to delete the evaluation from dataset
        eval_key = ctx.params.get("eval_key", None)

        try:
            ctx.dataset.delete_evaluation(eval_key)
            store = get_store(ctx)
            store.delete(eval_id)
            ctx.ops.notify(
                "Evaluation deleted successfully!",
                variant="success",
            )
        except Exception as e:
            ctx.ops.notify(
                f"Failed to delete evaluation successfully",
                variant="error",
            )

    def load_evaluation_view(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        view = ctx.dataset.load_evaluation_view(computed_eval_key)
        if isinstance(view, fov.DatasetView):
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

    def get_confusion_matrix_colorscale(self, matrix, colorscale_name=None):
        maxval = matrix.max()
        colorscale = _to_log_colorscale(colorscale_name or "oranges", maxval)
        return colorscale

    def get_confusion_matrices(self, results, colorscale_name=None):
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
            default_matrix, colorscale_name
        )
        az_colorscale = self.get_confusion_matrix_colorscale(
            az_matrix, colorscale_name
        )
        za_colorscale = self.get_confusion_matrix_colorscale(
            za_matrix, colorscale_name
        )
        mc_colorscale = self.get_confusion_matrix_colorscale(
            mc_matrix, colorscale_name
        )
        lc_colorscale = self.get_confusion_matrix_colorscale(
            lc_matrix, colorscale_name
        )
        default_colorscale_blues = self.get_confusion_matrix_colorscale(
            default_matrix, "blues"
        )
        az_colorscale_blues = self.get_confusion_matrix_colorscale(
            az_matrix, "blues"
        )
        za_colorscale_blues = self.get_confusion_matrix_colorscale(
            za_matrix, "blues"
        )
        mc_colorscale_blues = self.get_confusion_matrix_colorscale(
            mc_matrix, "blues"
        )
        lc_colorscale_blues = self.get_confusion_matrix_colorscale(
            lc_matrix, "blues"
        )

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
            "default_colorscale_blues": default_colorscale_blues,
            "az_colorscale_blues": az_colorscale_blues,
            "za_colorscale_blues": za_colorscale_blues,
            "mc_colorscale_blues": mc_colorscale_blues,
            "lc_colorscale_blues": lc_colorscale_blues,
        }

    def get_correct_incorrect(self, results):
        correct = np.count_nonzero(results.ypred == results.ytrue)
        incorrect = np.count_nonzero(results.ypred != results.ytrue)
        return correct, incorrect

    def get_scenario(self, ctx, scenario_id):
        scenarios = get_scenarios(ctx)
        return scenarios.get(scenario_id)

    def load_scenarios(self, ctx):
        scenarios = get_scenarios(ctx)
        ctx.panel.set_data(f"scenarios", scenarios)

    def get_evaluation_data(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
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
        confidences = self.get_confidences(per_class_metrics)
        metrics["average_confidence"] = self.get_avg_confidence(confidences)
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

        return {
            "metrics": metrics,
            "custom_metrics": self.get_custom_metrics(results),
            "info": serialized_info,
            "confusion_matrices": self.get_confusion_matrices(results),
            "per_class_metrics": per_class_metrics,
            "mask_targets": mask_targets,
            "missing": results.missing,
        }

    def get_evaluation_data_cache_key_fn(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_id = view_state.get("id")
        computed_eval_id = ctx.params.get("id", eval_id)
        return [computed_eval_id, CACHE_VERSION]

    @execution_cache(
        store_name=STORE_NAME,
        key_fn=get_evaluation_data_cache_key_fn,
        ttl=CACHE_TTL,
    )
    def get_evaluation_data_cacheable(self, ctx):
        return self.get_evaluation_data(ctx)

    def load_evaluation(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        evaluation_data = (
            self.get_evaluation_data_cacheable(ctx)
            if ENABLE_CACHING
            else self.get_evaluation_data(ctx)
        )
        # Skip caching scenarios as they are updated frequently
        self.load_scenarios(ctx)
        ctx.panel.set_state("missing", evaluation_data["missing"])
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
        store = get_store(ctx)
        dataset_id = get_dataset_id(ctx)
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
            conf = ctx.dataset.get_evaluation_info(key).config
            if not self.has_evaluation_results(ctx.dataset, key):
                pending_evaluations.append(
                    {
                        "eval_key": key,
                        "type": conf.type,
                        "method": conf.method,
                    }
                )
        if update_store:
            pending_evaluations_in_store[
                dataset_id
            ] = updated_pending_evaluations_for_dataset_in_stored
            store.set("pending_evaluations", pending_evaluations_in_store)
        ctx.panel.set_data("pending_evaluations", pending_evaluations)

    def on_evaluate_model_success(self, ctx):
        dataset_id = get_dataset_id(ctx)
        store = get_store(ctx)
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

        # Restrict to subset, if applicable
        subset_def = view_options.get("subset_def", None)
        subset_def_type = subset_def.get("type", None) if subset_def else None

        if subset_def_type == "custom_code":
            code = subset_def.get("code", None)
            subset = subset_def.get("subset", None)
            subsets, error = get_subsets_from_custom_code(ctx, code)

            subset_def = subsets.get(subset, None)

            if error:
                return ctx.ops.notify(
                    f"Failed to load custom code subsets: {error}",
                    variant="error",
                )

        if subset_def is not None:
            eval_view = foue.get_subset_view(eval_view, gt_field, subset_def)

        view = None

        if view_type == "subset":
            view = eval_view
        elif info.config.type == "classification":
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

    def load_compare_evaluation_results(self, ctx):
        base_model_key = (
            ctx.params.get("panel_state", {}).get("view", {}).get("key", None)
        )
        compare_model_key = (
            ctx.params.get("panel_state", {})
            .get("view", {})
            .get("compareKey", None)
        )

        if base_model_key is None:
            raise ValueError("No base model key provided")

        eval_a_results = ctx.dataset.load_evaluation_results(base_model_key)
        eval_b_results = ctx.dataset.load_evaluation_results(compare_model_key)

        return (
            base_model_key,
            eval_a_results,
            compare_model_key,
            eval_b_results,
        )

    def get_subset_def_data(self, info, results, subset_def, is_compare):
        with results.use_subset(subset_def):
            metrics = results.metrics()
            per_class_metrics = self.get_per_class_metrics(info, results)
            confidences = self.get_confidences(per_class_metrics)
            metrics["average_confidence"] = self.get_avg_confidence(
                confidences
            )
            metrics["tp"], metrics["fp"], metrics["fn"] = self.get_tp_fp_fn(
                info, results
            )
            metrics["mAP"] = self.get_map(results)
            metrics["mAR"] = self.get_mar(results)
            metrics["iou"] = self.get_avg_iou(per_class_metrics)
            return {
                "metrics": metrics,
                "distribution": len(results.ytrue_ids),
                "confusion_matrices": self.get_confusion_matrices(results),
                "confidences": confidences,
                "confidence_distribution": self.get_confidence_distribution(
                    confidences
                ),
            }

    def get_scenario_data(self, ctx, scenario):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        results = ctx.dataset.load_evaluation_results(computed_eval_key)
        info = ctx.dataset.get_evaluation_info(computed_eval_key)
        scenario_type = scenario.get("type", None)
        scenario_data = scenario.copy()
        scenario_data["subsets_data"] = {}
        # todo@im: need more explicit flag
        is_compare = True if "key" in ctx.params else False

        if scenario_type == "custom_code":
            custom_code = scenario.get("subsets", None)
            cc_expr, cc_error = get_subsets_from_custom_code(ctx, custom_code)
            subsets_names = []

            if cc_error:
                # TODO
                print("TODO: custom code load error handling")
            else:
                # NOTE: subset expression could be a dict or an array
                if isinstance(cc_expr, dict):
                    for subset_name, subset_def in cc_expr.items():
                        subset_data = self.get_subset_def_data(
                            info, results, subset_def, is_compare
                        )
                        scenario_data["subsets_data"][
                            subset_name
                        ] = subset_data
                        subsets_names.append(subset_name)
                elif isinstance(cc_expr, list):
                    subset_data = self.get_subset_def_data(
                        info, results, subset_def, is_compare
                    )
                    scenario_data["subsets_data"]["All"] = subset_data
                    subsets_names.append("All")
                else:
                    scenario_data["subsets_data"]["All"] = subset_data
                    subsets_names.append("All")
            scenario_data["subsets"] = subsets_names
            # NOTE: Mani added this - we need the original custom code for Edit flow
            scenario_data["subsets_code"] = custom_code
        elif scenario_type == "view":
            scenario_subsets = scenario.get("subsets", [])
            for subset in scenario_subsets:
                subset_def = dict(type="view", view=subset)
                subset_data = self.get_subset_def_data(
                    info, results, subset_def, is_compare
                )
                scenario_data["subsets_data"][subset] = subset_data
        elif scenario_type == "sample_field":
            scenario_subsets = scenario.get("subsets", [])
            field_name = scenario.get("field", None)
            for subset in scenario_subsets:
                subset_def = dict(type="field", field=field_name, value=subset)
                subset_data = self.get_subset_def_data(
                    info, results, subset_def, is_compare
                )
                scenario_data["subsets_data"][subset] = subset_data
        elif scenario_type == "label_attribute":
            field = scenario.get("field", None)
            # todo@mani: need to tweak this depending on how it's stored. Line below
            # converts "ground_truth.detections.label" to "label"
            scenario_subsets = scenario.get("subsets", [])
            field_last_part = field.split(".")[-1]
            for subset in scenario_subsets:
                subset_def = dict(
                    type="attribute", field=field_last_part, value=subset
                )
                subset_data = self.get_subset_def_data(
                    info, results, subset_def, is_compare
                )
                scenario_data["subsets_data"][subset] = subset_data
        else:
            scenario_data["subsets_data"] = None  # unsupported type

        return scenario_data

    def get_subset_def_data_for_eval_key(self, ctx, scenario):
        """
        Builds and returns an execution cache key for each type of scenario.
        """
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)

        scenario_type = scenario.get("type", "")
        scenario_field = scenario.get("field", "")
        scenario_subsets = scenario.get("subsets", "")

        if scenario_type in ["label_attribute", "sample_field"]:
            return [
                "subset-data",
                computed_eval_key,
                scenario_type,
                scenario_field,
                scenario_subsets,
                CACHE_VERSION,
            ]

        return [
            "subset-data",
            computed_eval_key,
            scenario_type,
            scenario_subsets,
            CACHE_VERSION,
        ]

    @execution_cache(key_fn=get_subset_def_data_for_eval_key)
    def get_scenario_data_cacheable(self, ctx, scenario):
        return self.get_scenario_data(ctx, scenario)

    def validate_scenario_subsets(self, ctx, scenario):
        """
        Validates the subsets in a scenario and compiles basic changes.
        1. For view scenarios, check if the views exist in the dataset.
        2. For sample_field and label_attribute scenarios, check if the field exists in the dataset.
            - If the field is tags, check if the tags exist.

        returns the validated scenario and a list of changes.
        If the scenario is not valid, it will return an empty list of subsets.
        If the scenario is valid, it will return the original scenario with the validated subsets.
        """
        scenario_type = scenario.get("type", None)
        changes = []

        if scenario_type == "view":
            subset_views = scenario.get("subsets", [])
            dataset_views = ctx.dataset.list_saved_views()
            available_subsets = [v for v in subset_views if v in dataset_views]
            unavailable_subsets = [
                v for v in subset_views if v not in dataset_views
            ]

            if unavailable_subsets:
                unavailable = "\n- ".join(unavailable_subsets)
                changes.append(
                    {
                        "label": f"The following views are not available anymore. To continue your analysis, you can edit this scenario.",
                        "description": f"- {unavailable}",
                    }
                )

            scenario["subsets"] = available_subsets
        elif scenario_type in ["sample_field", "label_attribute"]:
            scenario_field = scenario.get("field", None)
            dataset_field_paths = ctx.dataset.get_field_schema(
                flat=True
            ).keys()

            # if the exact field does not exist, set subsets to empty
            if not scenario_field or scenario_field not in dataset_field_paths:
                changes.append(
                    {
                        "label": f"The following field does not exists. To continue your analysis, you can edit this scenario.",
                        "description": f"{scenario_field}",
                    }
                )
                scenario["subsets"] = []

            # if field exists, it is tags, but tag doesn't exist
            if scenario_field and scenario_field == "tags":
                all_tags = ctx.dataset.distinct("tags")
                tags = scenario.get("subsets", [])
                available_tags = [t for t in tags if t in all_tags]
                missing_tags = list(set(tags) - set(available_tags))

                if missing_tags:
                    the_tags = "\n- ".join(missing_tags)
                    changes.append(
                        {
                            "label": f"The following tags do not exists. To continue your analysis, you can edit this scenario.",
                            "description": f"- {the_tags}",
                        }
                    )
                    if len(available_tags) == 0:
                        scenario["subsets"] = []

        return scenario, changes

    def load_scenario(self, ctx):
        """
        Tries to load the scenario given its id and evaluation key
        If it fails, it shows an error page with options to edit/delete.
        """
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        scenario_id = str(ctx.params.get("id", "") or "")

        try:
            if scenario_id:
                scenario = self.get_scenario(ctx, scenario_id)
                validated_scenario, changes = self.validate_scenario_subsets(
                    ctx, scenario
                )

                if changes:
                    # can't load the scenario at all
                    if not validated_scenario.get("subsets"):
                        raise ValueError("Failed to load scenario")

                    # can load the scenario - but it might need an edit
                    ctx.panel.set_state(
                        f"scenario_{scenario_id}_changes",
                        {
                            "scenario": scenario,
                            "changes": changes,
                            "id": scenario_id,
                        },
                    )
                else:
                    ctx.panel.set_state(
                        f"scenario_{scenario_id}_changes",
                        None,
                    )

                # refresh clicked
                should_refresh_cache = ctx.params.get("refresh_cache", False)
                if should_refresh_cache:
                    self.get_scenario_data_cacheable.clear_cache(
                        self, ctx, validated_scenario
                    )

                scenario_data = (
                    self.get_scenario_data_cacheable(ctx, validated_scenario)
                    if ENABLE_CACHING
                    else self.get_scenario_data(ctx, validated_scenario)
                )

                ctx.panel.set_state("scenario_load_error", None)
                ctx.panel.set_data(
                    f"scenario_{scenario_id}_{computed_eval_key}",
                    scenario_data,
                )
                ctx.panel.set_state("scenario_loading", False)
        except Exception as e:
            print("error", e)
            ctx.panel.set_state("scenario_loading", False)
            msg = f"We couldn't load this scenario because the underlying data has changed or been removed. To continue your analysis you can,"
            ctx.panel.set_state(
                "scenario_load_error",
                {
                    "code": "scenario_load_error",
                    "error": msg,
                    "id": scenario_id,
                },
            )

    def delete_scenario(self, ctx):
        if not self.can_delete_scenario(ctx):
            return ctx.ops.notify(
                "You do not have permission to delete scenarios",
                variant="error",
            )
        scenario_id = ctx.params.get("id", None)
        scenarios = get_scenarios(ctx)
        scenarios.pop(scenario_id, None)
        set_scenarios(ctx, scenarios)
        ctx.ops.notify(f"Scenario deleted successfully!", variant="success")

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
                rename_evaluation=self.rename_evaluation,
                delete_evaluation=self.delete_evaluation,
                load_scenarios=self.load_scenarios,
                load_scenario=self.load_scenario,
                delete_scenario=self.delete_scenario,
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
