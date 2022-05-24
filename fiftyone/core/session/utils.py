"""
Session utilities

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pkg_resources


    def _reload(self) -> None:
        if self.dataset is None:
            return

        self.dataset._reload()
        self.dataset._reload_docs()

    def _show(self, height: int = None) -> None:
        if self._context == focx._NONE or self._desktop:
            return

        if self.dataset is not None:
            self.dataset._reload()

        import IPython.display

        uuid = str(uuid4())
        handle = IPython.display.DisplayHandle(display_id=uuid)

        # @todo isn't it bad to set this here? The first time this is called
        # is before `self.state` has been initialized
        self.state.active_handle = uuid

        if height is None:
            height = self.config.notebook_height

        self._handles[uuid] = {
            "target": handle,
            "height": height,
            "active": True,
        }

        _display(self, handle, uuid, self._port, self._address, height)
        return uuid

    def _update_state(self) -> None:
        self.state.datasets = fod.list_datasets()
        self.state = self.state


    def _base_url(self) -> str:
        if self._context == focx._COLAB:
            # pylint: disable=no-name-in-module,import-error
            from google.colab.output import eval_js

            return eval_js(
                "google.colab.kernel.proxyPort(%d)" % self.server_port
            )

        if self._context == focx._DATABRICKS:
            return _get_databricks_proxy_url(self.server_port)

        address = self.server_address or "localhost"
        return "http://%s:%d/" % (address, self.server_port)




    def _auto_show(self, height: int = None) -> None:
        if self._auto and self._context != focx._NONE:
            return self._show(height=height)

        return None

    def freeze():

        self.state.active_handle = None

        self._update_state()
        self.plots.freeze()

    def _capture(self, data: CaptureData):
        from IPython.display import HTML

        if self._context == focx._COLAB:
            return

        if self._context == focx._DATABRICKS:
            return

        if (
            data.subscription in self._handles
            and self._handles[data.subscription].
        ):
            self._handles[handle]["active"] = False
            self._handles[handle]["target"].update(
                HTML(
                    fout._SCREENSHOT_HTML.render(
                        handle=handle,
                        image=data["src"],
                        url=self._base_url(),
                        max_width=data["width"],
                    )
                )
            )


def import_desktop() -> None:
    try:
        # pylint: disable=unused-import
        import fiftyone.desktop
    except ImportError as e:
        raise ValueError(
            "You must `pip install fiftyone-teams[desktop]` in order to launch the "
            "desktop App"
        ) from e

    # Get `fiftyone-desktop` requirement for current `fiftyone` install
    fiftyone_dist = pkg_resources.get_distribution("fiftyone-teams")
    requirements = fiftyone_dist.requires(extras=["desktop"])
    desktop_req = [
        r for r in requirements if r.name == "fiftyone-teams-desktop"
    ][0]

    desktop_dist = pkg_resources.get_distribution("fiftyone-teams-desktop")

    if not desktop_req.specifier.contains(desktop_dist.version):
        raise ValueError(
            "fiftyone-teams==%s requires fiftyone-teams-desktop%s, but you have "
            "fiftyone-teams-desktop==%s installed.\n"
            "Run `pip install fiftyone-teams[desktop]` to install the proper "
            "desktop package version"
            % (
                fiftyone_dist.version,
                desktop_req.specifier,
                desktop_dist.version,
            )
        )
