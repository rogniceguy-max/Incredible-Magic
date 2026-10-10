# 二进制逆向工程与安全审计标准作业程序 (SOP)

本文档定义了 Incredible-Magic 工作台中 AI Agent 调度工具进行软件分析的标准化专业范式。

---

## 阶段一：二进制侦察 (Static Reconnaissance)
1. **文件指纹与熵值评估**：
   - 提取文件哈希（MD5 / SHA256），检查文件签名与架构（PE32 / PE64 / ELF）。
   - 计算全文件及各节区（Sections）的香农熵（Shannon Entropy）。若某节区熵值大于 7.0，标记为高疑似加壳、混淆或内嵌加密资源。
2. **导入与导出表审计**：
   - 检查关键外部动态链接库与 API 调用。
   - 敏感 API 筛查分类：
     - **内存操控**：`VirtualAlloc`, `VirtualProtect`, `WriteProcessMemory`
     - **进程注入/线程劫持**：`CreateRemoteThread`, `SetThreadContext`, `QueueUserAPC`
     - **反调试侦测**：`IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`
     - **网络通信**：`InternetOpen`, `HttpSendRequest`, `WSAStartup`

---

## 阶段二：字符串与特征常量挖掘 (Pattern Matching)
1. **字符串过滤与交叉引用**：
   - 提取 ASCII 与 UTF-16 宽字符。
   - 重点定位：网络 URL、IP 地址、注册表键路径、格式化字符串、错误提示信息。
2. **密码学与特征常数识别**：
   - 扫描标准算法特有常量（如 AES S-Box, MD5 初始常数, SHA256 常数表）。
   - 识别自定义异或（XOR）加解密循环。

---

## 阶段三：反编译与控制流图分析 (Decompilation & CFG)
1. **入口点与关键函数识别**：
   - 依据符号或导入表交叉引用定位主逻辑入口（`main`, `WinMain`, `DllMain`）。
2. **控制流分支推导 (CFG)**：
   - 分析基本块（Basic Blocks）之间的跳转拓扑。
   - 识别循环结构、分支判断（`je` / `jne` / `switch-case`）。
3. **C 伪代码与微代码复原**：
   - 变量重命名与类型推导。
   - 结构体成员对齐与内存访问偏移恢复。

---

## 阶段四：人在环路与受控动态验证 (Human-in-the-Loop)
1. **高危操作前置审批**：
   - 任何涉及**二进制修补（Patching）**、**进程内存覆写**或**调试器硬件断点**的操作，必须构造结构化审批载荷。
   - 向用户清晰说明：操作目标地址、修改前后的字节对比、预期分析结果及潜在崩溃风险。
2. **防御性测试验证**：
   - 验证绕过或解密逻辑后，生成结构化分析总结报告。
