const oled = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}
`;

const connectivity = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_SDA = 5;
const int PIN_SCL = 4;
const int PIN_LED = 8;
const int PIN_AMP_LRC = 7;
const int PIN_AMP_BCLK = 8;
const int PIN_AMP_DIN = 9;
const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;

bool oledOk = false;
bool ledOk = false;
bool ampOk = false;
bool micOk = false;
int oledAddr = 0;
int oledHint = 0;
int micPeak = 0;
String lastFail = "";

void say(const String& line) {
  Serial.println(line);
}

int scanI2C(int sda, int scl, int want) {
  Wire.end();
  Wire.begin(sda, scl);
  Wire.setTimeOut(50);
  delay(20);
  int found = 0;
  for (int addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      found = addr;
      if (addr == want) return addr;
    }
  }
  return found;
}

void showOled(const String& a, const String& b, const String& c, const String& d) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(a);
  display.println(b);
  display.println(c);
  display.println(d);
  display.display();
}

bool testOled() {
  say("[1/4] OLED  I2C  SDA=GPIO5  SCL=GPIO4  地址 0x3C");
  int normal = scanI2C(PIN_SDA, PIN_SCL, 0x3C);
  if (normal == 0x3C) {
    oledAddr = 0x3C;
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
      lastFail = "找到 0x3C，但屏幕初始化失败。检查 VCC 是否接到 3.3，不要接 5V。";
      say("FAIL OLED: " + lastFail);
      return false;
    }
    oledOk = true;
    showOled("OLED OK 0x3C", "SDA=5 SCL=4", "next: LED", "");
    say("PASS OLED: 在正确引脚上找到 0x3C，屏幕已点亮。");
    return true;
  }
  int swapped = scanI2C(PIN_SCL, PIN_SDA, 0x3C);
  if (swapped == 0x3C) {
    oledHint = 1;
    lastFail = "SCL 和 SDA 接反了。请把 OLED SCL 接到 GPIO4，SDA 接到 GPIO5。";
    say("FAIL OLED: " + lastFail);
    return false;
  }
  if (normal != 0) {
    oledAddr = normal;
    oledHint = 2;
    lastFail = "I2C 上找到的是 0x" + String(normal, HEX) + "，不是 0x3C。核对屏幕背面地址跳线和四脚顺序 GND VCC SCL SDA。";
    say("FAIL OLED: " + lastFail);
    return false;
  }
  lastFail = "完全扫不到 OLED。断电后查：GND->G，VCC->3.3（不要 5V），SCL->4，SDA->5，母头是否插到底。";
  say("FAIL OLED: " + lastFail);
  return false;
}

bool testLed() {
  say("[2/4] 板载蓝灯  GPIO8（旁边一直亮的是电源红灯，不算）");
  pinMode(PIN_LED, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, LOW);
    delay(180);
    digitalWrite(PIN_LED, HIGH);
    delay(180);
  }
  digitalWrite(PIN_LED, HIGH);
  ledOk = true;
  say("CHECK LED: 蓝灯应闪 3 次。若只有红灯亮，程序已跑到这块板，但 GPIO8 蓝灯没亮。");
  showOled("LED GPIO8", "blue should blink", "red = power only", "");
  return true;
}

bool testAmp() {
  say("[3/4] 功放 MAX98357  LRC=GPIO7  BCLK=GPIO8  DIN=GPIO9  Vin=3.3  GND=G");
  say("喇叭只接功放绿色端子：红+ 黑-。不要接 ESP32。");
  i2s.end();
  i2s.setPins(PIN_AMP_BCLK, PIN_AMP_LRC, PIN_AMP_DIN, -1, -1);
  if (!i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    lastFail = "I2S 打不开功放引脚。查 LRC->7、BCLK->8、DIN->9 有没有插错到 OLED 或麦克风。";
    say("FAIL AMP: " + lastFail);
    return false;
  }
  showOled("AMP playing", "listen speaker", "1kHz 0.8s", "LRC7 BCLK8 DIN9");
  const int n = 16000 * 8 / 10;
  for (int i = 0; i < n; i++) {
    int16_t s = ((i / 8) % 2) ? 9000 : -9000;
    i2s.write((uint8_t*)&s, 2);
  }
  i2s.end();
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);
  ampOk = true;
  say("CHECK AMP: 驱动已向 GPIO9 送出 1kHz。若无声：Vin/GND、LRC/BCLK/DIN 是否接反，喇叭是否进绿色端子。GAIN/SD 应悬空。");
  return true;
}

int micEnergy() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return -1;
  int samples = got / 2;
  int peak = 0;
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
    sum += v;
  }
  micPeak = peak;
  return peak;
}

bool testMic() {
  say("[4/4] 麦克风 MSM3526  WS=GPIO20  SCK=GPIO21  SD=GPIO10  VDD=3.3  GND=G  L/R 悬空");
  say("注意：GPIO20/21 也是 USB。测麦克风时，电脑可能暂时认不到串口，请看 OLED 报告。");
  i2s.end();
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  if (!i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    lastFail = "I2S 打不开麦克风引脚。查 WS->20、SCK->21、SD->10，不要接到功放那一组。";
    say("FAIL MIC: " + lastFail);
    return false;
  }
  delay(50);
  int peak = micEnergy();
  if (peak < 20) {
    i2s.end();
    i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
    i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
    delay(50);
    peak = micEnergy();
  }
  i2s.end();
  if (peak < 0) {
    lastFail = "读不到麦克风数据。SD 可能没接到 GPIO10，或接到了 SCK/WS。";
    say("FAIL MIC: " + lastFail);
    return false;
  }
  if (peak < 30) {
    lastFail = "数据线有时钟但几乎无声音数据，峰值=" + String(peak) + "。查 SD->10、VDD->3.3、GND->G；对麦克风吹气再烧一次。WS/SCK 接反也会接近全零。";
    say("FAIL MIC: " + lastFail);
    return false;
  }
  micOk = true;
  say("PASS MIC: I2S 读到变化，峰值=" + String(peak) + "。再对着吹一口气，峰值应更大。");
  return true;
}

void report() {
  say("========== 实物接线报告 ==========");
  say(String("OLED: ") + (oledOk ? "PASS" : "FAIL"));
  say(String("LED : ") + "CHECK 蓝灯闪过即为主板活着");
  say(String("AMP : ") + (ampOk ? "DRIVER PASS，请用耳朵确认喇叭" : "FAIL"));
  say(String("MIC : ") + (micOk ? "PASS" : "FAIL"));
  if (lastFail.length()) say("最后失败原因: " + lastFail);
  say("预期接线: OLED GND/VCC/SCL/SDA -> G/3.3/4/5");
  say("功放 GND/Vin/LRC/BCLK/DIN -> G/3.3/7/8/9");
  say("麦克风 GND/VDD/WS/SCK/SD -> G/3.3/20/21/10");
  say("================================");
  showOled(
    String("OLED ") + (oledOk ? "PASS" : "FAIL"),
    String("AMP  ") + (ampOk ? "PASS?" : "FAIL"),
    String("MIC  ") + (micOk ? "PASS" : "FAIL") + " p=" + String(micPeak),
    oledOk ? (lastFail.length() ? lastFail.substring(0, 21) : "look Serial 115200") : "fix OLED first"
  );
}

void setup() {
  Serial.begin(115200);
  delay(400);
  say("Desk Buddy 实物连通性测试");
  say("先看串口，测麦克风后若掉口，改看屏幕。");
  testOled();
  delay(200);
  testLed();
  delay(200);
  testAmp();
  delay(200);
  testMic();
  report();
}

void loop() {
  if (oledOk) {
    display.invertDisplay((millis() / 800) % 2);
  }
  delay(200);
}
`;

export const examples = {
  connectivity,
  eyes: oled + `
void loop() {
  display.clearDisplay();
  display.fillCircle(40, 32, 14, SSD1306_WHITE);
  display.fillCircle(88, 32, 14, SSD1306_WHITE);
  display.display();
  delay(1500);

  display.clearDisplay();
  display.fillRect(26, 30, 28, 4, SSD1306_WHITE);
  display.fillRect(74, 30, 28, 4, SSD1306_WHITE);
  display.display();
  delay(180);
}
`,

  move: oled + `
void loop() {
  for (int x = 30; x <= 50; x = x + 1) {
    display.clearDisplay();
    display.drawCircle(40, 32, 18, SSD1306_WHITE);
    display.drawCircle(88, 32, 18, SSD1306_WHITE);
    display.fillCircle(x, 32, 6, SSD1306_WHITE);
    display.fillCircle(x + 48, 32, 6, SSD1306_WHITE);
    display.display();
    delay(40);
  }
  delay(300);
}
`,

  text: oled + `
void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(16, 24);
  display.print("Hello!");
  display.display();
  delay(800);
}
`,

  clock: oled + `
void loop() {
  int total = millis() / 1000;
  int mins = (total / 60) % 60;
  int secs = total % 60;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(34, 24);
  if (mins < 10) display.print("0");
  display.print(mins);
  display.print(":");
  if (secs < 10) display.print("0");
  display.print(secs);
  display.display();
  delay(200);
}
`,

  heart: oled + `
void loop() {
  display.clearDisplay();
  display.fillCircle(48, 26, 12, SSD1306_WHITE);
  display.fillCircle(72, 26, 12, SSD1306_WHITE);
  for (int y = 30; y <= 56; y = y + 1) {
    int w = 56 - (y - 30);
    display.drawLine(64 - w / 2, y, 64 + w / 2, y, SSD1306_WHITE);
  }
  display.display();
  delay(500);

  display.clearDisplay();
  display.fillCircle(50, 28, 9, SSD1306_WHITE);
  display.fillCircle(70, 28, 9, SSD1306_WHITE);
  for (int y = 32; y <= 50; y = y + 1) {
    int w = 40 - (y - 32);
    display.drawLine(64 - w / 2, y, 64 + w / 2, y, SSD1306_WHITE);
  }
  display.display();
  delay(180);
}
`,

  progress: oled + `
void loop() {
  for (int n = 0; n <= 100; n = n + 4) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(28, 8);
    display.print("Loading");
    display.drawRect(14, 28, 100, 14, SSD1306_WHITE);
    display.fillRect(16, 30, n, 10, SSD1306_WHITE);
    display.setCursor(52, 48);
    display.print(n);
    display.display();
    delay(40);
  }
  delay(400);
}
`,

  bounce: oled + `
void loop() {
  int t = millis() / 30;
  int x = 8 + abs((t % 224) - 112);
  int y = 8 + abs(((t / 2) % 96) - 48);

  display.clearDisplay();
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.fillCircle(x, y, 5, SSD1306_WHITE);
  display.display();
  delay(30);
}
`,

  counter: oled + `
void loop() {
  for (int n = 0; n <= 20; n = n + 1) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(3);
    display.setCursor(40, 20);
    display.print(n);
    display.display();
    delay(200);
  }
}
`,

  led: `void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, LOW);
  Serial.println("LED ON");
  delay(400);
  digitalWrite(8, HIGH);
  Serial.println("LED OFF");
  delay(400);
}
`,

  speaker: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_AMP_LRC = 7;
const int PIN_AMP_BCLK = 8;
const int PIN_AMP_DIN = 9;

void beep(int hz, int ms) {
  int n = 16 * ms;
  for (int i = 0; i < n; i++) {
    int16_t s = ((i * hz / 500) % 2) ? 9000 : -9000;
    i2s.write((uint8_t*)&s, 2);
  }
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  i2s.setPins(PIN_AMP_BCLK, PIN_AMP_LRC, PIN_AMP_DIN, -1, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(20, 8);
  display.print("BEEP");
  display.display();
  beep(1000, 350);

  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(20, 22);
  display.print("quiet");
  display.display();
  delay(450);
}
`,

  microphone: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;

int micPeak() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return 0;
  int peak = 0;
  int samples = got / 2;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
  }
  return peak;
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void loop() {
  int vol = micPeak();
  int w = vol / 80;
  if (w > 118) w = 118;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("MIC");
  display.setCursor(40, 0);
  display.print(vol);
  display.drawRect(4, 22, 120, 24, SSD1306_WHITE);
  display.fillRect(6, 24, w, 20, SSD1306_WHITE);
  display.display();
  delay(40);
}
`,

  voice_light: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;

int micPeak() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return 0;
  int peak = 0;
  int samples = got / 2;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
  }
  return peak;
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  pinMode(8, OUTPUT);
  digitalWrite(8, HIGH);
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void loop() {
  int vol = micPeak();
  int w = vol / 80;
  if (w > 118) w = 118;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("CLAP");
  display.drawRect(4, 22, 120, 24, SSD1306_WHITE);
  display.fillRect(6, 24, w, 20, SSD1306_WHITE);
  display.display();

  if (vol > 400) {
    digitalWrite(8, LOW);
    delay(400);
    digitalWrite(8, HIGH);
  }
  delay(20);
}
`,

  dino_jump: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

// GAME_DINO  clap or shout to jump
Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;
const int THRESH = 450;
const int QUIET = 180;
const int GROUND = 54;

int dinoY = 54;
int vel = 0;
int cactusX = 140;
int cactusH = 16;
int score = 0;
int dead = 0;
int armed = 1;
int spd = 3;

int micPeak() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return 0;
  int peak = 0;
  int samples = got / 2;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
  }
  return peak;
}

void resetGame() {
  dinoY = GROUND;
  vel = 0;
  cactusX = 140;
  cactusH = 16;
  score = 0;
  dead = 0;
  spd = 3;
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void loop() {
  int vol = micPeak();
  if (vol < QUIET) armed = 1;

  if (dead) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > THRESH && armed) {
      resetGame();
      armed = 0;
    }
    delay(40);
    return;
  }

  if (vol > THRESH && armed && dinoY >= GROUND) {
    vel = -9;
    armed = 0;
  }

  vel = vel + 1;
  dinoY = dinoY + vel;
  if (dinoY > GROUND) {
    dinoY = GROUND;
    vel = 0;
  }

  cactusX = cactusX - spd;
  if (cactusX < -10) {
    cactusX = 128 + random(36);
    cactusH = 12 + random(14);
    score = score + 1;
    if (spd < 7 && score % 4 == 0) spd = spd + 1;
  }

  if (cactusX < 32 && cactusX + 6 > 16) {
    if (dinoY > GROUND - cactusH) dead = 1;
  }

  display.clearDisplay();
  display.drawLine(0, GROUND, 127, GROUND, SSD1306_WHITE);
  display.fillRect(16, dinoY - 14, 14, 12, SSD1306_WHITE);
  display.fillRect(26, dinoY - 18, 8, 8, SSD1306_WHITE);
  if ((millis() / 80) % 2) display.fillRect(18, dinoY - 2, 3, 4, SSD1306_WHITE);
  else display.fillRect(24, dinoY - 2, 3, 4, SSD1306_WHITE);
  display.fillRect(cactusX, GROUND - cactusH, 5, cactusH, SSD1306_WHITE);
  display.fillRect(cactusX - 3, GROUND - cactusH + 4, 3, 3, SSD1306_WHITE);
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("DINO ");
  display.print(score);
  display.display();
  delay(40);
}
`,

  star_catch: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

// GAME_STAR  louder sound moves the basket right
Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;
const int THRESH = 450;
const int QUIET = 180;

int paddle = 52;
int starX = 64;
int starY = 0;
int score = 0;
int miss = 0;
int drop = 2;
int dead = 0;
int armed = 1;

int micPeak() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return 0;
  int peak = 0;
  int samples = got / 2;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
  }
  return peak;
}

void resetGame() {
  paddle = 52;
  starX = 64;
  starY = 0;
  score = 0;
  miss = 0;
  drop = 2;
  dead = 0;
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
}

void loop() {
  int vol = micPeak();
  if (vol < QUIET) armed = 1;

  if (dead) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > THRESH && armed) {
      resetGame();
      armed = 0;
    }
    delay(40);
    return;
  }

  int target = vol / 70;
  if (target > 104) target = 104;
  paddle = paddle + (target - paddle) / 3;

  starY = starY + drop;
  if (starY > 66) {
    miss = miss + 1;
    starY = 0;
    starX = 8 + random(112);
    if (miss > 4) dead = 1;
  } else if (starY > 50 && starY < 62) {
    if (starX > paddle - 2 && starX < paddle + 26) {
      score = score + 1;
      starY = 0;
      starX = 8 + random(112);
      if (drop < 5 && score % 3 == 0) drop = drop + 1;
    }
  }

  int bar = vol / 80;
  if (bar > 40) bar = 40;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("STAR ");
  display.print(score);
  display.drawRect(80, 2, 44, 6, SSD1306_WHITE);
  display.fillRect(82, 4, bar, 2, SSD1306_WHITE);
  display.fillCircle(starX, starY, 3, SSD1306_WHITE);
  display.drawLine(starX, starY - 5, starX, starY + 5, SSD1306_WHITE);
  display.drawLine(starX - 5, starY, starX + 5, starY, SSD1306_WHITE);
  display.fillRect(paddle, 58, 24, 4, SSD1306_WHITE);
  display.drawLine(paddle, 58, paddle + 4, 54, SSD1306_WHITE);
  display.drawLine(paddle + 24, 58, paddle + 20, 54, SSD1306_WHITE);
  display.display();
  delay(40);
}
`,

  clap_mole: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP_I2S.h>

// GAME_MOLE  clap when the mole is up
Adafruit_SSD1306 display(128, 64, &Wire, -1);
I2SClass i2s;

const int PIN_MIC_WS = 20;
const int PIN_MIC_SCK = 21;
const int PIN_MIC_SD = 10;
const int THRESH = 450;
const int QUIET = 180;

int hole = 1;
int shown = 1;
int t0 = 0;
int score = 0;
int miss = 0;
int dead = 0;
int armed = 1;
int flash = 0;

int micPeak() {
  int16_t buf[256];
  int got = i2s.readBytes((char*)buf, sizeof(buf));
  if (got < 64) return 0;
  int peak = 0;
  int samples = got / 2;
  for (int i = 0; i < samples; i++) {
    int v = buf[i];
    if (v < 0) v = -v;
    if (v > peak) peak = v;
  }
  return peak;
}

void resetGame() {
  hole = 1;
  shown = 1;
  t0 = millis();
  score = 0;
  miss = 0;
  dead = 0;
  flash = 0;
}

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  i2s.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD, -1);
  i2s.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
  t0 = millis();
}

void loop() {
  int vol = micPeak();
  int now = millis();
  if (vol < QUIET) armed = 1;

  if (dead) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > THRESH && armed) {
      resetGame();
      armed = 0;
    }
    delay(40);
    return;
  }

  int life = 900;
  if (shown == 0) life = 320;
  if (now - t0 > life) {
    t0 = now;
    if (shown == 1) {
      shown = 0;
      miss = miss + 1;
      if (miss > 4) dead = 1;
    } else {
      shown = 1;
      int next = random(3);
      if (next == hole) next = (next + 1) % 3;
      hole = next;
    }
  }

  if (vol > THRESH && armed) {
    armed = 0;
    if (shown == 1) {
      score = score + 1;
      shown = 0;
      t0 = now;
      flash = 6;
      if (miss > 0) miss = miss - 1;
    } else {
      miss = miss + 1;
      if (miss > 4) dead = 1;
    }
  }

  int x0 = 22;
  int x1 = 64;
  int x2 = 106;
  int mx = x0;
  if (hole == 1) mx = x1;
  if (hole == 2) mx = x2;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("MOLE ");
  display.print(score);
  display.drawCircle(x0, 40, 12, SSD1306_WHITE);
  display.drawCircle(x1, 40, 12, SSD1306_WHITE);
  display.drawCircle(x2, 40, 12, SSD1306_WHITE);
  if (shown == 1) {
    display.fillCircle(mx, 36, 8, SSD1306_WHITE);
    display.fillCircle(mx, 28, 5, SSD1306_WHITE);
  }
  if (flash > 0) {
    display.setCursor(92, 0);
    display.print("HIT");
    flash = flash - 1;
  }
  display.display();
  delay(40);
}
`
};

const demoBeep = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}
void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(20, 8);
  display.print("BEEP");
  display.display();
  tone(9, 1000);
  delay(350);
  noTone(9);
  display.clearDisplay();
  display.setCursor(20, 22);
  display.print("quiet");
  display.display();
  delay(450);
}
`;

const demoMic = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  pinMode(8, OUTPUT);
  digitalWrite(8, HIGH);
}
void loop() {
  int vol = analogRead(10);
  int w = vol / 9;
  if (w > 118) w = 118;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("MIC demo");
  display.drawRect(4, 22, 120, 24, SSD1306_WHITE);
  display.fillRect(6, 24, w, 20, SSD1306_WHITE);
  display.display();
  if (vol > 200) {
    digitalWrite(8, LOW);
    delay(200);
    digitalWrite(8, HIGH);
  }
  delay(40);
}
`;

const demoDino = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int dinoY = 54;
int vel = 0;
int cactusX = 140;
int cactusH = 16;
int score = 0;
int dead = 0;
int armed = 1;
int spd = 3;
void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}
void loop() {
  int vol = analogRead(10);
  int ground = 54;
  if (vol < 120) armed = 1;
  if (dead == 1) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > 240 && armed == 1) {
      dinoY = ground;
      vel = 0;
      cactusX = 140;
      cactusH = 16;
      score = 0;
      dead = 0;
      spd = 3;
      armed = 0;
    }
    delay(40);
    return;
  }
  if (vol > 240 && armed == 1 && dinoY >= ground) {
    vel = -9;
    armed = 0;
  }
  vel = vel + 1;
  dinoY = dinoY + vel;
  if (dinoY > ground) {
    dinoY = ground;
    vel = 0;
  }
  cactusX = cactusX - spd;
  if (cactusX < -10) {
    cactusX = 128 + random(36);
    cactusH = 12 + random(14);
    score = score + 1;
    if (spd < 7 && score % 4 == 0) spd = spd + 1;
  }
  if (cactusX < 32 && cactusX + 6 > 16) {
    if (dinoY > ground - cactusH) dead = 1;
  }
  display.clearDisplay();
  display.drawLine(0, ground, 127, ground, SSD1306_WHITE);
  display.fillRect(16, dinoY - 14, 14, 12, SSD1306_WHITE);
  display.fillRect(26, dinoY - 18, 8, 8, SSD1306_WHITE);
  if ((millis() / 80) % 2 == 1) display.fillRect(18, dinoY - 2, 3, 4, SSD1306_WHITE);
  else display.fillRect(24, dinoY - 2, 3, 4, SSD1306_WHITE);
  display.fillRect(cactusX, ground - cactusH, 5, cactusH, SSD1306_WHITE);
  display.fillRect(cactusX - 3, ground - cactusH + 4, 3, 3, SSD1306_WHITE);
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("DINO ");
  display.print(score);
  display.display();
  delay(40);
}
`;

const demoStar = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int paddle = 52;
int starX = 64;
int starY = 0;
int score = 0;
int miss = 0;
int drop = 2;
int dead = 0;
int armed = 1;
void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}
void loop() {
  int vol = analogRead(10);
  if (vol < 120) armed = 1;
  if (dead == 1) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > 240 && armed == 1) {
      paddle = 52;
      starX = 64;
      starY = 0;
      score = 0;
      miss = 0;
      drop = 2;
      dead = 0;
      armed = 0;
    }
    delay(40);
    return;
  }
  int target = vol / 4;
  if (target > 104) target = 104;
  paddle = paddle + (target - paddle) / 3;
  starY = starY + drop;
  if (starY > 66) {
    miss = miss + 1;
    starY = 0;
    starX = 8 + random(112);
    if (miss > 4) dead = 1;
  } else if (starY > 50 && starY < 62) {
    if (starX > paddle - 2 && starX < paddle + 26) {
      score = score + 1;
      starY = 0;
      starX = 8 + random(112);
      if (drop < 5 && score % 3 == 0) drop = drop + 1;
    }
  }
  int bar = vol / 24;
  if (bar > 40) bar = 40;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("STAR ");
  display.print(score);
  display.drawRect(80, 2, 44, 6, SSD1306_WHITE);
  display.fillRect(82, 4, bar, 2, SSD1306_WHITE);
  display.fillCircle(starX, starY, 3, SSD1306_WHITE);
  display.drawLine(starX, starY - 5, starX, starY + 5, SSD1306_WHITE);
  display.drawLine(starX - 5, starY, starX + 5, starY, SSD1306_WHITE);
  display.fillRect(paddle, 58, 24, 4, SSD1306_WHITE);
  display.drawLine(paddle, 58, paddle + 4, 54, SSD1306_WHITE);
  display.drawLine(paddle + 24, 58, paddle + 20, 54, SSD1306_WHITE);
  display.display();
  delay(40);
}
`;

const demoMole = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int hole = 1;
int shown = 1;
int t0 = 0;
int score = 0;
int miss = 0;
int dead = 0;
int armed = 1;
int flash = 0;
void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  t0 = millis();
}
void loop() {
  int vol = analogRead(10);
  int now = millis();
  if (vol < 120) armed = 1;
  if (dead == 1) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(22, 10);
    display.print("OH NO");
    display.setTextSize(1);
    display.setCursor(16, 36);
    display.print("SCORE ");
    display.print(score);
    display.setCursor(16, 50);
    display.print("CLAP");
    display.display();
    if (vol > 240 && armed == 1) {
      hole = 1;
      shown = 1;
      t0 = now;
      score = 0;
      miss = 0;
      dead = 0;
      flash = 0;
      armed = 0;
    }
    delay(40);
    return;
  }
  int life = 900;
  if (shown == 0) life = 320;
  if (now - t0 > life) {
    t0 = now;
    if (shown == 1) {
      shown = 0;
      miss = miss + 1;
      if (miss > 4) dead = 1;
    } else {
      shown = 1;
      int next = random(3);
      if (next == hole) next = (next + 1) % 3;
      hole = next;
    }
  }
  if (vol > 240 && armed == 1) {
    armed = 0;
    if (shown == 1) {
      score = score + 1;
      shown = 0;
      t0 = now;
      flash = 6;
      if (miss > 0) miss = miss - 1;
    } else {
      miss = miss + 1;
      if (miss > 4) dead = 1;
    }
  }
  int x0 = 22;
  int x1 = 64;
  int x2 = 106;
  int mx = x0;
  if (hole == 1) mx = x1;
  if (hole == 2) mx = x2;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("MOLE ");
  display.print(score);
  display.drawCircle(x0, 40, 12, SSD1306_WHITE);
  display.drawCircle(x1, 40, 12, SSD1306_WHITE);
  display.drawCircle(x2, 40, 12, SSD1306_WHITE);
  if (shown == 1) {
    display.fillCircle(mx, 36, 8, SSD1306_WHITE);
    display.fillCircle(mx, 28, 5, SSD1306_WHITE);
  }
  if (flash > 0) {
    display.setCursor(92, 0);
    display.print("HIT");
    flash = flash - 1;
  }
  display.display();
  delay(40);
}
`;

export function virtualSketch(code) {
  if (code.includes('GAME_DINO')) return demoDino;
  if (code.includes('GAME_STAR')) return demoStar;
  if (code.includes('GAME_MOLE')) return demoMole;
  if (/PIN_MIC_|setPins\s*\(\s*21\s*,\s*20/.test(code)) return demoMic;
  return demoBeep;
}
