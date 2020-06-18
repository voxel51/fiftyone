FiftyOne
========

In the modern age of deep learning, **quality data** is quickly becoming the
most important factor to successful machine learning. And unlike those neatly
curated research datasets, real world problems means data that is partially
labeled, unbalanced, mislabeled, misrepresentative...you name it.

Is bad data holding back the performance of your models?

If you answered no, are you sure? Or are you being overly optimistic?

For the vast majority of cases, improving dataset quality is going to be the
highest return on investment for boosting model performance. This could mean
many things, such as:

1. adding new samples that increase diversity
2. removing redundant samples that do not benefit performance and bloat the
   dataset unnecessarily
3. modifying labels due to annotation mistakes

It is time to start seeing the dataset as a dynamic and evolving part of the
machine learning "code", and this is where **FiftyOne** comes in.

**FiftyOne** is a cutting-edge, Python-based tool for the visual data scientist
to help in creating valuable and diverse datasets. **FiftyOne**:

* provides powerful capabilities for understanding and modifying datasets
  in ways that will best improve model performance
* facilitates good practice and organization in shepherding data
* makes it easy to rapidly gain intuitions and efficiently wrangle data

Improving your dataset means better models, clearer and more meaningful
evaluation results and a more efficient means to all of this.

.. image:: images/video_placeholder.png
   :alt: Overview Video
   :width: 100%
   :align: center

Where to go from here? You could...

* start by :doc:`Installing FiftyOne<getting_started/install>`
* try one of the :doc:`Tutorials<tutorials/index>` that demonstrate the unique
  capabilites of FiftyOne
* explore the :doc:`Common Recipes<common_recipes/index>` for integrating
  FiftyOne into your current workflow
* check the :doc:`User Guide<user_guide/index>` for detailed "How To..." of
  a specific tasks you may be trying to accomplish
* view the :doc:`API Reference<api/fiftyone>`

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
