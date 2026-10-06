---
links:
  '#243': https://github.com/dahlia/logtape/issues/243
  '#251': https://github.com/dahlia/logtape/pull/251
---
 -  Added `inspectLogger()` function, which explains how the current
    configuration routes records for a logger without logging anything or
    invoking filters and sinks.  It reports the effective category, the
    level gates and sink paths (repeats included) with the categories that
    supplied them, the selected filters, where sink inheritance stops, and
    whether a scoped configuration applies.  [[#243], [#251]]

     -  Added `InspectLoggerOptions`, `LoggerInspection`,
        `LoggerNodeInspection`, `SinkPathInspection`,
        `LevelGateInspection`, `FilterSetInspection`, `FilterInspection`,
        and `InheritanceBoundaryInspection` interfaces.
     -  Added `LoggerInspectionStatus` type.
