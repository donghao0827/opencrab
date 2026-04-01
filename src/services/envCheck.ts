import { execSync } from 'child_process';
import { Logger } from './logger.js';

export function checkEnvironment() {
  Logger.info('Env', '正在检查运行环境...');
  
  const checks = [
    { name: 'Node.js', cmd: 'node -v' },
    { name: 'Git', cmd: 'git --version' },
    { name: 'Cursor Agent', cmd: `${process.env.AGENT_BIN || 'agent'} --version` },
    { name: 'Python3', cmd: 'python3 --version' }
  ];

  let allOk = true;
  for (const check of checks) {
    try {
      const output = execSync(check.cmd, { stdio: 'pipe' }).toString().trim();
      Logger.info('Env', `✅ ${check.name} 已就绪: ${output}`);
    } catch (err) {
      Logger.error('Env', `❌ ${check.name} 未找到或运行异常。指令: ${check.cmd}`);
      allOk = false;
    }
  }

  if (!allOk) {
    Logger.error('Env', '环境检查未通过，请确保上述工具已正确安装并加入 PATH。');
    process.exit(1);
  }
}
