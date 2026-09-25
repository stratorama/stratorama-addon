import { log } from './log.js';
import { AGENT_VERSION } from './version.js';
import { resolveConfig } from './config.js';
import { Health } from './health.js';
import { TunnelClient } from './tunnel-client.js';
import { HaWsSubscriber, haRestCaller } from './ha-client.js';

const resolved = resolveConfig(process.env);
if (!resolved.ok) {
  // Exit non-zero: the add-on shows in error, a container shows "Restarting" - either way
  // the next thing the owner reads is this line, and nothing has touched the relay or Home
  // Assistant.
  log.error(resolved.error);
  process.exit(1);
}
const config = resolved.config;
const docker = config.runtime === 'docker';

log.info(`Stratorama agent ${AGENT_VERSION} starting (${docker ? 'Docker image' : 'Home Assistant app'})`);
log.info(`  Relay: ${config.tunnelUrl}`);
log.info(`  Home Assistant: ${config.ha.httpUrl}`);
log.info(`  Pairing code in the configuration: ${config.pairingCode ? 'yes' : 'no'}`);

/** How often an idle Docker agent repeats why, so `docker logs --tail` still shows it. */
const IDLE_REMINDER_MS = 60 * 60_000;

const health = new Health();
let gaveUp = false;

/**
 * Something no retry can fix: a refused pairing code or credential (tunnel-client.ts), or a
 * token Home Assistant rejects. The line saying what to do is already in the log.
 *
 * The ADD-ON EXITS non-zero: Home Assistant then shows it in error, and the Log tab holds
 * the line that says what to do. Staying up would show "Running" next to a relay that says
 * "Not connected", which is the most confusing state it can be in.
 *
 * THE DOCKER AGENT STAYS UP, idle. Any exit - even exit 0 - is restarted by
 * `restart: unless-stopped`, which is what a home server needs to survive a reboot, so an
 * exit here would become a loop: the relay would see the same refused code once a minute and
 * lock this address out for 15 minutes, locking out the corrected code with it, and Home
 * Assistant would log a failed login for every retry of a rejected token. The container's
 * health turns "unhealthy" instead, and a changed configuration means a new container anyway.
 */
function giveUp(reason: string): void {
  if (gaveUp) return;
  gaveUp = true;
  tunnel.stop();
  haSubscriber.stop();
  health.stopped();
  if (!docker) {
    log.error('Stopping: the app cannot connect until its configuration changes. Fix it, then start the app again.');
    setTimeout(() => process.exit(1), 200);
    return;
  }
  log.error(
    'Staying up without connecting, so that Docker does not restart into the same refusal. Nothing ' +
      'will change until the configuration does: fix it, then recreate the container (docker compose up -d).',
  );
  setInterval(() => log.warn(`Still idle, waiting for a new configuration: ${reason}`), IDLE_REMINDER_MS);
}

const tunnel = new TunnelClient({
  tunnelUrl: config.tunnelUrl,
  pairingCode: config.pairingCode,
  version: AGENT_VERSION,
  runtime: config.runtime,
  callHa: haRestCaller(config.ha),
  onGiveUp: giveUp,
  onReadyChange: (ready) => health.relay(ready),
});

const haSubscriber = new HaWsSubscriber({
  endpoints: config.ha,
  onEvent: (data) => tunnel.pushEvent(data),
  onReadyChange: (ready) => health.ha(ready),
  onAuthRejected: () => {
    const line = docker
      ? 'Home Assistant rejected HA_TOKEN. Create a new long-lived access token (your Home Assistant ' +
        'profile, Security tab), set it as HA_TOKEN, then recreate the container (docker compose up -d).'
      : 'Home Assistant rejected the Supervisor token: check that homeassistant_api: true is set in config.yaml.';
    log.error(line);
    giveUp(line);
  },
});

tunnel.start();
haSubscriber.start();

const shutdown = (signal: string) => {
  log.info(`Received ${signal}, shutting down`);
  tunnel.stop();
  haSubscriber.stop();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Last resort. Every async path above catches its own errors; should one still escape,
// say so in the agent's own log format and exit non-zero, so the Supervisor's watchdog
// (when the owner enabled it) or Docker's restart policy restarts it. Node's default is a
// bare stack trace.
process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
  process.exit(1);
});
process.on('uncaughtException', (e) => {
  log.error(`Uncaught exception: ${e.stack ?? e.message}`);
  process.exit(1);
});
