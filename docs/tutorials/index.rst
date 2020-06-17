FiftyOne Tutorials
==================

Problem/solution focused

Goal
____

* Provide simple, compelling examples that demonstrate best-practices usages of
  FiftyOne to accomplish key components of the FiftyOne value-proposition

Contents
________

* Homepage that presents a table of contents that enables the user to quickly
  locate the tutorial that is most interesting to them/relevant to their use
  case
* Left navbar with full index of available tutorials, possibly categorized by
  beginner vs advanced and then sub-indexed by use case
* Individual tutorials that provide a realistic walkthrough that leads the user
  to discover a key value-add of the tool for themselves. The tutorials should:

   * Be both (a) easy to follow along exactly without customization, and (b)
     clearly extensible to the user’s own data with minimal manual labor
   * Be realistic, not contrived. The conclusion should be real
   * Clearly tie back to an element of the FiftyOne value proposition. This
     connection should be clearly stated

Tutorials
_________

Finding annotation mistakes

* Brain method used: compute_mitakenness()

Removing duplicate images

* Brain method used: compute_uniqueness()

Bootstrapping a training dataset from raw images

* Identifying a diverse subset of your dataset

  * Brain method used: compute_uniqueness()

Adding samples to your training dataset to improve your model’s performance

* Adding a new diverse set of images to your dataset

   * Brain method used: compute_uniqueness()

* Identifying hard samples that the model struggles to correctly predict

   * Brain method used: compute_hardness()

* Identifying model classes that are easily confused

   * Brain method used: compute_hardness()

.. toctree::
    :glob:
    :maxdepth: 1

    *
