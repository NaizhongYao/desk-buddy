# Desk Buddy 部署说明

## 只有一套代码

教师版和学生版共用 `dist/`。先把功能做到教师版里，再推送到 GitHub Pages。学生打开公开链接时，页面会自动隐藏「连接板子」和「烧录」，其余课程、视频、知识库、示例都一样。

### 教师版（本地）
- **访问地址**：`http://127.0.0.1:4173/?teacher=1`
- **特点**：完整功能 + 连接板子 + 烧录
- **启动方式**：双击 `打开教师烧录台.cmd`

### 学生版（GitHub Pages，或本机预览）
- **本机预览**：`http://127.0.0.1:4173/`（不要加 `?teacher=1`）
- **公开地址**：GitHub Pages 链接
- **特点**：与教师版相同，只是没有连接板子 / 烧录

---

## 当前实现

### 版本检测逻辑（已在 `dist/app.mjs` 实现）

```javascript
const teacherStation = ['localhost', '127.0.0.1'].includes(location.hostname) 
  && new URLSearchParams(location.search).get('teacher') === '1';
```

- `localhost` 或 `127.0.0.1` + `?teacher=1` → 教师版
- 其他域名（如 GitHub Pages）→ 学生版

### 烧录按钮控制（已实现）

```javascript
if (!teacherStation) {
  for (const id of ['connect-board', 'disconnect-board', 'flash']) {
    $(id).hidden = true;
  }
}
```

---

## 部署到 GitHub Pages

### 1. 推送到 GitHub

```bash
cd "C:/Users/yaost/Desktop/我的_context_engineering/Agent Academy （重要）/Desk Buddy/virtual-lab"
git add .
git commit -m "更新课程系统和连通性测试"
git push origin main
```

### 2. GitHub Actions 自动发布

项目里的 `.github/workflows/publish-pages.yml` 会自动：
1. 监听 `main` 分支的推送
2. 构建 `dist` 目录
3. 发布到 GitHub Pages

### 3. 学生访问

学生访问 GitHub Pages 链接（例如：`https://username.github.io/desk-buddy/`）时：
- 自动识别为学生版
- 烧录按钮隐藏
- 可以保存 JSON、导出 .ino、复制代码
- 无法直接烧录硬件

---

## 测试检查清单

### 教师版测试
- [ ] `http://127.0.0.1:4173/?teacher=1` 显示烧录按钮
- [ ] 可以连接 ESP32
- [ ] 可以编译和烧录
- [ ] 三课程系统正常
- [ ] 连通性测试示例可用

### 学生版测试
- [ ] GitHub Pages 链接不显示烧录按钮
- [ ] 虚拟实验正常运行
- [ ] 可以保存作品（.json）
- [ ] 可以导出代码（.ino）
- [ ] 可以复制代码交给老师
- [ ] 三课程系统正常
- [ ] 连通性测试示例可用

---

## 当前状态

✅ **已完成**：
1. 版本检测逻辑
2. 烧录按钮隐藏控制
3. 三课程线性解锁系统
4. 实时接线错误反馈
5. 连通性测试示例

⏳ **待推送到 GitHub**：
- 将最新代码推送到 GitHub 仓库
- GitHub Actions 自动发布学生版

---

## 注意事项

1. **教师版只在本地运行**，不要把 `?teacher=1` 链接发给学生
2. **学生版链接可以公开分享**
3. 学生完成作品后，通过"交给老师"功能导出代码
4. 老师在教师烧录台接收学生的 `.ino` 文件并烧录
5. 确保 `.github/workflows/publish-pages.yml` 正确配置
