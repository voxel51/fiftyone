"""
Internal string templates.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from jinja2 import Template


_SCREENSHOT_STYLE = """
@import url("https://fonts.googleapis.com/css2?family=Palanquin&display=swap");

#focontainer-{{ handle }} {
  position: relative;
  display: block !important;
}
#foactivate-{{ handle }} {
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
#foactivate-{{ handle }}:focus {
  outline: none;
}
#fooverlay-{{ handle }} {
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

_SCREENSHOT_SCRIPT = """
   (function() {
     var container = document.getElementById("focontainer-{{ handle }}");
     var overlay = document.getElementById("fooverlay-{{ handle }}");
     fetch(`{{ url }}notebook?handleId={{ handle }}`)
     .then((response) => response.json())
     .then(() => {
        overlay.addEventListener("click", () => {
          fetch(`{{ url }}reactivate?handleId={{ handle }}`)
        });
        container.addEventListener("mouseenter", () => overlay.style.display = "block");
        container.addEventListener("mouseleave", () => overlay.style.display = "none");
     });
   })();
"""
_SCREENSHOT_DIV = """
<div id="focontainer-{{ handle }}">
   <div id="fooverlay-{{ handle }}" style="display: none;">
      <button id="foactivate-{{ handle }}" >Activate</button>
   </div>
   <img src='{{ image }}' style="width: 100%; max-width: {{ max_width }}px;"/>
</div>
"""

_SCREENSHOT_HTML = Template(
    """
<style>%s</style>
%s
<script type="text/javascript">%s</script>
"""
    % (_SCREENSHOT_STYLE, _SCREENSHOT_DIV, _SCREENSHOT_SCRIPT)
)

_SCREENSHOT_COLAB = """
<style>
{{ style }}
</style>
<div id="focontainer-{{ handle }}" style="display: none;">
   <div id="fooverlay-{{ handle }}">
      <button id="foactivate-{{ handle }}" >Activate</button>
   </div>
</div>
"""

_SCREENSHOT_COLAB_SCRIPT = """
(() => {
    google.colab.kernel.proxyPort({{ port }}, {
        'cache': true
    }).then((baseURL) => {
        const url = new URL(baseURL);
        const handleId = "{{ handle }}";
        url.searchParams.set('fiftyoneColab', 'true');
        url.searchParams.set('notebook', 'true');
        url.searchParams.set('handleId', handleId);
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.setAttribute('width', '100%');
        iframe.setAttribute('height', '{{ height }}');
        iframe.setAttribute('frameborder', 0);
        document.body.appendChild(iframe);
        window.addEventListener("message", (event) => {
            if (event.data.handleId !== handleId) return;
            document.body.removeChild(iframe);
            var container = document.getElementById(`focontainer-${handleId}`);
            var overlay = document.getElementById(`fooverlay-${handleId}`);
            google.colab.kernel.invokeFunction(`fiftyone.${handleId.replaceAll('-', '_')}`, [event.data.src, event.data.width], {});
            overlay.addEventListener("click", () => {
                container.removeChild(container.children[1]);
                document.body.appendChild(iframe);
            });
            container.addEventListener("mouseenter", () => overlay.style.display = "block");
            container.addEventListener("mouseleave", () => overlay.style.display = "none");
        });
    });
})()
"""
