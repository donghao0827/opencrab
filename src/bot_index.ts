import { FeishuBotService } from './services/feishuBot.js';
import type { BotTask } from './services/feishuBot.js';
import { CursorService } from './services/cursor.js';
import { GitService } from './services/git.js';
import { ProjectService } from './services/project.js';
import { Logger } from './services/logger.js';
import { startDashboard } from './services/dashboardServer.js';
import { DashboardService } from './services/dashboard.js';
import { checkEnvironment } from './services/envCheck.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// 启动前检查环境
checkEnvironment();

const MODEL = process.argv[2] || process.env.AGENT_MODEL || 'auto';
const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || '4000');

async function main() {
  const bot = new FeishuBotService();
  const cursor = new CursorService();
  const git = new GitService();
  const projectService = new ProjectService();

  Logger.info('Core', `OpenCrab 启动中... (模型: ${MODEL})`);

  // 启动管理后台
  startDashboard(DASHBOARD_PORT);

  bot.startWS(async (task: BotTask) => {
    const prompt = task.content.trim();
    if (!prompt) return;

    const project = await projectService.getProjectByChatId(task.chatId);
    if (!project) {
      await bot.reply(task.messageId, '无法识别当前会话对应的项目，请检查配置。');
      bot.cleanupImages(task.imagePaths);
      return;
    }

    const sessionId = task.chatId;
    const taskId = `${sessionId}-${Date.now()}`;
    const worktreeName = `opencrab-session-${sessionId}`;
    const hasSession = cursor.hasSession(project.path, sessionId);

    // 注册任务到 Dashboard
    DashboardService.addTask({
      id: taskId,
      chatId: task.chatId,
      project: project.name,
      branch: project.branch,
      status: 'initializing', // 节点化：初始化
      startTime: Date.now(),
      prompt: prompt,
    });

    Logger.info('Core', `开始处理任务 [${project.name}] - ${hasSession ? '继续会话' : '新任务'}`);
    await bot.reply(task.messageId, `收到，正在处理...\n项目: ${project.name}\n状态: ${hasSession ? '继续会话' : '新任务'}`);

    if (!hasSession) {
      DashboardService.updateTask(taskId, { status: 'analyzing' }); // 节点化：分析中
      git.syncBranch(project.branch, project.path);
    }

    const skills = [
      fs.readFileSync(path.join(process.cwd(), 'skills/test_driven.md'), 'utf-8'),
      fs.readFileSync(path.join(process.cwd(), 'skills/task_complete.md'), 'utf-8'),
    ].join('\n\n---\n\n');

    const finalPrompt = `${prompt}\n\n(系统指令与技能：\n\n${skills})`;

    DashboardService.updateTask(taskId, { status: 'coding' }); // 节点化：编码与执行中
    const result = await cursor.run(finalPrompt, project.path, {
      model: MODEL,
      worktree: worktreeName,
      worktreeBase: project.branch,
      continue: hasSession,
    });

    bot.cleanupImages(task.imagePaths);

    if (!result.success) {
      Logger.error('Core', `Agent 执行失败: ${result.output}`);
      DashboardService.updateTask(taskId, { status: 'failed', output: result.output, endTime: Date.now() });
      await bot.reply(task.messageId, `抱歉，处理过程中出现了错误:\n${result.output}`);
      return;
    }

    const checkPath = result.worktreePath || project.path;
    const isFinished = result.output.includes('TASK_COMPLETE');
    const hasChanges = git.hasChanges(checkPath);

    Logger.info('Core', `任务状态: isFinished=${isFinished}, hasChanges=${hasChanges}`);

    if (isFinished) {
      const cleanOutput = result.output
        .replace('TASK_COMPLETE', '')
        .replace(/Using worktree: .*\n?/g, '')
        .trim();

      if (hasChanges) {
        try {
          let prefix = project.commitPrefix;
          if (!prefix && project.chatName) {
            prefix = `${project.chatName}:`;
          }
          if (!prefix) {
            prefix = 'feat:';
          }

          const commitMsg = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;
          const tempBranch = git.commitLocal(commitMsg, checkPath);
          DashboardService.updateTask(taskId, { status: 'committing' }); // 节点化：同步中
          const mergeToFeature = await git.mergeToDeploy(tempBranch, project.branch, project.path);
          
          if (!mergeToFeature) {
            Logger.warn('Core', `合并到基准分支 ${project.branch} 失败`);
            DashboardService.updateTask(taskId, { status: 'failed', output: 'Git 合并失败', endTime: Date.now() });
            await bot.reply(task.messageId, `${cleanOutput}\n\n⚠️ 变更已保存，但合并到 ${project.branch} 失败，请联系开发人员处理。`);
            return; 
          }

          git.push(project.branch, project.path);
          git.cleanupWorktree(checkPath, project.path);

          const deployBranch = project.deployBranch;
          if (deployBranch) {
            const deploySuccess = await git.mergeToDeploy(project.branch, deployBranch, project.path);
            if (deploySuccess) {
              Logger.info('Core', `任务完成并成功部署到 ${deployBranch}`);
              DashboardService.updateTask(taskId, { status: 'completed', hasChanges: true, endTime: Date.now() });
              await bot.reply(task.messageId, `${cleanOutput}\n\n✅ 变更已同步并触发测试环境部署。`);
            } else {
              Logger.warn('Core', `合并到部署分支 ${deployBranch} 失败`);
              DashboardService.updateTask(taskId, { status: 'completed', hasChanges: true, endTime: Date.now() });
              await bot.reply(task.messageId, `${cleanOutput}\n\n✅ 变更已合入 ${project.branch}，但合并到部署分支失败，请联系开发人员。`);
            }
          } else {
            Logger.info('Core', `任务完成并已同步到 ${project.branch}`);
            DashboardService.updateTask(taskId, { status: 'completed', hasChanges: true, endTime: Date.now() });
            await bot.reply(task.messageId, `${cleanOutput}\n\n✅ 变更已同步。`);
          }
        } catch (error) {
          Logger.error('Core', 'Git 流程异常', error);
          DashboardService.updateTask(taskId, { status: 'failed', endTime: Date.now() });
          await bot.reply(task.messageId, `${cleanOutput}\n\n❌ 变更保存过程中出现错误，请联系开发人员检查。`);
        }
      } else {
        Logger.info('Core', '任务完成 (无代码变更)');
        git.cleanupWorktree(checkPath, project.path);
        DashboardService.updateTask(taskId, { status: 'completed', hasChanges: false, endTime: Date.now() });
        await bot.reply(task.messageId, cleanOutput);
      }
    } else {
      const cleanOutput = result.output
        .replace('TASK_COMPLETE', '')
        .replace(/Using worktree: .*\n?/g, '')
        .trim();
      Logger.info('Core', '任务未完成，等待用户回复');
      DashboardService.updateTask(taskId, { status: 'waiting', output: cleanOutput });
      await bot.reply(task.messageId, cleanOutput);
    }
  });
}

main().catch((err) => Logger.error('Main', '程序崩溃', err));
