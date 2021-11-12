import tornado.web


class FileHandler(tornado.web.StaticFileHandler):
    def set_headers(self):
        super().set_headers()
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.set_header("x-colab-notebook-cache-control", "no-cache")

    def get_content_type(self):
        if self.absolute_path.endswith(".js"):
            return "text/javascript"

        return super().get_content_type()
