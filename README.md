# Crypto Research Workbench

> 加密货币研究工具箱 — 实时行情雷达面板

![Node](https://img.shields.io/badge/Node.js-20+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Vite](https://img.shields.io/badge/Vite-6-orange) ![License](https://img.shields.io/badge/License-MIT-yellow)

## 功能特性

| 模块 | 描述 |
|------|------|
| 📊 **涨跌榜 (Movers)** | Binance Futures 24h 涨幅榜 / 跌幅榜，60 秒自动刷新 |
| 📈 **OI 异动 (OI Anomalies)** | 检测持仓量异常波动的合约，预警潜在多空信号 |
| 🔍 **调试面板** | 查看 Binance API 直连状态 |

## 本地部署

### 前置要求

- **Node.js 20+**
- **pnpm** (`npm i -g pnpm`)
- **Clash 代理**（或其他 HTTP 代理，端口默认 `7897`）

### 一键启动

```bash
cd ~/Desktop/工作/crypto

# 仅启动（默认命令）
./start.sh

# 查看状态
./start.sh status

# 停止所有服务
./start.sh stop
```

启动成功后打开 → **http://localhost:5173**

### 手动启动（不使用脚本）

```bash
# 1. 克隆项目
git clone https://github.com/endlessroadddd/crypto-research-workbench.git
cd crypto-research-workbench
pnpm install

# 2. 启动后端（需要代理）
cd apps/api
BINANCE_PROXY_URL=http://127.0.0.1:7897 node dist/bundle.cjs

# 3. 另开终端，启动前端
cd apps/web
echo "VITE_API_BASE=http://localhost:3000" > .env.local
pnpm dev
```

## 配置说明

修改 `start.sh` 顶部的配置区域：

```bash
# ========== 配置 ==========
PROXY_URL="http://127.0.0.1:7897"   # 你的代理地址
BACKEND_PORT=3000                    # 后端端口
FRONTEND_PORT=5173                   # 前端端口
# ==============================
```

## 项目结构

```
crypto-research-workbench/
├── apps/
│   ├── api/                    # Fastify 后端
│   │   └── src/radar/
│   │       ├── movers.ts       # 涨跌榜逻辑
│   │       ├── oi-anomalies.ts # OI 异动检测
│   │       └── utils.ts        # 代理 + 工具函数
│   └── web/                    # Vite + React 前端
│       └── src/components/radar/
│           ├── MoversBoard.tsx # 涨跌榜组件
│           └── OIBoard.tsx     # OI 异动组件
├── start.sh                    # 一键启动脚本
└── README.md
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Vite |
| 后端 | Fastify + TypeScript |
| 数据源 | Binance Futures API |
| 代理 | HTTP 代理（支持 Clash） |

## 常见问题

**Q: 启动后没有数据？**
```bash
# 检查代理是否开启，Clash 需要在"增强模式"下
# 验证代理是否通
curl -x http://127.0.0.1:7897 https://fapi.binance.com/fapi/v1/ping

# 查看后端日志
tail -f /tmp/crypto-backend.log
```

**Q: 端口被占用？**
```bash
# 查看哪个进程占用了端口
lsof -i :3000
lsof -i :5173

# 停止占用进程
kill -9 <PID>
```

## License

MIT
