# 加密资产 AI 研究台 v3

本项目是“人工智能应用实践”课程大作业版本的完整实现。系统定位为一个 **监控 + 人工复核** 的加密资产研究台：它融合 Binance CEX 研究源、OKX OnchainOS 链上源、市场结构快照、AI 复核助手与安全护栏，用于发现候选标的、解释证据链、给出人工交易复核框架。

> 风险边界：项目不自动实盘下单，不生成自动下单指令，不提供收益承诺；所有输出都必须经过人工复核。

## 已覆盖课程技术点

- Prompt Engineering：`packages/assistant/src/index.ts` 中的结构化复核提示词与 JSON 输出契约。
- AI Agent：`Evidence -> Freshness -> Fusion -> Lifecycle -> Regime -> Router -> Review` 的多步决策流水线。
- MCP / 工具集成思想：`packages/adapters` 将 Binance / OKX skill、CLI 或快照源统一映射为 Evidence。
- RAG / 检索增强：AI 助手读取候选证据、人工清单、风险护栏和策略上下文后生成复核说明。
- 安全护栏：阻断提示词注入，识别自动交易请求，固定 manual-only 输出边界。
- Web 交互界面：`apps/web` 提供中文看板、执行卡、证据页、AI 助手、回放时间线和人工复核表单。
- TDD-for-AI：Vitest + pytest 双测试体系，`tests/requirements_test.py` 是可执行需求规约。

## 目录结构

```text
apps/
  api/                 Fastify API，提供候选、源覆盖、AI 分析、复核与回放接口
  web/                 React/Vite 中文看板
packages/
  core/                Evidence、Freshness、Fusion、Lifecycle、Regime、Router
  adapters/            Binance / OKX / market structure 数据适配层
  assistant/           本地 Ollama 优先的 AI 复核助手与安全护栏
  storage/             SQLite 状态库与 JSONL 结构流
  replay/              live / fixture / historical snapshot replay
  review/              人工复核清单与离线阈值校准报告
tests/
  requirements_test.py pytest 可执行需求规约
docs/
  课程大作业报告.md
  答辩演示.md
deliverables/
  课程大作业报告.pdf
  答辩演示.pptx
```

## 环境要求

- Node.js 22+
- pnpm 10+
- Python 3.10+
- 可选：Ollama，本地模型建议 `qwen2.5:7b`

## 安装

```bash
corepack enable
pnpm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## 运行

```bash
pnpm dev
```

默认地址：

- Web 看板：http://localhost:5173
- API 服务：http://127.0.0.1:3000

如果要启用本地 LLM 分析：

```bash
ollama pull qwen2.5:7b
RESEARCH_ENABLE_LLM=1 OLLAMA_MODEL=qwen2.5:7b pnpm dev
```

未启用 Ollama 或本地模型不可达时，系统会自动退回确定性策略助手，仍可完成演示。

## 测试

TypeScript 工程测试：

```bash
pnpm test
```

Python 可执行需求规约：

```bash
python -m pytest tests/requirements_test.py
```

构建：

```bash
pnpm build
```

## API 摘要

- `GET /api/source-coverage`：源覆盖、版本钉住、限流与降级状态
- `GET /api/candidates`：候选池列表
- `GET /api/candidates/:symbol`：单个候选详情与人工清单
- `GET /api/candidates/:symbol/replay`：回放时间线、校准报告
- `POST /api/ai/analyze`：AI 复核助手
- `POST /api/manual-review`：人工复核落盘
- `POST /api/admin/recompute`：重新计算候选池

## 演示步骤

1. 启动 `pnpm dev`。
2. 在搜索框输入 `分析 ORDI`。
3. 选择 ORDI 候选，打开右侧执行卡。
4. 查看“执行卡”：系统会说明是否只观察、偏多或偏空，以及手动执行步骤。
5. 打开“AI 助手”：输入“分析 ORDI，下一步应该看什么？”，生成复核说明。
6. 查看“证据”和“回放时间线”：确认 discovery、confirmation、risk、veto 的来源。
7. 在“人工复核”中保存一条复核，随后在回放中查看反馈。

## 交付物生成

```bash
python scripts/generate_report_pdf.py
pandoc docs/答辩演示.md -o deliverables/答辩演示.pptx
```

生成文件：

- `deliverables/课程大作业报告.pdf`
- `deliverables/答辩演示.pptx`

## 说明

项目中的 Binance/OKX 源会优先尝试真实链路；本地缺失 CLI、网络不可达或限流时，会显示降级原因并自动使用 fixtures 快照，保证课堂 Demo 不被外部服务不可用阻断。
