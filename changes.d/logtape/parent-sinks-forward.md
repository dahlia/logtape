 -  Added `"forward"` mode to the `parentSinks` option of `LoggerConfig`.
    Unlike the default `"inherit"` mode, `"forward"` inherits ancestors'
    configured sinks without applying each ancestor's `lowestLevel`
    threshold, so records accepted by the logger's own `lowestLevel` reach
    the inherited sinks as well.  An ancestor configured with
    `parentSinks: "override"` still stops the inheritance chain.  [[#198]]
