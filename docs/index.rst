========
FiftyOne
========

FiftyOne is a cutting-edge, Python-based tool for the visual data scientist to
help in creating valuable and diverse datasets.

This documentation includes an :doc:`installation guide <install_guide>` and
documentation covering the :doc:`fiftyone Python package <api/fiftyone>`. See
below for a full table of contents.

Overview
========

Teaser video that summarizes a typical usage of FiftyOne
- visualize data
- query, sort, tag
- compute useful metrics like mistakedness, uniqueness

Value Proposition: What problems are you solving for me?
1. Your data has problems that are holding back the performance of your models
2. Dataset wrangling is tedious, laborious, and not-sexy. At the same time, gaining an intuitive understanding of your data is key to improving your model’s performance
3. ROI for Data Scientists: Improving your data diversity is the biggest return on investment that you can make to improving the accuracy/performance of your model. - this needs to be emphasized - that FiftyONe is for data scientists - it’s not just about data wrangling - it’s for data scientists to help them build better models by making data interaction more accessible]

How does FiftyOne help?

Capabilities
------------

- (Each capability links to a tutorial for more details)
- Finding annotation mistakes
- Removing duplicate images
- Bootstrapping a training dataset from raw images
- Adding samples to your training dataset to improve your model’s performance

Concepts
--------

- (Each concept links to a user guide section for more details)
- Using dataset views to search and filter your data


Support
-------

If you run into any issue with FiftyOne that cannot be resolved wih this
documentation, feel free to reach out to us at support@voxel51.com.

.. toctree::
   :maxdepth: 2
   :hidden:
   :caption: Getting Started

   getting_started/install_guide
   getting_started/linux_db_setup

.. toctree::
   :maxdepth: 2
   :hidden:
   :caption: Tutorials

   tutorials/index

.. toctree::
   :maxdepth: 2
   :hidden:
   :caption: Common Recipes

   common_recipes/index

.. toctree::
   :maxdepth: 2
   :hidden:
   :caption: User Guide

   user_guide/index

.. toctree::
   :maxdepth: 2
   :hidden:
   :caption: API Reference

   api/fiftyone
