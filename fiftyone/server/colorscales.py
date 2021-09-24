"""
FiftyOne colorscales request

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import plotly.express as px
import tornado.web


class ColorscalesHandler(tornado.web.RequestHandler):
    """Colorscale requests

    Args:
        page: the page number
        page_length (20): the number of items to return
    """

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    async def get(self):
        self.write({"colorscales": px.colors.named_colorscales()})
