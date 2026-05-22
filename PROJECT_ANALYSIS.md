# ScrollBoard 项目解析

## 项目概述

**ScrollBoard** 是一个基于 React + TypeScript 的**编程竞赛滚榜动画** Web 应用。用于在颁奖典礼等场合动态揭示 ACM/ICPC、IOI 等编程竞赛的最终排名结果。它支持 ICPC（ACM 赛制）和 IOI（OI 赛制）两种评分规则，具有自动/手动两种运行模式和丰富的动画效果。

- **在线 Demo:** [https://thinkspiritlab.github.io/ScrollBoard/](https://thinkspiritlab.github.io/ScrollBoard/?data-url=https://thinkspiritlab.github.io/ScrollBoard/data/test.json)
- **框架:** React 16 + TypeScript 3.9
- **UI 库:** Ant Design 4
- **脚手架:** Create React App

---

## 项目文件结构

```
ScrollBoard/
├── public/
│   └── index.html            # HTML 模板
├── data/
│   └── test.json             # 示例比赛数据
├── src/
│   ├── index.tsx             # 应用入口
│   ├── react-app-env.d.ts    # CRA TypeScript 类型声明
│   ├── serviceWorker.ts      # PWA Service Worker（CRA 默认生成）
│   └── app/
│       ├── App.tsx           # 根组件（状态机：加载 → 滚榜）
│       ├── App.css           # 全局样式（隐藏滚动条）
│       ├── Loader.tsx        # 数据加载器 & 参数配置面板
│       ├── Board.tsx         # 核心：排行榜展示 & 滚榜动画
│       ├── Board.css         # 排行榜样式
│       ├── dto.ts            # 数据传输对象（原始数据结构定义）
│       ├── vo.ts             # 视图对象（状态计算 & 揭示生成器）
│       ├── util.ts           # 工具函数（文件读取、延时、定时器）
│       └── effects.ts        # React 自定义 Hooks
├── package.json              # 项目依赖配置
├── tsconfig.json             # TypeScript 编译配置
├── yarn.lock                 # 依赖锁定文件
└── README.md                 # 项目说明
```

---

## 各文件详细解析

### 1. `public/index.html` — HTML 模板

由 CRA 生成的标准单页应用模板，只包含一个 `<div id="root"></div>` 挂载点。React 应用的全部内容都会被渲染到这个 div 中。

---

### 2. `src/index.tsx` — 应用入口

```typescript
ReactDOM.render(<App />, document.getElementById("root"));
serviceWorker.unregister();
```

- 将 `<App />` 根组件渲染到 `#root` 节点
- 调用 `serviceWorker.unregister()` 禁用离线缓存（开发阶段常用做法）

---

### 3. `src/serviceWorker.ts` — PWA Service Worker

CRA 脚手架自动生成的文件，提供离线缓存和渐进式 Web 应用能力。项目默认**未启用**（调用了 `unregister()`）。

---

### 4. `src/app/dto.ts` — 数据传输对象（DTO）

定义了从 JSON 反序列化的**原始数据结构**，是整个应用的数据核心：

| 类型 | 字段 | 说明 |
|------|------|------|
| `Contest` | `problems`, `teams`, `submissions` | 比赛整体数据 |
|  | `duration` | 比赛总时长（毫秒） |
|  | `penaltyTime` | 罚时（分钟） |
|  | `freezeTime` | 封榜时间（毫秒），此后的提交进入"未揭晓"状态 |
|  | `name` | 比赛名称 |
|  | `medal` | 奖牌设置（金/银/铜数量，可选） |
|  | `rule` | 比赛规则：`"icpc"`（默认）或 `"ioi"` |
| `Problem` | `id`, `tag`, `color`, `score` | 题目信息（标签如 A/B/C/D，颜色，分数） |
| `Team` | `id`, `name`, `userName`, `gender`, `wildcard` | 队伍信息（名称、用户名、性别、外卡标识） |
| `Submission` | `id`, `teamId`, `problemId`, `submitTime`, `accepted`, `score` | 提交记录（队伍、题目、时间、是否通过、得分） |

---

### 5. `src/app/vo.ts` — 视图对象 & 核心业务逻辑

这是整个项目的**核心逻辑文件**，包含三大块：

#### 5.1 类型定义

| 类型 | 说明 |
|------|------|
| `BoardOptions` | 面板配置项：`autoReveal`（自动运行）、`shiningBeforeReveal`（闪烁动画）、`speedFactor`（速度）、`darkMode`（暗黑模式） |
| `ContestState` | 比赛的运行时状态，包含所有 `TeamState`、首杀记录 `firstSolvers`、当前光标位置 `cursor` |
| `TeamState` | 单个队伍的状态：题目列表 `problemStates`、排名 `rank`、总分 `score`、总罚时 `penalty` |
| `ProblemState` | 单个题目的状态：`state`（当前状态）、已揭示/未揭示提交、最高分、通过次数/时间 |
| `ProblemStateKind` | 题目状态枚举：`Untouched`（未提交）、`Pending`（封榜等待揭示）、`Passed`（已通过）、`Failed`（未通过） |
| `HighlightItem` | 高亮项：当前正在揭示的 `teamId` + `problemId` |
| `RevealGen` | Generator 类型，用于逐步揭示封装期间的提交 |

#### 5.2 `calcContestState(data)` — 初始状态计算

根据原始比赛数据计算初始状态：

1. 将提交按时间排序，题目按标签排序
2. 为每支队伍初始化空状态
3. **遍历所有提交**，根据 `freezeTime` 分两路处理：
   - 封榜时间之前的提交 → 直接计算得分，更新排名
   - 封榜时间之后的提交 → 放入 `unrevealedSubmissions`，标记为 `Pending`（待揭示）
4. 调用 `calcRankInplace()` 计算初始排名
5. 返回含排名、首杀等信息的 `ContestState`

#### 5.3 `reveal(state)` — 揭示生成器（Generator）

这是滚榜动画的**核心逻辑**，使用 ES6 Generator 逐步揭示封榜后的提交：

- 从排名最后（`state.cursor.index`）的队伍开始，逐个向上揭示
- 每步 `yield` 一个 `HighlightItem`（高亮某个题目的格子）
- 再 `yield undefined`（展示得分结果）
- 再 `yield undefined`（排名变化动画阶段）
- 揭示逻辑：对某队伍的所有 `Pending` 题目，找出得分最高的未揭示提交，更新总分和排名

配合 `calcRankInplace()` 实现排名按得分 → 罚时 → ID 规则排序。

---

### 6. `src/app/util.ts` — 工具函数

| 函数 | 说明 |
|------|------|
| `readFile(file)` | 使用 `FileReader` 将 File 对象读为字符串 |
| `delay(ms)` | 返回一个在指定毫秒后 resolve 的 Promise |
| `runInterval(ms, f)` | 创建可停止的循环定时器，返回 `{ stop() }` |

---

### 7. `src/app/effects.ts` — React 自定义 Hooks

| Hook | 说明 |
|------|------|
| `useWindowResize()` | 监听窗口大小变化，返回 `{ width }`，用于响应式调整队伍名称列宽 |
| `useEventListener(type, f)` | 泛型事件监听 Hook，在 `useEffect` 中注册/注销 document 事件 |

---

### 8. `src/app/Loader.tsx` — 数据加载器 & 配置面板

#### 功能

- **数据加载（两种方式）：**
  1. 通过「加载数据」按钮选择本地 JSON 文件（使用隐藏的 `<input type="file">`）
  2. 通过 URL 参数 `?data-url=<URL>` 从远端加载 JSON（使用 `query-string` 解析）
- **加载后展示比赛概览**：比赛名称、时长、封榜时刻、题目/队伍/提交数量、各题目颜色标签
- **配置面板（Ant Design Form）：**
  - 自动运行开关（`autoReveal`）
  - 题目闪烁动画开关（`shiningBeforeReveal`）
  - 速度因子（`speedFactor`，0.1 ~ 10）
  - 暗黑模式开关（`darkMode`）
- 点击「开始」按钮后，将数据和配置传递给父组件，切换到滚榜视图

---

### 9. `src/app/Board.tsx` — 排行榜 & 滚榜动画

这是**最核心的 UI 组件**，展示排行榜并驱动整个滚榜过程。

#### 9.1 主要状态

| 状态 | 说明 |
|------|------|
| `state` | 比赛实时状态（`ContestState`） |
| `highlightItem` | 当前高亮的提交项 |
| `keyLock` | 按键锁（动画播放中锁定输入） |
| `autoReveal` | 是否自动运行 |
| `speedFactor` | 速度因子 |
| `focusIndex` | 当前聚焦的队伍索引 |

#### 9.2 `handleNextStep()` — 步进核心

每调用一次就推进滚榜一个步骤：

1. 调用 `revealGen.current.next()` 获取下一个揭示项
2. 如果有高亮项 → 锁定按键 → 闪烁动画 → 延时后自动继续下一步
3. 如果是结果展示步骤 → 短暂延时后继续下一步
4. 如果是排名变动步骤 → 等待 FlipMove 动画完成后解锁

#### 9.3 键盘 & 鼠标交互

| 操作 | 行为 |
|------|------|
| 鼠标单击 / `Enter` | 手动推进下一步 |
| `P` | 切换自动/手动运行模式 |
| `+` / `-` | 增减速度因子（步长 0.5） |
| `Ctrl` | 大步长改变速度因子（步长 3，超出最大值后回绕） |

#### 9.4 UI 结构

```
<StickyContainer>
  ├── <Sticky>            ← 粘性表头（滚动时固定在顶部）
  │   └── <table.board-head>
  │       └── 表头：Rank | Team | Score | 各题目列
  │
  ├── <FlipMove>          ← FlipMove 动画容器（处理排名变化时的平滑移动）
  │   └── 为每支队伍渲染一个 <table>
  │       ├── 排名（含外卡 `*` 标记）
  │       ├── 队伍名称（支持 Tooltip、认证名称、女性图标）
  │       ├── 总分 - 罚时
  │       └── 各题目状态格：
  │           ├── 绿色 = 通过（满分深绿，高分亮绿/黄/橙递减）
  │           ├── 红色 = 未通过
  │           ├── 蓝色 = 封榜 Pending
  │           ├── 深绿色（#006600）= 首杀
  │           └── 闪烁动画：高亮格使用 <Transition> 做淡入淡出
  │
  └── 底部 50vh 空白（方便滚动视口）
```

#### 9.5 辅助函数

- **`cvtColor(problem)`**：根据题目通过情况返回颜色
  - 满分 → `#33cc33`（亮绿）
  - 75%以上 → `#cccc00`（黄）
  - 60%以上 → `#cc9900`（橙）
  - 其他 → `#996600`（深黄）
- **`messageInfo(content)`**：底部弹出短暂提示（0.4 秒）

---

### 10. `src/app/App.tsx` — 根组件

作为应用状态机，只有两个状态：

- **`!running`**：显示 `Loader` 组件（数据加载页）
- **`data !== null && running`**：显示 `Board` 组件（滚榜页）

状态流转：`Loader` 加载数据 → 用户点击「开始」→ `App` 切换为 `Board` 视图。

---

### 11. `src/app/App.css` — 全局样式

- 隐藏滚动条（`scrollbar-width: none` + `::-webkit-scrollbar`）

### 12. `src/app/Board.css` — 排行榜样式

| 类名 | 说明 |
|------|------|
| `.team` | 普通队伍行，`preserve-3d` 以优化 3D transform |
| `.focused-team` | 当前聚焦队伍，提升 `z-index`，添加阴影 |
| `.info-message` | 提示信息定位在视口底部 |
| `.board-head` | 表头，大字号（`2em`），高 z-index |
| `.board-body` | 表格主体，`overflow-anchor: none` 防止滚动跳动 |

---

### 13. `data/test.json` — 示例比赛数据

一个包含约 200+ 支队伍、多个题目和大量提交记录的 ICPC 赛制比赛数据。包含 `teams[]`（队伍名、ID）、`problems[]`（题目标签、颜色）、`submissions[]`（提交时间、队伍、题目、是否通过）等字段。

---

### 14. `package.json` — 项目配置

**核心依赖：**

| 包 | 用途 |
|----|------|
| `react` / `react-dom` | React 框架 |
| `antd` + `@ant-design/icons` | UI 组件库 |
| `d3-array` | 数据结构工具（未被充分使用） |
| `react-flip-move` | 排名变化时的平滑位移动画 |
| `react-sticky` | 表头粘性定位 |
| `react-transition-group` | 题目格闪烁动画 |
| `query-string` | URL 参数解析 |
| `typescript` | 类型系统 |

**脚本命令**（CRA 标准）：`start` / `build` / `test` / `eject`

---

## 数据流总结

```
JSON 文件 / URL
    │
    ▼
Loader.tsx  (解析 JSON → dto.Contest)
    │
    ▼
App.tsx  (状态: data, options)
    │
    ▼
Board.tsx  (vo.calcContestState → ContestState)
    │
    ▼
vo.reveal(state)  ← Generator，每步 yield HighlightItem
    │
    ▼
handleNextStep()  ← 消费 Generator，驱动动画
    │
    ├── 高亮闪烁 (react-transition-group)
    ├── 结果展示
    └── 排名变动 (FlipMove 动画)
```

---

## 核心设计亮点

1. **Generator 驱动的步进引擎**：`reveal()` Generator 将复杂的多阶段揭示流程（高亮 → 展示结果 → 排名变化）拆分到独立的 `yield` 步骤，使得自动/手动模式可以共用同一套逻辑。

2. **双赛制支持**：`calcSubmissionScore()` 和 `findMaxScoreUnrevealedSubmission()` 分别处理 ICPC（只看是否通过）和 IOI（计算最大得分）的评分逻辑。

3. **封榜机制**：通过 `freezeTime` 分界线，封榜前的提交直接计入成绩，封榜后的提交进入 `unrevealedSubmissions` 队列，等待按排名反向逐个揭晓。

4. **动画编排**：`handleNextStep()` 内部通过 `async/await + delay()` 精确控制每一步的时间节奏，配合速度因子实现播放速率调节。

5. **粘性表头 + 居中滚动**：使用 `react-sticky` 固定表头，揭示时通过 `scrollIntoView({ behavior: "smooth" })` 自动将当前队伍滚动到视口中央。
