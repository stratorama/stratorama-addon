/**
 * Minimal leveled logger. Output is captured by HA's add-on log viewer.
 * Use `info` / `warn` / `error` consistently so users get readable diagnostics.
 */
function fmt(level: string, msg: string): string {
  return `[${new Date().toISOString()}] ${level} ${msg}`;
}

export const log = {
  info(msg: string): void { console.log(fmt('INFO ', msg)); },
  warn(msg: string): void { console.warn(fmt('WARN ', msg)); },
  error(msg: string): void { console.error(fmt('ERROR', msg)); },
};
