const OpenAI = require('openai');
const WebSocket = require('ws');
const { Portkey } = require('portkey-ai');
const { Readable } = require('stream');
const { getProviderForModel } = require('../factory.js');

// 千问模型配置
const QWEN_CONFIG = {
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-max'
};

class OpenAIProvider {
    static async validateApiKey(key) {
        // 千问API Key格式验证（阿里云DashScope）
        if (!key || typeof key !== 'string') {
            return { success: false, error: 'Invalid API key format.' };
        }
        
        const requestBody = {
          model: QWEN_CONFIG.model,
          messages: [
           { role: "user", content: "你好" }
          ]
        };

        try {
            const response = await fetch(`${QWEN_CONFIG.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
             },
              body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                return { success: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.error?.message || `Validation failed with status: ${response.status}`;
                return { success: false, error: message };
            }
        } catch (error) {
            console.error(`[OpenAIProvider] Network error during key validation:`, error);
            return { success: false, error: 'A network error occurred during validation.' };
        }
    }
}


/**
 * Creates an OpenAI STT session
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.language='zh'] - Language code
 * @param {object} [opts.callbacks] - Event callbacks
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key
 * @returns {Promise<object>} STT session
 */
async function createSTT({ apiKey, language = 'zh', callbacks = {}, usePortkey = false, portkeyVirtualKey, ...config }) {
  // 注意：千问(Qwen)目前不支持实时语音转写WebSocket接口
  // 如果你需要使用TTS功能，建议继续使用本地Whisper模型或其他支持STT的服务
  // 这里暂时返回一个错误，提示用户使用其他STT提供商
  
  throw new Error('Qwen provider does not support STT. Please use Whisper (Local) or other STT providers.');
}

/**
 * Creates an Qwen LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Qwen API key (阿里云DashScope)
 * @param {string} [opts.model='qwen-max'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=2048] - Max tokens
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey (not supported for Qwen)
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key (not supported for Qwen)
 * @returns {object} LLM instance
 */
function createLLM({ apiKey, model = QWEN_CONFIG.model, temperature = 0.7, maxTokens = 2048, usePortkey = false, portkeyVirtualKey, ...config }) {
  const client = new OpenAI({ 
    apiKey,
    baseURL: QWEN_CONFIG.baseURL
  });
  
  const callApi = async (messages) => {
    // Qwen不支持Portkey，始终使用直接调用
    const response = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    });
    return {
      content: response.choices[0].message.content.trim(),
      raw: response
    };
  };

  return {
    generateContent: async (parts) => {
      const messages = [];
      let systemPrompt = '';
      let userContent = [];
      
      for (const part of parts) {
        if (typeof part === 'string') {
          if (systemPrompt === '' && part.includes('You are')) {
            systemPrompt = part;
          } else {
            userContent.push({ type: 'text', text: part });
          }
        } else if (part.inlineData) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
          });
        }
      }
      
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      if (userContent.length > 0) messages.push({ role: 'user', content: userContent });
      
      const result = await callApi(messages);

      return {
        response: {
          text: () => result.content
        },
        raw: result.raw
      };
    },
    
    // For compatibility with chat-style interfaces
    chat: async (messages) => {
      return await callApi(messages);
    }
  };
}

/** 
 * Creates an Qwen streaming LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - Qwen API key
 * @param {string} [opts.model='qwen-max'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=2048] - Max tokens
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey (not supported)
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key (not supported)
 * @returns {object} Streaming LLM instance
 */
function createStreamingLLM({ apiKey, model = QWEN_CONFIG.model, temperature = 0.7, maxTokens = 2048, usePortkey = false, portkeyVirtualKey, ...config }) {
  return {
    streamChat: async (messages) => {
      // Qwen流式调用
      const fetchUrl = `${QWEN_CONFIG.baseURL}/chat/completions`;
      
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      return response;
    }
  };
}

module.exports = {
    OpenAIProvider,
    createSTT,
    createLLM,
    createStreamingLLM
}; 