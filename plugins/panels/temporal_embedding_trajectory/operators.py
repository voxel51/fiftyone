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


def _windowed_centroid_shift(normed: np.ndarray, W: int) -> np.ndarray:
    """Per-frame "scene change" score from windowed centroid distance.

    For each frame t, returns the cosine distance between the mean of
    the previous W normalized embeddings and the mean of the next W.
    Frames within W of either edge of the scene return 0 (insufficient
    context for a meaningful comparison).

    Detects gradual transitions like tunnel entry/exit that the
    per-step jump metric misses, and smooths out single-frame events
    like the streetlight-behind-sign blip.
    """
    n = len(normed)
    scores = np.zeros(n, dtype=np.float32)
    if n < 2 * W:
        return scores

    # cs[i] = sum of normed[:i] for i in 0..n
    cs = np.concatenate(
        [
            np.zeros((1, normed.shape[1]), dtype=normed.dtype),
            np.cumsum(normed, axis=0),
        ],
        axis=0,
    )

    for t in range(W, n - W + 1):
        before = (cs[t] - cs[t - W]) / W
        after = (cs[t + W] - cs[t]) / W
        bn = float(np.linalg.norm(before))
        an = float(np.linalg.norm(after))
        if bn == 0.0 or an == 0.0:
            continue
        scores[t] = 1.0 - float(np.dot(before, after) / (bn * an))

    return scores


def _list_existing_embedding_fields(ctx):
    """Return sample-field names that plausibly hold embeddings.

    Looks for VectorField / ArrayField / ListField columns on the
    current dataset's frame schema (for video) or sample schema (for
    image). Reported names are suitable for passing back as
    ``embeddings_field``.
    """
    dataset = ctx.dataset
    if dataset is None:
        return []
    try:
        import fiftyone.core.fields as fof

        media_type = getattr(dataset, "media_type", None)
        if media_type == "video":
            schema = dataset.get_frame_field_schema(flat=False) or {}
        else:
            schema = dataset.get_field_schema(flat=False) or {}

        candidate_types = (
            getattr(fof, "VectorField", None),
            getattr(fof, "ArrayField", None),
            getattr(fof, "ListField", None),
        )
        candidate_types = tuple(t for t in candidate_types if t is not None)

        out = []
        for name, field in schema.items():
            if name.startswith("_"):
                continue
            if isinstance(field, candidate_types):
                out.append(name)
        return sorted(out)
    except Exception:
        return []


_DEFAULT_BRAIN_KEY = "temporal_trajectory"

_MODEL_CHOICES = [
    ("clip-vit-base32-torch", "CLIP ViT-B/32 (semantic)"),
    ("dinov2-vitb14-torch", "DINOv2 ViT-B/14 (visual)"),
]

_METHOD_CHOICES = [
    ("umap", "UMAP (recommended, requires umap-learn)"),
    ("tsne", "t-SNE (sklearn, no extra deps)"),
    ("pca", "PCA (fastest, sklearn)"),
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

        # Existing embeddings field on the dataset/frames, if any. When
        # set, skips model loading + inference entirely and projects
        # straight from there. We surface every populated VectorField /
        # ArrayField the user could plausibly want.
        existing_field_choices = _list_existing_embedding_fields(ctx)
        if existing_field_choices:
            field_choices = types.Choices()
            field_choices.add_choice("", label="(compute new with model)")
            for field_name in existing_field_choices:
                field_choices.add_choice(field_name, label=field_name)
            inputs.enum(
                "embeddings_field",
                field_choices.values(),
                view=field_choices,
                label="Existing embeddings field",
                description=(
                    "Reuse an existing per-sample embedding field instead "
                    "of computing fresh embeddings. The model setting is "
                    "ignored when this is set."
                ),
                default="",
                required=False,
            )

        model_choices = types.Choices()
        for value, label in _MODEL_CHOICES:
            model_choices.add_choice(value, label=label)
        inputs.enum(
            "model",
            model_choices.values(),
            view=model_choices,
            label="Embedding model",
            description="Only used if no existing field is selected.",
            default=_MODEL_CHOICES[0][0],
            required=False,
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

        method_choices = types.Choices()
        for value, label in _METHOD_CHOICES:
            method_choices.add_choice(value, label=label)
        inputs.enum(
            "method",
            method_choices.values(),
            view=method_choices,
            label="Dimensionality reduction",
            default=_METHOD_CHOICES[0][0],
            required=False,
        )

        inputs.int(
            "batch_size",
            label="Embedding batch size",
            default=32,
            required=False,
        )

        inputs.int(
            "scene_window",
            label="Scene-shift window (frames)",
            default=30,
            description=(
                "Half-window size W for the scene-shift score. "
                "scene_shift(t) = cosine_distance(mean(emb[t-W:t]), "
                "mean(emb[t:t+W])). At 60fps, W=30 ≈ 0.5s before/after; "
                "smaller W = sharper boundaries, larger W = smoother "
                "segmentation."
            ),
            required=False,
        )

        inputs.int(
            "seed",
            label="UMAP/t-SNE random seed",
            default=51,
            description=(
                "Random seed for the dimensionality reduction. Fixing "
                "this makes the scatter layout reproducible: re-running "
                "with the same embeddings (e.g. only changing the "
                "scene-shift window) yields an identical projection "
                "instead of a rotated/reflected one. Leave as-is unless "
                "you want a different layout."
            ),
            required=False,
        )

        return types.Property(
            inputs,
            view=types.View(label="Compute trajectory embeddings"),
        )

    def execute(self, ctx):
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = ctx.dataset
        if dataset is None:
            return {"ok": False, "error": "No dataset"}

        existing_field = (ctx.params.get("embeddings_field") or "").strip()
        model_name = ctx.params.get("model") or _MODEL_CHOICES[0][0]
        brain_key = ctx.params.get("brain_key") or _DEFAULT_BRAIN_KEY
        method = ctx.params.get("method") or "umap"
        batch_size = ctx.params.get("batch_size") or 32
        scene_window = max(2, int(ctx.params.get("scene_window") or 30))
        seed = ctx.params.get("seed")
        if seed is None:
            seed = 51

        # Frame-level collection. For video datasets we materialize
        # frames via to_frames; for image datasets we assume each sample
        # is already a frame (e.g. the user is on a dataset that was
        # previously materialized from to_frames, or a plain image
        # collection).
        media_type = getattr(dataset, "media_type", None)
        if media_type == "video":
            frames = dataset.to_frames(sample_frames=True)
        elif media_type == "image":
            frames = dataset
        else:
            return {
                "ok": False,
                "error": (
                    f"Unsupported media type for trajectory: {media_type}. "
                    f"Expected 'video' or 'image'."
                ),
            }

        if existing_field:
            # User pointed us at an existing field — skip inference.
            if not frames.has_field(existing_field):
                return {
                    "ok": False,
                    "error": (
                        f"Embeddings field `{existing_field}` not found on "
                        f"the frames view."
                    ),
                }
            ctx.ops.notify(
                f"Using existing embeddings field `{existing_field}`.",
                variant="info",
            )
            embeddings_field = existing_field
        else:
            # Cache embeddings to a frame field keyed by model name so
            # that re-running the operator with the same model (e.g.
            # after a missing-dep failure on UMAP) skips inference
            # entirely.
            embeddings_field = (
                f"trajectory_embeddings_{model_name.replace('-', '_')}"
            )
            n_total = len(frames)
            n_cached = (
                frames.exists(embeddings_field).count()
                if frames.has_field(embeddings_field)
                else 0
            )
            if n_cached >= n_total and n_total > 0:
                ctx.ops.notify(
                    f"Reusing cached embeddings in `{embeddings_field}` "
                    f"({n_cached}/{n_total} frames).",
                    variant="info",
                )
            else:
                # Embed ONLY the frames still missing an embedding. This
                # fills a partially-populated cache (the common case
                # after an interrupted/failed run) and computes from
                # scratch when the field is empty.
                #
                # The previous gate accepted the cache if *any* single
                # frame was embedded. That was a bug: a partial field
                # masqueraded as complete, the
                # missing frames were never embedded, and the projection
                # silently ran on a sparse subset — producing a
                # fragmented scatter and inflated jump distances (a
                # "jump" skipped over the un-embedded frames).
                model = foz.load_zoo_model(model_name)
                todo = (
                    frames.exists(embeddings_field, False)
                    if frames.has_field(embeddings_field)
                    else frames
                )
                ctx.ops.notify(
                    f"Embedding {len(todo)} frame(s) with {model_name} "
                    f"({n_cached} already cached).",
                    variant="info",
                )
                # compute_embeddings writes to embeddings_field and
                # returns None when a field is specified; we pull the
                # array back from the field below for jump distances.
                todo.compute_embeddings(
                    model=model,
                    embeddings_field=embeddings_field,
                    batch_size=batch_size,
                    progress=True,
                )

        # Some frames may have failed to embed (e.g. ffmpeg couldn't
        # decode a frame). Filter to the subset whose embedding actually
        # landed on disk; all downstream work uses this restricted view.
        # Capture the pre-filter count FIRST so we can detect (and warn
        # about) partial coverage — otherwise the subsetting is silent
        # and the projection quietly covers fewer frames than the video.
        n_before_filter = len(frames)
        frames = frames.exists(embeddings_field)
        total = len(frames)
        if total == 0:
            return {
                "ok": False,
                "error": (
                    "No frames have embeddings — model failed on every "
                    "frame. Check the video file for decode errors."
                ),
            }
        if total < n_before_filter:
            ctx.ops.notify(
                f"Only {total}/{n_before_filter} frames have embeddings — "
                f"the projection covers a sparse subset, which fragments "
                f"the scatter and inflates jump distances. Re-run Compute "
                f"to embed the rest.",
                variant="warning",
            )

        raw_values = frames.values(embeddings_field)
        embeddings = np.asarray(
            [v for v in raw_values if v is not None], dtype=np.float32
        )
        if embeddings.shape[0] < total:
            ctx.ops.notify(
                f"{total - embeddings.shape[0]} frame(s) had no embedding "
                "and were dropped.",
                variant="warning",
            )

        # Pass a fixed seed so the projection is reproducible. UMAP /
        # t-SNE are stochastic; without a seed each run produces a
        # rotated/reflected/locally-distorted layout even for identical
        # embeddings, which looks like the scatter "changing shape"
        # between runs that only differ in, e.g., scene_window. `seed`
        # flows through **kwargs to the reducer's random_state.
        fob.compute_visualization(
            frames,
            embeddings=embeddings,
            method=method,
            brain_key=brain_key,
            num_dims=2,
            seed=seed,
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
        scene_field = f"{brain_key}_scene_shift"

        sample_id_order = []
        per_sample_frame_ids = []
        per_sample_jumps = []
        per_sample_shifts = []

        for sid, idxs in groups.items():
            # Sort by frame number to ensure correct sequence.
            idxs.sort(key=lambda i: frame_numbers[i] or 0)
            embs = np.asarray([embeddings[i] for i in idxs], dtype=np.float32)
            if len(embs) == 0:
                continue

            norms = np.linalg.norm(embs, axis=1)
            norms = np.where(norms == 0, 1.0, norms)
            normed = embs / norms[:, None]

            # Per-step jump: cosine distance between consecutive frames.
            if len(normed) >= 2:
                cos_sims = np.sum(normed[1:] * normed[:-1], axis=1)
                jumps = [0.0] + (1.0 - cos_sims).tolist()
            else:
                jumps = [0.0] * len(embs)

            # Windowed centroid shift — catches gradual scene transitions
            # (tunnel entry/exit) that per-step distance misses.
            shifts = _windowed_centroid_shift(normed, scene_window).tolist()

            sample_id_order.append(sid)
            per_sample_frame_ids.append([frame_ids[i] for i in idxs])
            per_sample_jumps.append(jumps)
            per_sample_shifts.append(shifts)

        import fiftyone.core.fields as fof

        if not dataset.has_frame_field(jump_field):
            dataset.add_frame_field(jump_field, fof.FloatField)
        if not dataset.has_frame_field(scene_field):
            dataset.add_frame_field(scene_field, fof.FloatField)

        def _write_field(field_name, per_sample_values):
            flat = {}
            for fids, vals in zip(per_sample_frame_ids, per_sample_values):
                for fid, val in zip(fids, vals):
                    flat[fid] = float(val)
            ids = list(flat.keys())
            vals = [flat[i] for i in ids]
            view = dataset.to_frames().select(ids, ordered=True)
            view.set_values(field_name, vals)

        _write_field(jump_field, per_sample_jumps)
        _write_field(scene_field, per_sample_shifts)
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
            "scene_field": scene_field,
        }
