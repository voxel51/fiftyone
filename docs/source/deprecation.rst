.. _deprecation-notices:

FiftyOne Deprecation Notices
============================

.. default-role:: code

FiftyOne Desktop
----------------
*Support ended with 0.25.0*

A compatible `fiftyone-desktop https://pypi.org/project/fiftyone-desktop/`_
package is no longer published with `fiftyone>=0.25.0` releases

Python 3.8
----------
*Support Ends October 2024*

`Python 3.8 <https://devguide.python.org/versions/>`_
transitions to `end-of-life` effective October of 2024. FiftyOne releases after
September 30, 2024 will no longer support Python 3.8.

Versions of `fiftyone` after 0.24.1, or after FiftyOne Teams SDK version 0.18.0,
will provide a deprecation notice when `fiftyone` is imported using Python 3.8.

You can disable this deprecation notice by setting the
`FIFTYONE_PYTHON_38_DEPRECATION_NOTICE` environment variable to `false` prior
to importing `fiftyone`.
