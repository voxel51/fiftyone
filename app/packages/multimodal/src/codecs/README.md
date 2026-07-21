# codecs

Codecs own low-level inspection and normalization of encoded media payloads.
They answer questions about bitstreams without choosing sources, scheduling
work, producing IR, or rendering pixels.

This is a headless foundation shared by adapters, decoders, and visualization.
It may use only other codec code and domain-free utilities.
