"""
Notebook Session HTML templates

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from jinja2 import Template


SCREENSHOT_STYLE = """
@import url("https://fonts.googleapis.com/css2?family=Palanquin&display=swap");

body, html {
  margin: 0;
  padding: 0;
  width: 100%;
}

#focontainer-{{ subscription }} {
  position: relative;
  height: {{ height }}px;
  display: block !important;
}
#foactivate-{{ subscription }} {
  font-weight: bold;
  cursor: pointer;
  font-size: 24px;
  border-radius: 3px;
  text-align: center;
  padding: 0.5em;
  color: rgb(255, 255, 255);
  font-family: "Palanquin", sans-serif;
  position: absolute;
  left: 50%;
  top: 50%;
  width: 160px;
  margin-left: -80px;
  margin-top: -23px;
  background: hsla(210,11%,15%, 0.8);
  border: none;
}
#foactivate-{{ subscription }}:focus {
  outline: none;
}
#fooverlay-{{ subscription }} {
  width: 100%;
  height: 100%;
  background: hsla(208, 7%, 46%, 0.7);
  position: absolute;
  top: 0;
  left: 0;
  display: none;
  cursor: pointer;
}
"""

SCREENSHOT_SCRIPT = """
   (function() {
     var container = document.getElementById("focontainer-{{ subscription }}");
     var overlay = document.getElementById("fooverlay-{{ subscription }}");
     fetch(`{{ url }}fiftyone`)
     .then(() => {
        overlay.addEventListener("click", () => {
          fetch(`{{ url }}event`, {
            method: "POST",
            body: JSON.stringify({
              event: "reactivate_notebook_cell",
              data: { subscription: "{{ subscription }}" },
              subscription: "{{ subscription }}"
            })
          })
        });
        container.addEventListener("mouseenter", () => overlay.style.display = "block");
        container.addEventListener("mouseleave", () => overlay.style.display = "none");
     });
   })();
"""


SCREENSHOT_DIV = """
<div id="focontainer-{{ subscription }}">
   <div id="fooverlay-{{ subscription }}" style="display: none;">
      <button id="foactivate-{{ subscription }}" >Activate</button>
   </div>
   <img src='{{ image }}' style="width: 100%; max-width: {{ max_width }}px;"/>
</div>
"""


SCREENSHOT_HTML = Template(
    """
<style>%s</style>
%s
<script type="text/javascript">%s</script>
"""
    % (SCREENSHOT_STYLE, SCREENSHOT_DIV, SCREENSHOT_SCRIPT)
)


SCREENSHOT_COLAB = """
<style>
{{ style }}
</style>
<div id="focontainer-{{ subscription }}" style="display: none;">
   <div id="fooverlay-{{ subscription }}">
      <button id="foactivate-{{ subscription }}" >Activate</button>
   </div>
</div>
"""


SCREENSHOT_COLAB_SCRIPT = """
(() => {
    google.colab.kernel.proxyPort({{ port }}, {
        'cache': true
    }).then((baseURL) => {
        const url = new URL(baseURL);
        url.searchParams.set('context', 'colab');
        url.searchParams.set('polling', 'true');
        const subscription = "{{ subscription }}";
        url.searchParams.set('subscription', subscription);
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.setAttribute('width', '100%');
        iframe.setAttribute('height', '{{ height }}');
        iframe.setAttribute('frameborder', 0);
        document.body.appendChild(iframe);
        window.addEventListener("message", (event) => {
            if (event.data.subscription !== subscription) return;
            document.body.removeChild(iframe);
            var container = document.getElementById(`focontainer-${subscription}`);
            var overlay = document.getElementById(`fooverlay-${subscription}`);
            google.colab.kernel.invokeFunction(`fiftyone.${subscription.replaceAll('-', '_')}`, [event.data.src, event.data.width], {});
            overlay.addEventListener("click", () => {
              google.colab.kernel.invokeFunction(`fiftyone.deactivate.${subscription.replaceAll('-', '_')}`, [], {})
              container.removeChild(container.children[1]);
              document.body.appendChild(iframe);
            });
            container.addEventListener("mouseenter", () => overlay.style.display = "block");
            container.addEventListener("mouseleave", () => overlay.style.display = "none");
        });
    });
})()
"""


SCREENSHOT_DATABRICKS_SCRIPT = """
   (function() {
     var container = document.getElementById("focontainer-{{ subscription }}");
     var overlay = document.getElementById("fooverlay-{{ subscription }}");
     var params = new URLSearchParams(window.location.search)
     var proxy = params.get("proxy");
     var url = new URL(window.location.toString());
     params.set("context", "databricks");
     params.set("polling", true);
     params.set("subscription", "{{ subscription }}");
     url.search = params.toString();
     url.pathname = proxy;
     fetch(`{{ proxy }}screenshot/{{ subscription }}`)
     .then(() => {
        overlay.addEventListener("click", () => {
          window.location = url.toString();
        });
        container.addEventListener("mouseenter", () => overlay.style.display = "block");
        container.addEventListener("mouseleave", () => overlay.style.display = "none");
     });
   })();
"""

SCREENSHOT_DATABRICKS = Template(
    """
<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="preload" href="https://fonts.googleapis.com/css2?family=Palanquin&display=swap" as="font" type="font/woff" crossorigin>
    <meta charset="UTF-8" />
    <meta name="description" content="Explore, Analyze, Curate" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FiftyOne</title>
    <style>
      %s
    </style>
  </head>
  <body>
    %s
    <script type="text/javascript">%s</script>
  </body>
</html>
"""
    % (SCREENSHOT_STYLE, SCREENSHOT_DIV, SCREENSHOT_DATABRICKS_SCRIPT)
)
