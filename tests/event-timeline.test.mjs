import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { createServer } from "vite";

let vite;

before(async () => {
  vite = await createServer({
    appType: "custom",
    configFile: false,
    server: { middlewareMode: true },
  });
});

after(async () => {
  await vite?.close();
});

function weeklyFixture() {
  return {
    weekStart: "2026-07-20",
    weekEnd: "2026-07-26",
    generatedAt: "2026-07-26T13:00:00.000Z",
    headline: "一周复盘",
    summary: "下周关注政策与经济数据。",
    overview: {
      tone: "mixed",
      interpretation: "事件密集，等待官方数据落地。",
      positive: [],
      negative: [],
    },
    highlights: [],
    outlook: { base: "", upside: "", downside: "" },
    events: [
      {
        id: "fed-fomc-2026-07-29",
        date: "2026-07-29",
        title: "美联储 FOMC 利率决议",
        whyItMatters: "决定美元流动性与风险资产折现率。",
        expectation: "市场预期维持政策利率不变。",
        expectationSource: "https://www.reuters.com/markets/rates-bonds/",
        expectationSourceLabel: "Reuters",
        impactTone: "negative",
        assessment: "结果符合基准预期，但投票结构偏鹰。",
        nextWatch: "后续利率方向取决于通胀和就业。",
        source:
          "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        sourceLabel: "Federal Reserve",
        status: "scheduled",
      },
      {
        id: "bea-gdp-2026-07-29",
        date: "2026-07-29",
        title: "美国 GDP 初值",
        whyItMatters: "检验增长与降息预期。",
        source: "https://www.bea.gov/news/schedule",
        sourceLabel: "BEA",
        status: "scheduled",
      },
      {
        id: "bls-jobs-2026-08-01",
        date: "2026-08-01",
        title: "美国就业报告",
        whyItMatters: "观察劳动力市场是否继续降温。",
        source: "https://www.bls.gov/schedule/",
        sourceLabel: "BLS",
        status: "scheduled",
      },
    ],
    agentModel: "codex",
    translations: {
      en: {
        headline: "Weekly review",
        summary: "Policy and macro data lead the coming week.",
        overview: {
          interpretation: "A dense event calendar awaits official releases.",
          positive: [],
          negative: [],
        },
        highlights: [],
        outlook: { base: "", upside: "", downside: "" },
        events: [
          {
            title: "Federal Reserve FOMC decision",
            whyItMatters: "Sets the discount-rate backdrop for risk assets.",
            expectation: "Markets expected the policy rate to remain unchanged.",
            assessment: "The result matched the base case, but the vote was hawkish.",
            nextWatch: "The next rate move depends on inflation and employment.",
          },
          {
            title: "U.S. advance GDP",
            whyItMatters: "Tests growth and easing expectations.",
          },
          {
            title: "U.S. employment report",
            whyItMatters: "Shows whether labor demand is cooling.",
          },
        ],
      },
    },
  };
}

function outcomeReports() {
  return [
    {
      reportDate: "2026-07-29",
      stories: [
        {
          id: "fomc-outcome",
          regions: ["US"],
          category: "宏观",
          importance: 5,
          title: "FOMC 公布 7 月利率决议",
          summary: "美联储维持政策利率不变，并重申依赖后续数据。",
          evidence: "官方声明已发布。",
          source:
            "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
          sourceLabel: "Federal Reserve",
          publishedAt: "2026-07-29T18:00:00.000Z",
        },
      ],
      translations: {
        en: {
          stories: [
            {
              summary:
                "The Fed held its policy rate and reiterated a data-dependent stance.",
            },
          ],
        },
      },
    },
  ];
}

function dailyFixture() {
  const markets = [
    ["US", "S&P 500", "SPX", "7,500.00", "+0.50%", "up"],
    ["US", "NASDAQ", "IXIC", "25,000.00", "+0.80%", "up"],
    ["US", "DOW", "DJI", "52,000.00", "+0.20%", "up"],
    ["US", "美国 10Y", "DGS10", "4.50%", "-3 bp", "down"],
    ["CN", "上证指数", "SSE", "3,800.00", "+0.30%", "up"],
    ["CN", "沪深 300", "CSI300", "4,600.00", "+0.40%", "up"],
  ].map(([region, name, symbol, value, change, direction]) => ({
    region,
    name,
    symbol,
    value,
    change,
    direction,
    note: "收盘",
    source: `https://example.com/market/${symbol}`,
  }));
  const sectorHeat = [
    ["CN", "932084", "信息技术", "Information Technology"],
    ["CN", "932083", "金融", "Financials"],
    ["CN", "932078", "原材料", "Materials"],
    ["US", "XLK", "信息技术", "Information Technology"],
    ["US", "XLF", "金融", "Financials"],
    ["US", "XLE", "能源", "Energy"],
  ].map(([market, symbol, name, nameEn], index) => ({
    market,
    symbol,
    name,
    nameEn,
    score: 80 - index,
    change: index === 5 ? "-0.50%" : "+0.50%",
    direction: index === 5 ? "down" : "up",
    asOf: "2026-07-26",
    source: `https://example.com/sector/${symbol}`,
  }));
  const story = {
    id: "verified-us-update",
    regions: ["US"],
    category: "公司",
    importance: 5,
    title: "公司上调收入指引",
    summary: "公司上调收入和现金流指引。",
    evidence: "公司公告确认最新指引。",
    source: "https://example.com/company/update",
    sourceLabel: "Company",
    publishedAt: "2026-07-26T12:00:00.000Z",
    ai: {
      tone: "positive",
      interpretation: "更高指引改善收入和现金流预期。",
      sectors: ["信息技术"],
      tickers: ["TEST"],
    },
  };
  const overview = {
    tone: "mixed",
    interpretation: "中美市场上涨，但行业表现仍有分化。",
    positive: ["信息技术"],
    negative: ["能源"],
  };
  return {
    reportDate: "2026-07-26",
    edition: 1,
    generatedAt: "2026-07-26T13:00:00.000Z",
    dataCut: "CN 2026-07-26 · US 2026-07-25",
    headline: "市场上涨但行业分化",
    summary: "主要指数上涨，信息技术强于能源。",
    overview,
    marketViews: {
      CN: { headline: "A股上涨", summary: "主要指数上涨。", overview },
      US: { headline: "美股上涨", summary: "主要指数上涨。", overview },
    },
    markets,
    sectorHeat,
    stories: [story],
    agentModel: "test-fixture",
    isSample: false,
    translations: {
      en: {
        headline: "Markets rose with sector divergence",
        summary: "Major indexes rose as technology outpaced energy.",
        overview: {
          interpretation: "Markets advanced while sectors diverged.",
          positive: ["Technology"],
          negative: ["Energy"],
        },
        marketViews: {
          CN: { headline: "China rose", summary: "Major indexes advanced." },
          US: { headline: "U.S. rose", summary: "Major indexes advanced." },
        },
        stories: [
          {
            title: "Company raises revenue guidance",
            summary: "The company raised revenue and cash-flow guidance.",
            interpretation: "Higher guidance supports revenue expectations.",
            sectors: ["Technology"],
          },
        ],
      },
    },
  };
}

test("market close labels name the actual session even when an old report is viewed later", async () => {
  const { formatMarketAsOfLabel } = await vite.ssrLoadModule(
    "/src/lib/i18n.ts",
  );

  assert.match(
    formatMarketAsOfLabel("2026-07-28", "2026-07-28", "CN", "zh"),
    /A股数据截至2026年7月28日收盘/,
  );
  assert.match(
    formatMarketAsOfLabel("2026-07-27", "2026-07-28", "US", "zh"),
    /美股数据截至2026年7月27日收盘/,
  );
  assert.match(
    formatMarketAsOfLabel("2026-07-24", "2026-07-27", "US", "zh"),
    /美股数据截至2026年7月24日收盘/,
  );
  assert.match(
    formatMarketAsOfLabel("2026-07-27", "2026-07-28", "US", "en"),
    /U\.S\. data through the Jul 27, 2026 close/,
  );
});

test("weekly events turn green only after an official result is verified", async () => {
  const { buildWeeklyEventTimeline } = await vite.ssrLoadModule(
    "/src/server/reports.ts",
  );
  const timeline = buildWeeklyEventTimeline(
    weeklyFixture(),
    "2026-07-30",
    outcomeReports(),
  );

  assert.equal(timeline.weekStart, "2026-07-27");
  assert.equal(timeline.weekEnd, "2026-08-02");
  assert.deepEqual(
    timeline.events.map((event) => event.displayStatus),
    ["realized", "awaiting", "scheduled"],
  );
  assert.equal(
    timeline.events[0].result,
    "美联储维持政策利率不变，并重申依赖后续数据。",
  );
  assert.equal(
    timeline.events[0].resultSource,
    "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
  );
  assert.ok(timeline.events[0].resultVerifiedAt);
  assert.equal(timeline.events[1].result, undefined);

  const beaOutcome = {
    reportDate: "2026-07-30",
    stories: [
      {
        id: "bea-gdp-outcome",
        title: "Gross Domestic Product, 2nd Quarter 2026",
        summary: "美国第二季度实际 GDP 折年率增长 2.4%。",
        evidence: "BEA 已发布预估数据。",
        source:
          "https://www.bea.gov/news/2026/gross-domestic-product-2nd-quarter-2026",
        sourceLabel: "U.S. Bureau of Economic Analysis",
        publishedAt: "2026-07-30T12:30:00.000Z",
      },
    ],
    translations: {
      en: {
        stories: [
          {
            summary:
              "U.S. real GDP increased at a 2.4% annual rate in the second quarter.",
          },
        ],
      },
    },
  };
  const withBeaResult = buildWeeklyEventTimeline(
    weeklyFixture(),
    "2026-07-30",
    [...outcomeReports(), beaOutcome],
  );
  assert.equal(withBeaResult.events[1].displayStatus, "realized");
  assert.match(withBeaResult.events[1].result, /GDP/);

  const sameDay = weeklyFixture();
  sameDay.events[1].date = "2026-07-30";
  assert.equal(
    buildWeeklyEventTimeline(sameDay, "2026-07-30", []).events[1]
      .displayStatus,
    "scheduled",
  );

  const unsafeStoredResult = weeklyFixture();
  unsafeStoredResult.events[0] = {
    ...unsafeStoredResult.events[0],
    status: "realized",
    result: "Unverified result",
    resultSource: "https://example.com/unverified",
    resultVerifiedAt: "2026-07-29T18:00:00.000Z",
  };
  assert.equal(
    buildWeeklyEventTimeline(
      unsafeStoredResult,
      "2026-07-30",
      [],
    ).events[0].displayStatus,
    "awaiting",
  );

  const outcomeWithoutTimestamp = outcomeReports();
  delete outcomeWithoutTimestamp[0].stories[0].publishedAt;
  assert.equal(
    buildWeeklyEventTimeline(
      weeklyFixture(),
      "2026-07-30",
      outcomeWithoutTimestamp,
    ).events[0].displayStatus,
    "awaiting",
  );
});

test("thesis ledger resolves only against timestamped first-party or wire follow-up", async () => {
  const { deriveThesisLedger } = await vite.ssrLoadModule(
    "/src/server/reports.ts",
  );
  const origin = {
    reportDate: "2026-07-20",
    stories: [
      {
        id: "apple-guidance",
        regions: ["US"],
        title: "苹果上调指引",
        signal: {
          thesis: "指引上调改善现金流预期。",
          roleByMarket: { US: "core" },
          exposures: [
            { name: "Apple", ticker: "AAPL", exchange: "NASDAQ" },
          ],
          horizon: "1-5d",
          confidence: "medium",
          checkpoint: {
            metric: "Apple revenue guidance",
            dueAt: "2026-07-22T13:00:00.000Z",
            confirmIf: "后续收入指引维持。",
            invalidateIf: "后续收入指引下修。",
            status: "pending",
          },
        },
      },
    ],
    translations: {
      en: {
        stories: [
          {
            title: "Apple raises guidance",
            signal: { thesis: "Guidance improves the cash-flow outlook." },
          },
        ],
      },
    },
  };
  const verifiedFollowUp = {
    reportDate: "2026-07-23",
    stories: [
      {
        id: "apple-follow-up",
        regions: ["US"],
        title: "苹果更新收入指引",
        summary: "Apple维持最新收入指引。",
        evidence: "Reuters published the company update.",
        source: "https://www.reuters.com/example/apple",
        sourceLabel: "Reuters",
        publishedAt: "2026-07-23T12:00:00.000Z",
        evidenceSource: {
          url: "https://www.reuters.com/example/apple",
          label: "Reuters",
          tier: "wire",
        },
        ai: { tickers: ["AAPL"] },
      },
    ],
  };
  const [resolved] = deriveThesisLedger(
    [origin, verifiedFollowUp],
    "2026-07-24",
    "US",
    "2026-07-20",
  );
  assert.equal(resolved.checkpoint.status, "inconclusive");
  assert.equal(resolved.checkpoint.resultSource.tier, "wire");
  assert.match(resolved.checkpoint.observation, /维持最新收入指引/);

  const unverified = structuredClone(verifiedFollowUp);
  delete unverified.stories[0].evidenceSource;
  const [pending] = deriveThesisLedger(
    [origin, unverified],
    "2026-07-24",
    "US",
    "2026-07-20",
  );
  assert.equal(pending.checkpoint.status, "pending");
});

test("dashboard reads market sources while legacy report APIs retain production read-through", async () => {
  const [workerSource, reportSource, devConfig] = await Promise.all([
    readFile("src/worker.tsx", "utf8"),
    readFile("src/server/reports.ts", "utf8"),
    readFile("wrangler.jsonc", "utf8"),
  ]);
  assert.match(
    workerSource,
    /REMOTE_DATA_ORIGIN/,
  );
  assert.match(
    workerSource,
    /loadDashboard/,
  );
  assert.match(workerSource, /app\.use\("\/api\/\*"/);
  const wranglerConfig = JSON.parse(devConfig);
  assert.equal(
    wranglerConfig.vars.REMOTE_DATA_ORIGIN,
    "https://stock-daily-8k4.pages.dev",
  );
  assert.equal(wranglerConfig.d1_databases, undefined);
  assert.equal(wranglerConfig.env.production.d1_databases[0].binding, "DB");
  assert.doesNotMatch(workerSource, /getDailyReport\(undefined\)|bundled fallback/);
  assert.doesNotMatch(
    reportSource,
    /data\/reports\.json|data\/story-insights\.json|fallbackReportsJson/,
  );
});
