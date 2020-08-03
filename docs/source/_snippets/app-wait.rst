.. note::

    `launch_app()` will launch the App asynchronously and return control to
    your Python process; the App will remain open until you close it or the
    process exits.

    If you are using the App in a non-interactive script, you should use
    :meth:`session.wait() <fiftyone.core.session.Session.wait>` at the end of
    your script to block execution until you close the App manually:

    .. code-block:: python

        session = fo.launch_app(...)
        # Perform any additional operations necessary
        # Block execution until the App is closed
        session.wait()
