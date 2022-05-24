"""
Plotting framework.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .base import (
    plot_confusion_matrix,
    plot_regressions,
    plot_pr_curve,
    plot_pr_curves,
    plot_roc_curve,
    lines,
    scatterplot,
    location_scatterplot,
    Plot,
    ResponsivePlot,
    InteractivePlot,
    ViewPlot,
)
from .manager import PlotManager
from .views import (
    ViewGrid,
    CategoricalHistogram,
    NumericalHistogram,
)
