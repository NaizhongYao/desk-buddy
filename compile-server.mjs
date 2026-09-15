import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { classifyKeyHealth, classifyAsr, classifyChat, classifyTts } from './dist/provision.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (/\.(html?|mjs|js|css)$/i.test(req.path) || req.path === '/' ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});
app.use(express.static('dist'));

const ARDUINO_CLI = process.env.ARDUINO_CLI_PATH || join(process.env.LOCALAPPDATA || 'C:\\Users\\yaost\\AppData\\Local', 'Programs', 'Arduino IDE', 'resources', 'app', 'lib', 'backend', 'resources', 'arduino-cli.exe');
const TEMP_DIR = join(__dirname, 'temp');
const CACHE_DIR = join(__dirname, 'cache');

// 确保临时目录存在
await fs.mkdir(TEMP_DIR, { recursive: true });
await fs.mkdir(CACHE_DIR, { recursive: true });

// 编译 Arduino 代码
app.post('/api/compile', async (req, res) => {
  const { code } = req.body;
  
  if (!code || typeof code !== 'string' || code.length > 120000) {
    console.error('[编译] 代码验证失败: 无效或过长');
    return res.status(400).json({ error: '代码无效或过长', message: '代码无效或过长' });
  }

  try {
    // 生成缓存 key
    const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
    const cacheFile = join(CACHE_DIR, `${hash}.json`);
    
    console.log(`[编译] 请求编译，代码哈希: ${hash}`);
    
    // 检查缓存
    try {
      const cached = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
      console.log(`[编译] ✓ 使用缓存: ${hash}`);
      return res.json(cached);
    } catch (e) {
      console.log(`[编译] 缓存未命中，开始新编译: ${hash}`);
    }

    const sketchDir = join(TEMP_DIR, `sketch_${hash}`);
    const sketchFile = join(sketchDir, `sketch_${hash}.ino`);
    const buildDir = join(sketchDir, 'build');

    // 完全清理旧的 sketch 文件夹，避免重复 .ino 文件
    try {
      await fs.rm(sketchDir, { recursive: true, force: true });
      console.log(`[编译] 清理旧文件夹: ${sketchDir}`);
    } catch (e) {
      // 文件夹不存在，忽略
    }

    // 创建 sketch 目录
    await fs.mkdir(sketchDir, { recursive: true });
    console.log(`[编译] 创建文件夹: ${sketchDir}`);
    
    await fs.writeFile(sketchFile, code, 'utf-8');
    console.log(`[编译] 写入代码文件: ${sketchFile} (${code.length} 字节)`);

    console.log(`[编译] 开始调用 arduino-cli: ${hash}`);
    const startTime = Date.now();

    // 调用 arduino-cli 编译
    const args = [
      'compile',
      '--fqbn', 'esp32:esp32:esp32c3',
      '--output-dir', buildDir,
      '--export-binaries',
      sketchDir
    ];

    console.log(`[编译] arduino-cli 参数: ${args.join(' ')}`);

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const proc = spawn(ARDUINO_CLI, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // 实时输出编译进度
        if (chunk.includes('Sketch uses') || chunk.includes('Compiling')) {
          console.log(`[编译] ${chunk.trim()}`);
        }
      });
      
      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // 错误和警告实时输出
        console.log(`[编译警告/错误] ${chunk.trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[编译] ✓ arduino-cli 编译成功 (exit 0)`);
          resolve({ stdout, stderr });
        } else {
          console.error(`[编译] ✗ arduino-cli 编译失败 (exit ${code})`);
          console.error(`[编译错误详情]\n${stderr}`);
          reject(new Error(`编译失败 (exit ${code}): ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        console.error(`[编译] ✗ 进程错误: ${err.message}`);
        reject(err);
      });
    });

    const compileTime = Date.now() - startTime;
    console.log(`[编译] ✓ 编译完成: ${compileTime}ms`);

    // 读取生成的 bin 文件
    const binPrefix = `sketch_${hash}.ino`;
    const platformDir = join(buildDir, 'esp32.esp32.esp32c3');
    console.log(`[编译] 读取生成的固件文件，前缀: ${binPrefix}`);
    
    const binFiles = [
      { path: join(buildDir, `${binPrefix}.bootloader.bin`), name: 'bootloader.bin', offset: 0x0 },
      { path: join(buildDir, `${binPrefix}.partitions.bin`), name: 'partitions.bin', offset: 0x8000 },
      { path: join(platformDir, 'boot_app0.bin'), name: 'boot_app0.bin', offset: 0xe000 },
      { path: join(buildDir, `${binPrefix}.bin`), name: 'sketch.bin', offset: 0x10000 }
    ];

    const bins = [];
    for (const f of binFiles) {
      try {
        const data = await fs.readFile(f.path);
        console.log(`[编译] ✓ 读取 ${f.name}: ${data.length} 字节`);
        bins.push(data);
      } catch (err) {
        console.error(`[编译] ✗ 读取 ${f.name} 失败: ${err.message}`);
        throw new Error(`固件文件缺失: ${f.name}`);
      }
    }

    const result = {
      success: true,
      compileTime,
      hash,
      files: binFiles.map((f, i) => ({
        name: f.name,
        data: bins[i].toString('base64'),
        offset: f.offset,
        size: bins[i].length
      }))
    };

    console.log(`[编译] ✓ 打包完成: ${result.files.length} 个文件, 总大小 ${result.files.reduce((s, f) => s + f.size, 0)} 字节`);

    // 保存到缓存
    await fs.writeFile(cacheFile, JSON.stringify(result), 'utf-8');
    console.log(`[编译] ✓ 缓存已保存: ${cacheFile}`);

    // 清理临时文件（异步，不阻塞响应）
    fs.rm(sketchDir, { recursive: true, force: true })
      .then(() => console.log(`[编译] 清理临时文件: ${sketchDir}`))
      .catch(err => console.error(`[编译警告] 清理临时文件失败: ${err.message}`));

    res.json(result);

  } catch (err) {
    console.error(`[编译] ✗✗✗ 编译失败 ✗✗✗`);
    console.error(`[编译] 错误类型: ${err.name}`);
    console.error(`[编译] 错误信息: ${err.message}`);
    if (err.stack) {
      console.error(`[编译] 错误堆栈:\n${err.stack}`);
    }
    
    res.status(500).json({ 
      error: '编译失败', 
      message: err.message,
      details: err.stderr || err.stdout,
      timestamp: new Date().toISOString()
    });
  }
});

function isLocalTeacher(req) {
  const host = String(req.hostname || '').toLowerCase();
  const ip = String(req.socket?.remoteAddress || '');
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const localPeer = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  return localHost && localPeer;
}

app.post('/api/minimax/health', async (req, res) => {
  if (!isLocalTeacher(req)) {
    return res.status(403).json({ ok: false, code: 'student', message: '学生页不会把钥匙发到网上。请到老师电脑上的教师台检查。' });
  }
  const key = String(req.body?.key || '').trim();
  if (!key || key.length > 256) {
    return res.status(400).json({ ok: false, code: 'auth', message: '这把 MiniMax 钥匙不对。请让大人再填一次。' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const upstream = await fetch('https://api.minimax.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5-highspeed',
        messages: [{ role: 'user', content: 'hi' }],
        max_completion_tokens: 1,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });
    let body = {};
    try { body = await upstream.json(); } catch { body = {}; }
    const result = classifyKeyHealth({ httpStatus: upstream.status, body });
    console.log(`[钥匙] ${result.ok ? '通过' : '未通过'} code=${result.code} http=${upstream.status}`);
    res.json(result);
  } catch (err) {
    const result = classifyKeyHealth({ networkError: true });
    console.log(`[钥匙] 网络失败: ${err.name}`);
    res.status(502).json(result);
  } finally {
    clearTimeout(timer);
  }
});

function decodeWavBase64(audio) {
  const raw = String(audio || '').replace(/\s/g, '');
  if (!raw || raw.length > 1_600_000) return null;
  let buf;
  try { buf = Buffer.from(raw, 'base64'); } catch { return null; }
  if (buf.length < 44 || buf.length > 400_000) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  return buf;
}

async function postMiniMaxAsr(key, wav, signal) {
  const urls = [
    'https://api.minimax.cn/v1/speech_to_text',
    'https://api.minimaxi.com/v1/speech_to_text',
  ];
  let last = { httpStatus: 0, body: {}, host: 'cn' };
  for (const url of urls) {
    const form = new FormData();
    form.append('model', 'asr-1.0');
    form.append('response_format', 'json');
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        language: 'zh',
      },
      body: form,
      signal,
    });
    let body = {};
    try { body = await upstream.json(); } catch { body = {}; }
    last = {
      httpStatus: upstream.status,
      body,
      host: url.includes('minimax.cn') ? 'cn' : 'com',
    };
    if (upstream.status !== 404) return last;
  }
  return last;
}

app.post('/api/minimax/asr', async (req, res) => {
  if (!isLocalTeacher(req)) {
    return res.status(403).json({ ok: false, code: 'student', text: '', message: '学生页不会把声音发到网上。请到老师电脑上的教师台开始听。' });
  }
  const key = String(req.body?.key || '').trim();
  if (!key || key.length > 256) {
    return res.status(400).json({ ok: false, code: 'auth', text: '', message: '这把 MiniMax 钥匙听写时不被接受。请让大人再填一次。' });
  }
  const wav = decodeWavBase64(req.body?.audio);
  if (!wav) {
    return res.status(400).json({ ok: false, code: 'format', text: '', message: '这段声音 MiniMax 听不懂。请再靠近麦克风说一次。' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await postMiniMaxAsr(key, wav, controller.signal);
    const result = classifyAsr(upstream);
    console.log(`[听写] ${result.ok ? '完成' : '失败'} code=${result.code} http=${upstream.httpStatus} host=${upstream.host} bytes=${wav.length}`);
    res.json(result);
  } catch (err) {
    const result = classifyAsr({ networkError: true });
    console.log(`[听写] 网络失败: ${err.name}`);
    res.status(502).json(result);
  } finally {
    clearTimeout(timer);
  }
});

const BUDDY_SYSTEM = '你是 Desk Buddy，插在桌上的小机器人。用中文回答 12 岁小朋友。一到两句，短、暖、具体。不要列清单，不要说自己是 AI。';

app.post('/api/minimax/chat', async (req, res) => {
  if (!isLocalTeacher(req)) {
    return res.status(403).json({ ok: false, code: 'student', reply: '', message: '学生页不会把话发到网上。请到老师电脑上的教师台说话。' });
  }
  const key = String(req.body?.key || '').trim();
  if (!key || key.length > 256) {
    return res.status(400).json({ ok: false, code: 'auth', reply: '', message: '这把 MiniMax 钥匙回答时不被接受。请让大人再填一次。' });
  }
  const heard = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!heard) {
    return res.status(400).json({ ok: false, code: 'empty', reply: '', message: '没听清。请再靠近麦克风说一次。' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch('https://api.minimax.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M3',
        messages: [
          { role: 'system', content: BUDDY_SYSTEM },
          { role: 'user', content: heard },
        ],
        max_completion_tokens: 80,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });
    let body = {};
    try { body = await upstream.json(); } catch { body = {}; }
    const result = classifyChat({ httpStatus: upstream.status, body });
    console.log(`[回答] ${result.ok ? '完成' : '失败'} code=${result.code} http=${upstream.status} chars=${heard.length}`);
    res.json(result);
  } catch (err) {
    const result = classifyChat({ networkError: true });
    console.log(`[回答] 网络失败: ${err.name}`);
    res.status(502).json(result);
  } finally {
    clearTimeout(timer);
  }
});

function hexToBase64(hex) {
  return Buffer.from(hex, 'hex').toString('base64');
}

async function postMiniMaxTts(key, text, signal) {
  const urls = [
    'https://api.minimax.cn/v1/t2a_v2',
    'https://api.minimaxi.com/v1/t2a_v2',
  ];
  const models = ['speech-2.6-turbo', 'speech-02-turbo'];
  let last = { httpStatus: 0, body: {}, host: 'cn' };
  for (const url of urls) {
    for (const model of models) {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          text,
          stream: false,
          voice_setting: {
            voice_id: 'female-shaonv',
            speed: 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
          },
        }),
        signal,
      });
      let body = {};
      try { body = await upstream.json(); } catch { body = {}; }
      last = {
        httpStatus: upstream.status,
        body,
        host: url.includes('minimax.cn') ? 'cn' : 'com',
      };
      if (upstream.status === 404) continue;
      const blob = JSON.stringify(body);
      if (/unknown model|invalid model|model_not|模型不存在|model.*not found/i.test(blob) && model !== models[models.length - 1]) continue;
      return last;
    }
  }
  return last;
}

app.post('/api/minimax/tts', async (req, res) => {
  if (!isLocalTeacher(req)) {
    return res.status(403).json({ ok: false, code: 'student', audio: '', message: '学生页不会把话发到网上出声。请到老师电脑上的教师台说话。' });
  }
  const key = String(req.body?.key || '').trim();
  if (!key || key.length > 256) {
    return res.status(400).json({ ok: false, code: 'auth', audio: '', message: '这把 MiniMax 钥匙出声时不被接受。请让大人再填一次。' });
  }
  const spoken = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!spoken) {
    return res.status(400).json({ ok: false, code: 'empty', audio: '', message: '它想了一下，但没写出字，所以没有声音。' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await postMiniMaxTts(key, spoken, controller.signal);
    const result = classifyTts(upstream);
    const audio = result.ok ? hexToBase64(result.hex) : '';
    console.log(`[出声] ${result.ok ? '完成' : '失败'} code=${result.code} http=${upstream.httpStatus} host=${upstream.host} chars=${spoken.length} audio=${audio.length}`);
    res.json({ ok: result.ok, code: result.code, audio, message: result.message });
  } catch (err) {
    const result = classifyTts({ networkError: true });
    console.log(`[出声] 网络失败: ${err.name}`);
    res.status(502).json({ ok: false, code: result.code, audio: '', message: result.message });
  } finally {
    clearTimeout(timer);
  }
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`✓ Desk Buddy 编译服务已启动`);
  console.log(`✓ 地址: http://localhost:${PORT}`);
  console.log(`✓ arduino-cli: ${ARDUINO_CLI}`);
  console.log(`✓ 临时目录: ${TEMP_DIR}`);
  console.log(`✓ 缓存目录: ${CACHE_DIR}`);
  console.log(`========================================\n`);
});
