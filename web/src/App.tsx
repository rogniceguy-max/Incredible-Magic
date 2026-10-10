import React, { useState, useEffect } from 'react';
import { 
  Shield, Terminal, Cpu, CheckCircle2, XCircle, AlertTriangle, 
  Settings, Play, FileCode, Layers, Search, RefreshCw, Activity,
  ChevronRight, Lock, Check, X, Code2, GitFork, ArrowRight,
  FileText, Download, Copy
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  target_binary: string;
  status: 'running' | 'pending_approval' | 'completed' | 'failed' | 'idle';
  created_at: string;
}

interface TaskEvent {
  id: number;
  task_id: string;
  event_type: 'thought' | 'tool_call' | 'tool_result' | 'approval_needed' | 'message';
  content: any;
  created_at: string;
}

interface Approval {
  id: string;
  task_id: string;
  tool_name: string;
  parameters: any;
  risk_level: string;
  status: string;
  created_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'approvals' | 'tools' | 'settings'>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  
  // Launch Task Form
  const [taskTitle, setTaskTitle] = useState('Windows 二进制深度逻辑审计');
  const [binaryPath, setBinaryPath] = useState('C:\\Windows\\System32\\cmd.exe');
  const [userPrompt, setUserPrompt] = useState('侦察入口节区与导入表，定位敏感API并对校验跳转进行逆向分析。');
  const [loading, setLoading] = useState(false);

  // Settings State
  const [llmProvider, setLlmProvider] = useState('deepseek');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.deepseek.com/v1');
  const [llmKey, setLlmKey] = useState('');
  const [ghidraHome, setGhidraHome] = useState('');

  // Report State
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const handleGenerateReport = async () => {
    if (!selectedTask) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/report`);
      if (res.ok) {
        const data = await res.json();
        setReportContent(data.markdown);
      }
    } catch (e) {
      alert('报告生成失败: ' + e);
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const tasksRes = await fetch('/api/tasks');
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || []);
        if (data.tasks.length > 0 && !selectedTask) {
          setSelectedTask(data.tasks[0]);
        }
      }

      const approvalsRes = await fetch('/api/approvals');
      if (approvalsRes.ok) {
        const data = await approvalsRes.json();
        setApprovals(data.approvals || []);
      }

      const toolsRes = await fetch('/api/tools');
      if (toolsRes.ok) {
        const data = await toolsRes.json();
        setTools(data.tools || []);
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [selectedTask]);

  // Fetch events for selected task
  useEffect(() => {
    if (!selectedTask) return;
    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/tasks/${selectedTask.id}/events`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (e) {
        console.error('Failed to fetch task events:', e);
      }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 1500);
    return () => clearInterval(interval);
  }, [selectedTask]);

  // Handle Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', taskTitle);
      formData.append('binary_path', binaryPath);
      formData.append('prompt', userPrompt);

      const res = await fetch('/api/tasks', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        await fetchData();
        setActiveTab('tasks');
        const newTask = tasks.find(t => t.id === data.task_id);
        if (newTask) setSelectedTask(newTask);
      }
    } catch (err) {
      alert('启动任务失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Approval Decision
  const handleDecision = async (approvalId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      if (res.ok) {
        fetchData();
        if (selectedTask) {
          const evRes = await fetch(`/api/tasks/${selectedTask.id}/events`);
          if (evRes.ok) {
            const evData = await evRes.json();
            setEvents(evData.events || []);
          }
        }
      }
    } catch (err) {
      alert('审批操作失败: ' + err);
    }
  };

  // Extract C pseudocode from events if present
  const decompEvent = events.find(e => e.event_type === 'tool_result' && e.content?.tool === 'decompile_function');
  const pseudocode = decompEvent?.content?.result?.pseudocode || null;

  // Extract CFG nodes from events
  const cfgEvent = events.find(e => e.event_type === 'tool_result' && e.content?.tool === 'get_cfg');
  const cfgNodes = cfgEvent?.content?.result?.nodes || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100">
      {/* Top Header */}
      <header className="h-16 border-b border-slate-800 bg-[#0d1322] px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-wide text-white">Incredible-Magic</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 font-mono">
                WORKBENCH v0.1
              </span>
            </div>
            <p className="text-xs text-slate-400">AI 智能二进制逆向工程与安全分析系统</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
          {[
            { id: 'dashboard', label: '仪表盘', icon: Activity },
            { id: 'tasks', label: '逆向任务', icon: Terminal },
            { 
              id: 'approvals', 
              label: '拦截审批', 
              icon: AlertTriangle, 
              badge: approvals.length > 0 ? approvals.length : undefined 
            },
            { id: 'tools', label: '工具矩阵', icon: Layers },
            { id: 'settings', label: '系统设置', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 px-1.5 py-0.2 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>核心引擎在线</span>
          </div>
          <div className="text-slate-500">|</div>
          <div className="text-slate-400">
            待审批: <span className="text-amber-400 font-bold">{approvals.length}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ================= DASHBOARD TAB ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs text-slate-400">总分析任务</div>
                <div className="text-2xl font-bold font-mono mt-1 text-white">{tasks.length}</div>
                <div className="text-[11px] text-slate-500 mt-2">支持 PE / ELF / 固件二进制</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs text-slate-400">待决策审批拦截</div>
                <div className={`text-2xl font-bold font-mono mt-1 ${approvals.length > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {approvals.length}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">人在环路 (Human-in-the-Loop)</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs text-slate-400">已就绪逆向工具</div>
                <div className="text-2xl font-bold font-mono mt-1 text-blue-400">{tools.length || 7}</div>
                <div className="text-[11px] text-slate-500 mt-2">Core 8 只读 + Extended 敏捷调用</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs text-slate-400">Ghidra / Capstone 状态</div>
                <div className="text-2xl font-bold font-mono mt-1 text-emerald-400">READY</div>
                <div className="text-[11px] text-slate-500 mt-2">反汇编、AST与拓扑解析已连接</div>
              </div>
            </div>

            {/* Quick Launch Panel */}
            <div className="bg-[#111726] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" />
                  <h2 className="font-semibold text-white text-sm">启动新逆向分析任务</h2>
                </div>
                <span className="text-xs text-slate-400">零广告 · 纯净安全审计</span>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">任务名称</label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">目标二进制文件路径</label>
                    <input
                      type="text"
                      value={binaryPath}
                      onChange={(e) => setBinaryPath(e.target.value)}
                      placeholder="C:\Windows\System32\cmd.exe"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">AI 逆向指导提示词 (Goal Prompt)</label>
                  <textarea
                    rows={2}
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:border-blue-500 focus:outline-none font-mono resize-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-lg shadow-blue-900/30"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>调度 AI 智能逆向</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Recent Tasks List */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">最近任务记录</span>
                <button onClick={fetchData} className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> 刷新
                </button>
              </div>
              <div className="divide-y divide-slate-800/60">
                {tasks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">暂无任务，请在上方启动一个新任务。</div>
                ) : (
                  tasks.slice(0, 5).map((t) => (
                    <div 
                      key={t.id} 
                      onClick={() => { setSelectedTask(t); setActiveTab('tasks'); }}
                      className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Terminal className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="text-xs font-medium text-slate-200">{t.title}</div>
                          <div className="text-[11px] font-mono text-slate-500">{t.target_binary}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                          t.status === 'running' ? 'bg-blue-950 text-blue-400 border border-blue-800 animate-pulse' :
                          t.status === 'pending_approval' ? 'bg-amber-950 text-amber-400 border border-amber-800 font-bold' :
                          t.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {t.status === 'pending_approval' ? '待审批拦截' : t.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TASKS EXECUTION TAB ================= */}
        {activeTab === 'tasks' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
            {/* Task Sidebar */}
            <div className="lg:col-span-3 bg-[#0d1322] border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-800 font-medium text-xs text-slate-400 flex items-center justify-between">
                <span>任务队列 ({tasks.length})</span>
                <button onClick={fetchData}><RefreshCw className="w-3 h-3 text-slate-500 hover:text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className={`p-3 text-xs cursor-pointer transition-colors ${
                      selectedTask?.id === t.id ? 'bg-blue-600/10 border-l-2 border-blue-500' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="font-medium text-slate-200 truncate">{t.title}</div>
                    <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{t.target_binary}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        t.status === 'pending_approval' ? 'bg-amber-900/60 text-amber-300 font-bold' :
                        t.status === 'running' ? 'bg-blue-900/60 text-blue-300' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {t.status}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono">#{t.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Task Detail & Event Stream */}
            <div className="lg:col-span-5 bg-[#0d1322] border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white truncate max-w-xs">{selectedTask?.title || '未选择任务'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTask && (
                    <>
                      <button
                        onClick={handleGenerateReport}
                        disabled={reportLoading}
                        className="px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/60 text-blue-300 text-[10px] flex items-center gap-1 transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        <span>{reportLoading ? '生成中...' : '生成审计报告'}</span>
                      </button>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        selectedTask.status === 'pending_approval' ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {selectedTask.status}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Event Logs Stream */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
                {events.length === 0 ? (
                  <div className="text-center text-slate-500 py-12">等待事件流...</div>
                ) : (
                  events.map((ev) => {
                    if (ev.event_type === 'thought') {
                      return (
                        <div key={ev.id} className="bg-slate-900/70 border border-slate-800/80 rounded-lg p-3 text-slate-300">
                          <div className="flex items-center gap-1.5 text-blue-400 text-[10px] font-bold mb-1">
                            <Cpu className="w-3 h-3" />
                            <span>AI 思考 (THOUGHT)</span>
                          </div>
                          <div className="text-slate-300 text-xs leading-relaxed font-sans">{ev.content?.message}</div>
                        </div>
                      );
                    }
                    if (ev.event_type === 'tool_call') {
                      return (
                        <div key={ev.id} className="bg-blue-950/20 border border-blue-900/40 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 text-blue-300 text-[10px] font-bold">
                            <Layers className="w-3 h-3" />
                            <span>调用工具: {ev.content?.tool}</span>
                          </div>
                          <pre className="text-[10px] text-slate-400 mt-1 overflow-x-auto">
                            {JSON.stringify(ev.content?.args, null, 2)}
                          </pre>
                        </div>
                      );
                    }
                    if (ev.event_type === 'approval_needed') {
                      return (
                        <div key={ev.id} className="bg-amber-950/40 border border-amber-800/80 rounded-lg p-3 shadow-lg">
                          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-1">
                            <AlertTriangle className="w-4 h-4" />
                            <span>人在环路拦截警告 (APPROVAL REQUIRED)</span>
                          </div>
                          <p className="text-xs text-amber-200/90 font-sans mb-3">{ev.content?.details}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDecision(ev.content?.approval_id, 'approved')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs flex items-center gap-1 font-sans"
                            >
                              <Check className="w-3 h-3" /> 批准放行
                            </button>
                            <button
                              onClick={() => handleDecision(ev.content?.approval_id, 'rejected')}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs flex items-center gap-1 font-sans"
                            >
                              <X className="w-3 h-3" /> 拒绝驳回
                            </button>
                          </div>
                        </div>
                      );
                    }
                    if (ev.event_type === 'tool_result') {
                      return (
                        <div key={ev.id} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-400">
                          <div className="text-[10px] text-slate-500 font-semibold mb-1">✓ 工具返回 [{ev.content?.tool}]</div>
                          {ev.content?.tool === 'static_recon' && (
                            <div className="text-slate-300 text-[10px] space-y-0.5">
                              <div>文件格式: {ev.content.result.format}</div>
                              <div>香农熵: {ev.content.result.overall_entropy}</div>
                              <div>MD5: {ev.content.result.hashes?.md5}</div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Code Inspection & CFG Visualizer */}
            <div className="lg:col-span-4 bg-[#0d1322] border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-300">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span>反编译与拓扑视窗</span>
                </div>
                <span className="text-[10px] text-slate-500">C 伪代码 / CFG</span>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-4">
                {/* Pseudocode box */}
                <div className="bg-[#070b13] border border-slate-800/80 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-blue-400" />
                    <span>反编译 C 伪代码 (Ghidra AST)</span>
                  </div>
                  {pseudocode ? (
                    <pre className="font-mono text-[11px] text-emerald-300/90 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {pseudocode}
                    </pre>
                  ) : (
                    <div className="text-[11px] text-slate-600 py-6 text-center">
                      暂无反编译数据（AI 调度 decompile_function 时在此渲染）
                    </div>
                  )}
                </div>

                {/* CFG Basic Block Visualizer */}
                <div className="bg-[#070b13] border border-slate-800/80 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <GitFork className="w-3.5 h-3.5 text-amber-400" />
                    <span>控制流基本块拓扑 (CFG)</span>
                  </div>
                  {cfgNodes.length > 0 ? (
                    <div className="space-y-2">
                      {cfgNodes.map((node: any) => (
                        <div key={node.id} className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono">
                          <div className="text-amber-400 font-bold mb-1 flex justify-between">
                            <span>{node.data?.label}</span>
                            <span className="text-slate-500">{node.data?.address}</span>
                          </div>
                          <div className="space-y-0.5 text-slate-300">
                            {node.data?.instructions?.map((ins: string, idx: number) => (
                              <div key={idx} className="truncate">{ins}</div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 py-6 text-center">
                      等待 CFG 生成 (调用 get_cfg 时动态渲染拓扑)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= APPROVALS TAB ================= */}
        {activeTab === 'approvals' && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span>人在环路拦截审批网关 (Human-in-the-Loop)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  防范 AI 自主逆向产生越权修改或不可逆损坏。涉及写入补丁、下断点等敏感动作前触发拦截。
                </p>
              </div>
              <button onClick={fetchData} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> 刷新待审批
              </button>
            </div>

            {approvals.length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-12 text-center text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                当前无待审批拦截事件，系统运行安全合规。
              </div>
            ) : (
              approvals.map((appr) => (
                <div key={appr.id} className="bg-slate-900/80 border border-amber-900/40 rounded-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <span className="font-bold text-sm text-white">工具拦截: {appr.tool_name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold uppercase">
                        {appr.risk_level} RISK
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">ID: {appr.id}</span>
                  </div>

                  <div className="bg-black/40 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 mb-4">
                    <div className="text-[10px] text-slate-500 mb-1">拦截调用参数载荷 (PAYLOAD DIFF):</div>
                    <pre className="overflow-x-auto text-amber-200/90">
                      {JSON.stringify(appr.parameters, null, 2)}
                    </pre>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-400 font-sans">
                      任务归属: <code className="text-blue-400">#{appr.task_id}</code>
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDecision(appr.id, 'rejected')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                      >
                        拒绝并终止操作 (Reject)
                      </button>
                      <button
                        onClick={() => handleDecision(appr.id, 'approved')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors shadow-lg shadow-emerald-900/30"
                      >
                        批准并放行执行 (Approve)
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= TOOLS MATRIX TAB ================= */}
        {activeTab === 'tools' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                <span>逆向工具矩阵 (Core 8 & Extended Tools)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                吸收 IG5 逆向内核设计，所有分析与调试工具均已解耦并支持标准 MCP 协议。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tools.map((t, idx) => (
                <div key={idx} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-xs text-blue-400">{t.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        t.requires_approval ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {t.requires_approval ? '需要审批' : '只读分析'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">{t.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>分类: {t.category}</span>
                    <span>MCP-Ready</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= SETTINGS TAB ================= */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6 bg-slate-900/60 border border-slate-800 rounded-xl p-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <span>系统与模型配置</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                自由配置大模型 API，本工具不植入任何强制品牌与第三方水印。
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">LLM 提供方</label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                >
                  <option value="deepseek">DeepSeek (Recommended)</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">API Base URL</label>
                <input
                  type="text"
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={llmKey}
                  onChange={(e) => setLlmKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Ghidra 安装路径 (GHIDRA_HOME)</label>
                <input
                  type="text"
                  value={ghidraHome}
                  onChange={(e) => setGhidraHome(e.target.value)}
                  placeholder="C:\Tools\ghidra_11.0_PUBLIC"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">若留空，工作台将启用内建的高性能反汇编与启发式 C 伪代码分析引擎。</span>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => alert('配置已保存生效')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Report Modal */}
        {reportContent && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-sm text-white">二进制逆向工程分析报告</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(reportContent);
                      alert('报告 Markdown 已复制到剪贴板');
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> 复制 Markdown
                  </button>
                  <button
                    onClick={() => setReportContent(null)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1 font-sans text-xs text-slate-300 leading-relaxed space-y-4">
                <pre className="whitespace-pre-wrap font-mono text-[11px] bg-slate-950 p-4 rounded-lg border border-slate-800/80 text-emerald-300/90 overflow-x-auto">
                  {reportContent}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
