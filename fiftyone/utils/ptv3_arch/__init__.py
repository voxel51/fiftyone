"""
Vendored Point Transformer V3 architecture.

This subpackage is a vendored copy of the Point Transformer V3 (PTv3) backbone
from `Pointcept <https://github.com/Pointcept/Pointcept>`_, used to load the
pretrained PTv3 checkpoints exposed in the FiftyOne Model Zoo. The upstream code
is released under the MIT License (Copyright (c) Pointcept contributors).

Reference::

    Wu et al., "Point Transformer V3: Simpler, Faster, Stronger," CVPR 2024.
    https://arxiv.org/abs/2312.10035

Only the inference path required by the zoo wrapper is retained. Training-only
couplings to the wider Pointcept codebase (the model registry, the
Point-Prompt-Training norms, and the engine hooks) have been removed, and
cross-package imports have been rewritten as relative imports. See the
individual module headers for per-file provenance.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .model import PointTransformerV3

__all__ = ["PointTransformerV3"]
