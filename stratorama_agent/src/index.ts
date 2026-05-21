import { log } from './log.js';
import { TunnelClient } from './tunnel-client.js';
import { HaWsSubscriber } from './ha-client.js';

const tunnelUrl = process.env.TUNNEL_URL;
const pairingCode = process.env.PAIRING_CODE?.trim() || null;

if (!tunnelUrl) {
  log.error('TUNNEL_URL env var missing — set tunnel_url in add-on config');
  process.exit(1);
}

log.info('Stratorama agent starting');
log.info(`  Tunnel URL: ${tunnelUrl}`);
log.info(`  Pairing code provided: ${pairingCode ? 'yes' : 'no'}`);

const tunnel = new TunnelClient({ tunnelUrl, pairingCode });
const haSubscriber = new HaWsSubscriber((data) => tunnel.pushEvent(data));

void tunnel.start();
haSubscriber.start();

const shutdown = (signal: string) => {
  log.info(`Received ${signal}, shutting down`);
  tunnel.stop();
  haSubscriber.stop();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
