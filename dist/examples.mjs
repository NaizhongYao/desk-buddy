const oled = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}
`;

export const examples = {
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

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  pinMode(9, OUTPUT);
}

void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(20, 8);
  display.print("BEEP");
  display.fillRect(16, 40, 96, 10, SSD1306_WHITE);
  display.display();
  tone(9, 440);
  delay(350);
  noTone(9);

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

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Wire.begin(5, 4);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  int vol = analogRead(10);
  int w = vol / 9;
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
  delay(80);
}
`,

  voice_light: `#include <Wire.h>
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
  display.print("CLAP");
  display.drawRect(4, 22, 120, 24, SSD1306_WHITE);
  display.fillRect(6, 24, w, 20, SSD1306_WHITE);
  display.display();

  if (vol > 200) {
    digitalWrite(8, LOW);
    delay(400);
    digitalWrite(8, HIGH);
  }
  delay(40);
}
`
};
