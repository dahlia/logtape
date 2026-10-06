---
links:
  '#238': https://github.com/dahlia/logtape/issues/238
  '#246': https://github.com/dahlia/logtape/pull/246
---
 -  Added queue limits and a request lifetime hook to `fromAsyncSink()`.
    Its type is now
    `(asyncSink: AsyncSink, options?: AsyncSinkOptions) => Sink & AsyncDisposable`
    (was `(asyncSink: AsyncSink) => Sink & AsyncDisposable`).  Without options,
    the adapter behaves as before.  [[#238], [#246]]

     -  The `maxQueueSize` and `overflow` options cap how many records wait
        for the async sink, not counting the one being processed, and choose
        whether a full queue drops its oldest waiting record (the default)
        or the incoming one.  The limit bounds queued records, not total
        memory: with `"drop-oldest"`, the promise and request-context
        bookkeeping of each dropped record remains until the record being
        processed at that time settles.  `"drop-newest"` leaves nothing
        behind for rejected records.
     -  The `onDrop` callback receives a `SinkDropEvent` with the number of
        dropped records and the reason, but no record payloads.
     -  The `waitUntil` callback is called synchronously while a record is
        being logged, with a `Promise` that settles once that record and
        every earlier record have been processed or dropped.  Passing
        a platform's `waitUntil()` function lets serverless functions finish
        sending logs after returning a response.
     -  Added the `AsyncSinkOptions` interface and the
        `AsyncSinkOverflowPolicy`, `SinkDropEvent`, and `SinkDropReason`
        types.
