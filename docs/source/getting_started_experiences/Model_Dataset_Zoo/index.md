# Getting Started with the FiftyOne Zoo

Welcome to the FiftyOne Zoo! This interactive guide will walk you through
using, customizing, and extending the Zoo’s capabilities with datasets and
models — all from within Jupyter Notebooks.

## Who this is for

This experience is designed for:

-   **Data scientists** looking to explore CV datasets quickly
-   **ML engineers** wanting to prototype with pre-trained models
-   **Computer vision practitioners** seeking to integrate custom models

Whether you're exploring public data, testing models, or wrapping your own
contributions, the Zoo helps you streamline your computer vision workflows.

## Assumed Knowledge

To get the most out of this series, you should have:

-   Basic knowledge of Python and Jupyter Notebooks
-   Familiarity with CV tasks (classification, detection, segmentation)
-   Some exposure to FiftyOne (optional but helpful)

## Time to complete

-   **Step 1:** 20–30 minutes
-   **Step 2:** 15–20 minutes
-   **Step 3:** 30–45+ minutes (more if wrapping your own model)

## Required packages

Before getting started, make sure the following packages are installed:

```bash
pip install fiftyone torch torchvision
```

## Content

### [Step 1: Exploring the FiftyOne Dataset Zoo](./step1.ipynb)

Get hands-on with the FiftyOne Dataset Zoo. You'll learn how to list, load, and
explore built-in datasets as well as work with remotely-sourced datasets hosted
on external URLs or GitHub repositories.

### [Step 2: Using the FiftyOne Model Zoo](./step2.ipynb)

Apply pre-trained models to datasets using the built-in Zoo. You'll see how to
use classification and detection models, visualize results, and iterate faster.

### [Step 3: Using Remotely-Sourced Zoo Models](./step3.ipynb)

Learn how to integrate custom or community models hosted on GitHub or public
URLs. This step shows how to load and run these models just like native zoo
models — ideal for advanced use cases or team-specific models.
