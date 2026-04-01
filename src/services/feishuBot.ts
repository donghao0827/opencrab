import * as lark from '@larksuiteoapi/node-sdk';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger.js';

dotenv.config();

const BUFFER_WAIT_MS = 5000; // 缓冲等待时间：收到第一条消息后等 5 秒收齐

export interface BotTask {
  chatId: string;
  messageId: string;
  content: string;
  senderId: string;
  imagePaths: string[];
}

interface BufferedMessage {
  messageId: string;
  type: 'text' | 'image';
  content: string;
}

interface MessageBuffer {
  chatId: string;
  senderId: string;
  firstMessageId: string;
  messages: BufferedMessage[];
  timer: ReturnType<typeof setTimeout>;
}

export class FeishuBotService {
  private client: lark.Client;
  private wsClient: InstanceType<typeof lark.WSClient> | null = null;
  private processedMessages = new Set<string>();
  private messageBuffers = new Map<string, MessageBuffer>();
  private tmpDir: string;

  constructor() {
    this.client = new lark.Client({
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
    });
    this.tmpDir = path.join(os.tmpdir(), 'opencrab-images');
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  startWS(callback: (task: BotTask) => Promise<void>) {
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        const { message, sender } = data;

        // 仅处理群聊消息，忽略私聊
        if (message.chat_type !== 'group') {
          Logger.warn('Feishu', `收到非群聊消息 (Type: ${message.chat_type}, Sender: ${sender?.sender_id?.open_id})，已忽略`);
          return;
        }

        if (this.processedMessages.has(message.message_id)) return;
        this.processedMessages.add(message.message_id);
        if (this.processedMessages.size > 1000) {
          const entries = [...this.processedMessages];
          entries.slice(0, 500).forEach((id) => this.processedMessages.delete(id));
        }

        const senderId = sender?.sender_id?.open_id;
        if (!senderId) return;

        const bufferKey = `${message.chat_id}:${senderId}`;

        if (message.message_type === 'text') {
          let text = JSON.parse(message.content).text;
          text = text.replace(/@_user_\d+\s*/g, '').trim();
          if (!text) return;

          Logger.info('Feishu', `收到文字消息 from ${senderId}: ${text}`);
          this.addToBuffer(bufferKey, message.chat_id, senderId, message.message_id, {
            messageId: message.message_id,
            type: 'text',
            content: text,
          }, callback);
        } else if (message.message_type === 'image') {
          const imageKey = JSON.parse(message.content).image_key;
          Logger.info('Feishu', `收到图片消息 from ${senderId}: ${imageKey}`);

          try {
            const imagePath = await this.downloadImage(message.message_id, imageKey);
            this.addToBuffer(bufferKey, message.chat_id, senderId, message.message_id, {
              messageId: message.message_id,
              type: 'image',
              content: imagePath,
            }, callback);
          } catch (err) {
            Logger.error('Feishu', `图片下载失败: ${imageKey}`, err);
          }
        } else if (message.message_type === 'post') {
          const parsed = await this.parsePostMessage(message.message_id, message.content);
          if (!parsed.texts.length && !parsed.imagePaths.length) return;

          Logger.info('Feishu', `收到富文本消息 from ${senderId}: ${parsed.texts.join(' ').slice(0, 50)}...`);

          for (const text of parsed.texts) {
            this.addToBuffer(bufferKey, message.chat_id, senderId, message.message_id, {
              messageId: message.message_id,
              type: 'text',
              content: text,
            }, callback);
          }
          for (const imgPath of parsed.imagePaths) {
            this.addToBuffer(bufferKey, message.chat_id, senderId, message.message_id, {
              messageId: message.message_id,
              type: 'image',
              content: imgPath,
            }, callback);
          }
        }
      },
    });

    this.wsClient = new lark.WSClient({
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
      loggerLevel: lark.LoggerLevel.info,
    });

    this.wsClient.start({ eventDispatcher });
    Logger.info('Feishu', 'WebSocket 长连接已启动，等待消息...');
  }

  private addToBuffer(
    bufferKey: string,
    chatId: string,
    senderId: string,
    messageId: string,
    msg: BufferedMessage,
    callback: (task: BotTask) => Promise<void>,
  ) {
    const existing = this.messageBuffers.get(bufferKey);

    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(msg);
      existing.timer = setTimeout(() => this.flushBuffer(bufferKey, callback), BUFFER_WAIT_MS);
    } else {
      const timer = setTimeout(() => this.flushBuffer(bufferKey, callback), BUFFER_WAIT_MS);
      this.messageBuffers.set(bufferKey, {
        chatId,
        senderId,
        firstMessageId: messageId,
        messages: [msg],
        timer,
      });
    }

    const count = this.messageBuffers.get(bufferKey)!.messages.length;
    Logger.info('Feishu', `消息缓冲中 (${bufferKey}): ${count} 条消息，${BUFFER_WAIT_MS / 1000}s 后处理`);
  }

  private async flushBuffer(
    bufferKey: string,
    callback: (task: BotTask) => Promise<void>,
  ) {
    const buffer = this.messageBuffers.get(bufferKey);
    if (!buffer) return;
    this.messageBuffers.delete(bufferKey);

    const textParts: string[] = [];
    const imagePaths: string[] = [];

    for (const msg of buffer.messages) {
      if (msg.type === 'text') {
        textParts.push(msg.content);
      } else if (msg.type === 'image') {
        imagePaths.push(msg.content);
      }
    }

    let content = textParts.join('\n');
    if (imagePaths.length > 0) {
      const imageRefs = imagePaths.map((p) => `[参考图片: ${p}]`).join('\n');
      content = content ? `${content}\n\n${imageRefs}` : imageRefs;
    }

    if (!content.trim()) return;

    Logger.info('Feishu', `缓冲完成，合并 ${buffer.messages.length} 条消息并发起任务`);

    const task: BotTask = {
      chatId: buffer.chatId,
      messageId: buffer.firstMessageId,
      content: content.trim(),
      senderId: buffer.senderId,
      imagePaths,
    };

    await callback(task);
  }

  private async parsePostMessage(
    messageId: string,
    rawContent: string,
  ): Promise<{ texts: string[]; imagePaths: string[] }> {
    const texts: string[] = [];
    const imagePaths: string[] = [];

    try {
      const parsed = JSON.parse(rawContent);
      let post: any;
      if (parsed.content && Array.isArray(parsed.content)) {
        post = parsed;
      } else {
        post = parsed.zh_cn || parsed.en_us || parsed.ja_jp;
        if (!post) {
          const vals = Object.values(parsed);
          post = vals.find((v: any) => v && typeof v === 'object' && Array.isArray(v.content));
        }
      }
      if (!post) return { texts, imagePaths };

      if (post.title) texts.push(post.title);

      const content: any[][] = post.content || [];
      for (const paragraph of content) {
        const lineParts: string[] = [];
        for (const element of paragraph) {
          if (element.tag === 'text') {
            const t = (element.text || '').replace(/@_user_\d+\s*/g, '').trim();
            if (t) lineParts.push(t);
          } else if (element.tag === 'a') {
            const linkText = element.text || element.href || '';
            if (linkText) lineParts.push(linkText);
          } else if (element.tag === 'img') {
            const imageKey = element.image_key;
            if (imageKey) {
              try {
                const imgPath = await this.downloadImage(messageId, imageKey);
                imagePaths.push(imgPath);
              } catch (err) {
                Logger.error('Feishu', `富文本图片下载失败 (${imageKey})`, err);
              }
            }
          }
        }
        if (lineParts.length > 0) texts.push(lineParts.join(' '));
      }
    } catch (err) {
      Logger.error('Feishu', '富文本解析失败', err);
    }

    return { texts, imagePaths };
  }

  private async downloadImage(messageId: string, imageKey: string): Promise<string> {
    const resp = await this.client.im.messageResource.get({
      path: { message_id: messageId, file_key: imageKey },
      params: { type: 'image' },
    });

    const filePath = path.join(this.tmpDir, `${imageKey}.png`);
    const data = resp as any;

    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else if (data?.writeFile) {
      await data.writeFile(filePath);
    } else if (typeof data?.pipe === 'function') {
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(filePath);
        data.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
    } else if (data?.data) {
      const buf = Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data);
      fs.writeFileSync(filePath, buf);
    } else {
      fs.writeFileSync(filePath, Buffer.from(data));
    }

    Logger.info('Feishu', `图片已下载并保存: ${filePath}`);
    return filePath;
  }

  async reply(messageId: string, text: string) {
    try {
      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      Logger.info('Feishu', `消息回复成功: ${text.slice(0, 30)}...`);
    } catch (error) {
      Logger.error('Feishu', '消息回复失败', error);
    }
  }

  async sendMessage(chatId: string, text: string) {
    try {
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
      Logger.info('Feishu', `主动发送消息成功: ${chatId}`);
    } catch (error) {
      Logger.error('Feishu', '主动发送消息失败', error);
    }
  }

  /**
   * 上传并发送图片到飞书
   */
  async uploadAndSendImage(chatId: string, filePath: string, title: string = '') {
    try {
      // 1. 上传图片
      const fileStream = fs.createReadStream(filePath);
      const uploadResp = await this.client.im.file.create({
        data: {
          file_type: 'image',
          file_name: path.basename(filePath),
          file: fileStream,
        },
      });

      const imageKey = uploadResp.image_key;
      if (!imageKey) throw new Error('上传图片未返回 image_key');

      // 2. 发送图片消息
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ image_key: imageKey }),
          msg_type: 'image',
        },
      });

      if (title) {
        await this.sendMessage(chatId, title);
      }

      Logger.info('Feishu', `图片消息发送成功: ${imageKey}`);
    } catch (error) {
      Logger.error('Feishu', '上传或发送图片失败', error);
    }
  }

  cleanupImages(imagePaths: string[]) {
    for (const p of imagePaths) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          Logger.info('Feishu', `已清理临时图片: ${p}`);
        }
      } catch (err) {
        Logger.error('Feishu', `临时图片清理失败: ${p}`, err);
      }
    }
  }
}
