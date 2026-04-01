import { DashboardService } from './dashboard.js';

/**
 * 统一日志工具类
 */
export class Logger {
  private static formatTime(): string {
    const now = new Date();
    return now.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private static pushToDashboard(level: string, module: string, message: string) {
    DashboardService.addLog({
      time: this.formatTime(),
      level,
      module,
      message,
    });
  }

  static info(module: string, message: string, ...args: any[]) {
    const fullMsg = message + (args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '');
    console.log(`[${this.formatTime()}] [INFO] [${module}] ${fullMsg}`);
    this.pushToDashboard('INFO', module, fullMsg);
  }

  static warn(module: string, message: string, ...args: any[]) {
    const fullMsg = message + (args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '');
    console.warn(`[${this.formatTime()}] [WARN] [${module}] ${fullMsg}`);
    this.pushToDashboard('WARN', module, fullMsg);
  }

  static error(module: string, message: string, error?: any) {
    let fullMsg = message;
    if (error) {
      fullMsg += `: ${error.message || error}`;
    }
    console.error(`[${this.formatTime()}] [ERROR] [${module}] ${fullMsg}`);
    if (error?.stack) console.error(error.stack);
    this.pushToDashboard('ERROR', module, fullMsg);
  }

  static debug(module: string, message: string, ...args: any[]) {
    if (process.env.DEBUG === 'true') {
      const fullMsg = message + (args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '');
      console.log(`[${this.formatTime()}] [DEBUG] [${module}] ${fullMsg}`);
      this.pushToDashboard('DEBUG', module, fullMsg);
    }
  }
}
