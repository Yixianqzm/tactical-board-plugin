# 战术大屏 · DSH 插件版

把「NEURAL 神经星环」做成 DeepSeek Harness 里的战术大屏：会话、token、轮次、思考时长全部取本机 DSH 实时数据。

> **来源声明**
> 大屏本体来自抖音 **@赛博老爸** 开源的 [agent-display](https://github.com/cyberdaddyleo/agent-display)（原许可 PolyForm Noncommercial License 1.0.0，保留其署名与许可）。
> 本仓库只是把它接进 DSH 的插件外壳与数据适配层。
> **目前只适配 03 · NEURAL 神经星环**，其余六个主题保持原样、不接真实数据。

## 装

放到 DSH 插件目录，然后在该 profile 里注册：

```bash
# 1) 放插件
mkdir -p ~/.dsh/plugins && cd ~/.dsh/plugins
git clone <this-repo> dsh-neural-board

# 2) 挂进 profile（桌面端默认是 profiles/desktop）
#    package.json 的 dependencies 加一行：
#      "dsh-neural-board": "link:C:/Users/<you>/.dsh/plugins/dsh-neural-board"
#    dsh.profile.bundles 末尾加一项：
#      "dsh-neural-board"
#    node_modules 下建个目录联接：
#      mklink /J node_modules\dsh-neural-board C:\Users\<you>\.dsh\plugins\dsh-neural-board

# 3) 重启 DSH
```

重启后：**设置 → 战术大屏** 多一页，**会话顶栏** 多一个「战术大屏」按钮。

## 用

- 顶栏按钮 / 设置页的「在默认浏览器打开」→ 打开 `http://127.0.0.1:7800/`，长期挂大屏就用这个。
- 设置页的「内嵌预览」会先弹提示：内嵌浏览器会实时消耗 token，确认后才加载。
- 数据服务是插件自己拉起的独立进程（`board/serve.mjs`，端口 7800），会自己找 DSH 当前端口，DSH 重启后跟着换。

## 数据从哪来

同源 `/api/session/list`（DSH 自己的接口，只读，不调模型、不烧 token），面板里现在是：

| 位置 | 含义 |
| --- | --- |
| 对话轮次 | 今天所有会话的轮次合计，零点重置 |
| 思考时长 | 当前这一轮实际生成时间，不在回答时为 0 |
| 今日消耗 | 今天的 token 总量 |
| 缓存命中 | 今天的缓存命中率 |
| 累计 TOKEN | 所有会话的历史总量 |
| DeepSeek Harness | 数据源标识 |

右上弹窗与字带：会话开始跑 = 接单，每冒一轮 = 第 N 轮，停了 = 交付；空闲 20 秒回落成「派单 · DSH」。

## 环境检测

设置页有「检测环境」和「一键修复」：

- 检测：大屏文件 / Node 运行时 / DSH 客户端库 / 价目表（可选）/ 数据服务 7800
- 修复：自动在常见位置找 `dsh-client.js`（有就写进插件 `config.json` 的 `clientDir`），并把数据服务拉起来
- 想手动指定就设环境变量 `DSH_CLIENT_DIR` 或改 `config.json`

## 已知限制

- 只适配 NEURAL 星环；别的主题还是原版的模拟数据。
- 余额接口（`account/getBalance`）需要内部 client 参数，校验过不去，所以那格改成了数据源标识。
- 内嵌预览是 DSH 内嵌浏览器，长期挂着会持续消耗 token，能外开就外开。

## 版本

- **v0.1.2**：设置页加「检测环境 / 一键修复」，数据服务的客户端路径改为可配置
- **v0.1.1**：设置页补上出处与许可声明
- **v0.1.0**：首个插件版。NEURAL 接真实数据（会话/token/轮次/思考时长）；默认浏览器入口 + 内嵌预览（带 token 提示）；顶栏快捷按钮；全屏。

## License

跟随上游：**PolyForm Noncommercial License 1.0.0**，非商业使用免费；商业使用需原作者授权。署名：Required Notice: Copyright (c) 2026 赛博老爸。
