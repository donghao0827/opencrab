import * as lark from '@larksuiteoapi/node-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger.js';

dotenv.config();

const PROJECTS_ROOT = process.env.PROJECTS_ROOT || path.join(os.homedir(), 'Documents/work');

export interface ProjectInfo {
  name: string;
  path: string;
  branch: string;
  deployBranch: string;  // 为空则不自动合并部署
  commitPrefix?: string;
  chatName?: string;      // 群名称
}

export class ProjectService {
  private client: lark.Client;
  private cache = new Map<string, { data: ProjectInfo; expireAt: number }>();

  constructor() {
    this.client = new lark.Client({
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
    });
  }

  async getProjectByChatId(chatId: string): Promise<ProjectInfo | null> {
    const cached = this.cache.get(chatId);
    if (cached && Date.now() < cached.expireAt) {
      return cached.data;
    }

    try {
      const info = await this.fetchFromAnnouncement(chatId);
      if (info) {
        this.cache.set(chatId, { data: info, expireAt: Date.now() + 5 * 60 * 1000 });
        return info;
      }
    } catch (error) {
      Logger.error('Project', `从群公告获取配置失败 (${chatId})`, error);
    }

    Logger.warn('Project', `群公告未找到配置，使用默认配置`);
    return this.getDefaultProject();
  }

  private async fetchFromAnnouncement(chatId: string): Promise<ProjectInfo | null> {
    try {
      const annResp = await this.client.docx.v1.chatAnnouncement.get({
        path: { chat_id: chatId },
      });

      const data = annResp.data as any;
      
      let content = '';
      if (data?.announcement_type === 'docx') {
        content = await this.fetchDocxAnnouncementContent(chatId);
      } else if (data?.content) {
        content = data.content;
      }

      if (!content) return null;
      
      const parsed = this.parseAnnouncement(content);
      if (!parsed.name) return null;

      // 获取群名称用于 commit 前缀
      try {
        const chatInfo = await this.client.im.chat.get({
          path: { chat_id: chatId },
        });
        parsed.chatName = chatInfo.data?.name;
      } catch (e) {
        Logger.warn('Project', `获取群名称失败: ${chatId}`);
      }

      Logger.info('Project', `从群公告解析成功: ${parsed.name} (${parsed.branch})`);
      return parsed;
    } catch (error: any) {
      Logger.error('Project', `获取公告失败: ${error.message}`);
      return null;
    }
  }

  private async fetchDocxAnnouncementContent(chatId: string): Promise<string> {
    try {
      const resp = await (this.client.docx.v1 as any).chatAnnouncementBlock.list({
        path: { chat_id: chatId },
      });

      const blocks = resp.data?.items || [];
      let fullText = '';

      for (const block of blocks) {
        if (block.block_type === 2) { // text block
          const textElements = (block as any).text?.elements || [];
          for (const el of textElements) {
            if (el.text_run?.content) {
              fullText += el.text_run.content;
            }
          }
          fullText += '\n';
        }
      }
      return fullText;
    } catch (err: any) {
      Logger.error('Project', `读取 docx 公告块失败: ${err.message}`);
      return '';
    }
  }

  private parseAnnouncement(text: string): ProjectInfo {
    const plain = text.replace(/<[^>]+>/g, '').trim();

    const get = (key: string): string => {
      const regex = new RegExp(`${key}[：:：]\\s*(.+)`, 'i');
      const match = plain.match(regex);
      return (match && match[1]) ? match[1].trim() : '';
    };

    const name = get('项目');
    if (!name) return { name: '', path: '', branch: '', deployBranch: '' };

    const branch = get('分支') || 'main';
    const deployBranch = get('部署分支') || process.env.DEPLOY_BRANCH || '';
    const commitPrefix = get('commit前缀');
    const customPath = get('路径');

    return {
      name,
      path: customPath || path.join(PROJECTS_ROOT, name),
      branch,
      deployBranch,
      commitPrefix: commitPrefix || undefined,
    };
  }

  private getDefaultProject(): ProjectInfo {
    return {
      name: 'example-project',
      path: path.join(PROJECTS_ROOT, 'example-project'),
      branch: 'main',
      deployBranch: process.env.DEPLOY_BRANCH || '',
    };
  }
}
