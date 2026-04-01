import * as lark from '@larksuiteoapi/node-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
}

export class FeishuService {
  private client: lark.Client;

  constructor() {
    this.client = new lark.Client({
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
    });
  }

  /**
   * 获取多维表格中待处理的任务
   * @param appToken 多维表格的 app_token
   * @param tableId 数据表的 table_id
   */
  async getPendingTasks(appToken: string, tableId: string): Promise<Task[]> {
    try {
      const response = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
        params: {
          filter: 'CurrentValue.[状态]="待处理"', // 假设状态列名为 "状态"
        },
      });

      return (response.data?.items || []).map((item: any) => ({
        id: item.record_id,
        title: item.fields['标题'] || '',
        description: item.fields['需求描述'] || '',
        status: item.fields['状态'] || '',
      }));
    } catch (error) {
      console.error('获取飞书任务失败:', error);
      return [];
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(appToken: string, tableId: string, recordId: string, status: string) {
    try {
      await this.client.bitable.appTableRecord.update({
        path: {
          app_token: appToken,
          table_id: tableId,
          record_id: recordId,
        },
        data: {
          fields: {
            '状态': status,
          },
        },
      });
      console.log(`任务 ${recordId} 状态已更新为: ${status}`);
    } catch (error) {
      console.error('更新飞书任务状态失败:', error);
    }
  }
}
