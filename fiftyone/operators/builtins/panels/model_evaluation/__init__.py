import traceback

import fiftyone.operators.types as types

from fiftyone import ViewField as F
from collections import defaultdict
from fiftyone.operators.panel import Panel, PanelConfig
from fiftyone.operators.utils import is_new
from fiftyone.operators.categories import Categories

STORE_NAME = "model_evaluation_panel_builtin"
STATUS_LABELS = {
    "needs_review": "needs review",
    "in_review": "in review",
    "reviewed": "reviewed",
}
EVALUATION_TYPES_WITH_CONFIDENCE = ["detection", "classification"]
EVALUATION_TYPES_WITH_IOU = ["detection"]


class EvaluationPanel(Panel):
    @property
    def config(self):
        return PanelConfig(
            name="evaluation_panel",
            label="Evaluation Panel",
            icon="ssid_chart",
            category=Categories.ANALYZE,
            beta=True,
            is_new=is_new("2024-11-07"),
        )

    def get_dataset_id(self, ctx):
        return str(ctx.dataset._doc.id)

    def get_store(self, ctx):
        return ctx.create_store(STORE_NAME)

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
        # keys = ctx.dataset.list_evaluations()
        # ctx.panel.set_state("keys", keys)

    def get_avg_confidence(self, per_class_metrics):
        count = 0
        total = 0
        for metrics in per_class_metrics.values():
            count += 1
            if "confidence" in metrics:
                total += metrics["confidence"]
        return total / count if count > 0 else None

    def get_tp_fp_fn(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        key = view_state.get("key")
        dataset = ctx.dataset
        tp_key = f"{key}_tp"
        fp_key = f"{key}_fp"
        fn_key = f"{key}_fn"
        tp_total = (
            sum(ctx.dataset.values(tp_key))
            if dataset.has_field(tp_key)
            else None
        )
        fp_total = (
            sum(ctx.dataset.values(fp_key))
            if dataset.has_field(fp_key)
            else None
        )
        fn_total = (
            sum(ctx.dataset.values(fn_key))
            if dataset.has_field(fn_key)
            else None
        )
        return tp_total, fp_total, fn_total

    def get_map(self, results):
        try:
            return results.mAP()
        except Exception as e:
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

    def get_confusion_matrix(self, results):
        matrix = results.confusion_matrix()
        classes = results.classes
        return matrix, classes

    def load_evaluation(self, ctx):
        view_state = ctx.panel.get_state("view") or {}
        eval_key = view_state.get("key")
        computed_eval_key = ctx.params.get("key", eval_key)
        eval_id = view_state.get("id")
        computed_eval_id = ctx.params.get("id", eval_id)
        store = self.get_store(ctx)
        evaluation_data = store.get(computed_eval_id)
        if evaluation_data is None:
            info = ctx.dataset.get_evaluation_info(computed_eval_key)
            results = ctx.dataset.load_evaluation_results(computed_eval_key)
            metrics = results.metrics()
            per_class_metrics = self.get_per_class_metrics(info, results)
            metrics["average_confidence"] = self.get_avg_confidence(
                per_class_metrics
            )
            metrics["tp"], metrics["fp"], metrics["fn"] = self.get_tp_fp_fn(
                ctx
            )
            metrics["mAP"] = self.get_map(results)
            matrix, labels = self.get_confusion_matrix(results)
            evaluation_data = {
                "metrics": metrics,
                "info": info.serialize(),
                "confusion_matrix": {
                    "matrix": matrix.tolist(),
                    "labels": labels.tolist(),
                },
                "per_class_metrics": per_class_metrics,
            }
            # Cache the evaluation data
            try:
                store.set(computed_eval_id, evaluation_data)
            except Exception:
                traceback.print_exc()

        ctx.panel.set_data(f"evaluation_{computed_eval_key}", evaluation_data)

    def on_change_view(self, ctx):
        # Used only for triggering re-renders when the view changes
        pass

    def load_pending_evaluations(self, ctx, skip_update=False):
        store = self.get_store(ctx)
        dataset_id = self.get_dataset_id(ctx)
        pending_evaluations = store.get("pending_evaluations") or {}
        pending = pending_evaluations.get(dataset_id, [])
        if not skip_update:
            eval_keys = ctx.dataset.list_evaluations()
            updated_pending = []
            update = False
            for item in pending:
                pending_eval_key = item.get("eval_key")
                if pending_eval_key in eval_keys:
                    update = True
                else:
                    updated_pending.append(item)
            if update:
                pending_evaluations[dataset_id] = updated_pending
                store.set("pending_evaluations", pending_evaluations)
                pending = updated_pending
        ctx.panel.set_data("pending_evaluations", pending)

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
        self.load_pending_evaluations(ctx, True)

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
        eval_key = view_state.get("key")
        info = ctx.dataset.get_evaluation_info(eval_key)
        pred_field = info.config.pred_field
        gt_field = info.config.gt_field
        view_options = ctx.params.get("options", {})
        x = view_options.get("x", None)
        y = view_options.get("y", None)
        field = view_options.get("field", None)
        computed_eval_key = view_options.get("key", eval_key)
        view = None
        if view_type == "class":
            view = ctx.dataset.filter_labels(pred_field, F("label") == x)
        elif view_type == "matrix":
            view = ctx.dataset.filter_labels(
                gt_field, F("label") == y
            ).filter_labels(pred_field, F("label") == x)
        elif view_type == "field":
            view = ctx.dataset.filter_labels(
                pred_field, F(computed_eval_key) == field
            )

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
