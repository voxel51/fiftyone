FiftyOne Frequently Asked Questions
===================================

.. default-role:: code

**Can I run this in a browser?**

Browers are not yet supported, but see the :doc:`Environments </environments/index>` page for instructions for using
FiftyOne in common local, remote, and cloud environments.

**Can I access data stored in the cloud or on a remote server like on AWS, Azure, or Google Cloud from my client application?**

Yes! If you install FiftyOne on both your :ref:`remote server and your local machine <remote-data>`, then you can load a dataset remotely and :ref:`explore it with the App <creating-an-app-session>` locally. See the :doc:`Environments </environments/index>` section for details.

**What label types are supported?**

FiftyOne provides both image and video support for :ref:`classifications (including
multi label classifications), object detections in multiple coordinate formats,
semantic and instance segmentation, key points, and polylines.
<manually-building-datasets>`

**What image file types are supported?**

Most standard image types like `JPEG`, `PNG`, and `BMP` are supported. In general,
all `image types supported by Chromium
<https://en.wikipedia.org/wiki/Comparison_of_browser_engines_(graphics_support)>`_ are supported by FiftyOne.

**What video file types are supported?**

Any video filetype that is supported by HTML5 video, like `.mp4`, is able to be
viewed in the App. If you are
having trouble viewing your video file, use the provided :func:`reencode_videos() <fiftyone.utils.video.reencode_videos>`
untility to reencode the source video so it is viewable in the app.

**What operating systems does FiftyOne support?**

FiftyOne is guaranteed to support the latest versions of popular Linux Distributions, Windows and MacOS (ex. Ubuntu 18.04, Windows 10) along with :ref:`specific install instructions for older versions like Ubuntu 16.04 and Debian 9. <alternative-builds>`

**Can you share a dataset with someone else?**

You can easily :doc:`export a dataset </user_guide/export_datasets>` in one line of code, zip it, and send it to someone else who can then :doc:`load it in a few lines of code. </user_guide/dataset_creation/datasets>`

Alternatively, you could launch a :ref:`remote session <remote-data>` of the FiftyOne App on your
machine that
another user can access using FiftyOne on their local machine.

**Are the Brain methods open-source?**

No, FiftyOne is open core. The :doc:`Brain methods </user_guide/brain>` exist in a separate repository that is
installed along-side the core FiftyOne repository. However, the :doc:`documentation
includes detailed instructions of how to use Brain methods. </user_guide/brain>`

