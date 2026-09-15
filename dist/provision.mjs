const STORAGE_KEY = 'desk-buddy-provision';

export function emptyProvision() {
  return { hotspotJoined: false, ssid: '', hasKey: false, key: '', keyStatus: '' };
}

export function validatePortal(fields = {}) {
  const ssid = String(fields.ssid ?? '').trim();
  const password = String(fields.password ?? '');
  const apiKey = String(fields.apiKey ?? '').trim();
  const errors = [];
  if (!ssid) errors.push({ field: 'ssid', message: 'Wi-Fi 名字还是空的。请填家里或学校的 Wi-Fi 名字。' });
  if (!password.length) errors.push({ field: 'password', message: 'Wi-Fi 密码还是空的。没有密码也请先问大人。' });
  if (!apiKey) errors.push({ field: 'apiKey', message: 'MiniMax API key 还是空的。请让大人填这一格。' });
  return { ok: !errors.length, errors, ssid, hasKey: !!apiKey };
}

export function isOnline(p) {
  return !!(p && String(p.ssid || '').trim() && p.hasKey);
}

export function canListen(p) {
  return isOnline(p) && p?.keyStatus === 'ok';
}

export function loadProvision(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return emptyProvision();
    const keyStatus = raw.keyStatus === 'ok' || raw.keyStatus === 'bad' ? raw.keyStatus : '';
    return {
      hotspotJoined: !!raw.hotspotJoined,
      ssid: typeof raw.ssid === 'string' ? raw.ssid.slice(0, 64) : '',
      hasKey: !!raw.hasKey,
      key: typeof raw.key === 'string' ? raw.key.slice(0, 256) : '',
      keyStatus,
    };
  } catch {
    return emptyProvision();
  }
}

export function saveProvision(p, storage = globalThis.localStorage) {
  const next = {
    hotspotJoined: !!p?.hotspotJoined,
    ssid: String(p?.ssid || '').slice(0, 64),
    hasKey: !!p?.hasKey,
    key: p?.hasKey ? String(p?.key || '').slice(0, 256) : '',
    keyStatus: p?.keyStatus === 'ok' || p?.keyStatus === 'bad' ? p.keyStatus : '',
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearProvision(storage = globalThis.localStorage) {
  try { storage.removeItem(STORAGE_KEY); } catch {}
  return emptyProvision();
}

export function asciiLabel(ssid) {
  const ascii = String(ssid || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 16);
  return ascii || 'HOME WIFI';
}

export function classifyKeyHealth(res = {}) {
  if (res.networkError) {
    return { ok: false, code: 'network', message: '老师电脑连不上 MiniMax。请检查网络后再试。' };
  }
  const http = Number(res.httpStatus) || 0;
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = Number(body.base_resp?.status_code ?? body.status_code);
  const blob = JSON.stringify(body);
  if (http === 401 || status === 1004) {
    return { ok: false, code: 'auth', message: '这把 MiniMax 钥匙不对。请让大人再填一次。' };
  }
  if (status === 1008 || /balance|quota|insufficient|欠费|余额/i.test(blob)) {
    return { ok: false, code: 'quota', message: '钥匙对了，但账户没额度了。请让大人充值后再试。' };
  }
  if (http >= 500) {
    return { ok: false, code: 'server', message: 'MiniMax 暂时没空。请稍后再检查钥匙。' };
  }
  if (http >= 400) {
    return { ok: false, code: 'bad', message: '钥匙检查没有通过。请让大人核对 MiniMax API key。' };
  }
  if (Number.isFinite(status) && status !== 0) {
    return { ok: false, code: 'bad', message: '钥匙检查没有通过。请让大人核对 MiniMax API key。' };
  }
  if (body.choices || body.id || status === 0) {
    return { ok: true, code: 'ok', message: '钥匙能用。下一步可以点「开始听」。' };
  }
  return { ok: false, code: 'bad', message: '钥匙检查没有通过。请让大人核对 MiniMax API key。' };
}

export function asciiHeard(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const ascii = raw.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 32);
  if (ascii) return ascii;
  if (raw) return 'CHINESE';
  return '';
}

export function classifyAsr(res = {}) {
  if (res.networkError) {
    return { ok: false, code: 'network', text: '', message: '老师电脑连不上 MiniMax 听写。请检查网络后再试。' };
  }
  const http = Number(res.httpStatus) || 0;
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = Number(body.base_resp?.status_code ?? body.status_code);
  const type = String(body.type || body.error?.type || '');
  const blob = JSON.stringify(body);
  if (http === 401 || status === 1004 || type === 'authorized_error') {
    return { ok: false, code: 'auth', text: '', message: '这把 MiniMax 钥匙听写时不被接受。请让大人再填一次。' };
  }
  if (http === 402 || status === 1008 || type === 'insufficient_balance_error' || /balance|quota|insufficient|欠费|余额/i.test(blob)) {
    return { ok: false, code: 'quota', text: '', message: '钥匙对了，但账户没额度了。请让大人充值后再试。' };
  }
  if (http === 429 || status === 1002 || type === 'rate_limit_error') {
    return { ok: false, code: 'rate', text: '', message: '说得太密了。请稍等一会儿再听。' };
  }
  if (http === 413) {
    return { ok: false, code: 'large', text: '', message: '这段话太长了。请说短一点再试。' };
  }
  if (http === 400 && (status === 2013 || /500 seconds|duration|too long|过长/i.test(blob))) {
    return { ok: false, code: 'long', text: '', message: '这段话太长了。请说短一点再试。' };
  }
  if (http === 422 || status === 1026 || type === 'unprocessable_entity_error') {
    return { ok: false, code: 'format', text: '', message: '这段声音 MiniMax 听不懂。请再靠近麦克风说一次。' };
  }
  if (http >= 500 || status === 1000 || type === 'server_error') {
    return { ok: false, code: 'server', text: '', message: 'MiniMax 暂时没空听。请稍后再试。' };
  }
  if (http >= 400) {
    return { ok: false, code: 'bad', text: '', message: '听写没有成功。请再试一次。' };
  }
  if (Number.isFinite(status) && status !== 0) {
    return { ok: false, code: 'bad', text: '', message: '听写没有成功。请再试一次。' };
  }
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (typeof body.text === 'string' || body.duration != null || status === 0) {
    return {
      ok: true,
      code: text ? 'ok' : 'empty',
      text,
      message: text ? '听见了：' + text : '没听清。请再靠近麦克风说一次。',
    };
  }
  return { ok: false, code: 'bad', text: '', message: '听写没有成功。请再试一次。' };
}

export function extractChatText(body = {}) {
  const msg = body?.choices?.[0]?.message || {};
  let raw = msg.content;
  if (Array.isArray(raw)) {
    raw = raw.map((p) => (typeof p === 'string' ? p : p?.text || p?.content || '')).join('');
  }
  const text = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return text;
}

export function classifyChat(res = {}) {
  if (res.networkError) {
    return { ok: false, code: 'network', reply: '', message: '老师电脑连不上 MiniMax 回答。请检查网络后再试。' };
  }
  const http = Number(res.httpStatus) || 0;
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = Number(body.base_resp?.status_code ?? body.status_code);
  const type = String(body.type || body.error?.type || '');
  const blob = JSON.stringify(body);
  if (http === 401 || status === 1004 || type === 'authorized_error') {
    return { ok: false, code: 'auth', reply: '', message: '这把 MiniMax 钥匙回答时不被接受。请让大人再填一次。' };
  }
  if (http === 402 || status === 1008 || type === 'insufficient_balance_error' || /balance|quota|insufficient|欠费|余额/i.test(blob)) {
    return { ok: false, code: 'quota', reply: '', message: '钥匙对了，但账户没额度了。请让大人充值后再试。' };
  }
  if (http === 429 || status === 1002 || type === 'rate_limit_error') {
    return { ok: false, code: 'rate', reply: '', message: '问得太密了。请稍等一会儿再听。' };
  }
  if (http >= 500 || status === 1000 || type === 'server_error') {
    return { ok: false, code: 'server', reply: '', message: 'MiniMax 暂时没空想。请稍后再试。' };
  }
  if (http >= 400) {
    return { ok: false, code: 'bad', reply: '', message: '它没有想出回答。请再试一次。' };
  }
  if (Number.isFinite(status) && status !== 0) {
    return { ok: false, code: 'bad', reply: '', message: '它没有想出回答。请再试一次。' };
  }
  const reply = extractChatText(body);
  if (reply) {
    return { ok: true, code: 'ok', reply, message: '它写下了：' + reply };
  }
  if (body.choices || body.id || status === 0) {
    return { ok: false, code: 'empty', reply: '', message: '它想了一下，但没写出字。请再试一次。' };
  }
  return { ok: false, code: 'bad', reply: '', message: '它没有想出回答。请再试一次。' };
}

export function extractTtsHex(body = {}) {
  const raw = body?.data?.audio ?? body?.audio ?? '';
  const hex = String(raw).replace(/\s/g, '').replace(/^0x/i, '');
  if (!hex || hex.length < 8 || hex.length % 2 || hex.length > 4_000_000) return '';
  if (!/^[0-9a-fA-F]+$/.test(hex)) return '';
  return hex;
}

export function classifyTts(res = {}) {
  if (res.networkError) {
    return { ok: false, code: 'network', hex: '', message: '老师电脑连不上 MiniMax 出声。请检查网络后再试。' };
  }
  const http = Number(res.httpStatus) || 0;
  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const status = Number(body.base_resp?.status_code ?? body.status_code);
  const type = String(body.type || body.error?.type || '');
  const blob = JSON.stringify(body);
  if (http === 401 || status === 1004 || type === 'authorized_error') {
    return { ok: false, code: 'auth', hex: '', message: '这把 MiniMax 钥匙出声时不被接受。请让大人再填一次。' };
  }
  if (http === 402 || status === 1008 || type === 'insufficient_balance_error' || /balance|quota|insufficient|欠费|余额/i.test(blob)) {
    return { ok: false, code: 'quota', hex: '', message: '钥匙对了，但账户没额度了。请让大人充值后再试。' };
  }
  if (http === 429 || status === 1002 || type === 'rate_limit_error') {
    return { ok: false, code: 'rate', hex: '', message: '说得太密了。请稍等一会儿再听。' };
  }
  if (http >= 500 || status === 1000 || type === 'server_error') {
    return { ok: false, code: 'server', hex: '', message: 'MiniMax 暂时没嗓子。请稍后再试。' };
  }
  if (http >= 400) {
    return { ok: false, code: 'bad', hex: '', message: '它写下了回答，但没有发出声音。请再试一次。' };
  }
  if (Number.isFinite(status) && status !== 0) {
    return { ok: false, code: 'bad', hex: '', message: '它写下了回答，但没有发出声音。请再试一次。' };
  }
  const hex = extractTtsHex(body);
  if (hex) {
    return { ok: true, code: 'ok', hex, message: '它正在说话。' };
  }
  if (body.data || body.extra_info || status === 0) {
    return { ok: false, code: 'empty', hex: '', message: '它写下了回答，但没有发出声音。请再试一次。' };
  }
  return { ok: false, code: 'bad', hex: '', message: '它没有发出声音。请再试一次。' };
}
