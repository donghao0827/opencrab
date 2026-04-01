import express from 'express';
import { DashboardService } from './dashboard.js';
import { Logger } from './logger.js';

export function startDashboard(port: number = 4000) {
  const app = express();

  app.get('/', (req, res) => {
    const stats = DashboardService.getStats();
    const tasks = DashboardService.getTasks();
    const logs = DashboardService.getLogs();

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenCrab 管理后台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f9fafb; }
        .log-line { font-family: 'Menlo', 'Monaco', 'Courier New', monospace; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 flex items-center">
                <span class="mr-2">🦀</span> OpenCrab Dashboard
            </h1>
            <div class="text-sm text-gray-500">
                最后更新: ${new Date().toLocaleString()}
            </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div class="text-sm font-medium text-gray-500 mb-1">总任务数</div>
                <div class="text-2xl font-bold text-gray-900">${stats.total}</div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div class="text-sm font-medium text-gray-500 mb-1">已完成</div>
                <div class="text-2xl font-bold text-green-600">${stats.completed}</div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div class="text-sm font-medium text-gray-500 mb-1">处理中</div>
                <div class="text-2xl font-bold text-blue-600">${stats.processing}</div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div class="text-sm font-medium text-gray-500 mb-1">失败</div>
                <div class="text-2xl font-bold text-red-600">${stats.failed}</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Tasks Table -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="px-6 py-4 border-b border-gray-100 bg-gray-50">
                        <h2 class="font-semibold text-gray-800">最近任务</h2>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead>
                                <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                                    <th class="px-6 py-3">项目/分支</th>
                                    <th class="px-6 py-3">状态</th>
                                    <th class="px-6 py-3">需求</th>
                                    <th class="px-6 py-3">开始时间</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${tasks.length === 0 ? '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">暂无任务数据</td></tr>' : ''}
                                ${tasks.map(task => `
                                    <tr class="hover:bg-gray-50 transition-colors">
                                        <td class="px-6 py-4">
                                            <div class="text-sm font-semibold text-gray-900">${task.project}</div>
                                            <div class="text-xs text-gray-500">${task.branch}</div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2 py-1 text-xs font-medium rounded-full 
                                                ${task.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                                  task.status === 'failed' ? 'bg-red-100 text-red-700' : 
                                                  ['initializing', 'analyzing', 'coding', 'testing', 'committing'].includes(task.status) ? 'bg-blue-100 text-blue-700 animate-pulse' : 
                                                  'bg-gray-100 text-gray-700'}">
                                                ${task.status === 'completed' ? '已完成' : 
                                                  task.status === 'failed' ? '失败' : 
                                                  task.status === 'initializing' ? '初始化' :
                                                  task.status === 'analyzing' ? '分析中' :
                                                  task.status === 'coding' ? '编码中' :
                                                  task.status === 'testing' ? '测试中' :
                                                  task.status === 'committing' ? '同步中' :
                                                  task.status === 'waiting' ? '等待回复' : '等待中'}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="text-sm text-gray-600 truncate max-w-xs" title="${task.prompt}">${task.prompt}</div>
                                        </td>
                                        <td class="px-6 py-4 text-xs text-gray-500">
                                            ${new Date(task.startTime).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Logs -->
            <div class="lg:col-span-1">
                <div class="bg-gray-900 rounded-xl shadow-sm border border-gray-800 overflow-hidden flex flex-col h-[600px]">
                    <div class="px-6 py-4 border-b border-gray-800 bg-gray-800 flex justify-between items-center">
                        <h2 class="font-semibold text-gray-200">实时日志</h2>
                        <span class="text-xs text-gray-500">最近 ${logs.length} 条</span>
                    </div>
                    <div class="p-4 overflow-y-auto flex-1 log-line text-xs">
                        ${logs.map(log => `
                            <div class="mb-2 leading-relaxed">
                                <span class="text-gray-500">[${log.time.split(' ')[1]}]</span>
                                <span class="${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-blue-400'} font-bold">[${log.level}]</span>
                                <span class="text-purple-400">[${log.module}]</span>
                                <span class="text-gray-300">${log.message}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        // 每 5 秒刷新一次页面
        setTimeout(() => window.location.reload(), 5000);
    </script>
</body>
</html>
    `;
    res.send(html);
  });

  app.listen(port, () => {
    Logger.info('Dashboard', `管理后台已启动: http://localhost:${port}`);
  });
}
