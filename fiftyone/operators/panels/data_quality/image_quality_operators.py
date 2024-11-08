import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types
from .duplication_operators import compute_filehashes

from .ctx_inp import _execution_mode, _handle_patch_inputs
from .image_operations import (
    compute_sample_brightness,
    compute_patch_brightness,
    compute_sample_exposure,
    compute_patch_exposure,
    compute_sample_aspect_ratio,
    compute_patch_aspect_ratio,
    compute_sample_entropy,
    compute_patch_entropy,
    compute_sample_blurriness,
    compute_patch_blurriness,
)

ISSUE_TYPES = [
    "brightness",
    "blurriness",
    "aspect_ratio",
    "entropy",
    "duplicates",
]

PROP_SAMPLE_COMPUTE_FUNCTIONS = {
    "brightness": compute_sample_brightness,
    "exposure": compute_sample_exposure,
    "aspect_ratio": compute_sample_aspect_ratio,
    "entropy": compute_sample_entropy,
    "blurriness": compute_sample_blurriness,
}


PROP_PATCH_COMPUTE_FUNCTIONS = {
    "brightness": compute_patch_brightness,
    "exposure": compute_patch_exposure,
    "aspect_ratio": compute_patch_aspect_ratio,
    "entropy": compute_patch_entropy,
    "blurriness": compute_patch_blurriness,
}


def compute_dataset_property(property, dataset, view=None, patches_field=None):
    if view is None:
        view = dataset
    if patches_field is None:
        dataset.add_sample_field(property, fo.FloatField)
        for sample in view.iter_samples(autosave=True, progress=True):
            if sample is None:
                continue
            prop_value = PROP_SAMPLE_COMPUTE_FUNCTIONS[property](sample)
            if property == "exposure":
                sample["min_exposure"] = prop_value[0]
                sample["max_exposure"] = prop_value[1]
            else:
                sample[property] = prop_value
    else:
        for sample in view.iter_samples(autosave=True, progress=True):
            if sample[patches_field] is None:
                continue
            for detection in sample[patches_field].detections:
                prop_value = PROP_PATCH_COMPUTE_FUNCTIONS[property](
                    sample, detection
                )
                if property == "exposure":
                    detection["min_exposure"] = prop_value[0]
                    detection["max_exposure"] = prop_value[1]
                else:
                    detection[property] = prop_value
        dataset.add_dynamic_sample_fields()


def _handle_inputs(ctx, property_name):
    inputs = types.Object()
    label = "compute " + property_name.replace("_", " ")
    inputs.message(label, label=label)
    _execution_mode(ctx, inputs)
    inputs.view_target(ctx)
    _handle_patch_inputs(ctx, inputs)
    return types.Property(inputs)


def _handle_execution(ctx, property_name):
    view = ctx.target_view()
    patches_field = ctx.params.get("patches_field", None)
    compute_dataset_property(
        property_name, ctx.dataset, view=view, patches_field=patches_field
    )
    # update the flag that computation has been done
    print("Computation done for ", property_name)
    # TODO: triggers to screen update to analysis view
    ctx.ops.reload_dataset()


def _handle_calling(
    uri, sample_collection, patches_field=None, delegate=False
):
    ctx = dict(view=sample_collection.view())
    params = dict(
        target="CURRENT_VIEW",
        patches_field=patches_field,
        delegate=delegate,
    )
    return foo.execute_operator(uri, ctx, params=params)


# TODO: For all of these operators, check if the field exists before adding it.
# Ask the user if they want to recompute for all samples or just those w/o the
# field populated
class ComputeBrightness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_brightness",
            label="Data Quality Panel Brightness",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "brightness")

    def execute(self, ctx):
        _handle_execution(ctx, "brightness")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeEntropy(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_entropy",
            label="Data Quality Panel Entropy",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "entropy")

    def execute(self, ctx):
        _handle_execution(ctx, "entropy")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeAspectRatio(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_aspect_ratio",
            label="Data Quality Panel Aspect Ratio",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "aspect_ratio")

    def execute(self, ctx):
        _handle_execution(ctx, "aspect_ratio")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeExposure(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_exposure",
            label="Data Quality Panel Exposure",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "exposure")

    def execute(self, ctx):
        _handle_execution(ctx, "exposure")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeBlurriness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_blurriness",
            label="Data Quality Panel Blur",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "blurriness")

    def execute(self, ctx):
        _handle_execution(ctx, "blurriness")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeAllIssues(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_all_issues",
            label="Data Quality Panel All Issues",
            dynamic=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()

        # Check which issues have already been computed
        present_issues = []
        not_present_issues = []
        for issue in ISSUE_TYPES:
            if not ctx.dataset.has_sample_field(issue):
                not_present_issues.append(issue)
            else:
                present_issues.append(issue)

        # Ask if user wants to recompute all or just those w/o the field
        radio_group = types.RadioGroup(
            label="Data Quality Issues",
            description="Select which issues to compute",
            caption="Issues already computed: " + ", ".join(present_issues),
        )
        radio_group.add_choice(
            "all", label="All", description="Recompute all issues"
        )
        radio_group.add_choice(
            "not_present",
            label="Not Present",
            description="Recompute only issues not already computed",
        )
        inputs.enum("compute", radio_group.values(), view=radio_group)

        _execution_mode(ctx, inputs)
        inputs.view_target(ctx)
        _handle_patch_inputs(ctx, inputs)
        return types.Property(inputs)

    def execute(self, ctx):
        if ctx.params["compute"] == "all":
            _handle_execution(ctx, "blurriness")
            _handle_execution(ctx, "exposure")
            _handle_execution(ctx, "aspect_ratio")
            _handle_execution(ctx, "entropy")
            _handle_execution(ctx, "brightness")
        else:
            for issue in ISSUE_TYPES:
                if not (ctx.dataset.has_sample_field(issue)):
                    _handle_execution(ctx, issue)
                    if issue == "duplicates":
                        # assume if someone runs "Execute All" then they consent
                        # to use our preferred defaults
                        continue

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )
