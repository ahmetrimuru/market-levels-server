import express from "express";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.static("public"));

const periodDays = {
  "1mo": 31,
  "3mo": 92,
  "6mo": 183,
  "1y": 365,
  "2y": 730,
  "5y": 1826
};

app.get("/api/quote", async (req, res) => {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const range = String(req.query.range || "2y");

  if (!/^[A-Z0-9.^_-]{1,24}$/.test(symbol)) {
    return res.status(400).json({ error: "Hisse kodu geçersiz. Örnek: AKBNK.IS" });
  }
  if (!periodDays[range]) {
    return res.status(400).json({ error: "Dönem seçimi geçersiz." });
  }

  try {
    const period1 = new Date(Date.now() - periodDays[range] * 24 * 60 * 60 * 1000);
    const result = await yahooFinance.chart(symbol, {
      period1,
      interval: "1d"
    });

    const quotes = (result.quotes || []).filter(
      (q) => Number.isFinite(q.high) && Number.isFinite(q.low)
    );

    if (!quotes.length) {
      return res.status(404).json({ error: "Sembol bulunamadı ya da bu dönem için fiyat verisi yok." });
    }

    const high = Math.max(...quotes.map((q) => q.high));
    const low = Math.min(...quotes.map((q) => q.low));
    const latestQuote = [...quotes].reverse().find((q) => Number.isFinite(q.close));
    const price = Number.isFinite(result.meta?.regularMarketPrice)
      ? result.meta.regularMarketPrice
      : latestQuote?.close;

    if (!Number.isFinite(price)) {
      return res.status(404).json({ error: "Güncel fiyat bilgisi alınamadı." });
    }

    res.set("Cache-Control", "public, max-age=60");
    return res.json({
      symbol,
      currency: result.meta?.currency || "—",
      exchange: result.meta?.exchangeName || "",
      price,
      high,
      low,
      updatedAt: new Date().toISOString(),
      bars: quotes.length
    });
  } catch (error) {
    console.error("Yahoo Finance error:", error?.message || error);
    const notFound = /not found|no data|delisted/i.test(String(error?.message || ""));
    return res.status(notFound ? 404 : 502).json({
      error: notFound
        ? "Sembol bulunamadı. BIST hisseleri için sonuna .IS ekleyin (örn: THYAO.IS)."
        : "Yahoo Finance verisi şu anda alınamadı. Birkaç dakika sonra tekrar deneyin."
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Market Levels çalışıyor: port ${PORT}`));
