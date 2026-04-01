#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];

if (command === 'setup') {
  spawn('npx', ['tsx', path.join(rootDir, 'src/setup.ts')], { stdio: 'inherit' });
} else if (command === 'start') {
  spawn('npx', ['tsx', path.join(rootDir, 'src/bot_index.ts'), ...args.slice(1)], { stdio: 'inherit' });
} else {
  console.log(`
🦀 OpenCrab CLI

用法:
  opencrab setup         运行交互式配置向导
  opencrab start         启动机器人服务
  opencrab start [model] 指定模型启动 (例如: opencrab start claude-3-5-sonnet)
  `);
}
