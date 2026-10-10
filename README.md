# Incredible-Magic (IM-Workbench)

> **AI-Powered Binary Reverse Engineering & Security Analysis Workbench**  
> 融合 ARTEX 级现代清爽 Web 交互体系 + 工业级静动态二进制逆向分析引擎内核

---

## 💡 项目设计理念

1. **极致清爽，零冗余私货**：告别充斥商业水印、引流广告与混乱提示词的传统插件，还原纯粹干净的技术工作台体验。
2. **静动双擎逆向能力**：深度整合静态反编译（Ghidra Headless / P-code / CFG 拓扑）与动态调试观测（寄存器、内存断点、调用栈）。
3. **人在环路（Human-in-the-Loop）**：关键操作（如补丁写入、内存修改、调试断点下达）通过优雅卡片拦截审批，兼顾 AI 自主效率与安全可控。
4. **开放互联（MCP 原生支持）**：所有逆向工具均支持标准 Model Context Protocol (MCP) 接口，可无缝对接 DeepSeek、Claude、OpenAI 等大模型。

---

## 🏗️ 架构概览

```
Incredible-Magic/
├── web/                # 现代交互前端 (Next.js / Tailwind CSS / Monaco Editor / React Flow)
├── server/             # 核心中枢调度与 Agent 状态机 (FastAPI / Python AsyncIO)
├── engine/             # 二进制逆向分析核心引擎
│   ├── static/         # PE/ELF 格式解析、熵值检测、导入导出、交叉引用
│   ├── ghidra/         # Ghidra Headless 反编译与微代码提取桥接
│   ├── cfg/            # 控制流拓扑分析与图生成
│   └── dynamic/        # 动态无头调试与仿真器桥接
├── mcp_servers/        # 标准 Model Context Protocol 服务
└── skills/             # 逆向工程专业分析 SOP 与方法论提示词
```

---

## 🚀 核心特性

- [ ] **可视化任务工作台**：实时追踪 AI 逆向推理链条（Thinking）、工具调用（Tool Calls）与状态输出。
- [ ] **双模工具架构（Core 8 + Extended）**：动态降噪设计，高频核心分析工具与深度全景工具分层调度。
- [ ] **伪代码与汇编查看器**：集成 Monaco Editor，支持反编译 C 伪代码语法高亮与变量符号追踪。
- [ ] **控制流图（CFG）渲染**：交互式节点折叠与跳转拓扑图。
- [ ] **拦截审批系统**：对涉及动态执行、补丁修改的操作进行实时弹窗拦截与审计记录。

---

## 📜 许可证

MIT License
