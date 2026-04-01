import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger.js';

export class GitService {
  cleanupWorktree(worktreePath: string, projectPath: string) {
    try {
      if (!fs.existsSync(worktreePath)) return;

      const branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath })
        .toString().trim();

      execSync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      Logger.info('Git', `worktree 已移除: ${worktreePath}`);

      if (branchName.startsWith('opencrab-')) {
        try {
          execSync(`git branch -D "${branchName}"`, { cwd: projectPath });
          Logger.info('Git', `临时分支已删除: ${branchName}`);
        } catch {}
      }
    } catch (err) {
      Logger.error('Git', `worktree 清理失败`, err);
    }
  }

  hasChanges(projectPath: string): boolean {
    try {
      const status = execSync('git status --porcelain', { cwd: projectPath }).toString().trim();
      return status.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 仅拉取最新代码，不修改主仓库的 HEAD 或工作区
   */
  syncBranch(branch: string, projectPath: string) {
    try {
      Logger.info('Git', `同步远程分支数据 ${branch}...`);
      execSync(`git fetch origin ${branch}:${branch}`, { cwd: projectPath });
      Logger.info('Git', `分支数据 ${branch} 已更新`);
    } catch (err) {
      // 如果本地没有该分支，直接 fetch
      try {
        execSync(`git fetch origin ${branch}`, { cwd: projectPath });
        Logger.info('Git', `远程分支 ${branch} 已拉取`);
      } catch (innerErr) {
        Logger.warn('Git', `同步分支 ${branch} 失败: ${innerErr instanceof Error ? innerErr.message : innerErr}`);
      }
    }
  }

  commitLocal(message: string, projectPath: string): string {
    const options = { cwd: projectPath };
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', options).toString().trim();

    if (!this.hasChanges(projectPath)) {
      Logger.info('Git', '没有检测到代码变更，跳过提交。');
      return currentBranch;
    }

    Logger.info('Git', `执行本地提交: ${projectPath}`);
    execSync('git add .', options);
    execSync(`git commit -m "${message}"`, options);
    Logger.info('Git', `已提交到本地分支: ${currentBranch}`);
    return currentBranch;
  }

  push(branch: string, projectPath: string) {
    const options = { cwd: projectPath };
    try {
      Logger.info('Git', `拉取最新代码并变基: ${branch}...`);
      // 先尝试拉取并变基，确保本地是最新的，避免 non-fast-forward 错误
      execSync(`git pull origin ${branch} --rebase`, options);
      
      Logger.info('Git', `推送分支 ${branch}...`);
      execSync(`git push origin ${branch}`, options);
      Logger.info('Git', `推送成功: ${branch}`);
    } catch (err) {
      Logger.error('Git', `推送分支 ${branch} 失败，可能存在远程冲突`, err);
      throw err;
    }
  }

  /**
   * 全隔离合并：在临时目录中完成合并与推送，完全不影响主仓库的工作区和分支状态
   */
  async mergeToDeploy(sourceBranch: string, targetBranch: string, projectPath: string): Promise<boolean> {
    const tempMergePath = path.join(os.tmpdir(), `opencrab-merge-${Date.now()}`);
    try {
      Logger.info('Git', `开始全隔离合并: ${sourceBranch} → ${targetBranch}`);
      
      // 1. 先确保本地有最新的目标分支数据
      this.syncBranch(targetBranch, projectPath);

      // 2. 创建一个临时的、分离的 worktree 来进行合并操作
      // 使用 --detach origin/targetBranch 确保我们是在一个纯净的远程状态上操作
      execSync(`git worktree add --detach "${tempMergePath}" "origin/${targetBranch}"`, { cwd: projectPath });
      
      const options = { cwd: tempMergePath };
      
      // 3. 执行合并
      try {
        // 合并源分支（可能是本地分支，也可能是远程分支名）
        execSync(`git merge "${sourceBranch}" --no-edit`, options);
      } catch (mergeError) {
        Logger.warn('Git', `隔离合并冲突: ${sourceBranch} -> ${targetBranch}`);
        throw mergeError;
      }
      
      // 4. 推送到远程目标分支
      // 使用 HEAD:targetBranch 语法将当前合并后的状态推送到远程
      execSync(`git push origin "HEAD:${targetBranch}"`, options);
      
      Logger.info('Git', `全隔离合并并推送成功: ${targetBranch}`);
      return true;
    } catch (error) {
      Logger.error('Git', `全隔离合并失败: ${targetBranch}`, error);
      return false;
    } finally {
      // 5. 彻底清理临时目录和 worktree 记录
      try {
        if (fs.existsSync(tempMergePath)) {
          execSync(`git worktree remove --force "${tempMergePath}"`, { cwd: projectPath });
        }
      } catch (e) {
        Logger.warn('Git', `清理临时合并目录失败: ${tempMergePath}`);
      }
    }
  }
}
