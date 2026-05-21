import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { log } from './log.js';

/**
 * HA add-ons get a `/data/` volume that survives upgrades/restarts.
 * We persist the long-lived agent token there so the agent can reconnect
 * after the pairing code is consumed.
 */
const DATA_DIR = process.env.AGENT_DATA_DIR ?? '/data';
const TOKEN_FILE = join(DATA_DIR, 'agent-token.json');

interface TokenFile {
  agentToken: string;
}

export async function loadToken(): Promise<string | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TokenFile>;
    return typeof parsed.agentToken === 'string' ? parsed.agentToken : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    log.warn(`Failed to read token file: ${(e as Error).message}`);
    return null;
  }
}

export async function saveToken(agentToken: string): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload: TokenFile = { agentToken };
  await fs.writeFile(TOKEN_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn(`Failed to clear token file: ${(e as Error).message}`);
    }
  }
}
