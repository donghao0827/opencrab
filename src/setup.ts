import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

async function runSetup() {
  console.log('\n🦀 欢迎使用 OpenCrab 配置向导\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'FEISHU_APP_ID',
      message: '请输入飞书 App ID:',
      default: process.env.FEISHU_APP_ID,
      validate: (input) => input ? true : 'App ID 不能为空'
    },
    {
      type: 'password',
      name: 'FEISHU_APP_SECRET',
      message: '请输入飞书 App Secret:',
      default: process.env.FEISHU_APP_SECRET,
      mask: '*'
    },
    {
      type: 'input',
      name: 'PROJECTS_ROOT',
      message: '请输入本地项目根目录 (绝对路径):',
      default: process.env.PROJECTS_ROOT || path.join(os.homedir(), 'Documents/work')
    },
    {
      type: 'input',
      name: 'AGENT_BIN',
      message: '请输入 Cursor Agent 二进制文件路径:',
      default: process.env.AGENT_BIN || path.join(os.homedir(), '.local/bin/agent')
    },
    {
      type: 'input',
      name: 'WORKTREE_ROOT',
      message: '请输入 Git Worktree 存储根目录:',
      default: process.env.WORKTREE_ROOT || path.join(os.homedir(), '.cursor/worktrees')
    },
    {
      type: 'list',
      name: 'AGENT_MODEL',
      message: '请选择默认 AI 模型:',
      choices: ['gemini-3-flash', 'claude-3-5-sonnet', 'gpt-4o', 'auto'],
      default: 'gemini-3-flash'
    },
    {
      type: 'number',
      name: 'DASHBOARD_PORT',
      message: '管理后台端口:',
      default: 4000
    }
  ]);

  let envContent = '';
  for (const [key, value] of Object.entries(answers)) {
    envContent += `${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`\n✅ 配置已保存至 ${envPath}`);
  console.log('现在你可以运行 `npm start` 启动机器人了！\n');
}

runSetup().catch(console.error);
