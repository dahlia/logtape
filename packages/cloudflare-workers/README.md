LogTape for Cloudflare Workers
==============================

*@logtape/cloudflare-workers* writes structured LogTape records to the Workers
console. Pass a caught `Error` as the `error` property to include its stack
when available.

~~~~ bash
npm install @logtape/logtape @logtape/cloudflare-workers
~~~~

Use `getWorkersConsoleSink()` with `configureSync()` in your Worker entry
point. See the [Cloudflare Workers guide] for configuration and examples.

[Cloudflare Workers guide]: https://logtape.org/sinks/cloudflare-workers
