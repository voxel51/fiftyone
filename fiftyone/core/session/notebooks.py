"""
Session notebook handling

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import os

from jinja2 import Template

try:
    import IPython.display
except:
    pass

import fiftyone.core.context as focx
import fiftyone.core.session.events as fose
import fiftyone.core.session.templates as fost


@dataclass(frozen=True)
class NotebookCell:
    address: str
    height: int
    handle: "IPython.display.DisplayHandle"
    port: int
    subscription: str


def capture(cell: NotebookCell, data: fose.CaptureNotebookCell) -> None:
    cell.handle.update(
        IPython.display.HTML(
            fost.SCREENSHOT_HTML.render(
                subscription=cell.subscription,
                image=data.src,
                url=focx.get_url(cell.address, cell.port),
                max_width=data.width,
                height=cell.height,
            ),
        )
    )


def display(cell: NotebookCell, reactivate: bool = False) -> None:
    """Displays a running FiftyOne instance."""
    funcs = {
        focx._COLAB: display_colab,
        focx._IPYTHON: display_ipython,
    }
    fn = funcs[focx._get_context()]
    fn(cell, reactivate)


def display_ipython(cell: NotebookCell, reactivate: bool = False) -> None:
    iframe = IPython.display.IFrame(
        focx.get_url(
            cell.address,
            os.environ.get("FIFTYONE_APP_CLIENT_PORT", cell.port),
            subscription=cell.subscription,
        ),
        height=cell.height,
        width="100%",
    )
    if reactivate:
        cell.handle.update(iframe)
    else:
        cell.handle.display(iframe)


def display_colab(cell: NotebookCell, reactivate: bool = False) -> None:
    """Display a FiftyOne instance in a Colab output frame.

    The Colab VM is not directly exposed to the network, so the Colab runtime
    provides a service worker tunnel to proxy requests from the end user's
    browser through to servers running on the Colab VM: the output frame may
    issue requests to https://localhost:<port> (HTTPS only), which will be
    forwarded to the specified port on the VM.

    It does not suffice to create an `iframe` and let the service worker
    redirect its traffic (`<iframe src="https://localhost:6006">`), because for
    security reasons service workers cannot intercept iframe traffic. Instead,
    we manually fetch the FiftyOne index page with an XHR in the output frame,
    and inject the raw HTML into `document.body`.
    """
    # pylint: disable=no-name-in-module,import-error
    from google.colab import output

    style_text = Template(fost.SCREENSHOT_STYLE).render(
        subscription=cell.subscription
    )
    html = Template(fost.SCREENSHOT_COLAB).render(
        style=style_text, subscription=cell.subscription
    )
    script = Template(fost.SCREENSHOT_COLAB_SCRIPT).render(
        height=cell.height, port=cell.port, subscription=cell.subscription
    )

    cell.handle.display(IPython.display.HTML(html))
    output.eval_js(script)

    def capture(img: str, width: int) -> None:
        with output.redirect_to_element(f"#focontainer-{cell.subscription}"):
            IPython.display.display(
                IPython.display.HTML(
                    f"<img src='{img}' style='width: 100%%; max-width: {width}px;'/>"
                )
            )

    output.register_callback(
        f"fiftyone.{cell.subscription.replace('-', '_')}", capture
    )
