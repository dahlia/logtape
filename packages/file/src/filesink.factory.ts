import type { Sink } from "@logtape/logtape";
import type {
  AsyncRotatingFileSinkDriver,
  FileSinkOptions,
  getBaseFileSink,
  getBaseRotatingFileSink,
  RotatingFileSinkDriver,
  RotatingFileSinkOptions,
} from "./filesink.base.ts";
import type {
  AsyncTimeRotatingFileSinkDriver,
  getBaseTimeRotatingFileSink,
  TimeRotatingFileSinkDriver,
  TimeRotatingFileSinkOptions,
} from "./timefilesink.ts";

/** Shared functions injected after the selected platform factory is loaded. */
export interface FileSinkDependencies {
  readonly getBaseFileSink: typeof getBaseFileSink;
  readonly getBaseRotatingFileSink: typeof getBaseRotatingFileSink;
  readonly getBaseTimeRotatingFileSink: typeof getBaseTimeRotatingFileSink;
  readonly join: (...paths: string[]) => string;
}

/** The existing file sink overloads shared by the internal factories. */
export interface FileSinkFunctions {
  getFileSink(path: string, options?: FileSinkOptions): Sink & Disposable;
  getFileSink(
    path: string,
    options: FileSinkOptions & { nonBlocking: true },
  ): Sink & AsyncDisposable;
  getRotatingFileSink(
    path: string,
    options?: RotatingFileSinkOptions,
  ): Sink & Disposable;
  getRotatingFileSink(
    path: string,
    options: RotatingFileSinkOptions & { nonBlocking: true },
  ): Sink & AsyncDisposable;
  getTimeRotatingFileSink(
    options: TimeRotatingFileSinkOptions,
  ): Sink & Disposable;
  getTimeRotatingFileSink(
    options: TimeRotatingFileSinkOptions & { nonBlocking: true },
  ): Sink & AsyncDisposable;
}

/** Factory result, including the drivers used by the internal npm entries. */
export interface FileSinkFactoryResult<TFile> extends FileSinkFunctions {
  readonly driver: RotatingFileSinkDriver<TFile>;
  readonly asyncDriver: AsyncRotatingFileSinkDriver<TFile>;
  readonly timeDriver: TimeRotatingFileSinkDriver<TFile>;
  readonly asyncTimeDriver: AsyncTimeRotatingFileSinkDriver<TFile>;
}
