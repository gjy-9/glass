# Listen功能修复 - 具体操作步骤

## 🎯 核心问题
Whisper模型已安装，但Listen功能无响应，最可能的原因是**STT模型未正确配置**或**麦克风权限问题**。

---

## 操作步骤（请按顺序执行）

### 步骤 1: 打开开发者工具（查看错误）

**操作：**
1. 启动PickleGlass应用程序
2. 按 `Ctrl + Shift + I` （Windows）或 `Cmd + Option + I` （Mac）
3. 切换到 **Console**（控制台）标签页
4. 保持此窗口打开，观察错误信息

**预期：**
- 如果没有错误，继续下一步
- 如果有红色错误信息，请截图保存

---

### 步骤 2: 检查当前STT模型配置

**操作：**
在开发者工具的控制台中，粘贴并运行以下代码：

```javascript
// 检查当前STT模型
window.ipcRenderer.invoke('model:get-selected-models').then(result => {
  console.log('=== 当前模型配置 ===');
  console.log('STT模型:', result.stt || '未配置');
  console.log('LLM模型:', result.llm || '未配置');
  
  if (!result.stt) {
    console.log('❌ 问题找到：STT模型未配置！');
    console.log('→ 需要执行步骤3配置Whisper');
  } else if (result.stt.includes('whisper')) {
    console.log('✅ STT模型已配置为Whisper');
    if (result.stt === 'whisper-tiny' || result.stt === 'whisper-base') {
      console.log('→ 模型配置正确，跳到步骤4检查权限');
    }
  } else {
    console.log('⚠️ STT配置为其他提供商:', result.stt);
    console.log('→ 建议切换到Whisper（步骤3）');
  }
}).catch(err => {
  console.error('检查失败:', err);
});
```

**判断结果：**
- 如果显示 `STT模型: whisper-tiny` 或 `whisper-base` → **配置正确**，跳到步骤4
- 如果显示 `STT模型: 未配置` 或 `null` → **执行步骤3**
- 如果显示其他模型（如 `nova-3-general`）→ **执行步骤3切换到Whisper**

---

### 步骤 3: 配置Whisper为STT模型（关键步骤）

**操作：**
在开发者工具控制台中，依次运行以下代码：

#### 3.1 设置Whisper提供商

```javascript
// 配置Whisper提供商（local表示本地服务）
window.ipcRenderer.invoke('model:set-api-key', {
  provider: 'whisper',
  key: 'local'
}).then(result => {
  if (result.success) {
    console.log('✅ Whisper提供商配置成功');
    return configureModel();
  } else {
    console.error('❌ 配置失败:', result.error);
  }
}).catch(err => {
  console.error('调用失败:', err);
});

// 选择Whisper模型（选择tiny或base）
function configureModel() {
  window.ipcRenderer.invoke('model:set-selected-model', {
    type: 'stt',
    modelId: 'whisper-tiny'  // 推荐使用tiny，速度快
  }).then(result => {
    if (result) {
      console.log('✅ Whisper模型配置成功！');
      console.log('→ 请重启应用程序');
      console.log('→ 重启后执行步骤4验证');
    } else {
      console.error('❌ 模型配置失败');
    }
  }).catch(err => {
    console.error('调用失败:', err);
  });
}
```

**预期结果：**
- 控制台显示两个 ✅ 成功信息
- 提示"请重启应用程序"

**操作：**
- 完全关闭PickleGlass应用
- 重新启动应用
- 启动后，回到步骤2重新检查配置

---

### 步骤 4: 检查麦克风权限

**操作：**
在开发者工具控制台中，运行以下代码：

```javascript
// 检查麦克风权限
navigator.permissions.query({ name: 'microphone' }).then(permissionObj => {
  console.log('=== 麦克风权限状态 ===');
  console.log('状态:', permissionObj.state); // granted, denied, prompt
  
  if (permissionObj.state === 'granted') {
    console.log('✅ 麦克风权限已授予');
    testMicrophone();
  } else if (permissionObj.state === 'prompt') {
    console.log('⚠️ 需要请求麦克风权限');
    requestMicrophone();
  } else {
    console.log('❌ 麦克风权限被拒绝');
    console.log('→ 需要到系统设置中手动开启');
    showPermissionGuide();
  }
}).catch(err => {
  console.error('检查权限失败:', err);
});

// 测试麦克风
function testMicrophone() {
  console.log('\n=== 测试麦克风 ===');
  navigator.mediaDevices.getUserMedia({ 
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: false
    }
  }).then(stream => {
    console.log('✅ 麦克风访问成功');
    console.log('音频轨道:', stream.getAudioTracks()[0].getSettings());
    
    // 立即关闭流
    stream.getTracks().forEach(track => track.stop());
    console.log('→ 麦克风测试完成，跳到步骤5');
  }).catch(err => {
    console.error('❌ 麦克风访问失败:', err.message);
    console.log('→ 执行步骤4.1手动授权');
  });
}

// 请求麦克风权限
function requestMicrophone() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    console.log('✅ 权限请求成功');
    stream.getTracks().forEach(track => track.stop());
  }).catch(err => {
    console.error('❌ 权限请求失败:', err);
  });
}

// 显示权限设置指南
function showPermissionGuide() {
  console.log('\n=== 手动授权指南 ===');
  if (process.platform === 'win32') {
    console.log('Windows系统:');
    console.log('1. 打开 设置 → 隐私 → 麦克风');
    console.log('2. 确保"允许应用访问麦克风"已开启');
    console.log('3. 找到PickleGlass，确保权限为"开"');
  } else if (process.platform === 'darwin') {
    console.log('macOS系统:');
    console.log('1. 打开 系统偏好设置 → 安全性与隐私');
    console.log('2. 切换到"隐私"标签 → "麦克风"');
    console.log('3. 勾选PickleGlass');
  }
  console.log('\n修改后，重启应用程序');
}
```

**判断结果：**
- 如果显示 ✅ 麦克风权限已授予 → **跳到步骤5**
- 如果显示 ⚠️ 需要请求权限 → 按照提示操作
- 如果显示 ❌ 权限被拒绝 → 按照系统指南手动开启

**手动操作（Windows）：**
1. 打开 Windows 设置
2. 进入 **隐私** → **麦克风**
3. 确保"允许应用访问你的麦克风"为 **开**
4. 在应用列表中找到 PickleGlass，确保也是 **开**
5. 重启应用程序

---

### 步骤 5: 测试Listen功能

**操作：**
确保Whisper已配置、麦克风权限已授予后，进行实际测试：

#### 5.1 监听STT输出

在开发者工具控制台中，运行以下代码监听转录输出：

```javascript
// 监听STT转录输出
console.log('=== 开始监听转录输出 ===');
console.log('请说话，观察下方是否有输出...\n');

const stopListening = window.ipcRenderer.on('stt-update', (event, data) => {
  const time = new Date().toLocaleTimeString();
  if (data.isFinal) {
    console.log(`✅ [${time}] ${data.speaker}: ${data.text}`);
  } else {
    console.log(`📝 [${time}] ${data.speaker} (部分): ${data.text}`);
  }
});

// 5分钟后自动停止监听
setTimeout(() => {
  stopListening();
  console.log('\n=== 监听结束 ===');
}, 5 * 60 * 1000);

console.log('监听已启动，有效期5分钟');
console.log('现在点击"Listen"按钮并说话\n');
```

#### 5.2 点击Listen按钮

**操作：**
1. 在应用主界面，找到并点击 **"Listen"** 按钮
2. 对着麦克风说话（建议说5-10秒）
3. 观察控制台是否有输出

**预期结果：**
- 控制台显示 `✅ [时间] Me: 你说的话`
- 应用界面上也会显示转录文本

#### 5.3 如果无输出，检查错误

在控制台中运行：

```javascript
// 检查错误信息
window.ipcRenderer.on('localai:error-occurred', (event, error) => {
  console.error('=== LocalAI错误 ===');
  console.error('服务:', error.service);
  console.error('错误类型:', error.errorType);
  console.error('错误信息:', error.error);
  console.error('完整错误:', JSON.stringify(error, null, 2));
});

// 检查状态更新
window.ipcRenderer.on('update-status', (event, status) => {
  console.log('状态更新:', status);
});

console.log('错误监听已启动，请重新点击Listen按钮\n');
```

---

### 步骤 6: 如果仍然不工作，收集诊断信息

如果以上步骤都执行了但Listen仍不工作，请收集以下信息：

#### 6.1 运行完整诊断

在控制台中运行：

```javascript
// 完整诊断脚本
async function collectDiagnostics() {
  console.log('=== 收集诊断信息 ===\n');
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    versions: process.versions,
    models: {},
    permissions: {},
    errors: []
  };
  
  try {
    // 1. Whisper状态
    const whisperStatus = await window.ipcRenderer.invoke('localai:get-status', 'whisper');
    diagnostics.models.whisper = whisperStatus;
    console.log('1. Whisper状态:', JSON.stringify(whisperStatus, null, 2));
  } catch (err) {
    diagnostics.errors.push({ step: 'whisper-status', error: err.message });
    console.error('1. Whisper状态获取失败:', err);
  }
  
  try {
    // 2. 模型配置
    const modelConfig = await window.ipcRenderer.invoke('model:get-selected-models');
    diagnostics.models.selected = modelConfig;
    console.log('\n2. 模型配置:', JSON.stringify(modelConfig, null, 2));
  } catch (err) {
    diagnostics.errors.push({ step: 'model-config', error: err.message });
    console.error('2. 模型配置获取失败:', err);
  }
  
  try {
    // 3. 运行诊断
    const diagnosticsResult = await window.ipcRenderer.invoke('localai:run-diagnostics', 'whisper');
    diagnostics.whisperDiagnostics = diagnosticsResult;
    console.log('\n3. Whisper诊断:', JSON.stringify(diagnosticsResult, null, 2));
  } catch (err) {
    diagnostics.errors.push({ step: 'diagnostics', error: err.message });
    console.error('3. 诊断运行失败:', err);
  }
  
  try {
    // 4. 检查麦克风权限
    const permission = await navigator.permissions.query({ name: 'microphone' });
    diagnostics.permissions.microphone = permission.state;
    console.log('\n4. 麦克风权限:', permission.state);
  } catch (err) {
    diagnostics.errors.push({ step: 'microphone-permission', error: err.message });
    console.error('4. 权限检查失败:', err);
  }
  
  console.log('\n=== 诊断完成 ===');
  console.log('\n请复制以下信息并发送给技术支持:\n');
  console.log(JSON.stringify(diagnostics, null, 2));
  
  return diagnostics;
}

// 运行诊断
collectDiagnostics().catch(console.error);
```

**操作：**
1. 运行上述代码
2. 等待所有诊断完成（约10-20秒）
3. 复制完整的JSON输出
4. 保存为文件，或发送给技术支持

#### 6.2 检查应用日志

**操作：**
1. 打开文件资源管理器
2. 地址栏输入：`%APPDATA%\pickle-glass\logs`
3. 找到最新的日志文件（如 `app.log` 或 `main.log`）
4. 打开并复制包含错误的部分

**如果日志目录不存在：**
- 查看控制台中的错误信息
- 截图保存

---

## 常见场景快速解决

### 场景A: STT模型显示为null/未配置

**症状：** 步骤2检查显示 `STT模型: null` 或 `未配置`

**解决方案：** 执行**步骤3**配置Whisper

### 场景B: 麦克风权限被拒绝

**症状：** 步骤4检查显示 `状态: denied`

**解决方案：**
- Windows: 设置 → 隐私 → 麦克风 → 开启PickleGlass权限
- macOS: 系统偏好设置 → 安全性与隐私 → 麦克风 → 勾选PickleGlass

### 场景C: 说话但无输出

**症状：** 步骤5测试时，说话但控制台无输出

**检查清单：**
1. 确认麦克风工作正常（可用系统录音机测试）
2. 确认Whisper服务运行中：`window.ipcRenderer.invoke('localai:get-status', 'whisper')`
3. 确认音量足够大（Whisper对低音量不敏感）
4. 尝试靠近麦克风说话
5. 尝试使用 `whisper-base` 模型（比tiny更准确）

切换模型：
```javascript
window.ipcRenderer.invoke('model:set-selected-model', {
  type: 'stt',
  modelId: 'whisper-base'  // 从tiny切换到base
});
```

### 场景D: 有错误信息输出

**症状：** 控制台显示红色错误信息

**解决方案：**
1. 截图或复制完整错误信息
2. 执行**步骤6**收集诊断信息
3. 将错误信息和诊断数据一起发送给技术支持

---

## 验证成功标准

当Listen功能正常工作时，你应该看到：

1. ✅ 点击"Listen"按钮后，按钮文本变为"Stop"
2. ✅ 界面显示"Connected. Ready to listen."
3. ✅ 对着麦克风说话时，控制台有 `✅ [时间] Me: 你说的话` 输出
4. ✅ 应用界面上显示转录的文本
5. ✅ 点击"Stop"后，转录内容保存到数据库

---

## 如果所有步骤都失败

请提供以下信息：

1. **操作系统版本**（Windows 10/11？macOS版本？）
2. **应用程序版本**（在设置页面查看）
3. **完整的诊断JSON**（步骤6.1的输出）
4. **控制台错误截图**
5. **日志文件**（如果有）

将这些信息发送给技术支持进行进一步分析。

---

## 最后手段

如果以上所有方法都无效：

### 重新安装Whisper模型

```javascript
// 删除并重新下载Whisper模型
async function reinstallWhisper() {
  console.log('正在重新安装Whisper...\n');
  
  // 1. 删除现有模型
  console.log('1. 删除现有模型文件...');
  const fs = require('fs').promises;
  const path = require('path');
  const whisperDir = path.join(require('os').homedir(), '.glass', 'whisper', 'models');
  
  try {
    await fs.rm(whisperDir, { recursive: true, force: true });
    console.log('   ✓ 模型文件已删除\n');
  } catch (err) {
    console.error('   ✗ 删除失败:', err.message);
  }
  
  // 2. 重新下载
  console.log('2. 重新下载Whisper模型...');
  try {
    await window.ipcRenderer.invoke('localai:install-model', {
      service: 'whisper',
      modelId: 'whisper-tiny'
    });
    console.log('   ✓ 模型下载完成\n');
    
    console.log('3. 重启应用...');
    window.ipcRenderer.invoke('app:restart');
  } catch (err) {
    console.error('   ✗ 下载失败:', err);
  }
}

reinstallWhisper().catch(console.error);
```

### 重置应用配置

**警告：这会清除所有设置！**

```javascript
// 重置应用配置
window.ipcRenderer.invoke('settings:reset').then(() => {
  console.log('配置已重置，请重启应用');
});
```

---

**祝你好运！如果还有问题，请提供详细的诊断信息。**
