## Transform 层完整测试计划

---

### 一、测试文件与分工

```
transform
└── __tests__
    ├── guards.test.ts            # 节点类型判断
    ├── text.test.ts              # 文本提取
    ├── block-factory.test.ts     # mdast 节点 → Block
    ├── section-factory.test.ts   # Section 创建
    ├── collector.test.ts         # definition  footnote 收集
    ├── recursion.test.ts         # 容器互递归（核心）
    ├── builder.test.ts           # 主循环（核心）
    ├── invariants.test.ts        # 不变量
    ├── edge-cases.test.ts        # 边界
    └── integration.test.ts       # 完整文档
```

---

### 二、guards.test.ts

覆盖目标：100% 行、分支、函数

 编号  测试用例  预期 
---------------------
 G01  isHeading 对 heading 节点返回 true  true 
 G02  isHeading 对不同 depth（1-6）都返回 true  true 
 G03  isHeading 对非 heading 节点返回 false  false 
 G04  isHeading 对 nullundefined 返回 false  false 
 G05  isList 对有序列表返回 true  true 
 G06  isList 对无序列表返回 true  true 
 G07  isList 对非 list 返回 false  false 
 G08  isBlockquote 正确识别  truefalse 
 G09  isTable 正确识别  truefalse 
 G10  isDefinition 正确识别  truefalse 
 G11  isFootnoteDefinition 正确识别  truefalse 
 G12  isFootnoteReference 正确识别  truefalse 
 G13  isFrontmatter 识别 yaml  true 
 G14  isFrontmatter 识别 toml  true 
 G15  isFrontmatter 对普通 code 节点返回 false  false 
 G16  所有 guard 接受标准 mdast 节点格式  不抛异常 

---

### 三、text.test.ts

覆盖目标：100%

 编号  测试用例  预期 
---------------------
 T01  提取 heading 纯文本（单层 text）  正确文本 
 T02  提取 heading 纯文本（含 inline 格式如 boldcode）  去格式纯文本 
 T03  提取 heading 纯文本（含 link）  保留链接文字 
 T04  提取段落纯文本  正确文本 
 T05  提取 listItem 第一段为 title  第一段文本 
 T06  listItem 无段落时取 checkbox 文本  checkbox 文本 
 T07  listItem 无段落无 checkbox 返回空字符串   
 T08  提取 blockquote 第一段前 50 字符  截断文本 
 T09  blockquote 第一段不足 50 字符  全部文本 
 T10  blockquote 为空返回空字符串   
 T11  blockquote 含 某某说： 模式提取人名（可选）  人名 

---

### 四、block-factory.test.ts

覆盖目标：100%

 编号  测试用例  预期 
---------------------
 B01  heading 节点转 Block  type=heading, 保留 depth 
 B02  paragraph 节点转 Block  type=paragraph 
 B03  code 节点转 Block  type=code, 保留 lang 和 value 
 B04  table 节点转 Block  type=table 
 B05  html 节点转 Block  type=html 
 B06  thematicBreak 转 Block  type=thematicBreak 
 B07  image 节点转 Block  type=image, 保留 urlalt 
 B08  math 节点转 Block  type=math 
 B09  未知 type 节点转 raw Block  type=unknown, originalType 保留原 type, raw 保留原始节点 
 B10  生成的 Block 有唯一 id  id 是字符串 
 B11  生成的 Block 保留 position（可选）  position 存在 

---

### 五、section-factory.test.ts

覆盖目标：100%

 编号  测试用例  预期 
---------------------
 S01  createRootSection  kind=root, depth=0, title=, titleKind=synthetic, children=[], items=[], footnotes=[], definitions=[] 
 S02  createHeadingSection  kind=heading, depthheadingDepth 等于传入值, titleKind=explicit, titleAst 保留 
 S03  createHeadingSection depth=1  depth=1, headingDepth=1 
 S04  createHeadingSection depth=3  depth=3, headingDepth=3 
 S05  createFrontmatterSection  kind=frontmatter, depth=0, titleKind=synthetic 
 S06  createListItemSection（无序）  kind=listItem, depth=parent+1, ordered=false, checked=null 
 S07  createListItemSection（有序）  ordered=true, start 保留 
 S08  createListItemSection（任务列表已勾选）  checked=true 
 S09  createListItemSection（任务列表未勾选）  checked=false 
 S10  createListItemSection index 正确  index 等于传入值 
 S11  createListItemSection listDepth 正确  listDepth 等于传入值 
 S12  createBlockquoteSection  kind=blockquote, depth=parent+1, quoteDepth 正确, titleKind=derived 
 S13  createFootnoteSection  kind=footnote, depth=0, titleKind=explicit 

---

### 六、collector.test.ts

覆盖目标：100%

 编号  测试用例  预期 
---------------------
 C01  收集单个 definition  root.definitions 长度 1 
 C02  收集多个 definition（不同 identifier）  全部收集 
 C03  相同 identifier 的 definition 全部收集  数组保留全部，不去重，顺序保持出现顺序 
 C04  definition 字段：identifier  url  title  position  都保留 
 C05  收集 footnoteDefinition 产生 Section  root.footnotes 长度正确 
 C06  记录 footnoteReference  记录 identifier  sectionId  blockId 
 C07  无 definition 的文档  root.definitions 为空数组 
 C08  无 footnote 的文档  root.footnotes 为空数组 
 C09  无 footnoteReference 的文档  root.footnoteRefs 为空数组 
 C10  容器内 definition 也被收集  同样在 root.definitions 中 

---

### 七、recursion.test.ts（核心）

覆盖目标：100%

#### listItemToSection

 编号  测试用例  预期 
---------------------
 R01  简单 listItem（一段落）  kind=listItem, title=段落文本, items 含 1 个 block 
 R02  listItem 内多段落  items 含 2+ block 
 R03  listItem 内代码块  items 含 code block 
 R04  listItem 内嵌套子列表（1层）  children 含 1 个 listItem Section, items 含对应 section 
 R05  listItem 内嵌套子列表（2层）  递归两层都展开 
 R06  listItem 内 blockquote  调 blockquoteToSection，产出 blockquote Section 在 children 和 items 中 
 R07  listItem 内 heading  heading 作为 Block（type=heading），items 中为 block 类型 
 R08  listItem 内 heading 不影响外层栈  递归返回后外层逻辑不受影响 
 R09  listItem 内 definition  不在 items 中 
 R10  listItem 内 definition 不破坏顺序  跳过 definition 后 items 顺序为 [before段落, after段落] 
 R11  definition 在 listItem 前后：`- before n [foo] url n after`  items=[blockbefore, blockafter], definition 被全局收集 
 R12  空 listItem  items=[], title= 
 R13  任务列表 checked=true  checked=true 
 R14  任务列表 checked=false  checked=false 
 R15  有序列表 ordered=true, start 保留  字段正确 
 R16  listItem index 正确  第一个=0 
 R17  listItem listDepth 正确  顶层=1，嵌套=2 

#### blockquoteToSection

 编号  测试用例  预期 
---------------------
 R18  简单 blockquote（一段落）  kind=blockquote, items 含 1 个 block 
 R19  blockquote 内多段落  items 含 2+ block 
 R20  blockquote 内嵌套 blockquote（1层）  children 含 1 个 blockquote Section 
 R21  blockquote 内嵌套 blockquote（2层）  递归两层都展开 
 R22  blockquote 内 list  调 listItemToSection，产出 listItem Section 
 R23  blockquote 内 heading  heading 作为 Block（type=heading），items 中是 block 类型 
 R24  blockquote 内 heading 不提升  递归返回后不出现全局 heading Section 
 R25  blockquote 内 definition  不在 items 中 
 R26  空 blockquote  items=[], title= 
 R27  quoteDepth 正确  顶层=1，嵌套=2 

#### 互递归组合

 编号  测试用例  预期 
---------------------
 R28  listItem 内 blockquote 内 list  三层全展开 
 R29  blockquote 内 listItem 内 blockquote  三层全展开 
 R30  listItem 内 blockquote 内 listItem 内 blockquote  四层全展开 
 R31  互递归不产生循环调用  不栈溢出 

---

### 八、builder.test.ts（核心）

覆盖目标：≥95%

#### 基础构建

 编号  测试用例  预期 
---------------------
 U01  空文档  只有 root Section, items=[], children=[] 
 U02  单段落  root.items 含 1 个 block 
 U03  单标题 + 单段落  root.children 含 1 个 heading Section，其 items 含段落 block 
 U04  多级标题正常嵌套（# → ## → ###）  depth 正确嵌套 
 U05  标题跳级（# → ### 跳过 ##）  不崩溃，### 挂到 # 下，depth=3 
 U06  同级标题并列  ## 后 ## 并列在同一个 # 下 

#### 容器

 编号  测试用例  预期 
---------------------
 U07  顶层无序列表  root.children 含 listItem Section 
 U08  顶层有序列表  listItem.ordered=true 
 U09  列表嵌套（3层）  全部展开 
 U10  标题下列表  列表挂到标题 Section 
 U11  顶层引用块  root.children 含 blockquote Section 
 U12  引用块嵌套（3层）  全部展开 

#### 容器互递归

 编号  测试用例  预期 
---------------------
 U13  标题下 listItem 内 blockquote  展开为 section 
 U14  标题下 blockquote 内 list  展开为 section 
 U15  三层交叉嵌套  全部展开 

#### 容器内 heading 降级且不影响外层栈（强断言）

 编号  测试用例  预期 
---------------------
 U16  `# A n - item n ## Fake n inside n after n ## B`  Fake 是 listItem.items 里的 heading Block 
 U17  同上  after 仍属于 # A 
 U18  同上  B 是 # A 的子 heading Section 
 U19  blockquote 内 heading 后跟段落  段落仍在 blockquote 的 items 中 
 U20  blockquote 内 heading 后出 blockquote 跟顶层段落  顶层段落归属外层 heading 
 U21  脚注内 heading  作为 Block，不影响外层 

#### 特殊节点

 编号  测试用例  预期 
---------------------
 U22  frontmatter  root.children 含 frontmatter Section 
 U23  表格  作为单 Block 在 items 中 
 U24  HTML  作为单 Block 
 U25  数学公式  作为 Block 
 U26  水平分割线  作为 Block 
 U27  图片  作为 Block 
 U28  unknown node  作为 raw Block，type=unknown，originalType 保留 

#### 全局收集

 编号  测试用例  预期 
---------------------
 U29  顶层 definition 收集  root.definitions 含定义 
 U30  容器内 definition 也收集  root.definitions 含定义 
 U31  顶层和容器内 definition 混合  全部收集，顺序保持出现顺序 
 U32  相同 identifier 的 definition  全部保留，不去重 
 U33  footnoteDefinition 进 root.footnotes  root.footnotes 长度正确 
 U34  脚注内容有段落  footnote Section 的 items 含段落 block 
 U35  脚注内容有列表  递归展开 
 U36  脚注内容有引用块  递归展开 

#### 顺序保持

 编号  测试用例  预期 
---------------------
 U37  段落-列表-段落  items = [block, section, block] 
 U38  列表-引用块-段落  items = [section, section, block] 
 U39  标题下：段落-列表-代码-段落  items 类型序列正确 
 U40  嵌套容器内部顺序  正确 

#### 空白处理

 编号  测试用例  预期 
---------------------
 U41  标题后紧跟同级标题  前一个 Section.items=[] 
 U42  空 listItem  items=[] 
 U43  空 blockquote  items=[] 
 U44  文档末尾空标题  items=[] 

---

### 九、invariants.test.ts（不变量）

覆盖目标：100%

#### childrenitems 双向一致性

 编号  测试用例  预期 
---------------------
 I01  children 中每个 Section 在 items 中出现恰好一次（type=section）  递归验证 
 I02  items 中每个 type=section 的项在 children 中出现恰好一次  递归验证 
 I03  children 和 items 中 section 顺序一致  遍历比对 
 I04  根节点满足双向一致性  通过 
 I05  任意 heading Section 满足  通过 
 I06  任意 listItem Section 满足  通过 
 I07  任意 blockquote Section 满足  通过 

#### 元信息完整性

 编号  测试用例  预期 
---------------------
 I08  所有 Section 有唯一 id  收集所有 id，无重复 
 I09  所有 Section 有 kind  非空 
 I10  所有 Section 有 depth  数字 
 I11  heading 子节点：child.depth  parent.depth  条件断言 
 I12  listItem 子节点：child.depth = parent.depth + 1  条件断言 
 I13  blockquote 子节点：child.depth = parent.depth + 1  条件断言 
 I14  root 的直接子节点：depth=0(frontmatter) 或 depth=1(其他)  条件断言 
 I15  heading Section 有 headingDepth  1-6 
 I16  listItem Section 有 listDepth  数字 
 I17  blockquote Section 有 quoteDepth  数字 
 I18  titleKind 与 kind 匹配  headingfootnote→explicit, listItemblockquote→derived, rootfrontmatter→synthetic 

#### 不可变性

 编号  测试用例  预期 
---------------------
 I19  转换前后原始 AST 不变  deep equal 
 I20  原始 AST 的 children 不变  无增删改 
 I21  原始 AST 节点 position 不变  字段值相同 
 I22  新树不持有原始 AST 可变引用  修改新树不影响原始 AST 

---

### 十、edge-cases.test.ts（边界）

覆盖目标：100%

 编号  测试用例  预期 
---------------------
 E01  空文档（root.children=[]）  返回 root Section，不崩溃 
 E02  只有文本无标题  内容挂 root.items 
 E03  顶层无标题：段落+列表+引用块  全部挂 root，顺序正确 
 E04  顶层无标题：子节点 depth 正确  depth=1（listItemblockquote）或 depth=0（frontmatter） 
 E05  10 层嵌套标题  全部展开，不栈溢出 
 E06  10 层嵌套列表  全部展开，不栈溢出 
 E07  10 层嵌套引用块  全部展开，不栈溢出 
 E08  标题 depth=6 后跟 depth=1  正确弹栈 
 E09  标题 depth=1 后跟 depth=6  正确嵌套 
 E10  unknown node（自定义 type）  不崩溃，保留为 raw Block，type=unknown 
 E11  unknown node 不破坏 items 顺序  其他节点顺序不变 
 E12  超大文档（5000+ 节点）  不崩溃，不超时 
 E13  纯脚注文档（无正文）  root.children 为空或只有 root，footnotes 有内容 
 E14  纯 definition 文档  root.definitions 有内容，不崩溃 
 E15  definition 在容器内且不占 items 位置：`- before n [foo] url n after`  listItem.items=[blockbefore, blockafter] 

---

### 十一、integration.test.ts（集成）

覆盖目标：完整场景

 编号  测试用例  预期 
---------------------
 INT01  解析后直接传给 buildSectionTree  不崩溃 
 INT02  完整文档含：frontmatter + 多级标题 + 列表 + 引用 + 表格 + 代码 + 脚注 + definition  结构正确 
 INT03  所有 Section 的 id 唯一  收集后去重，数量相等 
 INT04  所有 depth 层级合理（条件断言）  heading 子节点 depth  父，listItemblockquote 子节点 depth = 父 + 1 
 INT05  根 Section 结构完整  children  items  footnotes  definitions 都存在 
 INT06  容器互递归在真实文档中正确  检查嵌套结构 
 INT07  容器内 heading 在真实文档中降级  检查不出现全局 heading Section 
 INT08  同一输入重复转换，忽略 id 和 position 后结构快照一致  kindtitleitems 类型序列children 结构一致 
 INT09  TOC 生成的列表按普通 list 处理，转为 listItem Section  树中出现 listItem Section 
 INT10  复杂文档转换结果可序列化  JSON.stringify 不报错 
 INT11  容器内 heading 不影响外层栈（完整文档验证）  # A → ## Fake 在容器内 → 后续内容归属 A → ## B 是 A 的子标题 

---

### 十二、覆盖率汇总

 文件  目标覆盖率  用例数 
-------------------------
 guards.ts  100%  16 
 text.ts  100%  11 
 block-factory.ts  100%  11 
 section-factory.ts  100%  13 
 collector.ts  100%  10 
 recursion.ts  100%  31 
 builder.ts  ≥95%  44 
 invariants.test.ts  -  22 
 edge-cases.test.ts  -  15 
 integration.test.ts  -  11 
 总计  ≥90% 整体行覆盖率  ~184 

---

### 十三、不测内容

- position  offset 精确值（mdast 自带）
- 性能基准（另做性能测试）
- unified 插件行为（parser 层测）
- 哈希计算（hasher 层测）
- UI 渲染
- 具体 diff 算法（differ 层测）
- definition 去重逻辑（留给 resolver 层）

---
所有 Markdown 字符串测试必须写成 CommonMarkGFM 能实际解析出目标嵌套结构的形式；容器内节点必须正确缩进。