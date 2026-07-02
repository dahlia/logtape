import type { LogRecord } from "@logtape/logtape";

export function materializeLogRecord(record: LogRecord): LogRecord {
  const message = record.message;
  const rawMessage = record.rawMessage;
  const descriptors = Object.getOwnPropertyDescriptors(
    record,
  ) as PropertyDescriptorMap;
  if (!hasAccessorDescriptor(descriptors)) {
    return record;
  }
  const messageDescriptor = descriptors.message;
  const rawMessageDescriptor = descriptors.rawMessage;
  const snapshotDescriptors = Object.create(null) as PropertyDescriptorMap;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (isLogRecordKey(key)) continue;
    const descriptor = descriptors[key];
    if (descriptor == null) continue;
    snapshotDescriptors[key] = isDataDescriptor(descriptor)
      ? descriptor
      : materializedDescriptor(Reflect.get(record, key), descriptor);
  }
  Object.assign(snapshotDescriptors, {
    category: materializedDescriptor(record.category, descriptors.category),
    level: materializedDescriptor(record.level, descriptors.level),
    message: materializedDescriptor(message, messageDescriptor),
    rawMessage: materializedDescriptor(rawMessage, rawMessageDescriptor),
    timestamp: materializedDescriptor(record.timestamp, descriptors.timestamp),
    properties: materializedDescriptor(
      record.properties,
      descriptors.properties,
    ),
  });
  return Object.defineProperties(
    Object.create(Object.getPrototypeOf(record)),
    snapshotDescriptors,
  ) as LogRecord;
}

function hasAccessorDescriptor(
  descriptors: PropertyDescriptorMap,
): boolean {
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor != null && !isDataDescriptor(descriptor)) return true;
  }
  return false;
}

function isDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return descriptor != null && "value" in descriptor;
}

function isLogRecordKey(key: PropertyKey): key is keyof LogRecord {
  return key === "category" ||
    key === "level" ||
    key === "message" ||
    key === "rawMessage" ||
    key === "timestamp" ||
    key === "properties";
}

function materializedDescriptor(
  value: unknown,
  descriptor: PropertyDescriptor | undefined,
): PropertyDescriptor {
  return {
    configurable: descriptor?.configurable ?? true,
    enumerable: descriptor?.enumerable ?? true,
    value,
    writable: isDataDescriptor(descriptor) ? descriptor.writable : true,
  };
}
