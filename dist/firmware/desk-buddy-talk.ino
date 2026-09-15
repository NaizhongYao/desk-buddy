#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

static const int PIN_SDA = 5;
static const int PIN_SCL = 4;
static const int PIN_AMP_BCLK = 8;
static const int PIN_AMP_LRC = 7;
static const int PIN_AMP_DIN = 9;
static const int PIN_MIC_SCK = 21;
static const int PIN_MIC_WS = 20;
static const int PIN_MIC_SD = 10;
static const int PIN_BTN = 0;
static const int SR = 16000;
static const int REC_MS = 2500;
static const int REC_SAMPLES = SR * REC_MS / 1000;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;
WebServer server(80);
DNSServer dns;
Preferences prefs;

String wifiSsid, wifiPass, apiKey, apName;
bool online = false;
bool keyOk = false;
bool busy = false;
bool apUp = false;
int16_t *recBuf = nullptr;

static const char *HOSTS[] = {
  "https://api.minimax.cn",
  "https://api.minimaxi.com"
};

void oledLines(const char *a, const char *b = "", const char *c = "", const char *d = "") {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  if (a && a[0]) display.println(a);
  if (b && b[0]) display.println(b);
  if (c && c[0]) display.println(c);
  if (d && d[0]) display.println(d);
  display.display();
}

void oledFail(const char *a, const char *b) {
  oledLines(a, b, "RETRY");
}

void eyes(int px, int py, int r, int pr) {
  display.fillCircle(40, 26, r, SSD1306_WHITE);
  display.fillCircle(88, 26, r, SSD1306_WHITE);
  display.fillCircle(40 + px, 26 + py, pr, SSD1306_BLACK);
  display.fillCircle(88 + px, 26 + py, pr, SSD1306_BLACK);
}

void face(const char *kind) {
  display.clearDisplay();
  if (!strcmp(kind, "listen")) {
    eyes(3, 2, 14, 6);
    display.fillRoundRect(56, 50, 16, 3, 1, SSD1306_WHITE);
  } else if (!strcmp(kind, "think")) {
    display.fillRoundRect(26, 24, 28, 5, 2, SSD1306_WHITE);
    display.fillRoundRect(74, 24, 28, 5, 2, SSD1306_WHITE);
    display.drawCircle(64, 50, 5, SSD1306_WHITE);
  } else if (!strcmp(kind, "speak")) {
    eyes(0, 1, 13, 5);
    display.fillCircle(64, 50, 11, SSD1306_WHITE);
    display.fillCircle(64, 50, 6, SSD1306_BLACK);
  } else {
    eyes(0, 0, 14, 6);
    display.drawLine(50, 48, 56, 54, SSD1306_WHITE);
    display.drawLine(56, 54, 72, 54, SSD1306_WHITE);
    display.drawLine(72, 54, 78, 48, SSD1306_WHITE);
  }
  display.display();
}

void showHotspot() {
  oledLines("PLUG USB", "WIFI AP:", apName.c_str(), "192.168.4.1");
}

bool startMic() {
  i2s.end();
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  return i2s.begin(I2S_MODE_STD, SR, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

bool startAmp() {
  i2s.end();
  i2s.setPins(PIN_AMP_BCLK, PIN_AMP_LRC, PIN_AMP_DIN, -1, -1);
  return i2s.begin(I2S_MODE_STD, SR, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void beep(int hz, int ms) {
  if (!startAmp()) return;
  int n = SR * ms / 1000;
  for (int i = 0; i < n; i++) {
    int16_t s = ((i * hz / (SR / 2)) % 2) ? 7000 : -7000;
    i2s.write((uint8_t *)&s, 2);
  }
}

void writeWavHeader(uint8_t *h, int dataBytes) {
  memcpy(h, "RIFF", 4);
  uint32_t chunk = 36 + dataBytes;
  memcpy(h + 4, &chunk, 4);
  memcpy(h + 8, "WAVE", 4);
  memcpy(h + 12, "fmt ", 4);
  uint32_t fmtLen = 16;
  memcpy(h + 16, &fmtLen, 4);
  uint16_t pcm = 1, ch = 1, bits = 16, block = 2;
  memcpy(h + 20, &pcm, 2);
  memcpy(h + 22, &ch, 2);
  uint32_t rate = SR, byterate = SR * 2;
  memcpy(h + 24, &rate, 4);
  memcpy(h + 28, &byterate, 4);
  memcpy(h + 32, &block, 2);
  memcpy(h + 34, &bits, 2);
  memcpy(h + 36, "data", 4);
  uint32_t dlen = dataBytes;
  memcpy(h + 40, &dlen, 4);
}

String jsonEscape(const String &s) {
  String o;
  o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (c == '\n') o += "\\n";
    else if (c >= 32) o += c;
  }
  return o;
}

String jsonField(const String &body, const char *key) {
  String pat = String("\"") + key + "\":";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  while (i < (int)body.length() && (body[i] == ' ')) i++;
  if (i >= (int)body.length()) return "";
  if (body[i] == '"') {
    i++;
    String v;
    while (i < (int)body.length()) {
      char c = body[i++];
      if (c == '\\' && i < (int)body.length()) { v += body[i++]; continue; }
      if (c == '"') break;
      v += c;
    }
    return v;
  }
  int j = i;
  while (j < (int)body.length() && body[j] != ',' && body[j] != '}' && body[j] != ' ') j++;
  return body.substring(i, j);
}

int jsonStatus(const String &body) {
  String v = jsonField(body, "status_code");
  if (!v.length()) return 0;
  return v.toInt();
}

bool postJson(const char *path, const String &payload, String &out, int &httpCode) {
  httpCode = 0;
  out = "";
  for (int h = 0; h < 2; h++) {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setTimeout(25000);
    String url = String(HOSTS[h]) + path;
    if (!http.begin(client, url)) continue;
    http.addHeader("Authorization", "Bearer " + apiKey);
    http.addHeader("Content-Type", "application/json");
    httpCode = http.POST(payload);
    out = http.getString();
    http.end();
    if (httpCode != 404 && httpCode != 0) return httpCode > 0;
  }
  return false;
}

bool postAsr(const uint8_t *wav, int wavLen, String &text, int &httpCode, String &body) {
  text = "";
  body = "";
  httpCode = 0;
  String bound = "----DeskBuddy";
  String head =
    "--" + bound + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nasr-1.0\r\n" +
    "--" + bound + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"clip.wav\"\r\nContent-Type: audio/wav\r\n\r\n";
  String tail = "\r\n--" + bound + "--\r\n";
  int total = head.length() + wavLen + tail.length();
  uint8_t *pack = (uint8_t *)malloc(total);
  if (!pack) return false;
  memcpy(pack, head.c_str(), head.length());
  memcpy(pack + head.length(), wav, wavLen);
  memcpy(pack + head.length() + wavLen, tail.c_str(), tail.length());
  bool ok = false;
  for (int h = 0; h < 2; h++) {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setTimeout(30000);
    if (!http.begin(client, String(HOSTS[h]) + "/v1/speech_to_text")) continue;
    http.addHeader("Authorization", "Bearer " + apiKey);
    http.addHeader("language", "zh");
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + bound);
    httpCode = http.POST(pack, total);
    body = http.getString();
    http.end();
    if (httpCode == 404 || httpCode == 0) continue;
    ok = true;
    break;
  }
  free(pack);
  if (!ok) return false;
  int st = jsonStatus(body);
  if (httpCode == 401 || st == 1004) return false;
  text = jsonField(body, "text");
  text.trim();
  return httpCode >= 200 && httpCode < 300 && st == 0;
}

bool skipUntil(WiFiClient *s, const char *needle, uint32_t deadline) {
  size_t n = strlen(needle), matched = 0;
  while (millis() < deadline) {
    if (!s->available()) { delay(2); continue; }
    char c = (char)s->read();
    if (c == needle[matched]) {
      matched++;
      if (matched == n) return true;
    } else {
      matched = (c == needle[0]) ? 1 : 0;
    }
  }
  return false;
}

int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool playTtsStream(const String &text) {
  String payload = String("{\"model\":\"speech-2.6-turbo\",\"text\":\"") + jsonEscape(text) +
    "\",\"stream\":false,\"voice_setting\":{\"voice_id\":\"female-shaonv\",\"speed\":1,\"vol\":1,\"pitch\":0},"
    "\"audio_setting\":{\"sample_rate\":16000,\"format\":\"pcm\",\"channel\":1}}";
  if (!startAmp()) return false;
  for (int h = 0; h < 2; h++) {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setTimeout(25000);
    if (!http.begin(client, String(HOSTS[h]) + "/v1/t2a_v2")) continue;
    http.addHeader("Authorization", "Bearer " + apiKey);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    if (code == 404 || code == 0) { http.end(); continue; }
    if (code < 200 || code >= 300) { http.end(); return false; }
    WiFiClient *s = http.getStreamPtr();
    uint32_t deadline = millis() + 20000;
    if (!skipUntil(s, "\"audio\":\"", deadline)) { http.end(); return false; }
    bool hi = true;
    int hiNibble = 0;
    int got = 0;
    uint8_t pair[2];
    int pairN = 0;
    while (millis() < deadline) {
      if (!s->available()) { delay(1); continue; }
      char c = (char)s->read();
      if (c == '"') break;
      if (c == '\\' || c == '\n' || c == '\r' || c == ' ') continue;
      int v = hexVal(c);
      if (v < 0) continue;
      if (hi) { hiNibble = v; hi = false; }
      else {
        pair[pairN++] = (uint8_t)((hiNibble << 4) | v);
        hi = true;
        if (pairN == 2) {
          i2s.write(pair, 2);
          pairN = 0;
          got++;
        }
      }
    }
    http.end();
    return got > 32;
  }
  return false;
}

bool pingKey() {
  String body;
  int code = 0;
  String payload = "{\"model\":\"MiniMax-M2.5-highspeed\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_completion_tokens\":1,\"thinking\":{\"type\":\"disabled\"}}";
  if (!postJson("/v1/chat/completions", payload, body, code)) return false;
  int st = jsonStatus(body);
  if (code == 401 || st == 1004) return false;
  return (code >= 200 && code < 300) && (st == 0 || body.indexOf("\"choices\"") >= 0 || body.indexOf("\"id\"") >= 0);
}

void startAp() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str());
  dns.start(53, "*", WiFi.softAPIP());
  apUp = true;
  online = false;
  keyOk = false;
  showHotspot();
}

const char PORTAL[] PROGMEM = R"HTML(
<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Desk Buddy</title>
<style>body{font-family:sans-serif;max-width:22rem;margin:1.5rem auto;padding:0 1rem}label{display:block;margin:.8rem 0 .2rem}input{width:100%;padding:.5rem;box-sizing:border-box}button{margin-top:1rem;padding:.6rem 1rem}</style>
<h1>Desk Buddy 配网</h1>
<p>手机现在连着机器人热点。填家里的 Wi-Fi 和 MiniMax API key。</p>
<form method=POST action=/save>
<label>Wi-Fi 名字</label><input name=ssid required>
<label>Wi-Fi 密码</label><input name=password type=password required>
<label>MiniMax API key</label><input name=apiKey required>
<button>保存并连接</button>
</form>
)HTML";

void handleRoot() { server.send_P(200, "text/html; charset=utf-8", PORTAL); }

void handleSave() {
  String ssid = server.arg("ssid"); ssid.trim();
  String pass = server.arg("password");
  String key = server.arg("apiKey"); key.trim();
  if (!ssid.length() || !pass.length() || !key.length()) {
    server.send(400, "text/plain; charset=utf-8", "还有空格子");
    return;
  }
  wifiSsid = ssid.substring(0, 64);
  wifiPass = pass.substring(0, 64);
  apiKey = key.substring(0, 256);
  prefs.putString("ssid", wifiSsid);
  prefs.putString("pass", wifiPass);
  prefs.putString("key", apiKey);
  server.send(200, "text/html; charset=utf-8", "<p>正在连接家里的网…请看小屏幕。</p>");
  oledLines("PLUG USB", "WIFI...", "JOINING", "HOME NET");
  dns.stop();
  WiFi.softAPdisconnect(true);
  apUp = false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
}

void forgetNetwork() {
  prefs.clear();
  wifiSsid = wifiPass = apiKey = "";
  online = keyOk = false;
  WiFi.disconnect(true, true);
  startAp();
}

bool tryFinishJoin() {
  if (WiFi.status() != WL_CONNECTED) return false;
  online = true;
  oledLines("WIFI OK", "KEY...", "CHECKING");
  keyOk = pingKey();
  if (keyOk) oledLines("WIFI OK", "KEY OK", "WAIT TALK");
  else oledFail("KEY BAD", "RETRY KEY");
  return true;
}

void talkOnce() {
  if (busy || !online || !keyOk) return;
  busy = true;
  face("listen");
  if (!recBuf) recBuf = (int16_t *)malloc(REC_SAMPLES * 2);
  if (!recBuf || !startMic()) {
    oledFail("MIC BAD", "CLOSER");
    busy = false;
    return;
  }
  delay(80);
  int got = 0;
  uint32_t start = millis();
  while (got < REC_SAMPLES && millis() - start < REC_MS + 400) {
    int n = i2s.readBytes((char *)(recBuf + got), (REC_SAMPLES - got) * 2);
    if (n > 0) got += n / 2;
  }
  if (got < 800) {
    oledFail("DIDNT HEAR", "TRY AGAIN");
    busy = false;
    return;
  }
  face("listen");
  int wavLen = 44 + got * 2;
  uint8_t *wav = (uint8_t *)malloc(wavLen);
  if (!wav) {
    oledFail("LISTEN BAD", "RETRY");
    busy = false;
    return;
  }
  writeWavHeader(wav, got * 2);
  memcpy(wav + 44, recBuf, got * 2);
  String heard, asrBody;
  int asrCode = 0;
  bool asrOk = postAsr(wav, wavLen, heard, asrCode, asrBody);
  free(wav);
  int st = jsonStatus(asrBody);
  if (asrCode == 401 || st == 1004) { oledFail("KEY BAD", "RETRY KEY"); busy = false; return; }
  if (st == 1008) { oledFail("NO QUOTA", "ASK ADULT"); busy = false; return; }
  if (asrCode == 429 || st == 1002) { oledFail("TOO FAST", "WAIT"); busy = false; return; }
  if (!asrOk || !heard.length()) {
    oledFail(heard.length() ? "LISTEN BAD" : "DIDNT HEAR", "TRY AGAIN");
    busy = false;
    return;
  }
  face("think");
  String chatBody;
  int chatCode = 0;
  String sys = "You are Desk Buddy. Reply in Chinese to a 12-year-old. One or two short warm sentences. No lists.";
  String chat = String("{\"model\":\"MiniMax-M3\",\"messages\":[{\"role\":\"system\",\"content\":\"") + jsonEscape(sys) +
    "\"},{\"role\":\"user\",\"content\":\"" + jsonEscape(heard.substring(0, 200)) +
    "\"}],\"max_completion_tokens\":80,\"thinking\":{\"type\":\"disabled\"}}";
  postJson("/v1/chat/completions", chat, chatBody, chatCode);
  st = jsonStatus(chatBody);
  String reply = jsonField(chatBody, "content");
  reply.trim();
  if (chatCode == 401 || st == 1004) { oledFail("KEY BAD", "RETRY KEY"); busy = false; return; }
  if (st == 1008) { oledFail("NO QUOTA", "ASK ADULT"); busy = false; return; }
  if (!reply.length()) { oledFail("REPLY BAD", "RETRY"); busy = false; return; }
  face("speak");
  bool spoke = playTtsStream(reply.substring(0, 200));
  if (!spoke) {
    beep(880, 180);
    oledFail("SPEAK BAD", "RETRY");
    busy = false;
    return;
  }
  face("idle");
  busy = false;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN, INPUT_PULLUP);
  Wire.begin(PIN_SDA, PIN_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  uint16_t id = (uint16_t)(ESP.getEfuseMac() & 0xFFFF);
  char name[20];
  snprintf(name, sizeof(name), "DeskBuddy-%04X", id);
  apName = name;
  prefs.begin("buddy", false);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  apiKey = prefs.getString("key", "");
  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/generate_204", []() { server.sendHeader("Location", "http://192.168.4.1/"); server.send(302); });
  server.on("/hotspot-detect.html", handleRoot);
  server.onNotFound(handleRoot);
  server.begin();
  if (wifiSsid.length() && apiKey.length()) {
    oledLines("PLUG USB", "WIFI...", "JOINING", "HOME NET");
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  } else {
    startAp();
  }
}

void loop() {
  if (apUp) dns.processNextRequest();
  server.handleClient();

  static uint32_t joinAt = 0;
  if (!online && !apUp && wifiSsid.length()) {
    if (!joinAt) joinAt = millis();
    if (WiFi.status() == WL_CONNECTED) {
      joinAt = 0;
      tryFinishJoin();
    } else if (millis() - joinAt > 15000) {
      joinAt = 0;
      oledFail("NET BAD", "CHECK WIFI");
      delay(800);
      startAp();
    }
  }

  static bool wasDown = false;
  static uint32_t pressAt = 0;
  bool down = digitalRead(PIN_BTN) == LOW;
  if (down && !wasDown) pressAt = millis();
  if (!down && wasDown && !busy) {
    uint32_t held = millis() - pressAt;
    if (held >= 4000) forgetNetwork();
    else if (held >= 40 && online && keyOk) talkOnce();
  }
  wasDown = down;
  delay(10);
}
