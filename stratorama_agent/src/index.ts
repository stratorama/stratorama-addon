import { log } from './log.js';
import { AGENT_VERSION } from './version.js';
import { TunnelClient } from './tunnel-client.js';
import { HaWsSubscriber } from './ha-client.js';

const tunnelUrl = process.env.TUNNEL_URL;
const pairingCode = process.env.PAIRING_CODE?.trim() || null;

if (!tunnelUrl) {
  log.error('TUNNEL_URL env var missing - set tunnel_url in the add-on configuration');
  process.exit(1);
}

log.info(`Stratorama agent ${AGENT_VERSION} starting`);
log.info(`  Relay: ${tunnelUrl}`);
log.info(`  Pairing code in the configuration: ${pairingCode ? 'yes' : 'no'}`);

let haSubscriber: HaWsSubscriber | null = null;

const tunnel = new TunnelClient({
  tunnelUrl,
  pairingCode,
  version: AGENT_VERSION,
  // A refusal nothing but a configuration change can fix. Exit non-zero on purpose:
  // Home Assistant then shows the add-on in error, and the Log tab holds the line that
  // says what to do. Staying up would show "Running" next to a relay that says
  // "Not connected", which is the most confusing state this add-on can be in.
  onGiveUp: () => {
    log.error('Stopping: the add-on cannot connect until its configuration changes. Fix it, then start the add-on again.');
    haSubscriber?.stop();
    setTimeout(() => process.exit(1), 200);
  },
});
haSubscriber = new HaWsSubscriber((data) => tunnel.pushEvent(data));

tunnel.start();
haSubscriber.start();

const shutdown = (signal: string) => {
  log.info(`Received ${signal}, shutting down`);
  tunnel.stop();
  haSubscriber?.stop();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Last resort. Every async path above catches its own errors; should one still escape,
// say so in the add-on's own log format and exit non-zero, so the Supervisor's watchdog
// (when the owner enabled it) restarts the add-on. Node's default is a bare stack trace.
process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
  process.exit(1);
});
process.on('uncaughtException', (e) => {
  log.error(`Uncaught exception: ${e.stack ?? e.message}`);
  process.exit(1);
});
