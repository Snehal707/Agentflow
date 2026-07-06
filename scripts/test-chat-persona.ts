import { spawn } from 'node:child_process';

type Step = {
  name: string;
  command: string;
  args: string[];
};

const steps: Step[] = [
  {
    name: 'Hermes chat quality',
    command: 'npm',
    args: ['run', 'test:hermes-chat-quality:soft'],
  },
  {
    name: 'Telegram fallback sanitizer',
    command: 'npm',
    args: ['run', 'test:telegram-chat-fallback'],
  },
  {
    name: 'Semantic continuation',
    command: 'npm',
    args: ['run', 'test:semantic-continuation'],
  },
];

function runStep(step: Step): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${step.name} ===`);
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.name} failed with code ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}`));
    });
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  for (const step of steps) {
    await runStep(step);
  }
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nChat persona suite passed: ${steps.length}/${steps.length} checks in ${durationSeconds}s`);
}

main().catch((error) => {
  console.error(`\nChat persona suite failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
