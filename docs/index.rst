FiftyOne
========

**FiftyOne** is a cutting-edge, Python-based tool for the visual data scientist
to help in creating valuable and diverse datasets.

.. image:: images/video_placeholder.png
   :alt: Overview Video
   :width: 80%
   :align: center

Teaser video that summarizes a typical usage of FiftyOne

* visualize data
* query, sort, tag
* compute useful metrics like mistakedness, uniqueness

**Goal**

High-level overview of the value-add of the tool, with calls to action that
enable the user to dive into more details at the right altitude (e.g., install,
getting started, basic tutorials, advanced tutorials, use case-centric
workflows)

**Contents**

Value Proposition: What problems are you solving for me?

1. Your data has problems that are holding back the performance of your models
2. Dataset wrangling is tedious, laborious, and not-sexy. At the same time,
   gaining an intuitive understanding of your data is key to improving your
   model’s performance
3. ROI for Data Scientists: Improving your data diversity is the biggest return
   on investment that you can make to improving the accuracy/performance of
   your model. - this needs to be emphasized - that FiftyONe is for data
   scientists - it’s not just about data wrangling - it’s for data scientists
   to help them build better models by making data interaction more accessible]

How does FiftyOne help?

Capabilities
____________

**FiftyOne** provides advanced capabilities that will turbocharge your
machine learning workflow.

* Automatically detect label annotation mistakes.
  :doc:`Try Now >><tutorials/label_mistakes/README>`
* Remove duplicate images.
  :doc:`Try Now >><tutorials/uniqueness/README>`
* Bootstrap your training dataset with raw images.
  **:doc:`TODO >>`**
* Add the optimal samples to your training dataset for improving your model’s
  performance.
  **:doc:`TODO >>`**

Concepts
________

**FiftyOne** is comprised of...

* a core library that enables powerful dataset representation including
  efficient search and manipulation and saved fields for samples such as tags
  and model predictions.
  :doc:`Learn More >><user_guide/basics>`
* a GUI application that provides easy visualization datasets sliced into any
  aspect you need. The only limitation is imagination!
  :doc:`Learn More >><user_guide/app>`
* the FiftyOne Brain, which provides the :ref:`Capabilities` mentioned above.
  :doc:`Learn More >><user_guide/brain>`


Support
_______

If you run into any issue with FiftyOne that cannot be resolved wih this
documentation, feel free to reach out to us at support@voxel51.com.

.. toctree::
   :maxdepth: 1
   :hidden:

   getting_started/install
   tutorials/index
   common_recipes/index
   user_guide/index
   api/fiftyone
