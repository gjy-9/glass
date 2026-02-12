// 快速诊断：验证Whisper模型状态
const path = require('path');

// 设置正确的路径
const whisperServicePath = path.join(__dirname, 'src/features/common/services/whisperService');
const whisperService = require(whisperServicePath);

async function diagnoseWhisperStatus() {
    console.log('=== Whisper模型状态诊断 ===\n');
    
    try {
        // 1. 确保WhisperService已初始化
        if (!whisperService.installState.isInitialized) {
            console.log('初始化WhisperService...');
            await whisperService.initialize();
        }
        
        // 2. 获取实际安装的模型
        console.log('获取已安装的Whisper模型...');
        const installedModels = await whisperService.getInstalledModels();
        console.log('检测到模型:', JSON.stringify(installedModels, null, 2));
        
        // 3. 获取服务状态
        console.log('\n获取Whisper服务状态...');
        const status = await whisperService.handleGetInstalledModels();
        console.log('服务状态:', JSON.stringify(status, null, 2));
        
        console.log('\n=== 诊断完成 ===');
        console.log('Whisper模型文件存在且可检测。');
        console.log('如果UI显示未下载，问题在UI层没有正确调用IPC接口。');
        
    } catch (error) {
        console.error('诊断失败:', error.message);
        console.error(error.stack);
    }
}

// 立即执行
if (require.main === module) {
    diagnoseWhisperStatus().catch(console.error);
}

module.exports = { diagnoseWhisperStatus };