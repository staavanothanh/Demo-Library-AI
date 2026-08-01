require("dotenv").config();

const { getOpenCodeZenConfig } = require("../services/aiProviders/openCodeZenProvider");

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let payload;
  try { payload = await response.json(); } catch { payload = undefined; }
  if (!response.ok) throw new Error(`OpenCode Zen returned HTTP ${response.status}.`);
  return payload;
}

async function smokeTest() {
  const config = getOpenCodeZenConfig();
  if (!config.apiKey) throw new Error("OPENCODE_ZEN_API_KEY is required.");
  const models = await requestJson(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  const available = (models.data || []).some((model) => model.id === config.model);
  if (!available) throw new Error(`Configured model ${config.model} was not returned by /models.`);
  const payload = await requestJson(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply with the single word OK." }], stream: false, max_tokens: 8 }),
  });
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Chat completion did not contain choices[0].message.content.");
  console.log(`OpenCode Zen smoke test passed for ${config.model}.`);
}

smokeTest().catch((error) => { console.error(error.message); process.exit(1); });
