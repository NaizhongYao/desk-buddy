import assert from 'node:assert/strict';
import { Display } from './dist/display.mjs';
import { validatePortal, emptyProvision, loadProvision, saveProvision, clearProvision, isOnline, canListen, asciiLabel, classifyKeyHealth, classifyAsr, asciiHeard, classifyChat, extractChatText, extractTtsHex, classifyTts, oledFailLines } from './dist/provision.mjs';

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
d.paintHotspot('DeskBuddy-A3F2C1');
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
const lit = (x, y) => d.pixels[y * 128 + x] === 1;
d.paintListening();
assert.equal(lit(40, 16), true, '听：眼圈应亮');
assert.equal(lit(43, 28), false, '听：瞳孔应挖空');
assert.equal(lit(64, 51), true, '听：小嘴应亮');
d.paintListenWait();
assert.equal(lit(40, 16), true, '听写中也是听的脸');
d.paintHeard('hello buddy');
assert.ok(d.pixels.some((v) => v === 1), '听见画面应画出文字');
d.paintHeard('你好');
assert.ok(d.pixels.some((v) => v === 1), '中文听写应回退成英文字');
d.paintHeard('');
assert.ok(d.pixels.some((v) => v === 1), '没听清画面应画出文字');
d.paintListenBad();
assert.ok(d.pixels.some((v) => v === 1), '听写失败画面应画出文字');
d.paintThinking();
assert.equal(lit(40, 26), true, '想：眯眼应盖住眼睛中心');
assert.equal(lit(40, 16), false, '想：不应再画大眼圈');
assert.equal(lit(64, 50), false, '想：思考圈中心应空');
assert.equal(lit(64, 45), true, '想：思考圈边应亮');
d.paintReply('hello buddy');
assert.equal(lit(40, 16), true, '说完后回到微笑脸');
d.paintReply('你好');
assert.equal(lit(40, 16), true, '中文回答也回到微笑脸');
d.paintReplyBad();
assert.ok(d.pixels.some((v) => v === 1), '回答失败画面应画出文字');
d.paintSpeaking();
assert.equal(lit(64, 50), false, '说：张嘴中心应空');
assert.equal(lit(64, 41), true, '说：张嘴外圈应亮');
assert.equal(lit(40, 16), true, '说：眼睛应睁开');
d.paintSpeakBad();
assert.ok(d.pixels.some((v) => v === 1), '出声失败画面应画出文字');
d.paintListenBad('quota');
assert.ok(d.pixels.some((v) => v === 1), '额度失败画面应画出文字');
d.paintKeyBad('network');
assert.ok(d.pixels.some((v) => v === 1), '网络失败画面应画出文字');
assert.deepEqual(oledFailLines('listen', 'quota'), ['NO QUOTA', 'ASK ADULT']);
assert.deepEqual(oledFailLines('key', 'auth'), ['KEY BAD', 'RETRY KEY']);
assert.deepEqual(oledFailLines('listen', 'network'), ['NET BAD', 'CHECK WIFI', 'RETRY']);
assert.deepEqual(oledFailLines('speak', 'rate'), ['TOO FAST', 'WAIT']);
assert.deepEqual(oledFailLines('listen', 'empty'), ['DIDNT HEAR', 'TRY AGAIN']);
assert.deepEqual(oledFailLines('reply', 'empty'), ['NO TEXT', 'TRY AGAIN']);

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

console.log('PASS: provision ritual, empty fields, forget network, OLED states, key health, asr classify, chat classify, tts classify, talk faces');
