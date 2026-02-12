// providers/deepgram.js

const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const WebSocket = require('ws');

// Deepgram SDK client 实例缓存
let deepgramClient = null;

function getDeepgramClient(apiKey) {
  if (!deepgramClient || deepgramClient.apiKey !== apiKey) {
    deepgramClient = createClient(apiKey);
    deepgramClient.apiKey = apiKey; // 存储 API Key 以便比较
  }
  return deepgramClient;
}

/**
 * Deepgram Provider 클래스. API 키 유효성 검사를 담당합니다.
 */
class DeepgramProvider {
    /**
     * Deepgram API 키의 유효성을 검사합니다.
     * @param {string} key - 검사할 Deepgram API 키
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string') {
            return { success: false, error: 'Invalid Deepgram API key format.' };
        }
        try {
            // ✨ 변경점: SDK 대신 직접 fetch로 API를 호출하여 안정성 확보 (openai.js 방식)
            const response = await fetch('https://api.deepgram.com/v1/projects', {
                headers: { 'Authorization': `Token ${key}` }
            });

            if (response.ok) {
                return { success: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.err_msg || `Validation failed with status: ${response.status}`;
                return { success: false, error: message };
            }
        } catch (error) {
            console.error(`[DeepgramProvider] Network error during key validation:`, error);
            return { success: false, error: error.message || 'A network error occurred during validation.' };
        }
    }
}

function createSTT({
    apiKey,
    language = 'zh-CN',
    sampleRate = 24000,
    model = 'nova-3-general',
    callbacks = {},
  }) {
    // 支持中文语言代码映射 - 修复Deepgram语言代码
    const languageMap = {
      'zh': 'zh-CN',
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'en': 'en-US',
      'en-US': 'en-US',
      // 添加更多Deepgram支持的语言代码
      'es': 'es-ES',
      'es-ES': 'es-ES',
      'fr': 'fr-FR',
      'fr-FR': 'fr-FR',
      'de': 'de-DE',
      'de-DE': 'de-DE',
      'ja': 'ja-JP',
      'ja-JP': 'ja-JP',
      'ko': 'ko-KR',
      'ko-KR': 'ko-KR',
    };
    
    // Deepgram要求严格的语言代码格式，确保使用正确的代码
    let effectiveLanguage = languageMap[language] || language;
    
    // 如果映射后仍然不是有效的Deepgram语言代码（包含-），使用默认值
    if (!effectiveLanguage.includes('-')) {
      console.warn(`[Deepgram] 无效的语言代码: ${language}, 使用默认值: zh-CN`);
      effectiveLanguage = 'zh-CN';
    }
    
    console.log(`[Deepgram] 使用语言代码: ${effectiveLanguage}`);
    console.log(`[Deepgram] 使用模型: ${model}`);
    console.log(`[Deepgram] API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : '未提供'}`);
    
    // 使用 Deepgram SDK 创建连接
    try {
      const deepgram = getDeepgramClient(apiKey);
      
      console.log(`[Deepgram] 正在创建连接...`);
      
      // 建立 WebSocket 连接 - 捕获连接过程中的错误
      let connection;
      try {
        connection = deepgram.listen.live({
          model: model,
          language: effectiveLanguage,
          encoding: 'linear16',
          sample_rate: sampleRate,
          smart_format: true,
          interim_results: true,
          channels: 1,
        });
      } catch (connectionError) {
        console.error(`[Deepgram] 创建连接失败:`, connectionError);
        throw new Error(`Deepgram连接失败: ${connectionError.message}`);
      }
      
      // 设置事件监听
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log(`[Deepgram] WebSocket 连接成功!`);
        if (callbacks.onopen) callbacks.onopen();
      });
      
      connection.on(LiveTranscriptionEvents.Close, (event) => {
        console.log(`[Deepgram] WebSocket 关闭:`, event);
        if (callbacks.onclose) callbacks.onclose(event);
      });
      
      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (data.channel?.alternatives?.[0]?.transcript !== undefined) {
          callbacks.onmessage?.({ provider: 'deepgram', ...data });
        }
      });
      
      connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log(`[Deepgram] Metadata:`, data);
      });
      
      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error(`[Deepgram] 错误事件:`, err);
        if (callbacks.onerror) callbacks.onerror(err);
      });
      
      // 捕获连接过程中的错误
      connection.on('error', (err) => {
        console.error(`[Deepgram] 连接错误:`, err);
        if (callbacks.onerror) callbacks.onerror(err);
      });
      
      // 捕获未处理的异常
      connection.on('unhandledRejection', (err) => {
        console.error(`[Deepgram] 未处理的错误:`, err);
      });
      
      console.log(`[Deepgram] 连接对象创建成功，等待连接建立...`);
      
      // 返回连接对象
      return Promise.resolve({
        sendRealtimeInput: (buf) => {
          if (connection && connection.send) {
            try {
              connection.send(buf);
            } catch (sendError) {
              console.error(`[Deepgram] 发送数据失败:`, sendError);
            }
          }
        },
        close: () => {
          if (connection && connection.finish) {
            try {
              connection.finish();
            } catch (closeError) {
              console.error(`[Deepgram] 关闭连接失败:`, closeError);
            }
          } else if (connection) {
            try {
              connection.removeAllListeners();
            } catch (cleanupError) {
              console.error(`[Deepgram] 清理监听器失败:`, cleanupError);
            }
          }
        },
      });
      
    } catch (error) {
      console.error(`[Deepgram] 初始化失败:`, error.message);
      return Promise.reject(error);
    }
  }

// ... (LLM 관련 Placeholder 함수들은 그대로 유지) ...
function createLLM(opts) {
  console.warn("[Deepgram] LLM not supported.");
  return { generateContent: async () => { throw new Error("Deepgram does not support LLM functionality."); } };
}
function createStreamingLLM(opts) {
  console.warn("[Deepgram] Streaming LLM not supported.");
  return { streamChat: async () => { throw new Error("Deepgram does not support Streaming LLM functionality."); } };
}

module.exports = {
    DeepgramProvider,
    createSTT,
    createLLM,
    createStreamingLLM
};