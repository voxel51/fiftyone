FiftyOne Brain
==============

.. default-role:: code

The FiftyOne Brain provides powerful machine learning techniques that can
find unique insights into your data. FiftyOne Brain operations require the
installation of `torch`
and `tensorflow`.


The FiftyOne Brain can assist in every stage of the model training pipeline:

* **Mistakenness**: When curating a dataset, it is important to verify annotations
  so that all training data is as high quality as possible. The FiftyOne Brain
  provides a quantitative `mistakenness` measure to identify possible label
  mistakes.

* **Uniqueness**: During the training loop for a model, the best results will be
  seen when training on unique data. The FiftyOne Brain provides a `uniqueness`
  measure for images that compare the content of every image in a `Dataset`
  with all other images.
 
* **Hardness**: While a model is training, it will learn to understand
  attributes of certain samples faster than others. The FiftyOne Brain provides
  a `hardness` measure that calculates how easy or difficult it is for your
  model to understand any given sample.


Each of these functions have a detailed :doc:`tutorial <../tutorials/index>` demonstrating a workflow.


Label Mistakes
______________

Correct annotations are crucial in developing high performing models. Using the
FiftyOne Brain and the predictions of a pre-trained model, you can identify
possible labels mistakes in your `Datasets`::
   import fiftyone.brain as fob
    
   fob.compute_mistakenness(samples, model, label_field="ground_truth") 


Image Uniqueness
________________

The FiftyOne Brain allows for the computation of the `uniqueness` of an image, 
in comparison with other images in a `Dataset`. Unique samples are vital in
creating training batches that help your model learn as efficiently and
effectively as possible.

The `uniqueness` of a `Dataset` can be computed directly without need the
predictions of a pre-trained model::
    import fiftyone.brain as fob

    fob.compute_uniqueness(dataset)


Sample Hardness
_______________

During training, it is useful to identify samples that are more difficult for a
model to learn so that training can be more focused around these hard samples. 

In order to compute hardness, model predictions must be generated on the
samples of a `Dataset`. These predictions can then be loaded into FiftyOne into
the same `Dataset` and the FiftyOne Brain can be used to compute hardness::
    import fiftyone.brain as fob

    fob.compute_hardness(dataset, label_field="predictions")
    
    









