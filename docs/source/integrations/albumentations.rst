.. _albumentations-integration:

Albumentations Integration
===========================

.. default-role:: code

The `Albumentations <https://albumentations.ai/docs/>`_ library is 
the leading open-source library for image augmentation in machine learning. 
It is widely used in the computer vision community and is known for its
extensive collection of augmentations and its high performance.

Now, we've integrated Albumentations transformation pipelines directly with 
FiftyOne datasets, enabling you to visualize Albumentations augmentations
and test their effects on your data directly within the FiftyOne App!

This integration takes the form of a :ref:`FiftyOne plugin <using-plugins>`, 
which is easy to install and can be used entirely via a convenient graphical
interface.

With the FiftyOne Albumentations plugin, you can transform any and all labels 
of type :class:`fiftyone.core.labels.Detections`,
:class:`fiftyone.core.labels.Keypoints`, 
:class:`fiftyone.core.labels.Segmentation`,
and :class:`fiftyone.core.labels.Heatmap`, or just the images themselves.

This integration guide will focus on the installation process and the functionality
of the plugin. For a tutorial on how to curate your augmentations, check out
the :doc:`Data Augmentation Tutorial </tutorials/data_augmentation>`.
