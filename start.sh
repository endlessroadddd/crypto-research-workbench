#!/bin/bash
# ============================================
# Crypto Research Workbench - 一键启动脚本
# ============================================
# 使用方法: ./start.sh [命令]
#   web    - 启动前后端
#   status - 查看运行状态
#   stop   - 停止所有服务
#   help   - 显示帮助
#
# 其他用户请修改下方「配置」部分
# ============================================

# ========== 配置 (其他用户修改这里) ==========
# Clash 代理地址
PROXY_URL="http://127.0.0.1:7897"

# 后端端口
BACKEND_PORT=3000

# 前端端口
FRONTEND_PORT=5173

# 项目路径 (默认当前目录)
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
# ============================================

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_msg() { echo -e "${CYAN}[crypto]${NC} $1"; }
print_ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
print_warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }
print_err(){ echo -e "${RED}[ERR]${NC} $1"; }

# 检测端口是否被占用
is_port_used() {
    lsof -i :$1 >/dev/null 2>&1
}

# 检测进程是否存在
is_process_running() {
    ps -p $1 >/dev/null 2>&1
}

# 获取端口对应的进程PID
get_port_pid() {
    lsof -ti :$1 2>/dev/null
}

# 停止指定端口的服务
stop_port() {
    local port=$1
    local pid=$(get_port_pid $port)
    if [ -n "$pid" ]; then
        kill $pid 2>/dev/null
        sleep 1
        if is_port_used $port; then
            kill -9 $pid 2>/dev/null
        fi
        print_msg "端口 $port 已关闭"
    fi
}

# 启动后端
start_backend() {
    print_msg "启动后端..."
    
    # 检查端口是否已被占用
    if is_port_used $BACKEND_PORT; then
        print_warn "后端端口 $BACKEND_PORT 已被占用，跳过启动"
        local pid=$(get_port_pid $BACKEND_PORT)
        print_msg "后端运行中 (PID: $pid)"
    else
        cd "$PROJECT_DIR/apps/api"
        export BINANCE_PROXY_URL="$PROXY_URL"
        
        # 后台启动
        nohup node dist/bundle.cjs > /tmp/crypto-backend.log 2>&1 &
        local pid=$!
        sleep 2
        
        if is_process_running $pid; then
            print_ok "后端启动成功 (PID: $pid)"
        else
            print_err "后端启动失败，查看日志: tail /tmp/crypto-backend.log"
            return 1
        fi
    fi
    
    # 验证后端是否正常响应
    sleep 2
    if curl -s http://localhost:$BACKEND_PORT/api/debug/binance-fapi >/dev/null 2>&1; then
        print_ok "后端 API 正常"
    else
        print_warn "后端 API 无响应，请检查代理是否正常"
    fi
}

# 启动前端
start_frontend() {
    print_msg "启动前端..."
    
    # 检查端口是否已被占用
    if is_port_used $FRONTEND_PORT; then
        print_warn "前端端口 $FRONTEND_PORT 已被占用，跳过启动"
        local pid=$(get_port_pid $FRONTEND_PORT)
        print_msg "前端运行中 (PID: $pid)"
    else
        cd "$PROJECT_DIR/apps/web"
        
        # 写入 .env.local (只写入必须的配置)
        echo "VITE_API_BASE=http://localhost:$BACKEND_PORT" > "$PROJECT_DIR/apps/web/.env.local"
        
        # 后台启动
        nohup pnpm dev > /tmp/crypto-frontend.log 2>&1 &
        local pid=$!
        sleep 4
        
        if is_port_used $FRONTEND_PORT; then
            print_ok "前端启动成功 (PID: $pid)"
        else
            print_err "前端启动失败，查看日志: tail /tmp/crypto-frontend.log"
            return 1
        fi
    fi
}

# 查看状态
do_status() {
    echo ""
    print_msg "========== 运行状态 =========="
    
    # 后端
    if is_port_used $BACKEND_PORT; then
        local pid=$(get_port_pid $BACKEND_PORT)
        print_ok "后端  → http://localhost:$BACKEND_PORT (PID: $pid)"
        
        # 检测 API 是否正常
        if curl -s http://localhost:$BACKEND_PORT/api/debug/binance-fapi >/dev/null 2>&1; then
            print_ok "API   → 响应正常"
        else
            print_warn "API   → 无响应 (代理可能未开启)"
        fi
    else
        print_err "后端  → 未运行"
    fi
    
    # 前端
    if is_port_used $FRONTEND_PORT; then
        local pid=$(get_port_pid $FRONTEND_PORT)
        print_ok "前端  → http://localhost:$FRONTEND_PORT (PID: $pid)"
    else
        print_err "前端  → 未运行"
    fi
    
    echo ""
    print_msg "代理  → $PROXY_URL"
    print_msg "项目  → $PROJECT_DIR"
    echo ""
    print_msg "日志  → tail -f /tmp/crypto-backend.log (后端)"
    print_msg "日志  → tail -f /tmp/crypto-frontend.log (前端)"
    echo ""
}

# 停止所有服务
do_stop() {
    print_msg "停止所有服务..."
    stop_port $FRONTEND_PORT
    stop_port $BACKEND_PORT
    print_ok "已停止"
}

# 主菜单
do_help() {
    echo ""
    echo "=========================================="
    echo "  Crypto Research Workbench 启动脚本"
    echo "=========================================="
    echo ""
    echo "  使用方法: $0 [命令]"
    echo ""
    echo "  命令:"
    echo "    web     启动前后端 (默认)"
    echo "    status  查看运行状态"
    echo "    stop    停止所有服务"
    echo "    help    显示帮助"
    echo ""
    echo "  示例:"
    echo "    $0       启动前后端"
    echo "    $0 web   启动前后端"
    echo "    $0 status"
    echo "    $0 stop"
    echo ""
    echo "  配置 (修改脚本顶部的配置区域):"
    echo "    PROXY_URL   = $PROXY_URL"
    echo "    BACKEND_PORT= $BACKEND_PORT"
    echo "    FRONTEND_PORT= $FRONTEND_PORT"
    echo ""
}

# 主入口
case "${1:-web}" in
    web)
        start_backend
        start_frontend
        echo ""
        print_ok "========== 全部就绪 =========="
        echo ""
        print_msg "前端 → http://localhost:$FRONTEND_PORT"
        print_msg "后端 → http://localhost:$BACKEND_PORT"
        echo ""
        print_msg "按 Ctrl+C 停止，或另开终端运行 $0 stop"
        ;;
    status)
        do_status
        ;;
    stop)
        do_stop
        ;;
    help|--help|-h)
        do_help
        ;;
    *)
        print_err "未知命令: $1"
        echo ""
        $0 help
        exit 1
        ;;
esac
