/**
 * Host-side container config for the `opencode` provider.
 *
 * OpenCode's `opencode serve` process stores state under XDG_DATA_HOME, which
 * we pin to a per-session host directory mounted at /opencode-xdg. The
 * OPENCODE_* env vars (+ ANTHROPIC_BASE_URL as the upstream baseURL) tell the
 * CLI which provider/model to use at runtime. NO_PROXY / no_proxy are merged
 * with host values so the in-container OpenCode client can talk to 127.0.0.1
 * even when HTTPS_PROXY is set by OneCLI.
 *
 * Backbone fix: these vars live in `.env` (read via readEnvFile, like
 * claude.ts) and are NOT loaded into the host process.env — so read from the
 * .env file (falling back to process.env), and forward ANTHROPIC_BASE_URL too,
 * which the upstream provider config (buildOpenCodeConfig) needs as the
 * baseURL. Scoped to opencode containers only; Claude's path is unaffected.
 */
import fs from 'fs';
import path from 'path';

import { registerProviderContainerConfig } from './provider-container-registry.js';
import { readEnvFile } from '../env.js';

function mergeNoProxy(current: string | undefined, additions: string): string {
  if (!current?.trim()) return additions;
  const parts = new Set(
    current
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const addition of additions.split(',')) {
    const trimmed = addition.trim();
    if (trimmed) parts.add(trimmed);
  }
  return [...parts].join(',');
}

const OPENCODE_KEYS = ['OPENCODE_PROVIDER', 'OPENCODE_MODEL', 'OPENCODE_SMALL_MODEL', 'ANTHROPIC_BASE_URL'] as const;

registerProviderContainerConfig('opencode', (ctx) => {
  const opencodeDir = path.join(ctx.sessionDir, 'opencode-xdg');
  fs.mkdirSync(opencodeDir, { recursive: true });

  // Prefer the host process.env, fall back to the .env file (readEnvFile reads
  // <cwd>/.env without polluting process.env).
  const fromFile = readEnvFile([...OPENCODE_KEYS]);

  const env: Record<string, string> = {
    XDG_DATA_HOME: '/opencode-xdg',
    NO_PROXY: mergeNoProxy(ctx.hostEnv.NO_PROXY, '127.0.0.1,localhost'),
    no_proxy: mergeNoProxy(ctx.hostEnv.no_proxy, '127.0.0.1,localhost'),
  };
  for (const key of OPENCODE_KEYS) {
    const value = ctx.hostEnv[key] ?? fromFile[key];
    if (value) env[key] = value;
  }

  return {
    mounts: [{ hostPath: opencodeDir, containerPath: '/opencode-xdg', readonly: false }],
    env,
  };
});
