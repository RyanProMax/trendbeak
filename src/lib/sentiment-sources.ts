import type { Market } from "../market-types";

export const SENTIMENT_SOURCES = {
  baifenwei: {
    name: "百分位·自编指数",
    url: "https://baifenwei.com/indicator/fear-greed/",
    publisher: "百分位",
    channel: "百分位公开 CSV",
    description: "百分位发布的 A 股自编情绪指数，由波动、换手、融资融券、市场宽度、RSI 和涨跌停等维度汇总。反映整体 A 股情绪，非个股评分；与 CNN 的口径不同。",
  },
  cnn_whit3rabbit: {
    name: "CNN 贪恐指数·社区存档",
    url: "https://github.com/whit3rabbit/fear-greed-data",
    publisher: "CNN",
    channel: "whit3rabbit/fear-greed-data 社区存档，非 CNN 直连",
    description: "CNN 发布的美股市场情绪综合指数，综合动量、市场宽度、波动、期权等七项指标。经社区存档取得，非 CNN 直连；只展示有日期的真实观测，缺日留空，非个股评分。",
  },
  cnn_benzinga: {
    name: "CNN／Benzinga同期报道补录",
    url: "https://www.benzinga.com/markets/market-summary/26/03/51233977/dow-tumbles-more-than-700-points-investor-sentiment-declines-fear-greed-index-in-extreme-f",
    publisher: "CNN",
    channel: "Benzinga 同期报道，非 CNN 直连",
    description: "Benzinga 同期报道中的 CNN 情绪读数。不能确认精确收盘采样时刻或当前回溯版本，不代表官方最终全精度数据。",
  },
  self_v0_2: {
    name: "自有情绪算法",
    url: "https://trendbeak.com",
    publisher: "trendbeak",
    channel: "自有算法 v0.2，实验数据尚未导入",
    description: "自有情绪算法独立保存，与第三方发布分数分开。当前没有已导入观测。",
  },
} as const;

export type SentimentSource = keyof typeof SENTIMENT_SOURCES;
export const DEFAULT_SENTIMENT_SOURCE: Record<Market, SentimentSource> = { CN: "baifenwei", US: "cnn_whit3rabbit" };
export function validSentimentSource(market: Market, source: string): source is SentimentSource {
  return (market === "CN" || market === "US") && (source === DEFAULT_SENTIMENT_SOURCE[market] || source === "self_v0_2" || market === "US" && source === "cnn_benzinga");
}
