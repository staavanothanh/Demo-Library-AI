const { createAtlasVectorSearch, createPolicyService } = require("./policyService");
const { createChatbotService } = require("./chatbotService");
const { createOpenCodeZenProvider } = require("./aiProviders/openCodeZenProvider");

function createChatbotRuntime({
  Book,
  KnowledgeChunk,
  recommendationClient,
  provider,
  logger = console,
} = {}) {
  if (!recommendationClient) throw new Error("A recommendation client is required to create the chatbot runtime.");

  const resolvedProvider = provider || createOpenCodeZenProvider();
  const atlasVectorSearch = createAtlasVectorSearch({ KnowledgeChunk });
  const policyService = createPolicyService({
    KnowledgeChunk,
    embeddingClient: recommendationClient,
    vectorSearch: atlasVectorSearch,
  });
  const chatbotService = createChatbotService({
    policyService,
    recommendationClient,
    provider: resolvedProvider,
    Book,
    logger,
  });

  return {
    chatbotService,
    policyService,
    recommendationClient,
    provider: resolvedProvider,
    atlasVectorSearch,
  };
}

module.exports = { createChatbotRuntime };
