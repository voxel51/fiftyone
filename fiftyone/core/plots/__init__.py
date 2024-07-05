"""
Plotting framework.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .base import (
    InteractivePlot,
    Plot,
    ResponsivePlot,
    ViewPlot,
    lines,
    location_scatterplot,
    plot_confusion_matrix,
    plot_pr_curve,
    plot_pr_curves,
    plot_regressions,
    plot_roc_curve,
    scatterplot,
)
from .manager import PlotManager
from .views import (
    CategoricalHistogram,
    NumericalHistogram,
    ViewGrid,
)


# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
