# 🦀 OpenCrab

OpenCrab 是一个基于 Cursor Agent 的自动化代码修改与部署工具。它能监听飞书群消息，自动解析需求并驱动 Cursor Agent 修改代码，最后自动提交并部署到测试环境。

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/your-username/opencrab.git
cd opencrab
npm install
```

### 2. 环境准备
确保你的电脑上已安装：
- **Node.js** (v18+)
- **Git**
- **Cursor Agent CLI** (运行 `agent --version` 检查)
- **Python3**

### 3. 配置向导
运行交互式配置向导，自动生成 `.env` 文件：
```bash
npm run setup
```

### 4. 启动服务
```bash
npm start
```
启动后，访问 `http://localhost:4000` 查看管理后台。

## 🤖 飞书机器人配置

1. 在 [飞书开放平台](https://open.feishu.cn/) 创建一个企业自建应用。
2. 开启 **机器人** 功能。
3. 在 **事件与回调** 中，开启 **长连接 (WebSocket)** 模式，并订阅 `im.message.receive_v1` 事件。
4. 权限管理中开启：
   - `im:message.group_at_msg:readonly` (接收群聊中 @ 机器人的消息)
   - `im:chat:readonly` (读取群组信息)
   - `im:message:send_as_bot` (发送消息)
   - `docx:document:readonly` (读取群公告)

## 📝 群公告配置模板

将机器人拉入群组后，在群公告中按以下格式配置项目信息：

```text
项目: example-project
分支: main
部署分支: test1
路径: /Users/yourname/projects/example-project
```

## 🛠️ 管理后台

启动后访问 `http://localhost:4000`，你可以实时查看：
- 任务执行状态（处理中、已完成、失败）
- 详细的系统运行日志
- 任务消耗的时间和结果反馈

## 📄 License
ISC
# opencrab
