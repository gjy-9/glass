const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../common/services/modelStateService');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

// ── 截图上下文管理器 (方案4实现) ────────────────────────────────────────────
const screenshotContext = {
    accumulatedScreenshots: [], // 存储历史截图 [{base64, timestamp, scrollPosition, preview}]
    accumulatedText: '', // 从AI回复中提取的文本摘要
    lastScrollPosition: 0,
    maxScreenshots: 5, // 最多保留5张历史截图
};

/**
 * 更新截图上下文
 * @param {Object|null} newScreenshot - 新截图数据 {base64, width, height}
 * @param {string|null} aiResponse - AI回复文本，用于提取关键信息
 */
function updateScreenshotContext(newScreenshot, aiResponse) {
    if (newScreenshot && newScreenshot.base64) {
        // 生成预览缩略图（降低分辨率）
        const preview = newScreenshot.base64.substring(0, 10000); // 使用前10000字符作为预览
        
        screenshotContext.accumulatedScreenshots.push({
            base64: newScreenshot.base64,
            timestamp: Date.now(),
            width: newScreenshot.width,
            height: newScreenshot.height,
            preview: preview,
        });
        
        // 保持历史截图数量在限制内
        if (screenshotContext.accumulatedScreenshots.length > screenshotContext.maxScreenshots) {
            screenshotContext.accumulatedScreenshots.shift(); // 删除最旧的
            console.log('[AskService] 上下文已满，移除最旧的截图');
        }
        
        console.log(`[AskService] 上下文已更新，当前截图数: ${screenshotContext.accumulatedScreenshots.length}`);
        
        // 通知UI更新截图计数
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:contextUpdate', {
                screenshotCount: screenshotContext.accumulatedScreenshots.length,
                hasContext: screenshotContext.accumulatedScreenshots.length > 0,
            });
        }
    }
    
    // 从AI回复中提取关键信息（可选）
    if (aiResponse && aiResponse.length > 100) {
        const summary = aiResponse.substring(0, 300) + '...';
        screenshotContext.accumulatedText += `\n[历史摘要] ${summary}`;
        
        // 限制文本长度
        if (screenshotContext.accumulatedText.length > 2000) {
            screenshotContext.accumulatedText = screenshotContext.accumulatedText.substring(-1000);
        }
    }
}

/**
 * 清除截图上下文
 */
function clearScreenshotContext() {
    screenshotContext.accumulatedScreenshots = [];
    screenshotContext.accumulatedText = '';
    screenshotContext.lastScrollPosition = 0;
    console.log('[AskService] 截图上下文已清除');
}

/**
 * 获取截图上下文数据
 * @returns {Object} 上下文数据
 */
function getScreenshotContext() {
    return {
        accumulatedScreenshots: screenshotContext.accumulatedScreenshots,
        accumulatedText: screenshotContext.accumulatedText,
        lastScrollPosition: screenshotContext.lastScrollPosition,
        maxScreenshots: screenshotContext.maxScreenshots,
    };
}

/**
 * 构建带上下文的消息
 * @param {string} userPrompt - 用户提问
 * @param {Object|null} currentScreenshot - 当前截图
 * @param {string} conversationHistory - 对话历史
 * @param {Object} modelInfo - 模型信息
 * @returns {Array} 消息数组
 */
function buildMessagesWithContext(userPrompt, currentScreenshot, conversationHistory, modelInfo) {
    const messages = [];
    
    // 系统提示词
    const systemPrompt = getSystemPrompt('pickle_glass_analysis', conversationHistory, false);
    messages.push({ role: 'system', content: systemPrompt });
    
    // 添加上下文提示（如果有历史截图）
    if (screenshotContext.accumulatedScreenshots.length > 0) {
        const contextPrompt = `【浏览上下文】用户正在查看长文档或网页，这是第 ${screenshotContext.accumulatedScreenshots.length + 1} 个屏幕。` +
            `历史已查看 ${screenshotContext.accumulatedScreenshots.length} 屏内容。` +
            `请结合上下文理解用户的连续提问，特别是当用户询问"继续"、"接下来"、"下面"等时，应理解为继续浏览内容。`;
        
        messages.push({
            role: 'system',
            content: contextPrompt,
        });
        
        console.log(`[AskService] 添加了上下文提示，历史截图数: ${screenshotContext.accumulatedScreenshots.length}`);
    }
    
    // 添加历史截图（最多2张最近的，以节省token）
    const recentScreenshots = screenshotContext.accumulatedScreenshots.slice(-2);
    recentScreenshots.forEach((screenshot, index) => {
        // 为历史截图添加标记，帮助AI理解
        const historyLabel = `[历史视图 ${screenshotContext.accumulatedScreenshots.length - recentScreenshots.length + index + 1}/${screenshotContext.accumulatedScreenshots.length}]`;
        
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: historyLabel },
                {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshot.base64}` },
                },
            ],
        });
    });
    
    // 添加当前截图和提问
    const currentContent = [
        { type: 'text', text: `用户当前请求: ${userPrompt.trim()}` },
    ];
    
    if (currentScreenshot && currentScreenshot.base64) {
        currentContent.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${currentScreenshot.base64}` },
        });
    }
    
    messages.push({
        role: 'user',
        content: currentContent,
    });
    
    return messages;
}

async function captureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
        };
        // 方案4：保存当前截图结果
        this.currentScreenshotResult = null;
        console.log('[AskService] Service instance created.');
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            console.log('[AskService] Broadcasting state update:', {
                isLoading: this.state.isLoading,
                isStreaming: this.state.isStreaming,
                responseLength: this.state.currentResponse?.length || 0
            });
            askWindow.webContents.send('ask:stateUpdate', this.state);
        } else {
            console.warn('[AskService] Ask window not available for state broadcast');
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        console.log('[AskService] toggleAskButton called, inputScreenOnly:', inputScreenOnly);
        const askWindow = getWindowPool()?.get('ask');
        console.log('[AskService] askWindow available:', !!askWindow, 'visible:', askWindow?.isVisible());

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            console.log('[AskService] Sending screen-only message');
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            // 方案4：清除当前截图结果
            this.currentScreenshotResult = null;
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        console.log('[AskService] sendMessage called, userPrompt:', userPrompt.substring(0, 50));
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
        };
        console.log('[AskService] Initial state set, broadcasting:', this.state);
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        let sessionId;

        try {
            console.log(`[AskService] 🤖 Processing message: ${userPrompt.substring(0, 50)}...`);

            sessionId = await sessionRepository.getOrCreateActive('ask');
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);
            
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            console.log(`[AskService] Using model: ${modelInfo.model} for provider: ${modelInfo.provider}`);

            //const screenshotResult = await captureScreenshot({ quality: 'medium' });
            const screenshotResult = await captureScreenshot();
            console.log('[AskService] Screenshot capture result:', {
                success: screenshotResult.success,
                hasBase64: !!screenshotResult.base64,
                error: screenshotResult.error,
                width: screenshotResult.width,
                height: screenshotResult.height
            });
            // 方案4：保存截图结果供后续使用
            this.currentScreenshotResult = screenshotResult.success ? screenshotResult : null;
            const screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // 使用新的带上下文的消息构建函数
            const messages = buildMessagesWithContext(
                userPrompt,
                screenshotResult.success ? screenshotResult : null,
                conversationHistory,
                modelInfo
            );
            
            console.log('[AskService] 消息构建完成，消息数量:', messages.length);
            
            console.log('[AskService] Creating streaming LLM with config:', {
                provider: modelInfo.provider,
                model: modelInfo.model,
                apiKey: modelInfo.apiKey ? '***' : 'null'
            });
            
            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });

            try {
                console.log('[AskService] Calling streamChat with messages:', JSON.stringify(messages, null, 2));
                const response = await streamingLLM.streamChat(messages);
                console.log('[AskService] streamChat returned response:', response.ok ? 'OK' : 'NOT OK');
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error("[AskService] Ask window is not available to send stream to.");
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => { /* 이미 취소된 경우의 오류는 무시 */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                return { success: true };

            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);
                    
                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error("[AskService] Ask window is not available for fallback response.");
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';
        let chunkCount = 0;

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            
            console.log('[AskService] Starting stream processing');
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[AskService] Stream done');
                    break;
                }

                chunkCount++;
                const chunk = decoder.decode(value);
                console.log(`[AskService] Received chunk ${chunkCount}, length: ${chunk.length}`);
                console.log(`[AskService] Raw chunk: "${chunk.substring(0, 200)}"`);
                
                const lines = chunk.split('\n');
                console.log(`[AskService] Split into ${lines.length} lines`);

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;
                    
                    console.log(`[AskService] Processing line: "${trimmedLine}"`);
                    
                    if (trimmedLine.startsWith('data: ')) {
                        const data = trimmedLine.substring(6);
                        console.log(`[AskService] Data content: "${data}"`);
                        
                        if (data === '[DONE]') {
                            console.log('[AskService] Received [DONE]');
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            console.log('[AskService] Parsed JSON:', JSON.stringify(json, null, 2));
                            const token = json.choices[0]?.delta?.content || '';
                            console.log(`[AskService] Token: "${token}"`);
                            
                            if (token) {
                                fullResponse += token;
                                console.log(`[AskService] Full response so far: "${fullResponse}"`);
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            } else {
                                console.log('[AskService] Empty token, skipping');
                            }
                        } catch (error) {
                            console.error('[AskService] Failed to parse JSON:', error);
                        }
                    } else {
                        console.log('[AskService] Line does not start with "data: ", skipping');
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch(dbError) {
                    console.error("[AskService] DB: Failed to save assistant response after stream ended:", dbError);
                }
            }
            
            // 更新截图上下文（方案4核心）
            try {
                updateScreenshotContext(this.currentScreenshotResult, fullResponse);
            } catch (contextError) {
                console.error('[AskService] 更新上下文时出错:', contextError);
            }
        }
    }

    /**
     * 멀티모달 관련 에러인지 판단
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

}

const askService = new AskService();

// 将clearScreenshotContext附加到askService实例
askService.clearScreenshotContext = clearScreenshotContext;
askService.getScreenshotContext = getScreenshotContext;

module.exports = askService;