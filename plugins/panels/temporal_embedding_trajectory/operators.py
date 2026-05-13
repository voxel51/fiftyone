"""
Compute operator for the temporal embedding trajectory panel.

Computes per-frame embeddings + UMAP projection via
``fiftyone.brain.compute_visualization``, then for each video scene
computes consecutive-frame cosine distances in the raw embedding space
and persists them as a frame-level field.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

import fiftyone.operators as foo
import fiftyone.operators.types as types

logger = logging.getLogger(__name__)


_DEFAULT_BRAIN_KEY = "temporal_trajectory"

_MODEL_CHOICES = [
    ("clip-vit-base32-torch", "CLIP ViT-B/32 (semantic)"),
    ("dinov2-vitb14-torch", "DINOv2 ViT-B/14 (visual)"),
]


class ComputeTrajectoryEmbeddings(foo.Operator):
    """Compute embeddings + UMAP + per-scene frame jump distances."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_trajectory_embeddings",
            label="Compute temporal embedding trajectory",
            description=(
                "Compute per-frame embeddings, UMAP projection, and "
                "consecutive-frame cosine distances for trajectory "
                "visualization."
            ),
            dynamic=True,
            allow_immediate_execution=True,
            allow_delegated_execution=True,
            default_choice_to_delegated=True,
            icon="timeline",
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        model_choices = types.Choices()
        for value, label in _MODEL_CHOICES:
            model_choices.add_choice(value, label=label)
        inputs.enum(
            "model",
            model_choices.values(),
            view=model_choices,
            label="Embedding model",
            default=_MODEL_CHOICES[0][0],
            required=True,
        )

        inputs.str(
            "brain_key",
            label="Brain key",
            default=_DEFAULT_BRAIN_KEY,
            description=(
                "Brain key under which the UMAP visualization is "
                "stored. The jump-distance field is stored as "
                "``<brain_key>_jump_dist`` on each frame."
            ),
            required=True,
        )

        inputs.int(
            "batch_size",
            label="Embedding batch size",
            default=32,
            required=False,
        )

        return types.Property(
            inputs,
            view=types.View(label="Compute trajectory embeddings"),
        )

    def execute(self, ctx):
        import fiftyone.brain as fob

        dataset = ctx.dataset
        if dataset is None:
            return {"ok": False, "error": "No dataset"}

        model = ctx.params["model"]
        brain_key = ctx.params.get("brain_key") or _DEFAULT_BRAIN_KEY
        batch_size = ctx.params.get("batch_size") or 32

        # Frame-level view. For nuScenes-style video datasets this
        # exposes per-frame samples that compute_visualization can embed.
        frames = dataset.to_frames(sample_frames=True)

        # Compute embeddings once and pass them to compute_visualization,
        # so we can also use them for the raw cosine-distance step.
        # NB: compute_embeddings returns a numpy array aligned with the
        # frames view ordering.
        embeddings = frames.compute_embeddings(
            model=model,
            batch_size=batch_size,
            progress=True,
        )

        fob.compute_visualization(
            frames,
            embeddings=embeddings,
            method="umap",
            brain_key=brain_key,
            num_dims=2,
        )

        # Now compute consecutive-frame cosine distances within each
        # parent video. Frames view returns parallel arrays we can pull
        # via .values(); ordering follows the underlying frame order
        # (frame_number within each sample, samples in dataset order).
        sample_ids, frame_numbers, frame_ids = frames.values(
            ["sample_id", "frame_number", "id"]
        )

        # Group indices by parent sample (video), preserving order.
        groups = {}
        for i, sid in enumerate(sample_ids):
            groups.setdefault(str(sid), []).append(i)

        jump_field = f"{brain_key}_jump_dist"
        # Per-sample lists: list[ list[(frame_id, dist)] ] mirroring
        # _set_frame_values input shape.
        sample_id_order = []
        per_sample_frame_ids = []
        per_sample_values = []

        for sid, idxs in groups.items():
            # Sort by frame number to ensure correct sequence.
            idxs.sort(key=lambda i: frame_numbers[i] or 0)
            embs = np.asarray([embeddings[i] for i in idxs], dtype=np.float32)
            # Cosine distance between consecutive frames.
            if len(embs) == 0:
                dists = []
            else:
                norms = np.linalg.norm(embs, axis=1)
                norms = np.where(norms == 0, 1.0, norms)
                normed = embs / norms[:, None]
                if len(normed) >= 2:
                    cos_sims = np.sum(normed[1:] * normed[:-1], axis=1)
                    dists = (1.0 - cos_sims).tolist()
                else:
                    dists = []
                dists = [0.0] + dists  # first frame has no predecessor

            sample_id_order.append(sid)
            per_sample_frame_ids.append([frame_ids[i] for i in idxs])
            per_sample_values.append(dists)

        # Ensure the field exists on the dataset before writing.
        if not dataset.has_frame_field(jump_field):
            import fiftyone.core.fields as fof

            dataset.add_frame_field(jump_field, fof.FloatField)

        # Batch-write frame values, one sample at a time. set_values on
        # the dataset accepts a dict keyed by frame_id.
        flat_updates = {}
        for fids, vals in zip(per_sample_frame_ids, per_sample_values):
            for fid, val in zip(fids, vals):
                flat_updates[fid] = float(val)

        # Use the high-level set_values on a frames view, which handles
        # the per-frame write efficiently.
        frame_id_to_value = flat_updates
        ids = list(frame_id_to_value.keys())
        vals = [frame_id_to_value[i] for i in ids]
        # Select the matching frames and set values in one shot.
        view = dataset.to_frames().select(ids, ordered=True)
        view.set_values(jump_field, vals)
        dataset.save()

        ctx.ops.notify(
            f"Computed trajectory for {len(sample_id_order)} scene(s) "
            f"as brain key '{brain_key}'.",
            variant="success",
        )

        return {
            "ok": True,
            "brain_key": brain_key,
            "num_scenes": len(sample_id_order),
            "jump_field": jump_field,
        }
