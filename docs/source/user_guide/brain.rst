FiftyOne Brain
==============

.. default-role:: code

The FiftyOne Brain provides powerful machine learning techniques that are
designed to transform how you curate your data from an art into a measurable
science.

.. note::

    The FiftyOne Brain is a separate Python package that is bundled with
    FiftyOne. Although it is closed-source, it is licensed as freeware, and you
    have permission to use it for commercial or non-commercial purposes. See
    `the license <https://github.com/voxel51/fiftyone/blob/develop/LICENSE-BRAIN>`_
    for more details.

The FiftyOne Brain methods are useful across the stages of the machine learning
workflow:

* **Uniqueness**: During the training loop for a model, the best results will
  be seen when training on unique data. The FiftyOne Brain provides a
  `uniqueness` measure for images that compare the content of every image in a
  |WhatIsAFiftyOneDataset| with all other images. Uniqueness operates on raw
  images and does not require any prior annotation on the data. It is hence
  very useful in the early stages of the machine learning workflow when you are
  likely asking "What data should I select to annotate?"

* **Mistakenness**: Annotations mistakes create an artificial ceiling on the
  performance of your models.  However, finding these mistakes by hand is at
  least as arduous as the original annotation was, especially in cases of
  larger datasets.  The FiftyOne Brain provides a quantitative `mistakenness`
  measure to identify possible label mistakes.  Mistakenness operates on
  labeled images and requires the logit-output of your model predictions in
  order to provide maximum efficacy.

* **Hardness**: While a model is training, it will learn to understand
  attributes of certain samples faster than others. The FiftyOne Brain provides
  a `hardness` measure that calculates how easy or difficult it is for your
  model to understand any given sample.  Mining hard samples is a tried and
  true measure of mature machine learning processes.  Use your current model
  instance to compute predictions on unlabeled samples to determine which are
  the most valuable to have annotated and fed back into the system as training
  samples, for example.

Each of these functions has a detailed :doc:`tutorial <../tutorials/index>`
demonstrating a workflow.

.. _brain-image-uniqueness:

Image Uniqueness
________________

The FiftyOne Brain allows for the computation of the `uniqueness` of an image,
in comparison with other images in a |Dataset|; it does so without requiring
any model from you.  One good use of uniqueness is in the early stages of the
machine learning workflow when you are deciding what subset of data with which
to bootstrap your models.  Unique samples are vital in creating training
batches that help your model learn as efficiently and effectively as possible.

The `uniqueness` of a |Dataset| can be computed directly without need the
predictions of a pre-trained model:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_uniqueness(dataset)

**Input**: An unlabeled (or labeled) image dataset.  There are
:doc:`recipes<../recipes/index>` for building datasets from a wide variety of
image formats, ranging from a simple directory of images to complicated dataset
structures like `MS-COCO <https://cocodataset.org/#home>`_.

**Output**: A scalar-valued field per |Sample| that ranks the uniqueness of
that sample (higher value means more unique).  The default name of this field
is `uniqueness`, but you can customize its name by using the `uniqueness_field`
named argument.  The uniqueness value is normalized so it is comparable across
datasets and data-subsets.

**What to expect**: Uniqueness uses a tuned algorithm that measures the
distribution of each |Sample| in the |Dataset|.  Using this distribution, it
ranks each |Sample| based on its relative *similarity* to other samples.  Those
that are close to other samples are not unique whereas those that are far from
most other samples are more unique.

.. note::

    Check out the :doc:`uniqueness tutorial<../tutorials/uniqueness>` to see an
    example use case of the Brain's uniqueness method.

.. _brain-label-mistakes:

Label Mistakes
______________

Correct annotations are crucial in developing high performing models. Using the
FiftyOne Brain and the predictions of a pre-trained model, you can identify
possible labels mistakes in your |Dataset|:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_mistakenness(
        samples, pred_field="my_model", label_field="ground_truth"
    )

**Input**: Label mistakes operate on samples for which there are both human
annotations (`label_field` in the example block) and model predictions
(`pred_field` above).

**Output**: A scalar-valued field per |Sample| that ranks the chance of a
mistaken annotation.  The default name of this field is `mistakenness`, but you
can customize its name by using the `mistakenness_field` named argument.

**What to expect**: Finding mistakes in human annotations is non-trivial (if it
could be done perfectly then the approach would sufficiently replace your
prediction model).  The FiftyOne Brain uses a proprietary scoring model that
ranks samples for which your prediction model is highly confident but wrong
(according to the human annotation label) as a high chance of being a mistake.

.. note::

    Check out the :doc:`label mistakes tutorial<../tutorials/label_mistakes>`
    to see an example use case of the Brain's mistakenness method.

.. _brain-sample-hardness:

Sample Hardness
_______________

During training, it is useful to identify samples that are more difficult for a
model to learn so that training can be more focused around these hard samples.
These hard samples are also useful as seeds when considering what other new
samples of add to a training dataset.

In order to compute hardness, model predictions must be generated on the
samples of a |Dataset|. These predictions can then be loaded into FiftyOne into
the same |Dataset| and the FiftyOne Brain can be used to compute hardness:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob

    fob.compute_hardness(dataset, label_field="predictions")

**Input**: The `dataset` argument has samples on which predictions (logits)
have been computed and are stored in the `label_field`.  Annotations and labels
are not required for hardness.

**Output**: A scalar-valued field per |Sample| that ranks the hardness of the
sample.  The default name of this field is `mistakenness`, but you can
customize its name by using the `mistakenness_field` named argument.

**What to expect**: Hardness is computed in the context of a prediction model.
The FiftyOne Brain hardness measure defines hard samples as those for which the
prediction model is unsure about what label to assign.  This measure
incorporates prediction confidence and logits in a tuned model that has
demonstrated empirical value in many model training exercises.

.. note::

    Tutorial coming soon!
