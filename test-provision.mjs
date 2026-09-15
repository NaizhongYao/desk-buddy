import assert from 'node:assert/strict';
import { Display } from './dist/display.mjs';
import { validatePortal, emptyProvision, loadProvision, saveProvision, clearProvision, isOnline, canListen, asciiLabel, classifyKeyHealth, classifyAsr, asciiHeard, classifyChat, extractChatText, extractTtsHex, classifyTts } from './dist/provision.mjs';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

assert.equal(validatePortal({}).ok, false);
assert.equal(validatePortal({ ssid: 'Home', password: '123', apiKey: '' }).ok, false);
assert.equal(validatePortal({ ssid: '', password: '123', apiKey: 'sk-test' }).ok, false);
assert.equal(validatePortal({ ssid: 'Home', password: '', apiKey: 'sk-test' }).ok, false);
const empty = validatePortal({ ssid: '  ', password: '', apiKey: '  ' });
assert.equal(empty.ok, false);
assert.equal(empty.errors.length, 3);
assert.ok(empty.errors.some((e) => e.field === 'ssid'));
assert.ok(empty.errors.some((e) => e.field === 'password'));
assert.ok(empty.errors.some((e) => e.field === 'apiKey'));

const ok = validatePortal({ ssid: '  SchoolNet  ', password: 'secret', apiKey: 'sk-minimax' });
assert.equal(ok.ok, true);
assert.equal(ok.ssid, 'SchoolNet');
assert.equal(ok.hasKey, true);
assert.equal(ok.errors.length, 0);

const store = mem();
assert.equal(isOnline(loadProvision(store)), false);
const saved = saveProvision({ hotspotJoined: true, ssid: 'SchoolNet', hasKey: true, key: 'sk-minimax' }, store);
assert.equal(saved.ssid, 'SchoolNet');
assert.equal(isOnline(loadProvision(store)), true);
assert.equal(loadProvision(store).key, 'sk-minimax');
assert.deepEqual(clearProvision(store), emptyProvision());
assert.equal(isOnline(loadProvision(store)), false);

assert.equal(asciiLabel('SchoolNet'), 'SchoolNet');
assert.equal(asciiLabel('家里的网'), 'HOME WIFI');

const d = new Display();
d.paintHotspot('DeskBuddy-A3F2');
assert.ok(d.pixels.some((v) => v === 1), '热点画面应画出文字');
d.paintConnecting();
assert.ok(d.pixels.some((v) => v === 1), '连接中画面应画出文字');
d.paintWifiOk('SchoolNet');
assert.ok(d.pixels.some((v) => v === 1), '配网成功画面应画出文字');
d.paintWifiOk('家里的网');
assert.ok(d.pixels.some((v) => v === 1), '中文 Wi-Fi 名应回退成英文字');
d.paintKeyCheck();
assert.ok(d.pixels.some((v) => v === 1), '检查钥匙画面应画出文字');
d.paintKeyOk();
assert.ok(d.pixels.some((v) => v === 1), '钥匙通过画面应画出文字');
d.paintKeyBad();
assert.ok(d.pixels.some((v) => v === 1), '钥匙失败画面应画出文字');
d.paintListening();
assert.ok(d.pixels.some((v) => v === 1), '正在听画面应画出文字');
d.paintListenWait();
assert.ok(d.pixels.some((v) => v === 1), '听写中画面应画出文字');
d.paintHeard('hello buddy');
assert.ok(d.pixels.some((v) => v === 1), '听见画面应画出文字');
d.paintHeard('你好');
assert.ok(d.pixels.some((v) => v === 1), '中文听写应回退成英文字');
d.paintHeard('');
assert.ok(d.pixels.some((v) => v === 1), '没听清画面应画出文字');
d.paintListenBad();
assert.ok(d.pixels.some((v) => v === 1), '听写失败画面应画出文字');
d.paintThinking();
assert.ok(d.pixels.some((v) => v === 1), '正在想画面应画出文字');
d.paintReply('hello buddy');
assert.ok(d.pixels.some((v) => v === 1), '回答画面应画出文字');
d.paintReply('你好');
assert.ok(d.pixels.some((v) => v === 1), '中文回答应回退成英文字');
d.paintReplyBad();
assert.ok(d.pixels.some((v) => v === 1), '回答失败画面应画出文字');
d.paintSpeaking();
assert.ok(d.pixels.some((v) => v === 1), '正在说画面应画出文字');
d.paintSpeakBad();
assert.ok(d.pixels.some((v) => v === 1), '出声失败画面应画出文字');

assert.equal(classifyKeyHealth({ httpStatus: 200, body: { id: 'chat-1', choices: [{}] } }).ok, true);
assert.equal(classifyKeyHealth({ httpStatus: 200, body: { base_resp: { status_code: 0 } } }).ok, true);
assert.equal(classifyKeyHealth({ httpStatus: 200, body: { base_resp: { status_code: 1004 } } }).code, 'auth');
assert.equal(classifyKeyHealth({ httpStatus: 401, body: {} }).code, 'auth');
assert.equal(classifyKeyHealth({ httpStatus: 200, body: { base_resp: { status_code: 1008 } } }).code, 'quota');
assert.equal(classifyKeyHealth({ httpStatus: 503, body: {} }).code, 'server');
assert.equal(classifyKeyHealth({ networkError: true }).code, 'network');

const withKey = saveProvision({ hotspotJoined: false, ssid: 'SchoolNet', hasKey: true, key: 'sk-minimax', keyStatus: 'ok' }, mem());
assert.equal(withKey.keyStatus, 'ok');
assert.equal(canListen(withKey), true);
assert.equal(canListen({ ssid: 'SchoolNet', hasKey: true, keyStatus: '' }), false);
assert.equal(canListen({ ssid: 'SchoolNet', hasKey: true, keyStatus: 'bad' }), false);

assert.equal(asciiHeard('hello buddy'), 'hello buddy');
assert.equal(asciiHeard('你好世界'), 'CHINESE');
assert.equal(asciiHeard(''), '');

assert.equal(classifyAsr({ httpStatus: 200, body: { text: '  你好  世界  ', duration: 1.2 } }).text, '你好 世界');
assert.equal(classifyAsr({ httpStatus: 200, body: { text: '', duration: 0.4 } }).code, 'empty');
assert.equal(classifyAsr({ httpStatus: 401, body: { type: 'authorized_error' } }).code, 'auth');
assert.equal(classifyAsr({ httpStatus: 200, body: { base_resp: { status_code: 1004 } } }).code, 'auth');
assert.equal(classifyAsr({ httpStatus: 402, body: { type: 'insufficient_balance_error' } }).code, 'quota');
assert.equal(classifyAsr({ httpStatus: 429, body: {} }).code, 'rate');
assert.equal(classifyAsr({ httpStatus: 422, body: { type: 'unprocessable_entity_error' } }).code, 'format');
assert.equal(classifyAsr({ httpStatus: 500, body: {} }).code, 'server');
assert.equal(classifyAsr({ networkError: true }).code, 'network');

assert.equal(extractChatText({ choices: [{ message: { content: '  你好呀  ' } }] }), '你好呀');
assert.equal(extractChatText({ choices: [{ message: { content: '<think>secret</think>嗨' } }] }), '嗨');
assert.equal(classifyChat({ httpStatus: 200, body: { id: 'c1', choices: [{ message: { content: '你好呀' } }] } }).reply, '你好呀');
assert.equal(classifyChat({ httpStatus: 200, body: { choices: [{ message: { content: '' } }] } }).code, 'empty');
assert.equal(classifyChat({ httpStatus: 401, body: {} }).code, 'auth');
assert.equal(classifyChat({ httpStatus: 200, body: { base_resp: { status_code: 1004 } } }).code, 'auth');
assert.equal(classifyChat({ httpStatus: 200, body: { base_resp: { status_code: 1008 } } }).code, 'quota');
assert.equal(classifyChat({ httpStatus: 503, body: {} }).code, 'server');
assert.equal(classifyChat({ networkError: true }).code, 'network');

assert.equal(extractTtsHex({ data: { audio: 'fffb9040' } }), 'fffb9040');
assert.equal(extractTtsHex({ data: { audio: '0xFFFB9040' } }), 'FFFB9040');
assert.equal(extractTtsHex({ data: { audio: 'xyz' } }), '');
assert.equal(extractTtsHex({ data: { audio: 'abc' } }), '');
assert.equal(classifyTts({ httpStatus: 200, body: { data: { audio: 'fffb9040' }, extra_info: {} } }).ok, true);
assert.equal(classifyTts({ httpStatus: 200, body: { data: { audio: '' }, extra_info: {} } }).code, 'empty');
assert.equal(classifyTts({ httpStatus: 401, body: {} }).code, 'auth');
assert.equal(classifyTts({ httpStatus: 200, body: { base_resp: { status_code: 1004 } } }).code, 'auth');
assert.equal(classifyTts({ httpStatus: 200, body: { base_resp: { status_code: 1008 } } }).code, 'quota');
assert.equal(classifyTts({ httpStatus: 503, body: {} }).code, 'server');
assert.equal(classifyTts({ networkError: true }).code, 'network');

console.log('PASS: provision ritual, empty fields, forget network, OLED states, key health, asr classify, chat classify, tts classify');
