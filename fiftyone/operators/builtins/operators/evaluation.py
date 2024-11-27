"""
Evaluation operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types


class EvaluateModel(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="evaluate_model",
            label="Evaluate model",
            dynamic=True,
            unlisted=True,
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        evaluate_model(ctx, inputs)

        view = types.View(label="Evaluate model")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        kwargs = ctx.params.copy()
        target = kwargs.pop("target", None)
        pred_field = kwargs.pop("pred_field")
        gt_field = kwargs.pop("gt_field")
        eval_key = kwargs.pop("eval_key")
        method = kwargs.pop("method")

        target_view = _get_target_view(ctx, target)
        _, eval_type, _ = _get_evaluation_type(target_view, pred_field)

        _get_evaluation_method(eval_type, method).parse_parameters(ctx, kwargs)

        # Remove None values
        kwargs = {k: v for k, v in kwargs.items() if v is not None}

        if eval_type == "regression":
            eval_fcn = target_view.evaluate_regressions
        elif eval_type == "classification":
            eval_fcn = target_view.evaluate_classifications
        elif eval_type == "detection":
            eval_fcn = target_view.evaluate_detections
        elif eval_type == "segmentation":
            eval_fcn = target_view.evaluate_segmentations

        eval_fcn(
            pred_field,
            gt_field=gt_field,
            eval_key=eval_key,
            method=method,
            **kwargs,
        )

        ctx.trigger("reload_dataset")


class EvaluateModelAsync(foo.Operator):
    def __init__(self, _builtin=False):
        super().__init__(_builtin=_builtin)
        self.em = EvaluateModel()

    @property
    def config(self):
        return foo.OperatorConfig(
            name="evaluate_model_async",
            label="Evaluate model async",
            dynamic=True,
            unlisted=True,
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return self.em.resolve_input(ctx)

    def execute(self, ctx):
        eval_key = ctx.params.get("eval_key", None)

        if ctx.delegated:
            return self.em.execute(ctx)

        ctx.trigger("@voxel51/operators/evaluate_model", params=ctx.params)
        return {"eval_key": eval_key}


def evaluate_model(ctx, inputs):
    target_view = get_target_view(ctx, inputs)

    label_fields = _get_label_fields(
        target_view,
        (
            fo.Regression,
            fo.Classification,
            fo.Detections,
            fo.Polylines,
            fo.Keypoints,
            fo.TemporalDetections,
            fo.Segmentation,
        ),
    )

    if not label_fields:
        warning = types.Warning(
            label="This dataset has no suitable label fields",
            description="https://docs.voxel51.com/user_guide/evaluation.html",
        )
        prop = inputs.view("warning", warning)
        prop.invalid = True

        return False

    label_field_choices = types.DropdownView()
    for field_name in sorted(label_fields):
        label_field_choices.add_choice(field_name, label=field_name)

    inputs.enum(
        "pred_field",
        label_field_choices.values(),
        required=True,
        label="Predictions field",
        description="The field containing model predictions",
        view=label_field_choices,
    )

    pred_field = ctx.params.get("pred_field", None)
    if pred_field is None:
        return False

    label_type, eval_type, methods = _get_evaluation_type(
        target_view, pred_field
    )

    gt_fields = set(
        target_view.get_field_schema(embedded_doc_type=label_type).keys()
    )
    gt_fields.discard(pred_field)

    if not gt_fields:
        warning = types.Warning(
            label="This dataset has no suitable ground truth fields",
            description="https://docs.voxel51.com/user_guide/evaluation.html",
        )
        prop = inputs.view("warning", warning)
        prop.invalid = True

        return False

    gt_field_choices = types.DropdownView()
    for field_name in sorted(gt_fields):
        gt_field_choices.add_choice(field_name, label=field_name)

    inputs.enum(
        "gt_field",
        gt_field_choices.values(),
        required=True,
        label="Ground truth field",
        description="The field containing ground truth annotations",
        view=gt_field_choices,
    )

    gt_field = ctx.params.get("gt_field", None)
    if gt_field is None:
        return False

    eval_key = get_new_eval_key(ctx, inputs)
    if not eval_key:
        return False

    method_choices = types.DropdownView()
    for method in methods:
        method_choices.add_choice(method, label=method)

    inputs.enum(
        "method",
        method_choices.values(),
        default=methods[0],
        required=True,
        label="Evaluation method",
        description="The evaluation method to use",
        view=method_choices,
    )

    method = ctx.params.get("method", None)

    _get_evaluation_method(eval_type, method).get_parameters(ctx, inputs)

    return True


def _get_label_fields(sample_collection, label_types):
    schema = sample_collection.get_field_schema(embedded_doc_type=label_types)
    return list(schema.keys())


def _get_evaluation_type(view, pred_field):
    label_type = view._get_label_field_type(pred_field)
    eval_type = None
    methods = [None]

    if issubclass(label_type, fo.Regression):
        eval_type = "regression"
        methods = ["simple"]

    if issubclass(label_type, (fo.Classification, fo.Classifications)):
        eval_type = "classification"
        methods = ["simple", "top-k", "binary"]

    if issubclass(label_type, (fo.Detections, fo.Polylines, fo.Keypoints)):
        eval_type = "detection"
        methods = ["coco", "open-images"]

    if issubclass(label_type, fo.TemporalDetections):
        eval_type = "detection"
        methods = ["activitynet"]

    if issubclass(label_type, fo.Segmentation):
        eval_type = "segmentation"
        methods = ["simple"]

    return label_type, eval_type, methods


def _get_evaluation_method(eval_type, method):
    if eval_type == "regression":
        if method == "simple":
            return SimpleRegression(eval_type, method)

        return Regression(eval_type, method)

    if eval_type == "classification":
        if method == "simple":
            return SimpleClassification(eval_type, method)

        if method == "top-k":
            return TopKClassification(eval_type, method)

        if method == "binary":
            return BinaryClassification(eval_type, method)

        return Classification(eval_type, method)

    if eval_type == "detection":
        if method == "coco":
            return COCODetection(eval_type, method)

        if method == "open-images":
            return OpenImagesDetection(eval_type, method)

        if method == "activitynet":
            return ActivityNetDetection(eval_type, method)

        return Detection(eval_type, method)

    if eval_type == "segmentation":
        if method == "simple":
            return SimpleSegmentation(eval_type, method)

        return Segmentation(eval_type, method)

    return EvaluationMethod(eval_type, method)


class EvaluationMethod(object):
    def __init__(self, eval_type, method):
        self.eval_type = eval_type
        self.method = method

    def get_parameters(self, ctx, inputs):
        pass

    def parse_parameters(self, ctx, params):
        pass


class Regression(EvaluationMethod):
    def get_parameters(self, ctx, inputs):
        inputs.float(
            "missing",
            label="Missing",
            description=(
                "A missing value. Any None-valued regressions are given this "
                "value for results purposes"
            ),
        )


class SimpleRegression(Regression):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Simple regression evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#simple-evaluation-default",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        metric_choices = types.DropdownView()
        metric_choices.add_choice("squared_error", label="squared error")
        metric_choices.add_choice("absolute_error", label="absolute error")

        inputs.enum(
            "metric",
            metric_choices.values(),
            required=True,
            label="Metric",
            description=(
                "The error metric to use to populate sample/frame-level error "
                "data"
            ),
            view=metric_choices,
        )


class Classification(EvaluationMethod):
    def get_parameters(self, ctx, inputs):
        _get_classes(ctx, inputs)

        inputs.float(
            "missing",
            label="Missing",
            description=(
                "A missing label string. Any None-valued labels are given "
                "this label for results purposes"
            ),
        )

    def parse_parameters(self, ctx, params):
        classes = params.pop("classes", None)
        if classes is not None:
            params["classes"] = _parse_classes(ctx, classes)


class SimpleClassification(Classification):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Simple classification evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#id4",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)


class TopKClassification(Classification):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Top-k classification evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#top-k-evaluation",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        inputs.int(
            "k",
            label="k",
            description="The top-k value to use when assessing accuracy",
        )


class BinaryClassification(Classification):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Binary classification evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#binary-evaluation",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)


class Detection(EvaluationMethod):
    def get_parameters(self, ctx, inputs):
        _get_classes(ctx, inputs)

        pred_field = ctx.params["pred_field"]
        label_type, _, _ = _get_evaluation_type(ctx.dataset, pred_field)

        inputs.float(
            "missing",
            label="Missing",
            description=(
                "A missing label string. Any unmatched objects are given this "
                "label for results purposes"
            ),
        )

        inputs.float(
            "iou",
            default=0.5,
            required=True,
            label="IOU",
            description=(
                "The intersection-over-union (IoU) threshold to use to "
                "determine matches"
            ),
        )

        if issubclass(label_type, fo.Detections):
            inputs.bool(
                "use_masks",
                default=False,
                label="Use masks",
                description=(
                    "Whether to compute IoUs using the instances masks of the "
                    "provided objects"
                ),
            )

        if issubclass(label_type, fo.Polylines):
            inputs.bool(
                "use_boxes",
                default=False,
                label="Use boxes",
                description=(
                    "Whether to compute IoUs using the bounding boxes of the "
                    "provided polylines rather than their actual geometries"
                ),
            )

        inputs.bool(
            "classwise",
            default=True,
            label="Classwise",
            description=(
                "Whether to only match objects with the same class label "
                "(True) or allow matches between classes (False)"
            ),
        )

        inputs.bool(
            "dynamic",
            default=True,
            label="Dynamic",
            description=(
                "Whether to declare the dynamic object-level attributes that "
                "are populated on the dataset's schema"
            ),
        )

    def parse_parameters(self, ctx, params):
        classes = params.pop("classes", None)
        if classes is not None:
            params["classes"] = _parse_classes(ctx, classes)


class COCODetection(Detection):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="COCO-style evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#coco-style-evaluation-default-spatial",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        _get_iscrowd(ctx, inputs)

        inputs.bool(
            "compute_mAP",
            default=False,
            label="Compute mAP",
            description=(
                "Whether to perform the necessary computations so that mAP "
                "and PR curves can be generated"
            ),
        )

        compute_mAP = ctx.params.get("compute_mAP", False)

        if compute_mAP:
            inputs.str(
                "iou_threshs",
                label="IoU thresholds",
                description=(
                    "A comma-separated list of IoU thresholds to use when "
                    "computing mAP"
                ),
            )

            inputs.int(
                "max_preds",
                label="Maximum predictions",
                description=(
                    "A maximum number of predicted objects to evaluate when "
                    "computing mAP and PR curves"
                ),
            )

        _get_instance_mask_parameters(ctx, inputs)

    def parse_parameters(self, ctx, params):
        super().parse_parameters(ctx, params)

        iou_threshs = params.pop("iou_threshs", None)
        if iou_threshs is not None:
            params["iou_threshs"] = [float(t) for t in iou_threshs.split(",")]


class OpenImagesDetection(Detection):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Open Images-style evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#open-images-style-evaluation",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        _get_iscrowd(ctx, inputs)

        inputs.int(
            "max_preds",
            label="Maximum predictions",
            description=(
                "A maximum number of predicted objects to evaluate when "
                "computing mAP and PR curves"
            ),
        )

        _get_instance_mask_parameters(ctx, inputs)

        target_view = get_target_view(ctx, inputs)
        label_fields = _get_label_fields(target_view, fo.Classifications)

        if not label_fields:
            return

        label_field_choices = types.DropdownView()
        for field_name in sorted(label_fields):
            label_field_choices.add_choice(field_name, label=field_name)

        inputs.enum(
            "pos_label_field",
            label_field_choices.values(),
            label="Positive label field",
            description=(
                "A field containing image-level classifications that specify "
                "which classes should be evaluated in the image"
            ),
            view=label_field_choices,
        )

        inputs.enum(
            "neg_label_field",
            label_field_choices.values(),
            label="Negative label field",
            description=(
                "A field containing image-level classifications that specify "
                "which classes should not be evaluated in the image"
            ),
            view=label_field_choices,
        )

    def parse_parameters(self, ctx, params):
        super().parse_parameters(ctx, params)

        iou_threshs = params.pop("iou_threshs", None)
        if iou_threshs is not None:
            params["iou_threshs"] = [float(t) for t in iou_threshs.split(",")]


class ActivityNetDetection(Detection):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="ActivityNet-style evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#activitynet-style-evaluation-default-temporal",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        inputs.bool(
            "compute_mAP",
            default=False,
            label="Compute mAP",
            description=(
                "Whether to perform the necessary computations so that mAP "
                "and PR curves can be generated"
            ),
        )

        compute_mAP = ctx.params.get("compute_mAP", False)

        if compute_mAP:
            inputs.str(
                "iou_threshs",
                label="IoU thresholds",
                description=(
                    "A comma-separated list of IoU thresholds to use when "
                    "computing mAP"
                ),
            )

    def parse_parameters(self, ctx, params):
        super().parse_parameters(ctx, params)

        iou_threshs = params.pop("iou_threshs", None)
        if iou_threshs is not None:
            params["iou_threshs"] = [float(t) for t in iou_threshs.split(",")]


def _get_iscrowd(ctx, inputs, default=None):
    target = ctx.params.get("target", None)
    target_view = _get_target_view(ctx, target)

    gt_field = ctx.params["gt_field"]
    root, _ = target_view._get_label_field_root(gt_field)

    field = target_view.get_field(root, leaf=True)
    schema = field.get_field_schema(
        ftype=(fo.BooleanField, fo.IntField, fo.FloatField)
    )

    crowd_attrs = sorted(
        k for k, v in schema.items() if k not in ("confidence", "index")
    )

    if crowd_attrs:
        crowd_attr_choices = types.AutocompleteView()
        for crowd_attr in crowd_attrs:
            crowd_attr_choices.add_choice(crowd_attr, label=crowd_attr)
    else:
        crowd_attr_choices = None

    inputs.str(
        "iscrowd",
        default=default,
        label="Crowd attribute",
        description="The name of the crowd attribute (if any)",
        view=crowd_attr_choices,
    )


def _get_instance_mask_parameters(ctx, inputs):
    inputs.int(
        "tolerance",
        label="Tolerance",
        description=(
            "A tolerance, in pixels, when generating approximate "
            "polylines for instance masks. Typical values are 1-3 pixels"
        ),
    )

    error_level_choices = types.DropdownView()
    error_level_choices.add_choice(
        0,
        label="0: Raise geometric errors that are encountered",
    )
    error_level_choices.add_choice(
        1,
        label="1: Log warnings if geometric errors are encountered",
    )
    error_level_choices.add_choice(
        2,
        label="2: Ignore geometric errors",
    )

    inputs.enum(
        "error_level",
        error_level_choices.values(),
        default=1,
        label="Error level",
        description=(
            "The error level to use when manipulating instance masks or "
            "polylines. If error level is > 0, any calculation that "
            "raises a geometric error will default to an IoU of 0"
        ),
        view=error_level_choices,
    )


class Segmentation(EvaluationMethod):
    def get_parameters(self, ctx, inputs):
        _get_mask_targets(ctx, inputs)

    def parse_parameters(self, ctx, params):
        mask_targets = params.pop("mask_targets", None)
        if mask_targets is not None:
            params["mask_targets"] = _parse_mask_targets(ctx, mask_targets)


class SimpleSegmentation(Segmentation):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "parameters",
            types.Header(
                label="Simple segmentation evaluation",
                description="https://docs.voxel51.com/user_guide/evaluation.html#id17",
                divider=True,
            ),
        )

        super().get_parameters(ctx, inputs)

        inputs.int(
            "bandwidth",
            label="Bandwidth",
            description=(
                "An optional bandwidth along the contours of the ground truth "
                "masks to which to restrict attention when computing "
                "accuracies. A typical value for this parameter is 5 pixels. "
                "By default, the entire masks are evaluated"
            ),
        )

        average_choices = types.DropdownView()
        average_choices.add_choice(
            "micro",
            label="micro",
            description=(
                "Calculate metrics globally by considering each element of "
                "the label indicator matrix as a label"
            ),
        )
        average_choices.add_choice(
            "macro",
            label="macro",
            description=(
                "Calculate metrics for each label, and find their unweighted "
                "mean. This does not take label imbalance into account"
            ),
        )
        average_choices.add_choice(
            "weighted",
            label="weighted",
            description=(
                "Calculate metrics for each label, and find their average, "
                "weighted by support (the number of true instances for each "
                "label"
            ),
        )
        average_choices.add_choice(
            "samples",
            label="samples",
            description=(
                "Calculate metrics for each instance, and find their average"
            ),
        )

        inputs.enum(
            "average",
            average_choices.values(),
            required=True,
            label="Average",
            description=(
                "The averaging strategy to use when populating precision and "
                "recall numbers on each sample"
            ),
            view=average_choices,
        )


def _get_classes(ctx, inputs):
    dataset = ctx.dataset
    gt_field = ctx.params["gt_field"]
    pred_field = ctx.params["pred_field"]

    classes_choices = types.DropdownView()
    if dataset.default_classes:
        classes_choices.add_choice("default", label="default classes")

    if gt_field in dataset.classes:
        classes_choices.add_choice("gt", label=f"{gt_field} classes")

    if pred_field in dataset.classes:
        classes_choices.add_choice("pred", label=f"{pred_field} classes")

    if classes_choices:
        inputs.enum(
            "classes",
            classes_choices.values(),
            label="Classes",
            description=(
                "If you have class list(s) stored on your dataset, you can "
                "select one to use below. If not provided, the observed "
                "ground truth/predicted labels are used"
            ),
            view=classes_choices,
        )


def _parse_classes(ctx, classes):
    if classes == "default":
        return ctx.dataset.default_classes

    if classes == "gt":
        gt_field = ctx.params["gt_field"]
        return ctx.dataset.classes[gt_field]

    if classes == "pred":
        pred_field = ctx.params["pred_field"]
        return ctx.dataset.classes[pred_field]

    return None


def _get_mask_targets(ctx, inputs):
    dataset = ctx.dataset
    gt_field = ctx.params["gt_field"]
    pred_field = ctx.params["pred_field"]

    mask_targets_choices = types.DropdownView()
    if dataset.default_classes:
        mask_targets_choices.add_choice("default", label="default classes")

    if gt_field in dataset.classes:
        mask_targets_choices.add_choice("gt", label=f"{gt_field} classes")

    if pred_field in dataset.classes:
        mask_targets_choices.add_choice("pred", label=f"{pred_field} classes")

    if mask_targets_choices:
        inputs.enum(
            "mask_targets",
            mask_targets_choices.values(),
            label="Mask targets",
            description=(
                "If you have mask target(s) stored on your dataset, you can "
                "select one to use below. If not provided, the observed "
                "ground truth/predicted labels are used"
            ),
            view=mask_targets_choices,
        )


def _parse_mask_targets(ctx, mask_targets):
    if mask_targets == "default":
        return ctx.dataset.default_mask_targets

    if mask_targets == "gt":
        gt_field = ctx.params["gt_field"]
        return ctx.dataset.mask_targets[gt_field]

    if mask_targets == "pred":
        pred_field = ctx.params["pred_field"]
        return ctx.dataset.mask_targets[pred_field]

    return None


def get_target_view(ctx, inputs):
    has_view = ctx.view != ctx.dataset.view()
    has_selected = bool(ctx.selected)
    default_target = None

    if has_view or has_selected:
        target_choices = types.RadioGroup(orientation="horizontal")
        target_choices.add_choice(
            "DATASET",
            label="Entire dataset",
            description="Process the entire dataset",
        )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Process the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Process only the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            required=True,
            label="Target view",
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)

    return _get_target_view(ctx, target)


def _get_target_view(ctx, target):
    if target == "SELECTED_SAMPLES":
        return ctx.view.select(ctx.selected)

    if target == "DATASET":
        return ctx.dataset

    return ctx.view


def get_new_eval_key(
    ctx,
    inputs,
    name="eval_key",
    label="Evaluation key",
    description="Provide an evaluation key for this run",
):
    prop = inputs.str(
        name,
        required=True,
        label=label,
        description=description,
    )

    eval_key = ctx.params.get(name, None)
    if eval_key is not None and eval_key in ctx.dataset.list_evaluations():
        prop.invalid = True
        prop.error_message = "Evaluation key already exists"
        eval_key = None

    return eval_key
