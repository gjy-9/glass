# Listen功能无响应 - 诊断与修复指南

## 问题概述

根据诊断，Whisper模型已正确安装（whisper-tiny 和 whisper-base），但Listen功能没有响应。

## 快速检查清单

### 1. 检查模型配置

打开设置页面，确认STT（语音转文字）模型设置为 **Whisper (Local)**

**配置路径：**
```
设置页面 → 模型配置 → STT模型
```

**应显示:** `whisper-tiny` 或 `whisper-base`

### 2. 检查Whisper模型实际状态

在应用开发者工具中运行以下命令（按 `Ctrl+Shift+I` 打开控制台）：

```javascript
// 检查Whisper模型状态
window.ipcRenderer.invoke('whisper:get-installed-models').then(result => {
  console.log('Whisper模型状态:', result);
});

// 预期输出:
// {
//   "success": true,
//   "models": [
//     {"id": "whisper-tiny", "name": "Tiny", "installed": true},
//     {"id": "whisper-base", "name": "Base", "installed": true}
//   ]
// }
```

### 3. 检查当前STT配置

```javascript
// 检查当前STT模型配置
window.ipcRenderer.invoke('model:get-selected-models').then(result => {
  console.log('当前模型:', result);
});

// 预期输出:
// {
//   "llm": "qwen-max" (或其他LLM模型),
//   "stt": "whisper-tiny" (或 whisper-base)
// }
```

如果 `stt` 为 `null` 或其他模型，需要在设置中配置Whisper。

### 4. 检查LocalAI状态

```javascript
// 检查Whisper服务状态
window.ipcRenderer.invoke('localai:get-status', 'whisper').then(result => {
  console.log('Whisper服务状态:', result);
});

// 预期输出:
// {
//   "success": true,
//   "installed": true,
//   "running": true,
//   "models": [...]
// }
```

### 5. 运行时诊断

点击"Listen"按钮后，在控制台检查错误信息：

```javascript
// 监听错误事件
window.ipcRenderer.on('localai:error-occurred', (event, error) => {
  console.error('LocalAI错误:', error);
});

// 监听状态更新
window.ipcRenderer.on('stt-update', (event, data) => {
  console.log('STT更新:', data);
});
```

## 常见问题与解决方案

### 问题1: 模型显示未下载但实际已下载

**现象**: UI显示Whisper模型未下载，但诊断显示模型文件存在

**原因**: UI显示问题，前端没有正确调用IPC接口同步状态

**解决方案**:
1. 忽略UI显示，尝试直接使用Listen功能
2. 在设置中重新选择Whisper模型
3. 重启应用程序
4. 如果仍然显示未下载，可以手动触发同步：

```javascript
// 手动触发模型状态更新
window.ipcRenderer.invoke('whisper:get-installed-models').then(() => {
  console.log('模型状态已同步');
  // 刷新设置页面
  window.location.reload();
});
```

### 问题2: Listen按钮点击无响应

**检查步骤**:

1. **检查麦克风权限**
   - Windows: 设置 → 隐私 → 麦克风 → 允许应用访问
   - macOS: 系统偏好设置 → 安全性与隐私 → 麦克风

2. **检查音频设备**
   ```javascript
   // 检查可用音频设备
   navigator.mediaDevices.enumerateDevices().then(devices => {
     const audioInputs = devices.filter(d => d.kind === 'audioinput');
     console.log('音频输入设备:', audioInputs);
   });
   ```

3. **检查控制台错误**
   打开开发者工具 → Console，查看点击Listen按钮时是否有错误

4. **验证音频捕获**
   ```javascript
   // 测试麦克风访问
   navigator.mediaDevices.getUserMedia({ audio: true })
     .then(stream => {
       console.log('麦克风访问成功');
       stream.getTracks().forEach(track => track.stop());
     })
     .catch(err => console.error('麦克风访问失败:', err));
   ```

### 问题3: Whisper初始化失败

**错误信息**: `Failed to initialize STT: Whisper not found`

**解决方案**:

1. 确认Whisper二进制文件存在：
   ```
   C:\Users\ASUS\.glass\whisper\bin\whisper-whisper.exe
   ```

2. 如果文件不存在，手动下载：
   ```javascript
   // 重新下载Whisper
   window.ipcRenderer.invoke('localai:install', { service: 'whisper' })
     .then(result => console.log('安装结果:', result));
   ```

3. 验证Whisper可执行：
   ```bash
   # 在命令行测试
   "C:\Users\ASUS\.glass\whisper\bin\whisper-whisper.exe" --help
   ```

### 问题4: 音频发送但无转录输出

**检查步骤**:

1. **检查音频格式**
   ```javascript
   // 验证音频数据格式
   window.ipcRenderer.on('stt-update', (event, data) => {
     console.log('收到STT更新:', data);
   });
   ```

2. **检查Whisper处理**
   Whisper处理音频需要时间，确保音频片段足够长（至少0.5秒）

3. **查看Whisper日志**
   ```javascript
   // 启用详细日志
   window.ipcRenderer.invoke('localai:run-diagnostics', 'whisper')
     .then(result => console.log('诊断结果:', result));
   ```

## 完整调试流程

### 步骤1: 检查基础配置

```javascript
// 运行完整诊断
async function fullDiagnosis() {
  console.log('=== 完整诊断开始 ===\n');
  
  // 1. 检查Whisper模型
  const whisperStatus = await window.ipcRenderer.invoke('localai:get-status', 'whisper');
  console.log('1. Whisper服务状态:', JSON.stringify(whisperStatus, null, 2));
  
  // 2. 检查模型配置
  const modelConfig = await window.ipcRenderer.invoke('model:get-selected-models');
  console.log('\n2. 模型配置:', JSON.stringify(modelConfig, null, 2));
  
  // 3. 运行诊断
  const diagnostics = await window.ipcRenderer.invoke('localai:run-diagnostics', 'whisper');
  console.log('\n3. Whisper诊断:', JSON.stringify(diagnostics, null, 2));
  
  console.log('\n=== 诊断完成 ===');
}

fullDiagnosis().catch(console.error);
```

### 步骤2: 测试音频捕获

```javascript
// 测试音频捕获
async function testAudioCapture() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false
      } 
    });
    
    console.log('✓ 麦克风访问成功');
    
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    
    console.log('✓ AudioContext创建成功');
    console.log('采样率:', audioContext.sampleRate);
    
    // 清理
    stream.getTracks().forEach(track => track.stop());
    await audioContext.close();
    
  } catch (error) {
    console.error('✗ 音频捕获失败:', error);
  }
}

testAudioCapture();
```

### 步骤3: 手动触发Listen流程

```javascript
// 手动测试Listen流程
async function testListenFlow() {
  try {
    console.log('开始测试Listen流程...\n');
    
    // 1. 初始化会话
    console.log('1. 初始化会话...');
    await window.ipcRenderer.invoke('listen:changeSession', 'Listen');
    console.log('   ✓ 会话初始化完成\n');
    
    // 2. 等待3秒
    console.log('2. 等待服务准备...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('   ✓ 准备完成\n');
    
    // 3. 检查会话状态
    const isActive = await window.ipcRenderer.invoke('listen:isSessionActive');
    console.log('3. 会话状态:', isActive ? '活跃' : '非活跃');
    
    if (!isActive) {
      console.log('   ✗ 会话未激活，请检查错误日志');
      return;
    }
    
    console.log('   ✓ 会话已激活\n');
    
    // 4. 监听转录输出
    console.log('4. 监听转录输出 (说话5秒)...');
    
    const stopListener = window.ipcRenderer.on('stt-update', (event, data) => {
      console.log('   ✓ 转录:', data.speaker, '-', data.text);
    });
    
    // 5. 5秒后停止
    await new Promise(resolve => setTimeout(resolve, 5000));
    stopListener();
    
    // 6. 关闭会话
    console.log('\n5. 关闭会话...');
    await window.ipcRenderer.invoke('listen:changeSession', 'Stop');
    console.log('   ✓ 会话已关闭\n');
    
    console.log('=== 测试完成 ===');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
testListenFlow();
```

## 临时解决方案

如果上述方法都无法解决问题，可以尝试以下临时方案：

### 方案1: 重启服务

```javascript
// 重启Whisper服务
async function restartWhisper() {
  console.log('正在重启Whisper服务...');
  
  // 停止服务
  await window.ipcRenderer.invoke('localai:stop-service', 'whisper');
  console.log('✓ 服务已停止');
  
  // 等待2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 启动服务
  await window.ipcRenderer.invoke('localai:start-service', 'whisper');
  console.log('✓ 服务已启动');
  
  console.log('重启完成');
}

restartWhisper().catch(console.error);
```

### 方案2: 修复安装

```javascript
// 修复Whisper安装
async function repairWhisper() {
  console.log('正在修复Whisper...');
  
  const result = await window.ipcRenderer.invoke('localai:repair-service', 'whisper');
  console.log('修复结果:', JSON.stringify(result, null, 2));
}

repairWhisper().catch(console.error);
```

### 方案3: 切换模型

如果Whisper持续有问题，可以临时切换到其他STT提供商：

```javascript
// 切换到Deepgram（需要API密钥）
window.ipcRenderer.invoke('model:set-api-key', {
  provider: 'deepgram',
  key: 'YOUR_DEEPGRAM_API_KEY'
}).then(() => {
  return window.ipcRenderer.invoke('model:set-selected-model', {
    type: 'stt',
    modelId: 'nova-3-general'
  });
}).then(() => {
  console.log('已切换到Deepgram');
});
```

## 收集诊断信息

如果问题仍然存在，请收集以下信息：

### 1. 控制台日志

1. 打开开发者工具 (Ctrl+Shift+I)
2. 切换到 Console 标签
3. 点击 Listen 按钮
4. 复制所有日志信息

### 2. 应用日志

查看应用日志文件：
```
%APPDATA%/pickle-glass/logs/
```

或Windows事件查看器中的应用日志。

### 3. 系统信息

在控制台运行：
```javascript
console.log('操作系统:', process.platform);
console.log('Node版本:', process.version);
console.log('Electron版本:', process.versions.electron);
```

## 总结

根据诊断，你的Whisper模型已经正确安装，问题可能出在：

1. **UI显示问题** - 模型显示未下载但实际可用
2. **权限问题** - 麦克风权限未授予
3. **配置问题** - STT模型未正确配置为Whisper
4. **音频设备问题** - 麦克风无法访问
5. **前端错误** - JavaScript错误阻止功能正常工作

**建议优先检查：**
- 麦克风权限
- 开发者工具中的错误日志
- STT模型配置

如果仍然无法解决，请提供控制台日志以便进一步分析。
