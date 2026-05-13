# Temporal Embedding Trajectory

A FiftyOne panel that visualizes per-frame embeddings of a video scene as a 2D
scatter (UMAP) with a temporal trajectory polyline and red markers on outlier
("jump") frames. Click a marker → the modal seeks to that frame.

Use it to find the exact frame where a model's semantic understanding shifted —
a tree shadow misread as a pothole, a phantom pedestrian for one frame, a
lighting change at a tunnel mouth.

## Quick start (nuScenes mini)

```python
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset("nuscenes", split="mini")
session = fo.launch_app(dataset)
```

In the app:

1. Open the **Temporal Embedding Trajectory** panel from the panel browser
   (under "Curate").
2. Click **Compute** and pick a model (CLIP for semantic shifts, DINOv2 for
   visual shifts).
3. Once compute finishes (delegated), open a video sample in the modal. The
   scatter renders all frames of the current scene. Outlier frames are
   highlighted in red.
4. Click an outlier → the modal jumps to that frame.

## Models

| Model                   | Brain key             | Strength                                 |
| ----------------------- | --------------------- | ---------------------------------------- |
| `clip-vit-base32-torch` | `temporal_trajectory` | Semantic shifts (objects, text concepts) |
| `dinov2-vitb14-torch`   | `temporal_trajectory` | Visual shifts (texture, structure)       |

You can run both with different brain keys (e.g. `temporal_trajectory_clip`,
`temporal_trajectory_dino`) and switch between them in the panel to compare.

## What gets persisted

For each compute run:

-   A brain visualization (`dataset.load_brain_results(brain_key)`) holds the
    2D UMAP points + their parent frame ids.
-   A frame-level float field `<brain_key>_jump_dist` holds the cosine distance
    from each frame to its predecessor in the raw embedding space.

The panel is read-only; you can re-run compute any time to refresh.

## Out of scope

-   Multi-scene comparison.
-   3D UMAP.
-   Real-time embedding (all precomputed).
