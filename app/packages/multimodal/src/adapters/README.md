# adapters

This is the format edge.

Adapters know how a source is physically stored and translate that knowledge
into ports and IR. Vendor APIs, indexing, decompression, schema mapping, and
format-specific acceleration belong here. Once an episode session crosses this
boundary, the rest of the system should see a neutral data source.

Keep UI and shared playback policy out. If a decision makes sense for every
format, it probably belongs in runtime, query, or IR.
