# session

Session is the binding layer between host sample state and format-neutral
episode capabilities. It derives source identity, opens full or preview
sessions, and owns their React lifecycle.

Product surfaces depend on this layer, never the reverse. Session may use IR,
ports, runtime capabilities, and domain-free utilities, but it does not render,
choose layouts, interpret formats, or import any view surface.
