// factory.js

/**
 * @typedef {object} ModelOption
 * @property {string} id 
 * @property {string} name
 */

/**
 * @typedef {object} Provider
 * @property {string} name
 * @property {() => any} handler
 * @property {ModelOption[]} llmModels
 * @property {ModelOption[]} sttModels
 */

/**
 * @type {Object.<string, Provider>}
 */
const PROVIDERS = {
  'openai': {
      name: 'Qwen (阿里云千问)',
      handler: () => require("./providers/openai"),
      llmModels: [
          { id: 'qwen-max', name: 'qwen-max (最新版本)' },
          { id: 'qwen-max-latest', name: 'qwen-max-latest (始终最新)' },
          { id: 'qwen-plus', name: 'qwen-plus (性能与成本平衡)' },
          { id: 'qwen-turbo', name: 'qwen-turbo (快速响应)' },
          { id: 'qwen-long', name: 'qwen-long (长文本处理)' },
          { id: 'qwen-vl-max', name: 'qwen-vl-max (视觉理解 - 最强)' },
          { id: 'qwen-vl-plus', name: 'qwen-vl-plus (视觉理解 - 平衡)' },
          { id: 'qwen-vl-turbo', name: 'qwen-vl-turbo (视觉理解 - 快速)' },
      ],
      sttModels: [
          // Qwen目前不支持STT，建议用户使用Whisper (Local)
      ],
  },

  'openai-glass': {
      name: 'Qwen (Glass)',
      handler: () => require("./providers/openai"),
      llmModels: [
          { id: 'qwen-max', name: 'qwen-max (glass)' },
          { id: 'qwen-vl-max', name: 'qwen-vl-max (glass - 视觉)' },
      ],
      sttModels: [
          // Qwen目前不支持STT
      ],
  },
  'ollama': {
      name: 'Ollama (Local)',
      handler: () => require("./providers/ollama"),
      llmModels: [
          { id: 'qwen3:4b', name: 'qwen3:4b (Qwen 3 4B)' },
          { id: 'qwen3-vl:4b', name: 'qwen3-vl:4b (Qwen 3 VL 4B - Vision)' },
          { id: 'qwen3-vl:8b', name: 'qwen3-vl:8b (Qwen 3 VL 8B - Vision)' },
          { id: 'qwen2.5vl:32b', name: 'qwen2.5vl:32b (Qwen 2.5 VL 32B - Vision)' },
      ],
      sttModels: [], // Ollama doesn't support STT yet
  },
  'deepgram': {
    name: 'Deepgram',
    handler: () => require("./providers/deepgram"),
    llmModels: [],
    sttModels: [
        { id: 'nova-3-general', name: 'Nova-3 (General)' },
        { id: 'nova-3-general', name: 'Nova-3 General (推荐)' },
        { id: 'nova-2-general', name: 'Nova-2 General' },
        { id: 'nova-2-meeting', name: 'Nova-2 Meeting' },
        { id: 'nova-2-phonecall', name: 'Nova-2 Phone Call' },
        { id: 'nova-2-finance', name: 'Nova-2 Finance' },
        { id: 'nova-2-conversationalai', name: 'Nova-2 Conversational AI' },
        { id: 'nova-2-voicemail', name: 'Nova-2 Voicemail' },
        { id: 'nova-2-video', name: 'Nova-2 Video' },
        { id: 'nova-medical', name: 'Nova Medical' },
        { id: 'enhanced-general', name: 'Enhanced General' },
        { id: 'enhanced-meeting', name: 'Enhanced Meeting' },
        { id: 'enhanced-phonecall', name: 'Enhanced Phone Call' },
        { id: 'enhanced-finance', name: 'Enhanced Finance' },
        { id: 'base-general', name: 'Base General' },
        { id: 'base-meeting', name: 'Base Meeting' },
        { id: 'base-phonecall', name: 'Base Phone Call' },
        { id: 'base-finance', name: 'Base Finance' },
        ],
    },
  'whisper': {
      name: 'Whisper (Local)',
      handler: () => {
          // This needs to remain a function due to its conditional logic for renderer/main process
          if (typeof window === 'undefined') {
              const { WhisperProvider } = require("./providers/whisper");
              return new WhisperProvider();
          }
          // Return a dummy object for the renderer process
          return {
              validateApiKey: async () => ({ success: true }), // Mock validate for renderer
              createSTT: () => { throw new Error('Whisper STT is only available in main process'); },
          };
      },
      llmModels: [],
      sttModels: [
          { id: 'whisper-tiny', name: 'Whisper Tiny (39M)' },
          { id: 'whisper-base', name: 'Whisper Base (74M)' },
          { id: 'whisper-small', name: 'Whisper Small (244M)' },
          { id: 'whisper-medium', name: 'Whisper Medium (769M)' },
      ],
  },
};

function sanitizeModelId(model) {
  return (typeof model === 'string') ? model.replace(/-glass$/, '') : model;
}

function createSTT(provider, opts) {
  if (provider === 'openai-glass') provider = 'openai';
  
  const handler = PROVIDERS[provider]?.handler();
  if (!handler?.createSTT) {
      throw new Error(`STT not supported for provider: ${provider}`);
  }
  if (opts && opts.model) {
    opts = { ...opts, model: sanitizeModelId(opts.model) };
  }
  return handler.createSTT(opts);
}

function createLLM(provider, opts) {
  if (provider === 'openai-glass') provider = 'openai';

  const handler = PROVIDERS[provider]?.handler();
  if (!handler?.createLLM) {
      throw new Error(`LLM not supported for provider: ${provider}`);
  }
  if (opts && opts.model) {
    opts = { ...opts, model: sanitizeModelId(opts.model) };
  }
  return handler.createLLM(opts);
}

function createStreamingLLM(provider, opts) {
  if (provider === 'openai-glass') provider = 'openai';
  
  const handler = PROVIDERS[provider]?.handler();
  if (!handler?.createStreamingLLM) {
      throw new Error(`Streaming LLM not supported for provider: ${provider}`);
  }
  if (opts && opts.model) {
    opts = { ...opts, model: sanitizeModelId(opts.model) };
  }
  return handler.createStreamingLLM(opts);
}

function getProviderClass(providerId) {
    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) return null;
    
    // Handle special cases for glass providers
    let actualProviderId = providerId;
    if (providerId === 'openai-glass') {
        actualProviderId = 'openai';
    }
    
    // The handler function returns the module, from which we get the class.
    const module = providerConfig.handler();
    
    // Map provider IDs to their actual exported class names
    const classNameMap = {
        'openai': 'OpenAIProvider',
        'anthropic': 'AnthropicProvider',
        'gemini': 'GeminiProvider',
        'deepgram': 'DeepgramProvider',
        'ollama': 'OllamaProvider',
        'whisper': 'WhisperProvider'
    };
    
    const className = classNameMap[actualProviderId];
    return className ? module[className] : null;
}

function getAvailableProviders() {
  const stt = [];
  const llm = [];
  for (const [id, provider] of Object.entries(PROVIDERS)) {
      if (provider.sttModels.length > 0) stt.push(id);
      if (provider.llmModels.length > 0) llm.push(id);
  }
  return { stt: [...new Set(stt)], llm: [...new Set(llm)] };
}

module.exports = {
  PROVIDERS,
  createSTT,
  createLLM,
  createStreamingLLM,
  getProviderClass,
  getAvailableProviders,
};