import { FeishuService } from './services/feishu';
import { CursorService } from './services/cursor';
import { GitService } from './services/git';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const feishu = new FeishuService();
  const cursor = new CursorService();
  const git = new GitService();

  // 这些 ID 需要从飞书多维表格的 URL 中获取
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN || '';
  const tableId = process.env.FEISHU_BITABLE_TABLE_ID || '';

  if (!appToken || !tableId) {
    console.error('错误: 请在 .env 中配置 FEISHU_BITABLE_APP_TOKEN 和 FEISHU_BITABLE_TABLE_ID');
    return;
  }

  console.log('正在检查飞书任务...');

  // 1. 获取待处理任务
  const tasks = await feishu.getPendingTasks(appToken, tableId);
  
  if (tasks.length === 0) {
    console.log('暂无待处理任务。');
    return;
  }

  for (const task of tasks) {
    console.log(`\n>>> 开始处理任务: ${task.title}`);
    
    // 更新状态为 "处理中"
    await feishu.updateTaskStatus(appToken, tableId, task.id, '处理中');

    // 2. 调用 Cursor 修改代码
    const success = await cursor.applyChanges(task.description);

    if (success) {
      // 3. 提交并部署
      const pushSuccess = await git.commitAndPush(task.title);
      if (pushSuccess) {
        await git.deploy();
        // 4. 更新状态为 "已完成"
        await feishu.updateTaskStatus(appToken, tableId, task.id, '已完成');
        console.log(`任务 "${task.title}" 处理成功！`);
      }
    } else {
      // 失败则更新状态为 "失败"
      await feishu.updateTaskStatus(appToken, tableId, task.id, '失败');
      console.log(`任务 "${task.title}" 处理失败。`);
    }
  }
}

// 启动主程序
main().catch(console.error);
