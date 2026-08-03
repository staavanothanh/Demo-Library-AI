require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const {
  createOpenCodeZenProvider,
  getOpenCodeZenConfig,
} = require("../services/aiProviders/openCodeZenProvider");

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let payload;
  try { payload = await response.json(); } catch { payload = undefined; }
  if (!response.ok) throw new Error(`OpenCode Zen returned HTTP ${response.status}.`);
  return { response, payload };
}

async function smokeTest() {
  const config = getOpenCodeZenConfig();
  if (!config.apiKey) throw new Error("OPENCODE_ZEN_API_KEY is required.");
  const modelsResult = await requestJson(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  const models = modelsResult.payload;
  const available = (models?.data || []).some((model) => model.id === config.model);
  if (!available) throw new Error(`Configured model ${config.model} was not returned by /models.`);
  const provider = createOpenCodeZenProvider();
  const completion = await provider.chat(
    [{ role: "user", content: "Reply with the single word OK." }],
    { maxTokens: 128 },
  );
  if (typeof completion?.text !== "string" || !completion.text.trim()) {
    throw new Error("Chat completion response shape is unsupported.");
  }

  console.log(`OpenCode Zen smoke test passed for ${config.model}.`);
}

if (require.main === module) {
  smokeTest()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { smokeTest, requestJson };
