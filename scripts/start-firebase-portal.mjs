import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
  throw new Error('O portal com emuladores não pode executar em produção ou na Vercel.');
}

const environment = {
  ...process.env,
  RODOVAR_FIREBASE_ENV: 'emulator',
  GCLOUD_PROJECT: 'demo-rodovar-conecta',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  VITE_RODOVAR_AUTH_PROVIDER: 'firebase-emulator',
  HOST: '127.0.0.1',
  PORT: process.env.FIREBASE_PORTAL_PORT || '3100',
};

if (process.platform === 'win32' && !environment.JAVA_HOME && fs.existsSync('tools/java21')) {
  const folder = fs
    .readdirSync('tools/java21', { withFileTypes: true })
    .find((entry) => entry.isDirectory());
  if (folder) environment.JAVA_HOME = path.resolve('tools/java21', folder.name);
}

const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
environment[pathKey] = [
  ...(environment.JAVA_HOME ? [path.join(environment.JAVA_HOME, 'bin')] : []),
  path.dirname(process.execPath),
  environment[pathKey] || '',
].join(path.delimiter);

function waitForPort(port, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) reject(new Error(`Porta ${port} não iniciou.`));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

const firebase = spawn(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:start',
    '--config',
    'firebase.test.json',
    '--project',
    'demo-rodovar-conecta',
    '--only',
    'auth,firestore',
  ],
  { env: environment, stdio: 'inherit' }
);

let portal;
const stop = () => {
  portal?.kill('SIGINT');
  firebase.kill('SIGINT');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  await Promise.all([waitForPort(9099), waitForPort(8080)]);
  portal = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: environment,
    stdio: 'inherit',
  });
  portal.once('exit', (code) => {
    firebase.kill('SIGINT');
    process.exitCode = code ?? 1;
  });
  firebase.once('exit', (code) => {
    portal?.kill('SIGINT');
    if (code && code !== 0) process.exitCode = code;
  });
  console.log(`Portal Firebase de homologação: http://127.0.0.1:${environment.PORT}`);
} catch (error) {
  stop();
  throw error;
}
