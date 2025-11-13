"""
HRM2.0 3D Human Mesh Reconstruction Operator

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo as foz


class ApplyHRM2Model(foo.Operator):
    """Operator for applying HRM2.0 (4D-Humans) model to images."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name="apply_hrm2_model",
            label="Apply HRM2.0 3D Human Mesh Reconstruction",
            dynamic=True,
            icon="view_in_ar",
            description="Reconstruct 3D human body meshes from images using HRM2.0 (creates grouped dataset)",
        )

    def resolve_placement(self, ctx):
        return types.Placement(
            types.Places.SAMPLES_GRID_ACTIONS,
            types.Button(
                label="Apply HRM2.0 Model", icon="view_in_ar", prompt=True
            ),
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        # SMPL Model Path
        inputs.str(
            "smpl_model_path",
            required=True,
            label="SMPL Model Path",
            description=(
                "Path to SMPL_NEUTRAL.pkl file. Register at "
                "https://smpl.is.tue.mpg.de/ to obtain this file."
            ),
            view=types.FileView(),
        )

        # Output field name
        inputs.str(
            "output_field",
            default="human_pose",
            required=True,
            label="Output Field Base Name",
            description=(
                "Base name for label fields. Will create '{name}_2d' on image "
                "samples and '{name}_3d' on 3D scene samples"
            ),
        )

        # Checkpoint version
        version_choices = types.DropdownView()
        version_choices.add_choice("2.0b", label="2.0b (default)")
        version_choices.add_choice("2.0a", label="2.0a")
        version_choices.add_choice("1.0", label="1.0")

        inputs.str(
            "checkpoint_version",
            default="2.0b",
            required=False,
            label="Checkpoint Version",
            description="HRM2 checkpoint version to use",
            view=version_choices,
        )

        # Export meshes
        inputs.bool(
            "export_meshes",
            default=True,
            required=False,
            label="Export 3D Meshes",
            description="Whether to export 3D meshes as OBJ files and FiftyOne scenes",
        )

        # Mesh output directory
        if ctx.params.get("export_meshes", True):
            inputs.str(
                "mesh_output_dir",
                required=False,
                label="Mesh Output Directory",
                description=(
                    "Directory to save mesh files. If not specified, uses a "
                    "temporary directory."
                ),
                view=types.FileView(),
            )

        # Confidence threshold
        inputs.float(
            "confidence_thresh",
            default=0.5,
            required=False,
            label="Confidence Threshold",
            description="Confidence threshold for keypoint filtering",
            view=types.SliderView(min=0.0, max=1.0, step=0.05),
        )

        # Batch size
        inputs.int(
            "batch_size",
            default=1,
            required=False,
            label="Batch Size",
            description="Number of images to process in each batch",
            view=types.SliderView(min=1, max=32, step=1),
        )

        # Number of workers
        inputs.int(
            "num_workers",
            default=4,
            required=False,
            label="Number of Workers",
            description="Number of worker processes for data loading",
            view=types.SliderView(min=0, max=16, step=1),
        )

        # GPU device
        inputs.str(
            "device",
            default="cuda:0",
            required=False,
            label="Device",
            description="Device to use for inference (e.g., 'cuda:0', 'cuda:1', 'cpu')",
        )

        return types.Property(
            inputs,
            view=types.View(label="Apply HRM2.0 3D Human Mesh Reconstruction"),
        )

    def execute(self, ctx):
        """Execute the HRM2 model on the dataset."""
        # Get parameters
        smpl_model_path = ctx.params["smpl_model_path"]
        output_field = ctx.params.get("output_field", "human_pose")
        checkpoint_version = ctx.params.get("checkpoint_version", "2.0b")
        export_meshes = ctx.params.get("export_meshes", True)
        mesh_output_dir = ctx.params.get("mesh_output_dir", None)
        confidence_thresh = ctx.params.get("confidence_thresh", 0.5)
        batch_size = ctx.params.get("batch_size", 1)
        num_workers = ctx.params.get("num_workers", 4)
        device = ctx.params.get("device", "cuda:0")

        # Get the current view (must be the full dataset for grouped conversion)
        dataset = ctx.dataset

        # Load the HRM2 model
        ctx.log(f"Loading HRM2 model (version {checkpoint_version})...")

        try:
            model = foz.load_zoo_model(
                "hrm2-torch",
                smpl_model_path=smpl_model_path,
                checkpoint_version=checkpoint_version,
                export_meshes=export_meshes,
                mesh_output_dir=mesh_output_dir,
                confidence_thresh=confidence_thresh,
                device=device,
            )
        except Exception as e:
            ctx.log(f"Failed to load HRM2 model: {e}")
            return {"error": str(e)}

        # Apply the model to dataset
        ctx.log(f"Applying HRM2 model to {len(dataset)} samples...")

        try:
            dataset.apply_model(
                model,
                label_field=output_field,
                batch_size=batch_size,
                num_workers=num_workers,
            )

            ctx.log(f"Successfully applied HRM2 model.")
            ctx.log(
                f"Created field: '{output_field}' containing HumanPose3D labels"
            )
            ctx.log(
                "Each sample now has SMPL parameters, 3D keypoints, and optionally mesh data."
            )

            # Trigger a dataset refresh
            ctx.trigger("reload_dataset")

            return {
                "success": True,
                "message": (
                    f"HRM2 predictions saved in field '{output_field}'."
                ),
                "output_field": output_field,
                "num_samples": len(dataset),
            }

        except Exception as e:
            ctx.log(f"Failed to apply HRM2 model: {e}")
            import traceback

            ctx.log(traceback.format_exc())
            return {"error": str(e)}


class ViewHRM2Scene(foo.Operator):
    """Operator for viewing HRM2 3D scenes in the FiftyOne App."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name="view_hrm2_scene",
            label="View 3D Human Mesh",
            icon="3d_rotation",
            description="View the 3D human mesh in the FiftyOne App",
        )

    def resolve_placement(self, ctx):
        return types.Placement(
            types.Places.SAMPLES_VIEWER_ACTIONS,
            types.Button(
                label="View 3D Mesh",
                icon="3d_rotation",
            ),
        )

    def execute(self, ctx):
        """Open the 3D scene viewer for the selected sample."""
        sample_id = ctx.params.get("sample_id", None)
        field_name = ctx.params.get("field_name", "human_mesh_3d")

        if sample_id is None:
            return {"error": "No sample selected"}

        sample = ctx.dataset[sample_id]

        if not sample.has_field(field_name):
            return {"error": f"Sample does not have field '{field_name}'"}

        mesh_data = sample[field_name]

        if mesh_data is None or not hasattr(mesh_data, "scene_path"):
            return {"error": f"No 3D scene found in field '{field_name}'"}

        scene_path = mesh_data.scene_path

        if scene_path is None:
            return {"error": "No scene path available for this prediction"}

        # Open the 3D viewer
        ctx.log(f"Opening 3D scene from {scene_path}")

        return {
            "success": True,
            "scene_path": scene_path,
            "message": "3D scene viewer opened",
        }


def register(p):
    """Register the operators with FiftyOne."""
    p.register(ApplyHRM2Model)
    p.register(ViewHRM2Scene)
