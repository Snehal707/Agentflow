/**
 * AgentFlow pitch deck → PPTX (import into Google Slides).
 * ~12 slides: Problem → Solution → Proof → Demo → Compete → Tech → Future → Close
 * Brand: #070708 bg · #f2ca50 gold · white text
 */
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const BG = '070708';
const CARD = '101010';
const GOLD = 'F2CA50';
const MUTED = 'A3A3A3';
const WHITE = 'FFFFFF';
const LINE = '2A2A2A';

const root = path.resolve(__dirname, '..');
const logoBadgePng = path.join(root, 'agentflow-frontend/public/media-kit/agentflow-logo-badge.png');
const logoPrimaryPng = path.join(root, 'agentflow-frontend/public/media-kit/agentflow-logo-primary.png');
const qrPng = path.join(root, 'docs/agentflow-qr.png');
const outPath = path.join(root, 'docs/AgentFlow-Hackathon-Pitch.pptx');

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';
pptx.author = 'AgentFlow';
pptx.title = 'AgentFlow — Agentic Economy Pitch';

function addBg(slide) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: BG },
  });
}

function addGoldRule(slide, y = 0.32) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.6, y, w: 1.2, h: 0.05,
    fill: { color: GOLD },
  });
}

function addTitle(slide, title, opts = {}) {
  addGoldRule(slide, opts.ruleY ?? 0.32);
  slide.addText(title, {
    x: 0.6,
    y: opts.y ?? 0.48,
    w: opts.w ?? 10.5,
    h: opts.h ?? 0.4,
    fontSize: opts.fontSize ?? 26,
    color: GOLD,
    fontFace: 'Arial',
    bold: true,
  });
}

function addLogo(slide, opts = {}) {
  const x = opts.x ?? 11.6;
  const y = opts.y ?? 0.28;
  const w = opts.w ?? 1.0;
  if (fs.existsSync(logoBadgePng)) {
    slide.addImage({ path: logoBadgePng, x, y, w, h: w });
  }
}

function addFooter(slide, text = 'agentflow.one · Arc Testnet') {
  slide.addText(text, {
    x: 0.6, y: 7.05, w: 10, h: 0.3,
    fontSize: 11, color: MUTED, fontFace: 'Arial',
  });
}

// ——— 1. Hook ———
{
  const s = pptx.addSlide();
  addBg(s);
  if (fs.existsSync(logoPrimaryPng)) {
    s.addImage({ path: logoPrimaryPng, x: 0.55, y: 0.35, w: 4.8, h: 1.2 });
  } else if (fs.existsSync(logoBadgePng)) {
    s.addImage({ path: logoBadgePng, x: 0.7, y: 0.45, w: 0.95, h: 0.95 });
  }
  addGoldRule(s, 1.7);
  s.addText('Most people never open a wallet app.\nThey open chats.', {
    x: 0.7, y: 2.05, w: 11.5, h: 1.3,
    fontSize: 32, color: WHITE, fontFace: 'Arial', bold: true,
  });
  s.addText('We grew up using WhatsApp, Telegram, and Instagram DMs, not crypto wallets.\n\nSo why should onchain finance feel any different?', {
    x: 0.7, y: 3.5, w: 11, h: 1.4,
    fontSize: 18, color: MUTED, fontFace: 'Arial',
  });
  s.addText("That's why I built AgentFlow.", {
    x: 0.7, y: 5.1, w: 11, h: 0.45,
    fontSize: 20, color: WHITE, fontFace: 'Arial',
  });
  s.addText('Intent in. Execution out.', {
    x: 0.7, y: 5.65, w: 11, h: 0.55,
    fontSize: 28, color: GOLD, fontFace: 'Arial', bold: true,
  });
  addFooter(s);
}

// ——— 2. Problem ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'The Problem', { fontSize: 28 });
  s.addText("Crypto isn't difficult because of blockchain.\nIt's difficult because every financial task lives in a different interface.", {
    x: 0.6, y: 1.15, w: 12, h: 0.95,
    fontSize: 20, color: WHITE, fontFace: 'Arial',
  });
  const tasks = [
    ['Need to send money?', 'Open one app.'],
    ['Need to swap or vault?', 'Open another.'],
    ['Need to bridge funds?', 'Another.'],
    ['Need prediction-market research or a trade?', 'Another.'],
    ['Invoice or portfolio?', 'Another.'],
  ];
  tasks.forEach((row, i) => {
    const y = 2.3 + i * 0.52;
    s.addText(row[0], { x: 0.6, y, w: 5.5, h: 0.45, fontSize: 16, color: MUTED, fontFace: 'Arial' });
    s.addText(row[1], { x: 6.3, y, w: 5.5, h: 0.45, fontSize: 16, color: WHITE, fontFace: 'Arial' });
  });
  s.addText("The experience is fragmented. People don't want more apps.\nThey want one conversation.", {
    x: 0.6, y: 5.15, w: 12, h: 0.9,
    fontSize: 18, color: GOLD, fontFace: 'Arial', bold: true,
  });
  addFooter(s);
}

// ——— 3. Solution ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'The Solution', { fontSize: 28 });
  s.addText('AgentFlow turns natural language into verified onchain actions.', {
    x: 0.6, y: 1.05, w: 12, h: 0.35,
    fontSize: 17, color: WHITE, fontFace: 'Arial',
  });
  const examples = [
    'Pay alice.arc 5 USDC',
    'Request 10 USDC from alice.arc',
    'Create a payment link for snehal.arc for a 25 USDC consultation',
    'Bridge 1 USDC from Base Sepolia to Arc',
    'Swap 10 USDC to EURC',
    'Research the next Fed meeting and explain how it affects my portfolio',
  ];
  examples.forEach((ex, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.6, y: 1.5 + i * 0.52, w: 12.1, h: 0.46,
      fill: { color: CARD }, rectRadius: 0.08,
      line: { color: LINE, width: 1 },
    });
    s.addText(ex, {
      x: 0.85, y: 1.55 + i * 0.52, w: 11.6, h: 0.38,
      fontSize: 14, color: WHITE, fontFace: 'Consolas', valign: 'middle',
    });
  });
  s.addText('Chat  →  Preview  →  Confirm  →  Execute', {
    x: 0.6, y: 4.85, w: 12, h: 0.4,
    fontSize: 20, color: GOLD, fontFace: 'Arial', bold: true,
  });
  s.addText('Money-moving actions preview first — nothing settles until you confirm with YES.', {
    x: 0.6, y: 5.35, w: 12, h: 0.4,
    fontSize: 15, color: MUTED, fontFace: 'Arial',
  });
  addFooter(s);
}

// ——— 4. Capabilities ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Capabilities', { fontSize: 28 });

  const cols = [
    {
      title: 'AgentPay',
      items: [
        'Send & request USDC',
        '.arc · contacts · addresses',
        'Payment links & QR',
        'Invoices · Approvals',
        'Split · Schedule · Batch',
        'Chat + CSV for Batch, Split, Schedule, Invoice',
        'Telegram payments',
      ],
    },
    {
      title: 'Research',
      items: [
        'Any-topic reports + citations',
        'Research → Analyst → Writer',
        'Portfolio-impact analysis',
        'Prediction-market research',
        'Self-hosted evidence index',
      ],
    },
    {
      title: 'DeFi',
      items: [
        'Swap · Vault · Bridge',
        'Prediction markets (trade)',
        'Portfolio — balances, positions, PnL',
        'Vision + Voice input',
        'Chat-first for every agent',
      ],
    },
  ];

  cols.forEach((col, i) => {
    const x = 0.5 + i * 4.2;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.1, w: 4.0, h: 4.55,
      fill: { color: CARD }, rectRadius: 0.1,
      line: { color: LINE, width: 1 },
    });
    s.addText(col.title, {
      x: x + 0.25, y: 1.25, w: 3.5, h: 0.4,
      fontSize: 18, color: GOLD, fontFace: 'Arial', bold: true,
    });
    s.addText(col.items.map((t) => `•  ${t}`).join('\n'), {
      x: x + 0.25, y: 1.8, w: 3.5, h: 3.55,
      fontSize: 13, color: WHITE, fontFace: 'Arial', valign: 'top',
    });
  });
  s.addText('12 core agents in the Agent Store · Chat for all · CSV where lists/forms help (Batch, Split, Schedule, Invoice)', {
    x: 0.6, y: 5.9, w: 12, h: 0.55,
    fontSize: 13, color: GOLD, fontFace: 'Arial', bold: true,
  });
  addFooter(s);
}

// ——— 5. Product Demo ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Product demo — Intent → YES → Receipt', { fontSize: 24, w: 10.5 });
  s.addText('One real money flow. Same pattern for swap, bridge, batch, and more.', {
    x: 0.6, y: 0.95, w: 12, h: 0.3,
    fontSize: 14, color: MUTED, fontFace: 'Arial',
  });

  const steps = [
    {
      t: '1. Ask',
      d: 'You\n“Pay alice.arc 5 USDC for dinner”',
    },
    {
      t: '2. Preview',
      d: 'AgentFlow\nTo: alice.arc\nAmount: 5 USDC\nNetwork: Arc\nSay YES to confirm',
    },
    {
      t: '3. Settled',
      d: 'Onchain receipt\n✓ Transfer confirmed\nTx on Arc Testnet\nx402 agent nanopayment',
    },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 4.2;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.45, w: 4.0, h: 4.4,
      fill: { color: CARD }, rectRadius: 0.12,
      line: { color: i === 2 ? GOLD : LINE, width: i === 2 ? 2 : 1 },
    });
    s.addText(st.t, {
      x: x + 0.25, y: 1.7, w: 3.5, h: 0.45,
      fontSize: 18, color: GOLD, fontFace: 'Arial', bold: true,
    });
    s.addText(st.d, {
      x: x + 0.25, y: 2.4, w: 3.5, h: 3.0,
      fontSize: 16, color: WHITE, fontFace: 'Arial', valign: 'top',
    });
    if (i < 2) {
      s.addText('→', {
        x: x + 3.75, y: 3.3, w: 0.5, h: 0.5,
        fontSize: 22, color: GOLD, fontFace: 'Arial', align: 'center',
      });
    }
  });
  addFooter(s);
}

// ——— 6. Live Today + core agents definition ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Live today', { fontSize: 28 });
  s.addText('Not a mock — Arc Testnet with real USDC settlement.', {
    x: 0.6, y: 0.95, w: 12, h: 0.3,
    fontSize: 15, color: WHITE, fontFace: 'Arial',
  });

  const liveStats = [
    { n: '9,303+', l: 'Onchain transactions' },
    { n: '12', l: 'Core agents' },
    { n: '8,440+', l: 'A2A nanopayments' },
  ];
  liveStats.forEach((stat, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.4, w: 3.95, h: 1.85,
      fill: { color: CARD }, rectRadius: 0.12,
      line: { color: GOLD, width: 1.5 },
    });
    s.addText(stat.n, {
      x, y: 1.65, w: 3.95, h: 0.7,
      fontSize: 32, color: WHITE, fontFace: 'Arial', bold: true, align: 'center',
    });
    s.addText(stat.l, {
      x: x + 0.15, y: 2.45, w: 3.65, h: 0.45,
      fontSize: 14, color: MUTED, fontFace: 'Arial', align: 'center',
    });
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.55, y: 3.5, w: 12.2, h: 3.15,
    fill: { color: CARD }, rectRadius: 0.12,
    line: { color: LINE, width: 1 },
  });
  s.addText('What “12 core agents” means', {
    x: 0.85, y: 3.7, w: 11.6, h: 0.35,
    fontSize: 16, color: GOLD, fontFace: 'Arial', bold: true,
  });
  s.addText('The 12 Agent Store system agents: Research, Swap, Vault, Prediction Markets, Bridge, Portfolio, Invoice, Vision, Voice Input, Schedule, Split, Batch.', {
    x: 0.85, y: 4.15, w: 11.6, h: 0.55,
    fontSize: 14, color: WHITE, fontFace: 'Arial',
  });
  s.addText('Analyst + Writer are stages inside the Research pipeline (extra x402 hops) — not separate store listings.\nAgentPay send/request/links/QR are product surfaces powered by those agents + chat — not a 13th store agent.', {
    x: 0.85, y: 4.8, w: 11.6, h: 0.85,
    fontSize: 13, color: MUTED, fontFace: 'Arial',
  });
  s.addText('Stack: Arc · Circle USDC · x402 · DCW/Gateway · .arc · ERC-8004', {
    x: 0.85, y: 5.85, w: 11.6, h: 0.4,
    fontSize: 14, color: GOLD, fontFace: 'Arial', bold: true,
  });
  addFooter(s);
}

// ——— 7. Competitive ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Why not just a wallet or ChatGPT?', { fontSize: 24, w: 10.5 });

  const headers = ['', 'Wallets', 'General AI', 'Single-purpose\ncrypto agents', 'AgentFlow'];
  const colX = [0.45, 2.3, 4.55, 7.0, 10.0];
  const colW = [1.75, 2.1, 2.3, 2.85, 2.85];

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.45, y: 1.15, w: 12.4, h: 0.75,
    fill: { color: '161616' },
  });
  headers.forEach((h, i) => {
    s.addText(h, {
      x: colX[i], y: 1.2, w: colW[i], h: 0.65,
      fontSize: 12, color: i === 4 ? GOLD : MUTED, fontFace: 'Arial', bold: true, align: i === 0 ? 'left' : 'center', valign: 'middle',
    });
  });

  const rows = [
    ['Natural language', '—', 'Yes', 'Partial', 'Yes'],
    ['Onchain execution', 'Yes', '—', 'Narrow', 'Yes'],
    ['Preview → YES', 'Manual', '—', 'Varies', 'Yes'],
    ['Payments + DeFi + Research', 'Apps', 'Talk only', 'One job', 'One chat'],
    ['x402 A2A nanopayments', '—', '—', 'Rare', 'Native'],
    ['Chat + CSV workflows', '—', '—', 'Rare', 'Yes*'],
  ];
  rows.forEach((row, ri) => {
    const y = 2.0 + ri * 0.7;
    if (ri % 2 === 0) {
      s.addShape(pptx.shapes.RECTANGLE, {
        x: 0.45, y, w: 12.4, h: 0.7,
        fill: { color: CARD },
      });
    }
    row.forEach((cell, ci) => {
      s.addText(cell, {
        x: colX[ci], y: y + 0.15, w: colW[ci], h: 0.4,
        fontSize: 13,
        color: ci === 4 ? GOLD : WHITE,
        fontFace: 'Arial',
        bold: ci === 0 || ci === 4,
        align: ci === 0 ? 'left' : 'center',
      });
    });
  });
  s.addText('* Batch, Split, Schedule, Invoice — chat and CSV. All other core agents are chat-first.', {
    x: 0.6, y: 6.4, w: 12, h: 0.3,
    fontSize: 12, color: MUTED, fontFace: 'Arial',
  });
  addFooter(s);
}

// ——— 8. How it works (Architecture + Semantic + Hermes) ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'How it works', { fontSize: 28 });

  const stages = [
    { t: 'Surfaces', d: 'Web · Telegram\nVision · Voice' },
    { t: 'Intelligence', d: 'Classify → Route\nValidate · Memory' },
    { t: 'Agents', d: '12 core agents\n+ Research stages' },
    { t: 'Confirm', d: 'Preview\nUser YES' },
    { t: 'Settle', d: 'x402 · DCW\nArc USDC' },
  ];
  stages.forEach((st, i) => {
    const x = 0.4 + i * 2.55;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.15, w: 2.35, h: 1.85,
      fill: { color: CARD }, rectRadius: 0.1,
      line: { color: i === 1 || i === 4 ? GOLD : LINE, width: i === 1 || i === 4 ? 1.5 : 1 },
    });
    s.addText(st.t, {
      x: x + 0.1, y: 1.3, w: 2.15, h: 0.35,
      fontSize: 13, color: GOLD, fontFace: 'Arial', bold: true, align: 'center',
    });
    s.addText(st.d, {
      x: x + 0.1, y: 1.75, w: 2.15, h: 1.05,
      fontSize: 12, color: WHITE, fontFace: 'Arial', align: 'center',
    });
    if (i < stages.length - 1) {
      s.addText('→', {
        x: x + 2.15, y: 1.85, w: 0.4, h: 0.4,
        fontSize: 18, color: GOLD, fontFace: 'Arial', align: 'center',
      });
    }
  });

  // Hermes + Semantic compressed
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 3.25, w: 6.2, h: 3.35,
    fill: { color: CARD }, rectRadius: 0.12,
    line: { color: GOLD, width: 1.5 },
  });
  s.addText('Hermes Agent vs Hermes LLM', {
    x: 0.65, y: 3.45, w: 5.7, h: 0.35,
    fontSize: 15, color: GOLD, fontFace: 'Arial', bold: true,
  });
  s.addText('Hermes Agent — orchestrates workflows (chat runtime, tools, routing).\n\nHermes LLM — provides reasoning (Hermes-4 model API).\n\nAgent uses the LLM. Research/report often calls the LLM via /run so the chat brain can’t invent citations.', {
    x: 0.65, y: 3.95, w: 5.7, h: 2.4,
    fontSize: 13, color: WHITE, fontFace: 'Arial',
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.85, y: 3.25, w: 6.05, h: 3.35,
    fill: { color: CARD }, rectRadius: 0.12,
    line: { color: LINE, width: 1 },
  });
  s.addText('Semantic stack', {
    x: 7.1, y: 3.45, w: 5.6, h: 0.35,
    fontSize: 15, color: GOLD, fontFace: 'Arial', bold: true,
  });
  s.addText('01  Classification — understand the ask\n02  Intent Router — dispatch to the right agent\n03  Validation — previews & guardrails\n04  Semantic Memory — wallet-scoped contacts & prefs\n\nResearch infra: Meilisearch evidence index (~ms local reuse) → Firecrawl/SearXNG on VPS when needed · fail-open', {
    x: 7.1, y: 3.95, w: 5.6, h: 2.4,
    fontSize: 13, color: WHITE, fontFace: 'Arial',
  });
  addFooter(s);
}

// ——— 9. Agents & x402 ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Agents & x402 nanopayments', { fontSize: 24, w: 10.5 });
  s.addText('Pay per task in USDC. Research pipeline = agents paying agents.', {
    x: 0.6, y: 0.95, w: 12, h: 0.28,
    fontSize: 13, color: MUTED, fontFace: 'Arial',
  });

  const left = [
    ['Research', '$0.005'],
    ['Analyst*', '$0.003'],
    ['Writer*', '$0.008'],
    ['Swap', '$0.010'],
    ['Vault', '$0.012'],
    ['Pred Markets', '$0.012'],
    ['Bridge', '$0.009'],
  ];
  const right = [
    ['Portfolio', '$0.015'],
    ['Invoice', '$0.025'],
    ['Schedule', '$0.005'],
    ['Split', '$0.005'],
    ['Batch', '$0.010'],
    ['Vision', '$0.004'],
    ['Voice', 'Free'],
  ];

  function drawCol(rows, x0) {
    rows.forEach((row, i) => {
      const y = 1.4 + i * 0.55;
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: x0, y, w: 5.9, h: 0.48,
        fill: { color: CARD }, rectRadius: 0.08,
        line: { color: LINE, width: 1 },
      });
      s.addText(row[0], {
        x: x0 + 0.25, y: y + 0.08, w: 3.4, h: 0.32,
        fontSize: 14, color: WHITE, fontFace: 'Arial', bold: true,
      });
      s.addText(row[1], {
        x: x0 + 3.6, y: y + 0.08, w: 2.0, h: 0.32,
        fontSize: 14, color: GOLD, fontFace: 'Arial', bold: true, align: 'right',
      });
    });
  }
  drawCol(left, 0.55);
  drawCol(right, 6.85);

  s.addText('* Analyst & Writer = Research pipeline stages (full report $0.016). Chat + CSV: Batch, Split, Schedule, Invoice.', {
    x: 0.6, y: 5.4, w: 12, h: 0.35,
    fontSize: 12, color: MUTED, fontFace: 'Arial',
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.55, y: 5.85, w: 12.2, h: 0.9,
    fill: { color: CARD }, rectRadius: 0.1,
    line: { color: GOLD, width: 1.5 },
  });
  s.addText('Vision benchmark: ~94% field accuracy · 7/8 sections · OCR, invoices, charts, injection defence strong · grid spatial still improving', {
    x: 0.8, y: 6.05, w: 11.7, h: 0.5,
    fontSize: 13, color: WHITE, fontFace: 'Arial',
  });
  addFooter(s);
}

// ——— 10. Roadmap ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Where AgentFlow goes next', { fontSize: 26, w: 10.5 });

  const roadmap = [
    { phase: 'Now', items: 'Web + Telegram\n12 core agents live\nAgentPay · Research · DeFi\nVision · Voice\nx402 A2A on Arc' },
    { phase: 'Next', items: 'Android + iOS apps\nPush for YES confirms\nQR + camera Vision\nDeeper mobile Voice' },
    { phase: 'Then', items: 'AgentFlow SLM\nTrained on product usage\nFaster routing · lower cost\nStronger product moat' },
  ];
  roadmap.forEach((col, i) => {
    const x = 0.55 + i * 4.2;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.2, w: 4.0, h: 5.0,
      fill: { color: CARD }, rectRadius: 0.12,
      line: { color: i === 0 ? GOLD : LINE, width: i === 0 ? 1.5 : 1 },
    });
    s.addText(col.phase, {
      x: x + 0.25, y: 1.45, w: 3.5, h: 0.45,
      fontSize: 22, color: GOLD, fontFace: 'Arial', bold: true,
    });
    s.addText(col.items, {
      x: x + 0.25, y: 2.15, w: 3.5, h: 3.7,
      fontSize: 16, color: WHITE, fontFace: 'Arial',
    });
  });
  addFooter(s);
}

// ——— 11. Team ———
{
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  addTitle(s, 'Team', { fontSize: 28 });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 2.8, y: 1.5, w: 7.7, h: 4.6,
    fill: { color: CARD }, rectRadius: 0.14,
    line: { color: GOLD, width: 1.5 },
  });
  if (fs.existsSync(logoBadgePng)) {
    s.addImage({ path: logoBadgePng, x: 5.9, y: 1.85, w: 1.5, h: 1.5 });
  }
  s.addText('Snehal', {
    x: 3.1, y: 3.55, w: 7.1, h: 0.55,
    fontSize: 36, color: WHITE, fontFace: 'Arial', bold: true, align: 'center',
  });
  s.addText('Solo founder · AgentFlow', {
    x: 3.1, y: 4.2, w: 7.1, h: 0.4,
    fontSize: 18, color: GOLD, fontFace: 'Arial', bold: true, align: 'center',
  });
  s.addText('Building the full stack — product, agents, and Arc / x402 settlement.\nLive at agentflow.one  ·  X @AgentFlowone', {
    x: 3.3, y: 4.8, w: 6.7, h: 0.85,
    fontSize: 14, color: MUTED, fontFace: 'Arial', align: 'center',
  });
  addFooter(s);
}

// ——— 12. Closing ———
{
  const s = pptx.addSlide();
  addBg(s);
  if (fs.existsSync(logoBadgePng)) {
    s.addImage({ path: logoBadgePng, x: 6.15, y: 0.22, w: 1.0, h: 1.0 });
  }
  s.addText("Today's AI answers questions.\nAgentFlow completes financial work.", {
    x: 0.8, y: 1.2, w: 11.7, h: 0.85,
    fontSize: 24, color: WHITE, fontFace: 'Arial', bold: true, align: 'center',
  });
  s.addText("The future isn't opening more apps.\nIt's expressing your intent — on web, Telegram, and soon mobile.", {
    x: 0.8, y: 2.15, w: 11.7, h: 0.65,
    fontSize: 15, color: MUTED, fontFace: 'Arial', align: 'center',
  });
  s.addText('Intent in. Execution out.', {
    x: 0.8, y: 2.9, w: 11.7, h: 0.4,
    fontSize: 26, color: GOLD, fontFace: 'Arial', bold: true, align: 'center',
  });
  s.addText('Built by Snehal · Solo founder  ·  X @AgentFlowone', {
    x: 0.8, y: 3.4, w: 11.7, h: 0.3,
    fontSize: 13, color: GOLD, fontFace: 'Arial', align: 'center',
  });

  // CTA — ends before access-codes strip
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.55, y: 3.9, w: 6.2, h: 1.55,
    fill: { color: CARD }, rectRadius: 0.12,
    line: { color: GOLD, width: 1.5 },
  });
  if (fs.existsSync(qrPng)) {
    s.addImage({ path: qrPng, x: 3.85, y: 4.05, w: 1.25, h: 1.25 });
  }
  s.addText('Try AgentFlow today', {
    x: 5.35, y: 4.15, w: 4.1, h: 0.35,
    fontSize: 17, color: GOLD, fontFace: 'Arial', bold: true,
  });
  s.addText('Scan → agentflow.one', {
    x: 5.35, y: 4.55, w: 4.1, h: 0.3,
    fontSize: 14, color: WHITE, fontFace: 'Arial',
  });
  s.addText('Live on Arc Testnet', {
    x: 5.35, y: 4.9, w: 4.1, h: 0.28,
    fontSize: 12, color: MUTED, fontFace: 'Arial',
  });

  // Access codes — below CTA with clear gap
  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.7, y: 5.75, w: 11.9, h: 0.95,
    fill: { color: CARD }, rectRadius: 0.1,
    line: { color: GOLD, width: 1.25 },
  });
  s.addText('Access codes  ·  one per person', {
    x: 0.9, y: 5.85, w: 11.5, h: 0.28,
    fontSize: 12, color: GOLD, fontFace: 'Arial', bold: true, align: 'center',
  });
  s.addText('P2K5K7RW   ·   4RUYHW5X   ·   S3SQFXYB   ·   9VDFRSRD   ·   F6EBUWQP', {
    x: 0.9, y: 6.2, w: 11.5, h: 0.35,
    fontSize: 14, color: WHITE, fontFace: 'Arial', bold: true, align: 'center',
  });
  addFooter(s);
}

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log('Wrote', outPath);
  console.log('Slides: 12');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
