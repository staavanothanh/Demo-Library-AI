require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const { getOpenCodeZenConfig } = require("../services/aiProviders/openCodeZenProvider");

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
  const completionResult = await requestJson(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply with the single word OK." }], stream: false, max_tokens: 128 }),
  });
  const { response, payload } = completionResult;

  const text = payload?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    const choice = payload?.choices?.[0];
    const message = choice?.message;

    console.error(JSON.stringify({
      httpStatus: response.status,
      responseOk: response.ok,
      topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      choicesType: Array.isArray(payload?.choices) ? "array" : typeof payload?.choices,
      choicesLength: Array.isArray(payload?.choices) ? payload.choices.length : undefined,
      firstChoiceKeys: choice && typeof choice === "object" ? Object.keys(choice) : [],
      messageKeys: message && typeof message === "object" ? Object.keys(message) : [],
      contentType: typeof message?.content,
      contentLength: typeof message?.content === "string" ? message.content.length : undefined,
      errorCode: payload?.error?.code,
      errorMessage: typeof payload?.error?.message === "string"
        ? payload.error.message.slice(0, 200)
        : undefined,
    }, null, 2));

    throw new Error("Chat completion response shape is unsupported.");
  }

  console.log(`OpenCode Zen smoke test passed for ${config.model}.`);
}

smokeTest()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
