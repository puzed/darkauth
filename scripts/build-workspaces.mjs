import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const entries = await readdir(packagesDir, { withFileTypes: true });
const workspaces = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const packageFile = join(packagesDir, entry.name, 'package.json');
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
  } catch {
    continue;
  }

  if (packageJson?.scripts?.build) {
    workspaces.push(packageJson.name);
  }
}

if (workspaces.length === 0) {
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tasks = workspaces
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b))
  .map(
    (workspace) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, ['run', 'build', '-w', workspace], {
          stdio: 'inherit',
          cwd: root,
        });

        child.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(workspace));
          }
        });

        child.on('error', reject);
      }),
  );

try {
  await Promise.all(tasks);
} catch (error) {
  console.error('Build failed for workspace', error.message ?? error);
  process.exit(1);
}
