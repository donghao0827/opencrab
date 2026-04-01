import { Logger } from './logger.js';

export type TaskStatus = 
  | 'pending' 
  | 'initializing' 
  | 'analyzing' 
  | 'coding' 
  | 'testing' 
  | 'committing' 
  | 'completed' 
  | 'failed' 
  | 'waiting';

export interface TaskInfo {
  id: string;
  chatId: string;
  project: string;
  branch: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  prompt: string;
  output?: string;
  hasChanges?: boolean;
  testResult?: {
    success: boolean;
    output: string;
  };
}

export interface LogEntry {
  time: string;
  level: string;
  module: string;
  message: string;
}

export class DashboardService {
  private static tasks: Map<string, TaskInfo> = new Map();
  private static logs: LogEntry[] = [];
  private static MAX_LOGS = 200;

  static addTask(task: TaskInfo) {
    this.tasks.set(task.id, task);
  }

  static updateTask(id: string, updates: Partial<TaskInfo>) {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
    }
  }

  static addLog(entry: LogEntry) {
    this.logs.unshift(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }
  }

  static getTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.startTime - a.startTime);
  }

  static getLogs() {
    return this.logs;
  }

  static getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      processing: tasks.filter(t => t.status === 'processing').length,
    };
  }
}
