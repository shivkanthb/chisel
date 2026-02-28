import type { Logger } from "./types";

const noop = () => {};

const defaultLogger: Logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: noop,
};

/**
 * Creates a scoped logger that injects workflow/run/step metadata into every log call.
 */
export function createScopedLogger(
  base: Logger | undefined,
  scope: Record<string, unknown>
): Logger {
  const logger = base ?? defaultLogger;

  return {
    info: (msg, meta) => logger.info(msg, { ...scope, ...meta }),
    warn: (msg, meta) => logger.warn(msg, { ...scope, ...meta }),
    error: (msg, meta) => logger.error(msg, { ...scope, ...meta }),
    debug: (msg, meta) => logger.debug(msg, { ...scope, ...meta }),
  };
}
