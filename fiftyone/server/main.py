"""
FiftyOne Tornado server.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import argparse
import os
from fiftyone.server.filters import PinHandler
from fiftyone.server.set import DatasetHandler

import tornado.escape
import tornado.ioloop
import tornado.iostream
import tornado.options
import tornado.web
from tornado.web import HTTPError
import tornado.websocket

import eta.core.serial as etas

if os.environ.get("FIFTYONE_DISABLE_SERVICES", False):
    del os.environ["FIFTYONE_DISABLE_SERVICES"]

os.environ["FIFTYONE_SERVER"] = "1"

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.clips as focl
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.stages import _STAGES
import fiftyone.core.state as fos
import fiftyone.core.uid as fou
import fiftyone.core.view as fov

from fiftyone.server.aggregations import (
    AggregationsHandler,
    TagAggregationsHandler,
)
from fiftyone.server.colorscales import ColorscalesHandler
import fiftyone.server.view as fosv
from fiftyone.server.json_util import convert
import fiftyone.server.metadata as fosm
from fiftyone.server.notebook import NotebookHandler
from fiftyone.server.sidebar import SidebarHandler
from fiftyone.server.sort import SortHandler
from fiftyone.server.state import (
    catch_errors,
    PollingHandler,
    ReactivateHandler,
    StateHandler,
)
from fiftyone.server.tag import TagHandler
import fiftyone.server.utils as fosu


class FiftyOneHandler(fosu.RequestHandler):
    """Returns the version info of the fiftyone being used"""

    def prepare(self):
        super(FiftyOneHandler, self).prepare()
        if (
            self.request.headers.get("Content-Type")
            == "application/json; charset=utf-8"
        ):
            json = tornado.escape.json_decode(self.request.body)
            for key, value in json.items():
                if type(value) is list:
                    self.request.arguments.setdefault(key, []).extend(value)
                elif type(value) is dict:
                    self.request.arguments[key] = value
                else:
                    self.request.arguments.setdefault(key, []).extend([value])

    @staticmethod
    def get_response():
        """Returns the serializable response

        Returns:
            dict
        """
        uid, _ = fou.get_user_id()
        isfile = os.path.isfile(foc.TEAMS_PATH)
        if isfile:
            submitted = etas.load_json(foc.TEAMS_PATH)["submitted"]
        else:
            submitted = False

        return {
            "version": foc.VERSION,
            "user_id": uid,
            "do_not_track": fo.config.do_not_track,
            "teams": {"submitted": submitted, "minimized": isfile},
            "dev_install": foc.DEV_INSTALL or foc.RC_INSTALL,
        }


class StagesHandler(fosu.RequestHandler):
    """Returns the definitions of stages available to the App"""

    @staticmethod
    def get_response():
        """Returns the serializable response

        Returns:
            dict
        """
        return {
            "stages": [
                {"name": stage.__name__, "params": stage._params()}
                for stage in _STAGES
            ]
        }


class FramesHandler(tornado.web.RequestHandler):
    """Frames stream requests"""

    def set_default_headers(self, *args, **kwargs):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    @catch_errors
    async def get(self):
        # pylint: disable=no-value-for-parameter
        sample_id = self.get_argument("sampleId", None)
        # pylint: disable=no-value-for-parameter
        start_frame = int(self.get_argument("frameNumber"))
        # pylint: disable=no-value-for-parameter
        frame_count = int(self.get_argument("frameCount"))

        if sample_id is None or start_frame is None:
            raise ValueError("error")

        end_frame = min(
            # pylint: disable=no-value-for-parameter
            int(self.get_argument("numFrames")) + start_frame,
            frame_count,
        )
        state = fos.StateDescription.from_dict(StateHandler.state)
        if state.view is not None:
            view = state.view
        elif state.dataset is not None:
            view = state.dataset

        view = fov.make_optimized_select_view(view, sample_id)
        view = view.set_field(
            "frames",
            F("frames").filter(
                (F("frame_number") >= start_frame)
                & (F("frame_number") <= end_frame)
            ),
        )

        frames = await foo.aggregate(
            StateHandler.sample_collection(), view._pipeline(frames_only=True)
        ).to_list(end_frame - start_frame + 1)
        convert(frames)
        self.write({"frames": frames, "range": [start_frame, end_frame]})


class PageHandler(fosu.AsyncRequestHandler):
    @catch_errors
    async def post_response(self, data):
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        page = data.get("page", 1)
        page_length = data.get("page_length", 20)
        similarity = data.get("similarity", None)

        view = fosv.get_view(
            dataset,
            stages=stages,
            filters=filters,
            count_label_tags=True,
            similarity=similarity,
        )
        if view.media_type == fom.VIDEO:
            if isinstance(view, focl.ClipsView):
                expr = F("frame_number") == F("$support")[0]
            else:
                expr = F("frame_number") == 1

            view = view.set_field("frames", F("frames").filter(expr))

        view = view.skip((page - 1) * page_length)

        samples = await foo.aggregate(
            StateHandler.sample_collection(),
            view._pipeline(attach_frames=True, detach_frames=False),
        ).to_list(page_length + 1)
        convert(samples)

        more = False
        if len(samples) > page_length:
            samples = samples[:page_length]
            more = page + 1

        results = await _generate_results(samples)

        return {"results": results, "more": more}


async def _generate_results(samples):
    metadata_map = {s["filepath"]: s.get("metadata", None) for s in samples}

    filepaths = list(metadata_map.keys())
    metadatas = await asyncio.gather(
        *[fosm.get_metadata(f, metadata=metadata_map[f]) for f in filepaths]
    )
    metadata_map = {f: m for f, m in zip(filepaths, metadatas)}

    results = []
    for sample in samples:
        filepath = sample["filepath"]
        sample_result = {"sample": sample}
        sample_result.update(metadata_map[filepath])
        results.append(sample_result)

    return results


class TeamsHandler(fosu.RequestHandler):
    """Returns whether the teams button should be minimized"""

    def post(self):
        submitted = self.get_argument("submitted", "") == "true"
        etas.write_json({"submitted": submitted}, foc.TEAMS_PATH)


class FileHandler(tornado.web.StaticFileHandler):
    def set_headers(self):
        super().set_headers()
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.set_header("content-length", self.get_content_size())
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    def get_content_type(self):
        if self.absolute_path.endswith(".js"):
            return "text/javascript"

        return super().get_content_type()


class MediaHandler(FileHandler):
    @classmethod
    def get_absolute_path(cls, root, path):
        if os.name != "nt":
            path = os.path.join("/", path)

        return path

    def validate_absolute_path(self, root, absolute_path):
        if os.path.isdir(absolute_path) and self.default_filename is not None:
            if not self.request.path.endswith("/"):
                self.redirect(self.request.path + "/", permanent=True)
                return None

            absolute_path = os.path.join(absolute_path, self.default_filename)
        if not os.path.exists(absolute_path):
            raise HTTPError(404)

        if not os.path.isfile(absolute_path):
            raise HTTPError(403, "%s is not a file", self.path)

        return absolute_path


class Application(tornado.web.Application):
    """FiftyOne Tornado Application"""

    def __init__(self, **settings):
        server_path = os.path.dirname(os.path.abspath(__file__))
        rel_web_path = "static"
        web_path = os.path.join(server_path, rel_web_path)
        handlers = [
            (r"/aggregations", AggregationsHandler),
            (r"/colorscales", ColorscalesHandler),
            (r"/dataset", DatasetHandler),
            (r"/fiftyone", FiftyOneHandler),
            (r"/frames", FramesHandler),
            (r"/filepath/(.*)", MediaHandler, {"path": ""}),
            (r"/notebook", NotebookHandler),
            (r"/page", PageHandler),
            (r"/pin", PinHandler),
            (r"/polling", PollingHandler),
            (r"/reactivate", ReactivateHandler),
            (r"/sidebar", SidebarHandler),
            (r"/sort", SortHandler),
            (r"/stages", StagesHandler),
            (r"/state", StateHandler),
            (r"/tag", TagHandler),
            (r"/tags", TagAggregationsHandler),
            (r"/teams", TeamsHandler),
            (
                r"/(.*)",
                FileHandler,
                {"path": web_path, "default_filename": "index.html"},
            ),
        ]
        super().__init__(handlers, **settings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=fo.config.default_app_port)
    parser.add_argument(
        "--address", type=str, default=fo.config.default_app_address
    )
    args = parser.parse_args()
    app = Application(debug=foc.DEV_INSTALL)
    app.listen(args.port, address=args.address)
    tornado.ioloop.IOLoop.current().start()
