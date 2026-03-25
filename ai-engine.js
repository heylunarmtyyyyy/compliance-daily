/**
 * GCC 合规周报工具箱 — AI 深度分析引擎 v3.0
 * 纯前端实现，通过 OpenAI-compatible API 调用 AI 模型
 */

// ─── AI Provider Presets ───
const AI_PRESETS = {
  'openai-compat': { baseUrl: '', model: '', name: 'OpenAI 兼容 API' },
  'deepseek': { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', name: 'DeepSeek' },
  'openai': { baseUrl: 'https://api.openai.com', model: 'gpt-4o', name: 'OpenAI' },
  'zhipu': { baseUrl: 'https://open.bigmodel.cn/api/paas', model: 'glm-4-flash', name: '智谱 GLM' },
  'qwen': { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-plus', name: '通义千问' },
};

const STORAGE_KEY = 'gcc_toolbox_ai_config';
let _aiAbortController = null;

// ─── Config Management ───
function getAIConfig() {
  return {
    provider: document.getElementById('ai-provider').value,
    baseUrl: document.getElementById('ai-base-url').value.replace(/\/+$/, ''),
    model: document.getElementById('ai-model').value.trim(),
    apiKey: document.getElementById('ai-api-key').value.trim(),
  };
}

function onProviderChange() {
  const p = document.getElementById('ai-provider').value;
  const preset = AI_PRESETS[p];
  if (preset && preset.baseUrl) {
    document.getElementById('ai-base-url').value = preset.baseUrl;
    document.getElementById('ai-model').value = preset.model;
  }
}

function loadSavedConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const cfg = JSON.parse(saved);
    if (cfg.provider) document.getElementById('ai-provider').value = cfg.provider;
    if (cfg.baseUrl) document.getElementById('ai-base-url').value = cfg.baseUrl;
    if (cfg.model) document.getElementById('ai-model').value = cfg.model;
    if (cfg.apiKey) document.getElementById('ai-api-key').value = cfg.apiKey;
    toast('已加载保存的 AI 配置', 'info');
  } catch(e) { console.warn('加载配置失败', e); }
}

function saveAIConfig() {
  const cfg = getAIConfig();
  if (!cfg.apiKey) { toast('请先填写 API Key', 'error'); return; }
  const save = document.getElementById('save-config-toggle').checked;
  if (save) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    toast('配置已保存到浏览器', 'success');
  } else {
    localStorage.removeItem(STORAGE_KEY);
    toast('配置已应用（未保存到浏览器）', 'info');
  }
}

function toggleKeyVisibility() {
  const inp = document.getElementById('ai-api-key');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── AI API Call ───
async function callAI(messages, opts = {}) {
  const cfg = getAIConfig();
  if (!cfg.apiKey) throw new Error('请先配置 AI API Key');
  if (!cfg.baseUrl) throw new Error('请先配置 API Base URL');

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  const body = {
    model: cfg.model || 'deepseek-chat',
    messages: messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 4096,
    stream: false,
  };

  const controller = opts.abortController || new AbortController();
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`API 错误 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  if (!data.choices || !data.choices[0]) throw new Error('API 返回格式异常');
  return data.choices[0].message.content;
}

// ─── Test Connection ───
async function testAIConnection() {
  const resultDiv = document.getElementById('api-test-result');
  resultDiv.style.display = 'block';
  resultDiv.className = 'api-test-result';
  resultDiv.style.background = '#eff6ff';
  resultDiv.style.color = '#1d4ed8';
  resultDiv.textContent = '🔄 正在测试连接...';

  try {
    const reply = await callAI([
      { role: 'user', content: '请用一句话回复：你好，连接测试成功。' }
    ], { max_tokens: 50 });

    resultDiv.style.background = '#ecfdf5';
    resultDiv.style.color = '#059669';
    resultDiv.textContent = '✅ 连接成功！模型回复: ' + reply.slice(0, 80);
    toast('AI 连接测试成功', 'success');
  } catch(e) {
    resultDiv.style.background = '#fef2f2';
    resultDiv.style.color = '#dc2626';
    resultDiv.textContent = '❌ 连接失败: ' + e.message;
    toast('AI 连接失败: ' + e.message, 'error');
  }
}

// ─── Progress UI ───
class ProgressTracker {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.logs = [];
    this.total = 0;
    this.done = 0;
  }

  init(total, title) {
    this.total = total;
    this.done = 0;
    this.logs = [];
    this.container.style.display = 'block';
    this.container.innerHTML = `
      <div class="ai-progress-container">
        <div class="ai-progress-header">
          <span>✨</span> <span id="prog-title">${title}</span>
          <span style="margin-left:auto;font-size:13px;" id="prog-counter">0/${total}</span>
          <button class="btn btn-danger" onclick="cancelAIGeneration()" style="padding:6px 14px;font-size:12px;margin-left:8px;">⏹ 取消</button>
        </div>
        <div class="ai-progress-bar-track">
          <div class="ai-progress-bar-fill" id="prog-fill" style="width:0%"></div>
        </div>
        <div class="ai-progress-status" id="prog-status">准备开始...</div>
        <div class="ai-progress-log" id="prog-log"></div>
      </div>`;
  }

  update(status, logMsg, type = '') {
    document.getElementById('prog-status').textContent = status;
    if (logMsg) {
      this.logs.push({ msg: logMsg, type });
      const logDiv = document.getElementById('prog-log');
      const item = document.createElement('div');
      item.className = 'log-item ' + type;
      item.textContent = logMsg;
      logDiv.appendChild(item);
      logDiv.scrollTop = logDiv.scrollHeight;
    }
  }

  advance(logMsg) {
    this.done++;
    const pct = Math.round((this.done / this.total) * 100);
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('prog-counter').textContent = this.done + '/' + this.total;
    if (logMsg) this.update('', logMsg, 'success');
  }

  finish(msg) {
    document.getElementById('prog-fill').style.width = '100%';
    document.getElementById('prog-status').textContent = msg;
    this.update('', msg, 'success');
  }

  error(msg) {
    document.getElementById('prog-status').textContent = '❌ ' + msg;
    this.update('', msg, 'error');
  }
}

function cancelAIGeneration() {
  if (_aiAbortController) {
    _aiAbortController.abort();
    _aiAbortController = null;
    toast('已取消 AI 生成', 'info');
  }
}

// ─── System Prompt for Weekly Analysis ───
const SYSTEM_PROMPT = `你是一名服务于全球游戏业务的高级合规情报分析助手。你的服务对象是腾讯游戏合规经理团队（GCC），重点关注全球游戏合规、科技平台合规、数据隐私、未成年人保护、消费者保护、内容治理、AI合规、中国公司出海与Tencent相关风险。

你的输出受众包括公司内部的合规、法务、公关政策、游戏研发、发行、运营和管理层。受众希望快速看到真正重要的新闻和分析，不希望阅读冗长原文。

分析质量标准：
- 事件介绍不是简单复述标题，而是提供监管的具体条款、争议焦点、行业影响路径
- 业务影响要具体到"需要做什么"而非泛泛"有影响"
- 监管信号要提炼方法论层面的变化，而非重复事实
- 每条新闻分析 300-500 字
- 用中文输出，简洁、专业
- 重点写"为什么重要"和"对我们意味着什么"
- 语气自信但克制，不夸张不低估`;

// ─── Analyze Single News Item ───
async function analyzeOneNews(item, abortCtrl) {
  const sourceInfo = item.source ? `\n原文链接: ${item.source}` : '';
  const dateInfo = item.date ? `\n报道日期: ${item.date}` : '';
  const summaryInfo = item.summary ? `\n简要信息: ${item.summary}` : '';
  const sectionInfo = item.section ? `\n所属板块: ${item.section}` : '';

  const prompt = `请对以下合规新闻进行深度分析：

新闻标题: ${item.title}${dateInfo}${sourceInfo}${summaryInfo}${sectionInfo}

请严格按以下结构输出（使用Markdown格式）：

**事件介绍**

（2-3段，包含：事件核心事实、监管具体要求或争议焦点、当事方回应或最新进展）

**直接业务影响**

（用"●"开头的要点，每条1-2句话，聚焦对游戏公司运营的具体影响）

**监管趋势信号**

（1-2段分析：这个事件反映了什么监管方法论变化？对行业整体意味着什么？）

注意：
- 基于你对该领域的知识进行专业分析
- 如果你对这条新闻的具体细节不确定，请基于标题和已知背景进行合理推断，并在需要时标注"据公开报道"
- 不要编造具体数据或日期
- 分析总计300-500字`;

  return await callAI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], { max_tokens: 2000, abortController: abortCtrl });
}

// ─── Generate Trend Overview ───
async function generateTrendOverview(allAnalyses, dateRange, abortCtrl) {
  const summaryOfAll = allAnalyses.map((a, i) =>
    `${i+1}. [${a.section}] ${a.title}: ${a.analysis.slice(0, 200)}...`
  ).join('\n');

  const prompt = `基于以下本周所有合规新闻的分析，请提炼"本周高优先级信号总览"。

周报周期: ${dateRange}

本周新闻概要:
${summaryOfAll}

请输出 2-4 条宏观趋势信号，每条用以下格式：
● **关键词**: 2-3句话概括本周在该领域的监管动向和信号含义

要求：
- 从全部新闻中提炼跨事件的宏观趋势
- 突出对游戏业务的信号意义
- 如果有多国同周推进同一方向的监管，要指出"全球监管趋同"信号
- 简洁有力，每条不超过3句话`;

  return await callAI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], { max_tokens: 1500, abortController: abortCtrl });
}

// ─── Main: AI Report Generation ───
async function generateReportAI() {
  const cfg = getAIConfig();
  if (!cfg.apiKey) {
    toast('请先配置 AI API Key', 'error');
    document.querySelector('.ai-card').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const startDate = document.getElementById('date-start').value.trim();
  const endDate = document.getElementById('date-end').value.trim();
  if (!startDate || !endDate) { toast('请填写起始和结束日期', 'error'); return; }
  if (uploadedNewsItems.length === 0) { toast('请先上传 Excel', 'error'); return; }

  const dateRange = startDate + ' - ' + endDate;

  // Group news by section
  const groups = {};
  const sectionOrder = ['游戏行业关注', '中国企业出海', '科技行业关注'];
  sectionOrder.forEach(s => groups[s] = []);
  uploadedNewsItems.forEach(item => {
    let sec = item.section || '游戏行业关注';
    if (!groups[sec]) sec = '游戏行业关注';
    groups[sec].push(item);
  });

  const totalNews = uploadedNewsItems.length;
  // total tasks = each news analysis + 1 trend overview + 1 final assembly
  const totalSteps = totalNews + 2;

  const progress = new ProgressTracker('ai-progress');
  progress.init(totalSteps, 'AI 深度分析周报生成');

  _aiAbortController = new AbortController();
  const abortCtrl = _aiAbortController;

  const btnAI = document.getElementById('btn-generate-ai');
  const btnBasic = document.getElementById('btn-generate-basic');
  btnAI.disabled = true;
  btnBasic.disabled = true;

  const allAnalyses = [];

  try {
    // Phase 1: Analyze each news item
    let newsIdx = 0;
    for (const secName of sectionOrder) {
      const items = groups[secName];
      for (const item of items) {
        if (abortCtrl.signal.aborted) throw new Error('用户取消');
        newsIdx++;
        progress.update(`正在分析第 ${newsIdx}/${totalNews} 条: ${item.title.slice(0, 30)}...`, `[${newsIdx}/${totalNews}] 分析: ${item.title.slice(0, 40)}`, 'working');

        try {
          const analysis = await analyzeOneNews(item, abortCtrl);
          allAnalyses.push({ ...item, section: secName, analysis });
          progress.advance(`✅ ${item.title.slice(0, 40)}`);
        } catch(e) {
          if (e.name === 'AbortError' || abortCtrl.signal.aborted) throw new Error('用户取消');
          progress.update('', `⚠️ 分析失败: ${item.title.slice(0, 30)} — ${e.message}`, 'error');
          allAnalyses.push({ ...item, section: secName, analysis: `*[AI 分析失败: ${e.message}，请手动补充]*` });
          progress.advance(`⚠️ ${item.title.slice(0, 40)} (失败，已跳过)`);
        }
      }
    }

    // Phase 2: Generate trend overview
    progress.update('正在生成本周趋势总览...', '📊 生成趋势总览...', 'working');
    let trendOverview = '';
    try {
      trendOverview = await generateTrendOverview(allAnalyses, dateRange, abortCtrl);
      progress.advance('✅ 趋势总览生成完成');
    } catch(e) {
      if (e.name === 'AbortError' || abortCtrl.signal.aborted) throw new Error('用户取消');
      trendOverview = '● **请手动补充**: 趋势总览生成失败，请根据下方各条新闻分析，提炼本周宏观趋势。';
      progress.advance('⚠️ 趋势总览生成失败，已跳过');
    }

    // Phase 3: Assemble report
    progress.update('正在组装最终报告...', '📝 组装报告...', 'working');
    const md = assembleReport(dateRange, trendOverview, allAnalyses, sectionOrder, groups);
    progress.advance('✅ 报告组装完成');

    // Done
    progress.finish(`🎉 AI 深度分析完成！共分析 ${totalNews} 条新闻`);
    currentMdContent = md;

    document.getElementById('badge-r2').classList.add('done');
    const resultDiv = document.getElementById('generate-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<div class="status-bar" style="background:var(--ai-light);color:var(--ai);">✨ <strong>AI 深度分析周报已生成！</strong>共 ${totalNews} 条新闻，含趋势总览和逐条深度分析</div>`;

    document.getElementById('card-edit').style.display = 'block';
    document.getElementById('md-editor').value = md;
    document.getElementById('edit-status').innerHTML =
      `<div class="status-bar" style="background:var(--ai-light);color:var(--ai);">✨ AI 深度分析周报 ${dateRange} — 可直接编辑优化</div>`;
    document.getElementById('badge-r3').classList.add('done');

    toast('AI 深度分析周报生成成功！', 'success');
    document.getElementById('card-edit').scrollIntoView({ behavior: 'smooth' });

  } catch(e) {
    if (e.message === '用户取消') {
      progress.error('生成已取消');
      toast('AI 生成已取消', 'info');
    } else {
      progress.error(e.message);
      toast('AI 生成失败: ' + e.message, 'error');
    }
  } finally {
    btnAI.disabled = false;
    btnBasic.disabled = false;
    _aiAbortController = null;
  }
}

// ─── Assemble Final Report ───
function assembleReport(dateRange, trendOverview, allAnalyses, sectionOrder, groups) {
  const sectionEmojis = { '游戏行业关注': '🎮', '中国企业出海': '🌏', '科技行业关注': '💻' };
  const sectionLabels = { '游戏行业关注': '一、游戏行业关注', '中国企业出海': '二、中国企业出海', '科技行业关注': '三、科技行业关注' };

  let md = `# 【GCC】合规新闻每周导读\n\n`;
  md += `> **周报周期**: ${dateRange}\n\n`;
  md += `---\n\n`;
  md += `## 🔺 本周高优先级信号总览\n\n`;
  md += trendOverview + '\n\n';
  md += `---\n\n`;

  for (const secName of sectionOrder) {
    const secAnalyses = allAnalyses.filter(a => a.section === secName);
    if (secAnalyses.length === 0) continue;

    const emoji = sectionEmojis[secName] || '📋';
    const label = sectionLabels[secName] || secName;
    md += `## ${emoji} ${label}\n\n`;

    secAnalyses.forEach((item, i) => {
      md += `### ${i + 1}. ${item.title}\n\n`;
      if (item.source) md += `> 来源: [原文链接](${item.source})`;
      if (item.date) md += (item.source ? ' · ' : '> ') + `（${item.date}报道）`;
      if (item.source || item.date) md += '\n\n';
      md += item.analysis + '\n\n';
    });
  }

  md += `---\n\n`;
  md += `> 免责声明：以上内容为公开信息整理与分析摘要，不构成法律意见。如需具体合规建议，请咨询GCC游戏合规中心。\n\n`;
  md += `> 本周报由 GCC 合规周报工具箱 v3.0 (AI) 生成 | ${new Date().toLocaleDateString('zh-CN')}\n`;

  return md;
}
