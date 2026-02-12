@echo off
echo 正在修复语音功能...
cd /d c:\1111\glass-main-0903
node -e "
const { app } = require('electron');
const path = require('path');

console.log('=== 语音功能自动修复 ===\n');

// 模拟IPC调用
const modelStateService = require('./src/features/common/services/modelStateService');
const whisperService = require('./src/features/common/services/whisperService');

async function fix() {
  try {
    // 1. 检查模型配置
    console.log('1. 检查模型配置...');
    await modelStateService.initialize();
    const modelInfo = await modelStateService.getCurrentModelInfo('stt');

    if (!modelInfo || !modelInfo.model.includes('whisper')) {
      console.log('   STT模型未配置为Whisper，正在配置...');
n
      // 配置Whisper
      await modelStateService.setApiKey('whisper', 'local');
      await modelStateService.setSelectedModel('stt', 'whisper-tiny');
n
      console.log('   ✅ Whisper配置成功');
    } else {
      console.log('   ✅ STT模型已配置:', modelInfo.model);
    }

    // 2. 检查Whisper模型
    console.log('\n2. 检查Whisper模型...');
    const whisperStatus = await whisperService.handleGetInstalledModels();
    const installed = whisperStatus.models.filter(m => m.installed);

    if (installed.length > 0) {
      console.log('   ✅ Whisper模型已安装:', installed.map(m => m.id).join(', '));
    } else {
      console.log('   ❌ 没有Whisper模型，需要下载');
    }

    console.log('\n=== 修复完成 ===');
    console.log('请重启PickleGlass应用并测试语音功能');
n  } catch (err) {
    console.error('修复失败:', err.message);
  }
}

fix().catch(console.error);
"
pause
