Frequently Asked Questions
==========================

.. default-role:: code

Can I run this in a browser?
----------------------------

Browsers are not yet supported; you must
:ref:`install FiftyOne <installing-fiftyone>` on each machine from which you
want to use the library or the App.

However, check out the :doc:`environments guide </environments/index>` for
best practices on using FiftyOne in common local, remote, and cloud
environments.

Can I access data stored on a remote server?
--------------------------------------------

Yes! If you install FiftyOne on both your remote server and local machine, then
you can :ref:`load a dataset remotely <remote-data>` and then explore it via an
:ref:`App session on your local machine <creating-an-app-session>`.

Can I access data stored in the cloud?
--------------------------------------

Yes! The recommended best practice is to mount the cloud bucket to a cloud
compute instance in your cloud environment and then use the
:ref:`remote server workflow <remote-data>` to work with the data.

Check out the :doc:`environments guide </environments/index>` for instructions
for working in AWS, GCP, and Azure.

What label types are supported?
-------------------------------

FiftyOne provides support for all of the following label types for both image
and video datasets:

- :ref:`Classifications <classification>`
- :ref:`Multilabel classifications <multilabel-classification>`
- :ref:`Object detections <object-detection>`
- :ref:`Instance segmentations <objects-with-instance-segmentations>`
- :ref:`Object attributes <objects-with-attributes>`
- :ref:`Polylines and polygons <polylines>`
- :ref:`Keypoints <keypoints>`
- :ref:`Semantic segmentations <semantic-segmentation>`

Check out :ref:`this guide <manually-building-datasets>` for simple recipes to
load labels in each of these formats.

What image file types are supported?
------------------------------------

In general, FiftyOne supports `all image types supported by Chromium
<https://en.wikipedia.org/wiki/Comparison_of_browser_engines_(graphics_support)>`_,
which includes standard image types like JPEG, PNG, TIFF, and BMP.

What video file types are supported?
------------------------------------

Core methods that process videos can generally handle any
`codec supported by ffmpeg <https://www.ffmpeg.org/general.html#Video-Codecs>`_.

The App can play any video codec that is supported by
`HTML5 video on Chromium <https://en.wikipedia.org/wiki/HTML5_video#Browser_support>`_,
including MP4 (H.264), WebM, and Ogg.

If you try to view a video with an unsupported codec in the App, you will be
prompted to use the :func:`reencode_videos() <fiftyone.utils.video.reencode_videos>`
utility method to reencode the source video so it is viewable in the App.

What operating systems does FiftyOne support?
---------------------------------------------

FiftyOne is guaranteed to support the latest versions of MacOS, Windows, and
popular Linux distributions. FiftyOne will generally also support any version
of these popular operating systems from the past few years.

We also provide :ref:`custom install instructions <alternative-builds>` to use
FiftyOne on old-but-popular setups like Ubuntu 16.04 and Debian 9.

Can you share a dataset with someone else?
------------------------------------------

You can easily :doc:`export a dataset </user_guide/export_datasets>` in one
ine of code, zip it, and send it to someone else who can then
:doc:`load it in a few lines of code. </user_guide/dataset_creation/datasets>`.

Alternatively, you could launch a :ref:`remote session <remote-data>` of the
FiftyOne App on your machine that another user can connect to from their local
machine. This workflow does require that both users have the

Are the Brain methods open source?
----------------------------------

No. Although the :ref:`core library <https://github.com/voxel51/fiftyone>` is
open source and the :doc:`Brain methods </user_guide/brain>` are freely
available for use for any commerical or non-commerical purposes, the Brain
methods are closed source.

Check out the :doc:`Brain documentation </user_guide/brain>`` for detailed
instructions on using the various Brain methods.
