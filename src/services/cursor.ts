import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger.js';

const AGENT_BIN = process.env.AGENT_BIN || path.join(process.env.HOME || '', '.local/bin/agent');
const TIMEOUT_MS = 5 * 60 * 1000;
const WORKTREE_ROOT = process.env.WORKTREE_ROOT || path.join(
  process.env.HOME || '/tmp',
  '.cursor/worktrees',
);

export interface AgentResult {
  success: boolean;
  output: string;
  worktreePath?: string;
}

export interface AgentOptions {
  model?: string;
  worktree?: string;
  worktreeBase?: string;
  outputFormat?: string;
  continue?: boolean;
}

export class CursorService {
  hasSession(projectPath: string, sessionId: string): boolean {
    const sessionPath = this.getWorktreePath(projectPath, `opencrab-session-${sessionId}`);
    return fs.existsSync(sessionPath);
  }

  getWorktreePath(projectPath: string, worktreeName: string): string {
    const repoName = path.basename(projectPath);
    return path.join(WORKTREE_ROOT, repoName, worktreeName);
  }

  async run(
    prompt: string,
    projectPath: string,
    options: AgentOptions = {},
  ): Promise<AgentResult> {
    try {
      const mode = options.worktree ? `worktree:${options.worktree}` : 'direct';
      Logger.info('Cursor', `启动 Agent (${mode}) 处理项目: ${projectPath}`);

      if (!fs.existsSync(projectPath)) {
        return { success: false, output: `项目目录不存在: ${projectPath}` };
      }

      if (!fs.existsSync(AGENT_BIN)) {
        return { success: false, output: `Agent 路径不存在: ${AGENT_BIN}` };
      }

      return new Promise((resolve) => {
        const wrapperScript = path.join(process.cwd(), 'src/services/pty_wrapper.py');
        let output = '';

        const optionsJson = JSON.stringify({
          model: options.model,
          outputFormat: options.outputFormat || 'text',
          worktree: options.worktree,
          worktreeBase: options.worktreeBase,
          continue: options.continue,
        });

        const child = spawn('python3', [wrapperScript, AGENT_BIN, prompt, optionsJson], {
          cwd: projectPath,
          stdio: ['inherit', 'pipe', 'pipe'],
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            PATH: `${path.dirname(AGENT_BIN)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`,
          },
        });

        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          process.stdout.write(text);
          output += text;
        });

        child.stderr?.on('data', (data: Buffer) => {
          process.stderr.write(data.toString());
        });

        const timeout = setTimeout(() => {
          Logger.error('Cursor', `Agent 执行超时 (${TIMEOUT_MS / 1000}s)`);
          child.kill('SIGKILL');
          resolve({ success: false, output: 'Agent 执行超时' });
        }, TIMEOUT_MS);

        child.on('error', (err) => {
          clearTimeout(timeout);
          Logger.error('Cursor', `Agent 启动失败`, err);
          resolve({ success: false, output: `Agent 启动失败: ${err.message}` });
        });

        child.on('exit', (code) => {
          clearTimeout(timeout);
          const trimmed = output.trim();

          let worktreePath: string | undefined;
          if (options.worktree) {
            worktreePath = this.getWorktreePath(projectPath, options.worktree);
          }

          if (code === 0) {
            Logger.info('Cursor', 'Agent 执行完毕');
            resolve({
              success: true,
              output: trimmed || 'Agent 已处理完毕。',
              worktreePath,
            });
          } else {
            Logger.error('Cursor', `Agent 异常退出，退出码: ${code}`);
            resolve({
              success: false,
              output: trimmed || `Agent 异常退出 (code: ${code})`,
              worktreePath,
            });
          }
        });
      });
    } catch (error) {
      Logger.error('Cursor', 'run 异常', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Agent 异常: ${msg}` };
    }
  }
}
