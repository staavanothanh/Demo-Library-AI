const readline = require("node:readline/promises");

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 4;
const SIGNAL_NAMES = ["SIGINT", "SIGTERM"];
const ALLOWED_INTENTS = new Set(["policy", "recommendation", "mixed", "conversation", "book-information", "out-of-scope"]);
const ALLOWED_STAGES = new Set(["classify", "policy-retrieve", "provider", "recommend", "canonical-lookup", "database", "runtime"]);
const BOOK_FIELDS = ["_id", "title", "authors", "genre", "averageRating", "price", "stock", "coverUrl"];

const USAGE = [
  "Usage:",
  "  npm run chatbot:cli",
  "  npm run chatbot:ask -- --prompt \"what is your shipping policy?\" --json",
  "Options:",
  "  --prompt <text>  Ask one prompt and exit.",
  "  --json           Emit one machine-readable CHATBOT_RESULT_JSON line.",
  "  --no-history     Do not send or retain conversation history.",
  "  --help           Show this help.",
  "Interactive commands: /help, /status, /clear, /exit",
].join("\n");

const ERROR_MESSAGES = {
  NOT_CONFIGURED: "The chatbot provider is not configured.",
  RATE_LIMITED: "The chatbot provider is temporarily rate limited.",
  AUTH_FAILED: "The chatbot provider authentication failed.",
  TIMEOUT: "The chatbot provider request timed out.",
  UPSTREAM_UNAVAILABLE: "The chatbot provider is temporarily unavailable.",
  UPSTREAM_ERROR: "The chatbot provider returned an error.",
  INVALID_RESPONSE: "The chatbot provider returned an invalid response.",
  CATALOG_EMPTY: "Book recommendations are unavailable because the catalog is empty.",
  CATALOG_INVALID: "Book recommendations are unavailable because the catalog is invalid.",
  MODEL_LOAD_FAILED: "Book recommendations are temporarily unavailable while the AI model loads.",
  EMBEDDING_FAILED: "The chatbot could not process that request right now.",
  EMBEDDING_INVALID: "The chatbot could not process that request right now.",
  RECOMMENDATION_FAILED: "Book recommendations are temporarily unavailable.",
  CANONICAL_LOOKUP_FAILED: "The canonical book lookup could not be completed.",
};

const READ_ONLY_CONNECTION_OPTIONS = Object.freeze({
  autoIndex: false,
  autoCreate: false,
});

function parseArgs(argv = []) {
  const args = { once: false, json: false, noHistory: false, help: false, prompt: undefined, errors: [] };
  const values = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--help" || argument === "-h") {
      args.help = true;
    } else if (argument === "--once") {
      args.once = true;
    } else if (argument === "--json") {
      args.json = true;
    } else if (argument === "--no-history") {
      args.noHistory = true;
    } else if (argument === "--prompt") {
      const value = values[index + 1];
      if (value === undefined || String(value).startsWith("--")) args.errors.push("--prompt requires a value.");
      else args.prompt = values[++index];
    } else {
      args.errors.push("Unknown argument.");
    }
  }
  return args;
}

function validatePrompt(prompt) {
  const message = typeof prompt === "string" ? prompt.trim() : "";
  if (!message) return { error: "Message must contain 1–2000 characters." };
  if (message.length > MAX_MESSAGE_LENGTH) return { error: "Message must contain 1–2000 characters." };
  return { message };
}

function writeLine(output, value = "") {
  if (typeof output?.write === "function") output.write(`${value}\n`);
}

function normalizeBook(book = {}) {
  return {
    _id: String(book?._id ?? ""),
    title: String(book?.title ?? ""),
    authors: String(book?.authors ?? ""),
    genre: String(book?.genre ?? ""),
    averageRating: Number.isFinite(Number(book?.averageRating)) ? Number(book.averageRating) : 0,
    price: Number.isFinite(Number(book?.price)) ? Number(book.price) : 0,
    stock: Number.isFinite(Number(book?.stock)) ? Number(book.stock) : 0,
    coverUrl: String(book?.coverUrl ?? ""),
  };
}

function normalizeResult(result = {}) {
  return {
    answer: typeof result.answer === "string" ? result.answer : String(result.answer ?? ""),
    intent: ALLOWED_INTENTS.has(result.intent) ? result.intent : "unknown",
    sources: Array.isArray(result.sources) ? result.sources.filter((source) => typeof source === "string") : [],
    books: Array.isArray(result.books) ? result.books.map(normalizeBook) : [],
  };
}

function safeCode(code) {
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : "INTERNAL";
}

function safeIntent(intent) {
  return ALLOWED_INTENTS.has(intent) ? intent : "unknown";
}

function safeStage(stage) {
  return ALLOWED_STAGES.has(stage) ? stage : "runtime";
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeError(error, fallback = {}) {
  const code = safeCode(error?.code);
  return {
    ok: false,
    code,
    stage: safeStage(error?.stage || fallback.stage),
    intent: safeIntent(error?.intent || fallback.intent),
    candidateCount: safeCount(error?.candidateCount ?? fallback.candidateCount),
    canonicalCount: safeCount(error?.canonicalCount ?? fallback.canonicalCount),
    message: ERROR_MESSAGES[code] || "The bookstore assistant is temporarily unavailable.",
  };
}

function formatResultJson(payload) {
  return `CHATBOT_RESULT_JSON=${JSON.stringify(payload)}`;
}

function formatInteractiveResult(result) {
  const normalized = normalizeResult(result);
  return [
    `Answer: ${normalized.answer}`,
    `Intent: ${normalized.intent}`,
    `Sources: ${normalized.sources.length ? normalized.sources.join(", ") : "none"}`,
    `Books: ${JSON.stringify(normalized.books)}`,
  ].join("\n");
}

function formatStatus(runtime, recommendationClient) {
  const status = typeof recommendationClient?.getStatus === "function" ? recommendationClient.getStatus() : {};
  const provider = runtime?.provider || {};
  return JSON.stringify({
    recommendation: {
      status: typeof status.status === "string" ? status.status : "unknown",
      catalogCount: safeCount(status.catalogCount),
      catalogVersion: safeCount(status.catalogVersion),
      lastErrorCode: status.lastErrorCode ? safeCode(status.lastErrorCode) : undefined,
    },
    provider: typeof provider.provider === "string" ? provider.provider : "opencode-zen",
    model: typeof provider.config?.model === "string" ? provider.config.model : "unknown",
  });
}

function updateHistory(history, message, result) {
  return [...history, { role: "user", content: message }, { role: "assistant", content: result.answer }]
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-MAX_HISTORY_ITEMS);
}

function createCleanup(resources = {}) {
  let cleanupPromise;
  return () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      const readlineInterface = resources.readlineInterface;
      const recommendationClient = resources.recommendationClient;
      const disconnect = resources.disconnect;
      let firstError;
      try {
        if (typeof readlineInterface?.close === "function") readlineInterface.close();
      } catch (error) {
        firstError ||= error;
      }
      try {
        if (typeof recommendationClient?.stop === "function") await recommendationClient.stop();
      } catch (error) {
        firstError ||= error;
      }
      try {
        if (typeof disconnect === "function") await disconnect();
      } catch (error) {
        firstError ||= error;
      }
      if (firstError) throw firstError;
    })();
    return cleanupPromise;
  };
}

async function connectChatbotDatabase({ mongoose, uri } = {}) {
  if (!uri) throw Object.assign(new Error("MONGODB_URI is required."), { code: "NOT_CONFIGURED", stage: "database" });
  return mongoose.connect(uri, { ...READ_ONLY_CONNECTION_OPTIONS });
}

function registerSignals(signalSource, cleanup, onSignal) {
  let triggered = false;
  let resolveSignal;
  const signalPromise = new Promise((resolve) => { resolveSignal = resolve; });
  const handlers = new Map();
  const handleSignal = (signal) => {
    if (triggered) return;
    triggered = true;
    onSignal?.(signal);
    resolveSignal(signal);
    void cleanup();
  };
  for (const signal of SIGNAL_NAMES) {
    const handler = () => handleSignal(signal);
    handlers.set(signal, handler);
    if (typeof signalSource?.once === "function") signalSource.once(signal, handler);
    else if (typeof signalSource?.on === "function") signalSource.on(signal, handler);
  }
  return {
    signalPromise,
    get triggered() { return triggered; },
    dispose() {
      for (const [signal, handler] of handlers) {
        if (typeof signalSource?.off === "function") signalSource.off(signal, handler);
        else if (typeof signalSource?.removeListener === "function") signalSource.removeListener(signal, handler);
      }
    },
  };
}

function createRealDependencies() {
  require("dotenv").config({ quiet: true });
  const mongoose = require("mongoose");
  const Book = require("../models/Book");
  const KnowledgeChunk = require("../models/KnowledgeChunk");
  const { createRecommendationClient } = require("../services/recommendationClient");
  const { createChatbotRuntime } = require("../services/chatbotRuntime");
  const { configureRuntimeDns } = require("../services/runtimeDns");
  configureRuntimeDns();
  return {
    Book,
    KnowledgeChunk,
    connect: () => connectChatbotDatabase({ mongoose, uri: process.env.MONGODB_URI }),
    disconnect: () => mongoose.disconnect(),
    createRecommendationClient: ({ Book: catalog }) => createRecommendationClient({ Book: catalog }),
    createRuntime: (options) => createChatbotRuntime(options),
  };
}

async function runInteractive({ runtime, recommendationClient, readlineInterface, output, noHistory, signalState }) {
  let history = [];
  writeLine(output, "Direct chatbot CLI. Type /help for commands.");
  while (!signalState.triggered) {
    let rawInput;
    try {
      rawInput = await Promise.race([readlineInterface.question("> "), signalState.signalPromise]);
    } catch (error) {
      if (signalState.triggered) break;
      throw error;
    }
    if (signalState.triggered) break;
    if (rawInput === undefined || rawInput === null) break;
    const command = String(rawInput).trim();
    if (command.toLowerCase() === "/help") {
      writeLine(output, USAGE);
      continue;
    }
    if (command.toLowerCase() === "/status") {
      writeLine(output, `STATUS_JSON=${formatStatus(runtime, recommendationClient)}`);
      continue;
    }
    if (command.toLowerCase() === "/clear") {
      history = [];
      writeLine(output, "History cleared.");
      continue;
    }
    if (command.toLowerCase() === "/exit") break;

    const validation = validatePrompt(rawInput);
    if (validation.error) {
      writeLine(output, `Error: ${validation.error}`);
      continue;
    }
    const requestHistory = noHistory ? [] : history;
    try {
      const result = await runtime.chatbotService.chat({ message: validation.message, history: requestHistory });
      writeLine(output, formatInteractiveResult(result));
      if (!noHistory) history = updateHistory(history, validation.message, normalizeResult(result));
    } catch (error) {
      writeLine(output, `Error: ${normalizeError(error).message}`);
    }
  }
  return 0;
}

async function runCli({ argv = [], input = process.stdin, output = process.stdout, signalSource = process, dependencies } = {}) {
  const args = parseArgs(argv);
  const onceRequested = args.once || args.json || args.prompt !== undefined;
  if (args.help) {
    writeLine(output, USAGE);
    return 0;
  }
  if (args.errors.length) {
    writeLine(output, USAGE);
    if (onceRequested) {
      writeLine(output, formatResultJson({
        ok: false,
        code: "INVALID_ARGUMENT",
        stage: "runtime",
        intent: "unknown",
        candidateCount: 0,
        canonicalCount: 0,
        message: "Invalid CLI arguments.",
      }));
    }
    return 1;
  }
  const once = onceRequested;
  if (once) {
    const validation = validatePrompt(args.prompt);
    if (validation.error) {
      writeLine(output, USAGE);
      writeLine(output, `Error: ${validation.error}`);
      writeLine(output, formatResultJson({
        ok: false,
        code: "INVALID_ARGUMENT",
        stage: "runtime",
        intent: "unknown",
        candidateCount: 0,
        canonicalCount: 0,
        message: validation.error,
      }));
      return 1;
    }
    args.prompt = validation.message;
  }

  const resolvedDependencies = dependencies || createRealDependencies();
  let recommendationClient;
  let runtime;
  let readlineInterface;
  let runtimeError;
  let resultPayload;
  const cleanup = createCleanup({
    get readlineInterface() { return readlineInterface; },
    get recommendationClient() { return recommendationClient; },
    disconnect: resolvedDependencies.disconnect,
  });
  const signalState = registerSignals(signalSource, cleanup);

  try {
    try {
      await resolvedDependencies.connect();
    } catch (error) {
      const connectionError = error instanceof Error ? error : new Error("The database connection failed.");
      if (!connectionError.stage) connectionError.stage = "database";
      throw connectionError;
    }
    recommendationClient = resolvedDependencies.recommendationClient
      || resolvedDependencies.createRecommendationClient({ Book: resolvedDependencies.Book });
    runtime = resolvedDependencies.createRuntime({
      Book: resolvedDependencies.Book,
      KnowledgeChunk: resolvedDependencies.KnowledgeChunk,
      recommendationClient,
      logger: resolvedDependencies.logger,
    });
    if (!runtime?.chatbotService?.chat) throw Object.assign(new Error("Chatbot runtime is unavailable."), { code: "INTERNAL", stage: "runtime" });

    if (once) {
      const history = [];
      const result = await runtime.chatbotService.chat({ message: args.prompt, history });
      resultPayload = { ok: true, ...normalizeResult(result) };
    } else {
      if (typeof resolvedDependencies.createReadline !== "function") {
        resolvedDependencies.createReadline = (options) => readline.createInterface(options);
      }
      readlineInterface = resolvedDependencies.createReadline({ input, output, terminal: Boolean(input?.isTTY && output?.isTTY) });
      return await runInteractive({ runtime, recommendationClient, readlineInterface, output, noHistory: args.noHistory, signalState });
    }
  } catch (error) {
    runtimeError = error;
    resultPayload = normalizeError(error);
  } finally {
    signalState.dispose();
    try {
      await cleanup();
    } catch (error) {
      if (!runtimeError) {
        runtimeError = error;
        resultPayload = normalizeError(error);
      }
    }
  }

  if (once) writeLine(output, formatResultJson(resultPayload || normalizeError(runtimeError)));
  return runtimeError ? 1 : 0;
}

async function main() {
  try {
    const code = await runCli({ argv: process.argv.slice(2) });
    process.exitCode = code;
    return code;
  } catch {
    process.stderr.write("The chatbot CLI could not complete the request.\n");
    process.exitCode = 1;
    return 1;
  }
}

if (require.main === module) void main();

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_ITEMS,
  USAGE,
  parseArgs,
  validatePrompt,
  normalizeResult,
  normalizeError,
  createCleanup,
  READ_ONLY_CONNECTION_OPTIONS,
  connectChatbotDatabase,
  runCli,
  main,
};
