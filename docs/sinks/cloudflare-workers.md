Cloudflare Workers
==================

*This feature is available in LogTape 2.5.0 and later.*

The *@logtape/cloudflare-workers* package writes one structured object per log
record to the Workers console. [Workers Logs] indexes fields on those objects
so you can filter by an application property such as `event`. The sink is
synchronous: it makes no network requests and needs no `waitUntil()` or flush.

[Workers Logs]: https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects


Set up the sink
---------------

Install the sink alongside LogTape:

~~~~ bash
npm install @logtape/logtape @logtape/cloudflare-workers
~~~~

Configure it once in your Worker entry point:

~~~~ typescript
import { getWorkersConsoleSink } from "@logtape/cloudflare-workers";
import { configureSync, getLogger } from "@logtape/logtape";

configureSync({
  sinks: { workers: getWorkersConsoleSink() },
  loggers: [{ category: ["app"], lowestLevel: "info", sinks: ["workers"] }],
});

const logger = getLogger(["app", "catalog"]);
logger.info("Catalog loaded", { event: "catalog_loaded" });
~~~~

The `level`, `message`, and `category` fields come from the record and override
properties with the same names. The `level` field matches the console method:
`trace` and `debug` map to `debug`, `info` stays `info`, `warning` maps to
`warn`, and `error` and `fatal` map to `error`. The sink does not output the
original LogTape timestamp.

Use plain objects, arrays, or primitive values for custom fields. Convert
objects such as `URL` and `Headers` to strings or plain data before logging
them. Unsupported values can appear as `[unserializable]`. The sink also
uses this placeholder for objects and arrays it cannot finish processing within
its traversal limit. Reaching the limit does not drop top-level scalar
fields or the stack on the explicit `error` property.


Enable Workers Logs and Workers Issues
--------------------------------------

Enable [log collection] to store and search console output. To monitor handled
errors with [Workers Issues], also enable Issues and redeploy. The Issues
setting requires Wrangler 4.134.0 or later. This is a *wrangler.jsonc* excerpt:

~~~~ jsonc
{
  "upload_source_maps": true,
  "observability": {
    "enabled": true,
    "issues": { "enabled": true }
  }
}
~~~~

If a framework builds your Worker, have it generate [source maps] before
Wrangler uploads them. Then pass the caught value as the `error` property:

~~~~ typescript
try {
  return await loadCatalog();
} catch (error) {
  logger.error("Could not load catalog", { error });
  return Response.json({ items: [] });
}
~~~~

The sink preserves an `Error` object's stack when available. It does not
create a stack for other thrown values or remove secrets from messages,
properties, or stacks. Cloudflare controls capture, grouping, and remapping;
check the [Workers Logs limits] and [observability pricing] before choosing
sampling and retention settings. Do not assume Workers Logs sampling controls
Workers Issues detection.

[log collection]: https://developers.cloudflare.com/workers/observability/logs/workers-logs/#enable-workers-logs
[Workers Issues]: https://developers.cloudflare.com/workers/observability/issues/#enable-issues
[source maps]: https://developers.cloudflare.com/workers/observability/source-maps/
[Workers Logs limits]: https://developers.cloudflare.com/workers/observability/logs/workers-logs/#limits
[observability pricing]: https://developers.cloudflare.com/observability/pricing/
