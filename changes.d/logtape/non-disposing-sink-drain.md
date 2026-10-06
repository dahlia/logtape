---
links:
  '#239': https://github.com/dahlia/logtape/issues/239
  '#247': https://github.com/dahlia/logtape/pull/247
---
 -  Added the `drain()` function and the `Drainable` interface for waiting
    until the records that sinks accepted before the call have settled,
    without disposing of the sinks.  A record settles when its sink operation
    finishes, including when the operation fails, or when the sink drops the
    record after accepting it.  Records logged after the call are not waited
    for.  The sinks returned by `getStreamSink()` and `fromAsyncSink()` have
    a `drain()` method, and `withFilter()` and `fingersCrossed()` forward it
    when the wrapped sink has one.  Draining a `fingersCrossed()` sink does
    not release records still waiting for a trigger.  [[#239], [#247]]

 -  Changed the type of the `getStreamSink()` function to
    `(stream: WritableStream, options?: StreamSinkOptions) => Sink & AsyncDisposable & Drainable`
    (was
    `(stream: WritableStream, options?: StreamSinkOptions) => Sink & AsyncDisposable`).
    [[#239], [#247]]

 -  Changed the type of the `fromAsyncSink()` function to
    `(asyncSink: AsyncSink, options?: AsyncSinkOptions) => Sink & AsyncDisposable & Drainable`
    (was
    `(asyncSink: AsyncSink, options?: AsyncSinkOptions) => Sink & AsyncDisposable`).
    [[#239], [#247]]

 -  Added overloads to the `withFilter()` and `fingersCrossed()` functions
    that keep `Drainable` in the return type when the wrapped sink is
    `Drainable`, such as
    `withFilter(sink: Sink & Drainable, filter: FilterLike): Sink & Drainable`.
    [[#239], [#247]]
