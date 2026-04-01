import { CursorService } from './services/cursor.js';
import { GitService } from './services/git.js';
import { ProjectService } from './services/project.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function simulate(content: string) {
  const cursor = new CursorService();
  const git = new GitService();
  const projectService = new ProjectService();

  const project = await projectService.getProjectByChatId('oc_mock');
  if (!project) {
    console.error('无法识别项目配置');
    return;
  }

  console.log(`项目: ${project.name} (${project.path})`);
  console.log(`指令: ${content}\n`);

  const result = await cursor.run(content, project.path);

  console.log(`\n--- Agent 输出 ---`);
  console.log(result.output);
  console.log(`--- 执行${result.success ? '成功' : '失败'} ---`);

  if (result.success && git.hasChanges(project.path)) {
    console.log('\n检测到代码变更（模拟模式，跳过 Git 提交）');
  } else {
    console.log('\n没有代码变更，无需提交。');
  }
}

const prompt = process.argv[2] || '这个项目的技术栈是什么';
simulate(prompt).catch(console.error);
