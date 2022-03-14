from dataclasses import dataclass

try:
    import IPython.display
except:
    pass

import fiftyone.core.context as focx


@dataclass
class DisplayCall:
    address: str
    handle: IPython.display.DisplayHandle
    port: int
    subscription: str
    update: bool


def display(call: DisplayCall):
    """Displays a running FiftyOne instance."""
    funcs = {
        focx._COLAB: display_colab,
        focx._IPYTHON: display_ipython,
        focx._DATABRICKS: display_databricks,
    }
    fn = funcs[focx._get_context()]
    fn(session, handle, uuid, port, address, height, update=update)


def display_ipython(call):
    import IPython.display

    address = address or "localhost"
    src = "http://%s:%d/?subscription=%s" % (address, port, uuid)
    iframe = IPython.display.IFrame(src, height=height, width="100%")
    if update:
        handle.update(iframe)
    else:
        handle.display(iframe)


def display_colab(session, handle, uuid, port, address, height, update=False):
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
    import IPython.display

    # pylint: disable=no-name-in-module,import-error
    from google.colab import output

    style_text = Template(fout._SCREENSHOT_STYLE).render(handle=uuid)
    html = Template(fout._SCREENSHOT_COLAB).render(
        style=style_text, handle=uuid
    )
    script = Template(fout._SCREENSHOT_COLAB_SCRIPT).render(
        port=port, handle=uuid, height=height
    )

    handle.display(IPython.display.HTML(html))
    output.eval_js(script)

    def capture(img: str, width: int) -> None:
        idx = session._colab_img_counter[uuid]
        session._colab_img_counter[uuid] = idx + 1
        with output.redirect_to_element("#focontainer-%s" % uuid):
            # pylint: disable=undefined-variable,bad-format-character
            display(
                IPython.display.HTML(
                    """
                <img id='fo-%s%d' class='foimage' src='%s'
                    style='width: 100%%; max-width: %dpx'/>
                <style>
                #fo-%s%d {
                    display: none;
                }
                </style>
                """
                    % (uuid, idx, img, width, uuid, idx - 1)
                )
            )

    output.register_callback("fiftyone.%s" % uuid.replace("-", "_"), capture)


def display_databricks(
    session, handle, uuid, port, address, height, update=False
) -> None:
    """Display a FiftyOne instance in a Databricks output frame.

    The Databricks driver port is accessible via a proxy url and can be displayed inside an IFrame.
    """
    ipython = IPython.get_ipython()
    display_html = ipython.user_ns["displayHTML"]

    dbutils = ipython.user_ns["dbutils"]
    ctx = json.loads(
        dbutils.entry_point.getDbutils().notebook().getContext().toJson()
    )
    ctx_tags = ctx["tags"]
    browser_host_name = ctx_tags["browserHostName"]
    org_id = ctx_tags["orgId"]
    cluster_id = ctx_tags["clusterId"]
    url = f"https://{browser_host_name}/driver-proxy/o/{org_id}/{cluster_id}/{port}/"

    frame_id = f"fiftyone-frame-{uuid}"
    proxy_url = f"{url}?subscription={uuid}"
    html_string = f"""
    <div style="margin-bottom: 16px">
        <a href="{proxy_url}">
            Open in a new tab
        </a>
        <span style="margin-left: 1em; color: #a3a3a3">Note: FiftyOne is only available when this notebook remains attached to the cluster.</span>
    </div>
    <iframe id="{frame_id}" width="100%" height="{height}" frameborder="0" src="{proxy_url}"></iframe>
    """
    display_html(html_string)
