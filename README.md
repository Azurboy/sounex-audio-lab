# Sounex Lab

点击「说点什么」开始录音，也可以上传文件或试用示例音频。添加音频后会自动测量并生成描述。提前写好的问题会带入对话，可在添加音频后发送。对话框中的回形针可以更换音频，麦克风可以录音，点击回复中的时间可以回听原声。

## 本地预览

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:43125/>。开发服务器和 `npm run preview` 将 `/v1/audio:inspect`、`/v1/audio:describe`、`/v1/audio:ask` 和 `/v1/audio:models` 转发给本机 Sounex 检测台，默认地址为 `http://127.0.0.1:8798`。如果检测台使用其他端口，在本项目的 `.env.local` 中设置 `SOUNEX_DEMO_ORIGIN` 并重启。

录音、上传文件和首页示例的音频描述与连续问答均使用 DeepSeek V4 Pro。原音在本机测量并转写，DeepSeek 接收自动转写、相关声音指标、提问和对话上下文。

支持 DeepSeek 的检测台从服务端环境变量 `DEEPSEEK_API_KEY` 或私有文件 `SOUNEX_DEEPSEEK_KEY_FILE` 读取凭据。前端只需配置检测台地址。

浏览器将录音或上传文件解码成 16 kHz 单声道 PCM16。多声道上传文件会混为一轨进行测量。每段最长 3 分钟，文件最大 30 MB。静态部署时，页面同源的上述接口需要连接检测台，并支持 SSE 流式响应。

## 构建

```sh
npm run build
```
