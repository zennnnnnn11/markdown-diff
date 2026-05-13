# MarkdownDiff 引擎完整管道

## 设计哲学

**宁可少识别语义操作，也不错误识别语义操作。**

用户对 diff 的容忍度差异巨大：将 move 显示为 delete+insert 可以接受，将不相关段落错误显示为 move 很难接受；将 rename 显示为 replace 可以接受，将无关 heading 错配成 rename 很难接受。

因此本方案遵循三个核心原则：

1. **确定性优先**：匹配必须满足唯一性和上下文约束，不确定时降级为 replace/insert/delete。
2. **锚点驱动**：从确定锚点出发逐层扩散对齐，不做全局模糊竞争。
3. **语义操作后置**：move、rename、meta-update 不是在匹配阶段猜测，而是在已生成基础变更后从已有结果中恢复。

---

## 核心概念定义

### MatchPair（匹配对）
两个节点被确定为同一语义实体的高置信度匹配。用作递归对齐的锚点、move/rename 恢复的强依据。只有满足严格唯一性和上下文约束才建立。pairKind='match'。

### AlignedPair（对齐对）
局部序列对齐产生的 delete+insert 合并项（即 replace）。不证明两者是同一语义节点，但类型一致、位置对应、相似度达到门檻。用于计算 inline diff、meta-update 候选、rename 候选。pairKind='align'。

### MovePair（移动对）
从 delete/insert 对中通过强证据恢复的语义移动匹配。一旦确认即升级为 MatchPair 级别（pairKind 从 'move' 变为 'match'，matchKind 保留 move-exact / move-direct / move-heading / move-code 以追溯其来源）。在状态转换中，MovePair 是 MatchPair 的子类。

### 关键区别
MatchPair 是"这确定是同一个东西"，AlignedPair 是"它们在同一位置，类型相同，可能是同一个东西"。步骤 6 的 rename/meta-update 恢复同时检查 MatchPair 和 AlignedPair，而步骤 5 的 move 恢复不依赖 AlignedPair，只在 delete/insert 子树之间寻找 exact hash、唯一 identity 或强上下文证据，一旦成立则生成 MatchPair 级别的语义配对。

---

## Pair 状态机

```
Unpaired old/new
  → AlignedPair        // 同父 delete+insert 合并（步骤 2.4）
  → MatchPair          // exact hash / identity / local strong match（步骤 1 / 步骤 3）
  → MovePair           // delete+insert 强证据 move 恢复（步骤 5）
    → MatchPair        // MovePair 确认后立即升级为 MatchPair

AlignedPair (pairKind='align')
  → MatchPair          // rename/meta-update 高置信度确认（步骤 6）
    pairKind 从 'align' 变为 'match'
    isAlignedPair 从 true 变为 false
    isMatchPair 从 false 变为 true
  → remain AlignedPair // 不满足升级条件，保留为 replace
```

**状态转换规则**：

1. 一个节点只能处于一种配对状态：未配对、AlignedPair、MatchPair。
2. AlignedPair 可以升级为 MatchPair，升级后 isAlignedPair=false, isMatchPair=true, pairKind 从 'align' 变为 'match'，对应的 pairKey 键前缀同步更新。
3. MatchPair 不可降级为 AlignedPair。
4. MovePair 在步骤 5 创建时为临时状态，在同一个步骤内立即完成向 MatchPair 的转换。对外部步骤（步骤 6-10）而言，MovePair 始终表现为 MatchPair（isMatchPair=true）。
5. pairKind 长期只保留两种状态：'match' 和 'align'。move 不是独立的 pairKind——move 始终表达为 pairKind='match'，通过 matchKind 前缀（move-exact / move-direct / move-heading / move-code）和 logicalMoveId 字段表达移动语义。

---

## 管道全景

旧新两棵由 Transformer 产出的深度嵌套 Section/Block 语义树，经过十个步骤产出用户可见的语义差异对比界面。

**输入数据结构**：每棵树包含 root Section，其 items 数组按文档原始顺序混合存放 Block 和 Section。root.definitions 存放全局链接引用定义，root.footnotes 存放全局脚注定义。Section 有 kind（root/heading/frontmatter/listItem/blockquote/footnote），Block 有 type（paragraph/code/table/math/html/yaml/toml/definition 等）。Section.items 即文档顺序的完整子元素列表，Section.children 是其 Section 子集的投影，仅用于快速树遍历。旧树和新树的 id 各自独立生成，不存在语义对应关系。

---

## 步骤 0：节点模型统一化、索引构建、Root 强制匹配

### 0.1 定义 DiffNode 统一包装类型

Section 用 kind 区分语义，Block 用 type 区分语义。定义 DiffNode 统一包装，entity 字段取 'section' 或 'block'，后续所有操作统一用 entity 判断节点大类，用 kind/blockType 做细类匹配。DiffNode 持有对原始节点的只读引用，不修改原始数据。

### 0.2 构建单棵树的 SemanticIndex

**核心规则：结构遍历只走 items，不走 children。** Transformer 设计保证 items 是完整顺序数组，children 只是 Section 投影。如果同时走两个，同一 Section 会被访问两次，导致 preorder 序号错位、subtreeSize 翻倍、parent 重复写入。

**DFS 遍历构建索引**：

以 root Section 为起点，定义 getLogicalChildRaws 函数获取逻辑子节点：普通 Section 返回其 items 数组；root Section 额外处理 definitions 和 footnotes——

**definitions 和 footnotes 的防重与命名空间规则**：
- 如果 definitions/footnotes 已在 root.items 中（由 Transformer 放入），则不再追加为虚拟节点。
- 如果以虚拟节点追加，使用合成 id 命名空间（如 `synth:def:old:N`、`synth:fn:old:N`），确保不与真实节点 id 冲突。
- definitions 追加为虚拟 Block 节点（entity='block', blockType='definition'）。
- footnotes 追加为虚拟 Section 节点（entity='section', kind='footnote'）。

遍历过程中为每个节点注册：byId（id→DiffNode 映射）、parent（父子关系）、preorder（前序遍历序号）、subtreeSize（子树大小）。按 entity 和 kind/blockType 分组建立 byKind、byBlockType、byHeadingDepth 索引。计算 sourceRange：Block 直接取原始 position，Section 在递归完子节点后取 heading position 与所有子节点 sourceRange 的并集。

**处理 Section 特有属性**（仅 heading 类型）：

- 标题文本提取后执行 Unicode NFKC 规范化 → 小写 → 去除编号前缀（含年份启发式：4 位数字在 1900–2100 间不剥除；罗马数字和阿拉伯数字规则加强边界要求）
- 生成 slug：保留所有 Unicode 字符（使用 property escapes），统一分隔符
- tokenize：使用 Intl.Segmenter（词粒度，locale 依据文档语言标记或自动检测）进行分词；如果 Intl.Segmenter 不可用，回退到 ICU 词边界迭代器；如果 ICU 也不可用，回退到以下规则：英文按 word boundary（不去停用词，不去 not/no/without），中文按 2-gram（单字退化为 unigram），日文假名同理，数字序列保留原样，标点空白丢弃
- 沿 parent 链收集各级 heading 标题形成 pathParts，计算 pathHash

**DFS 完成后计算分层哈希**（按后序遍历顺序，先子后父）：

**哈希算法规格**：

- **selfHash / directHash / subtreeHash / identityHash / contentOnlyHash / headingBodyHash**：统一使用 **xxHash3-128**，输入为 **canonical JSON** 序列化后的字节串。Canonical JSON 对齐 RFC 8785 JCS 风格：字段按 ASCII 字典序递归排序，所有字符串使用 UTF-8，数字按 JSON 规范序列化（不保留 trailing zeros，整数不带小数点），不包含任何跨树不可比字段（id、position、treeDepth 等）。
- **textSimHash**：使用 **Charikar SimHash-64**，输入为分词后的 token 集合。
- **所有 canonical serialization 必须字段顺序稳定，且不包含 id、position、treeDepth 等跨树不可比字段。**

各哈希定义：

- **selfHash**：节点自身语义的哈希。Section 剔除 id、depth、treeDepth、position 等不可跨树比较字段，保留 kind、title、headingDepth、listDepth、quoteDepth、checked、ordered、identifier（footnote 的标识符、definition 的标识符均参与 selfHash，因为它们是节点身份的一部分）；Block 剔除 id、position，保留 type、value、lang、meta、checked、identifier 及 children 的完整 canonical inline AST。绝对不把任何跨树不可比的 id 放入哈希输入。Block 的 selfHash 必须包含完整 inline 语义：link URL 变化、emphasis/strong 切换、inlineCode 变化都会改变 selfHash。

- **subtreeHash**：以自身为根的整个子树的哈希。Section 用 selfHash 与其所有逻辑子节点的 subtreeHash 按序拼接后做 xxHash3-128；Block 的 subtreeHash 等于 selfHash。

- **directHash**：自身加直接子节点的哈希。Section 用 selfHash 与所有逻辑子节点的 selfHash 按序拼接后做 xxHash3-128；Block 的 directHash 等于 selfHash。

- **identityHash**：用于语义身份识别，弱化可变身份字段。
  - **Section 的 heading**：identityHash 等同于 selfHash。heading 的 title 是核心身份，不可剔除，因此 identityHash 与 selfHash 一致。
  - **Section 的 footnote**：剔除 identifier 字段，仅保留正文内容的哈希。
  - **Block 的 definition**：剔除 identifier 字段，仅保留 url/title/label 的哈希。
  - **其他类型**：等同 selfHash。

- **headingBodyHash**：专用于 heading rename 判断。仅在节点 entity='section' 且 kind='heading' 时计算。定义为：取 heading 下所有子节点（不含自身标题文本）的语义哈希。计算方式：将此 heading Section 的所有逻辑子节点（items）的 subtreeHash 按序拼接，连同 headingDepth、listDepth、quoteDepth 等结构属性一起做 xxHash3-128。如果 heading Section 没有子节点，则 headingBodyHash 为一个仅基于结构属性的固定哈希。headingBodyHash 不包含标题文本，因此标题变化时 headingBodyHash 保持不变，而 selfHash/identityHash 会变化。该字段在其他节点类型上为空。

- **contentOnlyHash**：纯文本内容的哈希，仅用 extractText 的文本做 xxHash3-128。用于检测"代码内容相同但 lang/meta 不同""段落文字相同但格式不同"等场景。

**构建倒排索引**：bySelfHash、bySubtreeHash、byDirectHash、byIdentityHash、byHeadingBodyHash。

**textSimHash**：对每个节点提取文本，使用 Intl.Segmenter 分词（回退策略同 heading tokenize），同时扫描 inline children 提取结构化 token（链接 URL、图片 URL/alt、引用标识符等），合并后使用 Charikar SimHash 算法生成 64 位指纹。空 token 节点标记为跳过。SimHash 仅作为候选召回辅助，不做匹配决策。

**反向引用索引**：扫描所有 Block 的 inline children 和 heading Section 的标题块 inline children，建立 backlinks.footnotes 和 backlinks.definitions。identifier 规范化规则：trim → 多空白收为单空格 → 小写。

### 0.3 强制 Root 匹配

旧新树必然各有一个 kind='root' 的 Section，语义上一定对应。将 oldRoot.id 和 newRoot.id 标记为 MatchPair，matchKind='forced-root'，作为整棵树骨架的确定起点。root 匹配只表示"这两个 root 对应"，内容差异由后续 siblingAlign 正常比较。

### 0.4 节点集合管理

建立三类集合：allOldIds / allNewIds（全部节点）、matchedOldSet / matchedNewSet（已匹配节点）、unmatchedOldSet / unmatchedNewSet（尚未匹配节点）。匹配一旦建立就从 unmatched 中移除。**本方案只有一种匹配状态：已匹配（MatchPair）。不存在 tentative、locked、available 等中间状态。** 匹配必须满足唯一性和上下文约束，不满足则不匹配。

### 0.5 Pair Key 机制

所有配对（无论 MatchPair 还是 AlignedPair）都使用统一的 pairKey 格式，通过 pairKind 前缀区分类型：

```
pairKind: 'match' | 'align' | 'move'（move 仅步骤 5 内部临时使用）
pairKey:  "{pairKind}:{oldId}:{newId}"
```

- **MatchPair**：pairKind='match'，pairKey="match:{oldId}:{newId}"
- **AlignedPair**：pairKind='align'，pairKey="align:{oldId}:{newId}"
- **MovePair**（步骤 5 临时状态）：pairKind='move'，pairKey="move:{oldId}:{newId}"。升级为 MatchPair 后，pairKind 变为 'match'，pairKey 同步更新为 "match:{oldId}:{newId}"。

logicalMoveId 保持独立，格式为 "move:{oldId}:{newId}"，用于 move 统计和渲染时的 source/target 关联，与 pairKey 不冲突。

pairKey 用于后续序列对齐的 token 投影、move 恢复的实体标识、以及渲染时的 key 生成。在整个管道中，pairKey 是连接旧新两侧节点的唯一桥梁。

---

## 步骤 1：确定性锚点匹配

### 1.1 匹配层级总则

锚点匹配只接受同时满足以下所有条件的配对：

1. **类型一致**：entity 相同，Section 的 kind 相同，Block 的 blockType 相同。
2. **唯一性成立**：在各自树中，当前哈希值只对应唯一节点（一对一）。
3. **父上下文一致**：如果双方父节点都已匹配，则父节点必须互为匹配对；如果一方父节点未匹配但另一方已匹配，则需要检查局部位置合理性。

不满足任一条件则不建立匹配，留给后续步骤处理。

### 1.2 第一优先级：subtreeHash 完全匹配

在整个子树完全不变时，subtreeHash 是最高确定性信号。

对两棵树中共享同一 subtreeHash 且两侧都唯一的节点对，直接建立 MatchPair（matchKind='exact-subtree'）。这表示整个子树内容完全相同。

**最大覆盖规则**：如果某个 exact-subtree MatchPair 已覆盖某子树，其 descendants 中如有 exact-subtree 匹配请求，在匹配层不再建立独立 MatchPair（因为它们已经隐含在祖先的 exact-subtree 中）。渲染层可以按需展开 descendants 生成 equal rows，但匹配层不为此创建独立锚点。渲染时以最顶层 exact-subtree 为准，标记整个子树为 equal 并折叠。

### 1.3 第二优先级：selfHash 匹配

节点自身未变但子节点有变化时，selfHash 是最可靠的锚点。

对两侧都唯一共享同一 selfHash 的节点对，检查父上下文：

- 双方 parent 都已匹配且互为 MatchPair → 直接建立 MatchPair（matchKind='exact-self'）
- 一方或双方 parent 未匹配 → 检查 preorder 位置：两侧在各自 sibling 中的相对位置偏移 ≤ 3 且在局部窗口内（前后共 5 个 sibling 的 selfHash 至少有一对也匹配）→ 建立 MatchPair（matchKind='exact-self-with-context'）
- 否则不建立匹配

### 1.4 第三优先级：directHash 匹配

仅对 Section 类型且两侧都唯一共享同一 directHash 的节点对，按与 selfHash 相同的规则检查父上下文。满足条件则建立 MatchPair（matchKind='exact-direct'）。directHash 匹配的置信度略低于 selfHash，但对于只有子节点顺序调整的 Section 有良好召回。

### 1.5 Frontmatter 结构锚点

如果旧新树都恰好各有一个 kind='frontmatter' 的 Section，直接建立 MatchPair（matchKind='frontmatter-anchor'）。这仅表示"这两个 frontmatter 区域对应"，不等价于内容相同。

### 1.6 Footnote 身份锚点

对两侧都唯一共享同一 identityHash 的 footnote Section 对（identityHash 剔除 identifier，只保留正文内容），建立 MatchPair（matchKind='footnote-identity'）。此匹配不要求 identifier 相同——这正是它能捕获 identifier 重命名的原因。

### 1.7 Definition 身份锚点

对两侧都唯一共享同一 identityHash 的 definition Block 对（identityHash 剔除 identifier，只保留 url/title/label），建立 MatchPair（matchKind='definition-identity'）。此匹配不要求 identifier 相同。

### 1.8 防误配规则

上述匹配全部执行后，进行一次全局去重检查：如果任一节点出现在多个 MatchPair 中，只保留 matchKind 优先级最高的匹配（优先级从高到低：subtreeHash > selfHash > directHash > footnote-identity > definition-identity > frontmatter-anchor），同优先级的则都放弃匹配（因为无法确定哪一个正确）。

---

## 步骤 2：从 Root 递归执行同父序列对齐

### 2.1 核心原则

序列对齐只在**父节点已经建立 MatchPair**的前提下，对两个父节点的逻辑子节点列表做局部对齐。不做全局跨父节点的自由竞争。

### 2.2 投影对齐 Token

对旧父节点和新父节点的 items 分别投影为可比 token：

- 如果子节点在 matched 集合中，且属于当前父节点下的某个 MatchPair → token 为 `MATCHED:{pairKey}`。pairKey 来自 MatchPair，此时 pairKind='match'，pairKey 格式为 "match:{oldId}:{newId}"。
- 如果子节点未匹配 → token 为 `SELF:{selfHash}`

**关键**：旧侧和新侧使用相同的 pairKey，因此 MATCHED token 在两侧一致，序列对齐算法才能正确识别为 equal。AlignedPair 不使用于此阶段（此时 AlignedPair 尚未产生），序列对齐输入只有 MATCHED（来自已确认的 MatchPair）和 SELF（未匹配节点）。

### 2.3 算法选择

根据序列特征自动选择对齐算法：

- 序列长度 < 80 → Myers 最短编辑脚本
- 唯一 token 比例 > 0.6 → Heckel 算法
- 其他 → Patience/Histogram 算法

### 2.4 对齐结果基础处理

算法产出原始对齐序列（equal/insert/delete），规范化后得到基础对齐项。

对相邻的 delete+insert 对，检查是否可以合并为 AlignedPair（即 replace 项）。

**合并条件**：
- 两边类型一致（entity 和 kind/blockType 相同）
- 且两边都未在 matched 集合中
- 且同类型局部相似度满足基础门檻（minSimilarity，默认 0.75）

满足条件则合并为 replace 项（AlignedPair），pairKind='align'，pairKey="align:{oldId}:{newId}"。这里使用的相似度只做"是否值得合并为 replace"的辅助判断，不做"是否匹配"的决策。

**AlignedPair 不是 MatchPair**：合并后的 replace 项是两个节点的对齐关系，但不证明它们是同一语义实体。它们会被后续步骤（步骤 3、步骤 6）进一步检查，可能升级为 MatchPair。

### 2.5 短 Heading 的 AlignedPair 兜底

针对短标题 rename 可能因文本相似度不足而无法形成 AlignedPair 的问题，增设兜底规则：

**兜底条件**（同时满足）：
- oldChild 和 newChild 都是 entity='section' 且 kind='heading'
- 两侧 headingDepth 相同
- 两侧在各自父节点的 items 中位置对应（preorder 偏移 ≤ 1）
- 两侧父节点已互为 MatchPair
- 在各自父节点的所有 heading 子节点中，不存在另一个 heading 与对面的 heading 形成竞争（即一对一的局部唯一性成立）
- headingBodyHash 相同，或两侧 heading 都没有子节点

如果满足以上条件，即使 normalizeTitle 后的文本相似度低于 minSimilarity，也将此 delete+insert 对合并为 AlignedPair（pairKind='align'，pairKey="align:{oldId}:{newId}"），并附加标记 shortHeadingFallback=true。

**注意**：这**不是**直接判定 rename。它只是将此对加入"值得比较"的 AlignedPair 池，最终是否确认为 rename 仍需步骤 6 判定。

### 2.6 同父级内重排检测

对 equal 项（MatchPair）和 replace 项（AlignedPair），计算它们在各自列表中的位置关系：提取已配对项在新列表中的序号构成序列，求其最长递增子序列（LIS）。不在 LIS 中的项标记为 reordered（同父级内位置移动）。

### 2.7 递归展开策略

递归展开遵循明确的层级分工：

**MatchPair（equal 项）**：
- 双方都是 Section → 递归进入，对子节点执行步骤 2 的同父序列对齐
- 双方都是 Block → 终止递归（叶子节点）
- 一方是 Section 另一方是 Block → 类型不匹配，降级为 replace 且标记 degraded

**AlignedPair（replace 项）**：
- **不在此步骤递归展开**。AlignedPair 作为 opaque compare pair 保留，留给步骤 3 做小窗口恢复。
- 如果双方都是 Block → 不递归（叶子节点），直接保留为 replace 项，等待步骤 7 的 inline diff

**delete 项**：
- 创建 delete change 并递归整棵子树（所有子孙节点标记为 delete）

**insert 项**：
- 创建 insert change 并递归整棵子树（所有子孙节点标记为 insert）

**reordered 标记**：
- 在 equal 项或 replace 项上设置 movedWithinParent=true

### 2.8 递归终止条件

递归在以下情况终止：

- 双方都是 Block（叶子节点，无子节点需要对齐）
- 到达子树大小预算上限（单侧子树节点数 > maxRecursiveSubtreeSize，默认 500），标记 degraded 并跳过递归展开

---

## 步骤 3：小窗口局部恢复

### 3.1 目标

对步骤 2 产生的 AlignedPair（replace Section 对，pairKind='align'），在其子树范围内做局部细粒度匹配恢复，尝试将"整个 Section 替换"细化为"部分子节点修改"，或将 AlignedPair 升级确认为实际的 rename/meta-update。

### 3.2 窗口预算

对每个 replace Section 对，计算两侧子树节点总数。超出 maxLocalWindowSize（默认 50）则标记 degraded 并跳过恢复。这是防止局部恢复本身消耗过多计算资源的保护机制。

### 3.3 局部匹配规则

在小窗口内执行精简版匹配，优先级如下：

1. **唯一 selfHash 匹配**：子树内两侧都唯一且 selfHash 相同的节点 → 直接建立 MatchPair
2. **同类型 + 唯一标题匹配**：heading Section 的 slug 相同且两侧唯一 → 建立 MatchPair（matchKind='local-heading-slug'）
3. **同类型 + 局部内容相似度满足门檻 + 唯一性边界**：相似度最高且明显高于第二名（margin ≥ minUniquenessMargin），且两侧在各自局部窗口内都唯一 → 建立 MatchPair（matchKind='local-similarity'）
4. 不满足以上任一条件 → 不匹配，保留为 replace/delete/insert

**Footnote/definition identityHash 局部匹配**：在局部窗口内，如果 identityHash 相同且两侧唯一，也可建立 MatchPair（matchKind='local-identity'），用于捕获局部范围内的 identifier 重命名。

### 3.4 APTED 回退（可选增强）

当 enhancedLocalRecovery 开启时，对于局部匹配失败但仍未充分细化的 AlignedPair（即两侧仍有较多未配对子节点，未配对比例 > 0.5），可启用 APTED（树编辑距离）算法作为结构化回退。

**约束条件**：
- 单侧子树节点总数 ≤ 50（必须满足 maxLocalWindowSize）
- APTED 仅用于生成候选对齐建议，不直接创建 MatchPair
- APTED 产生的候选必须经过类型一致、局部唯一性、相似度门檻的过滤才能转为 AlignedPair
- APTED 结果不作为 MatchPair，仅作为同类型 delete+insert 合并为 AlignedPair 的辅助依据
- 如果 APTED 无法产出符合质量要求的候选，则保持原始 replace/delete/insert 不变

**注意**：此功能为可选的增强特性。默认关闭。开启后，APTED 不应绕过任何确定性匹配和唯一性检查。

### 3.5 局部对齐

用局部匹配结果（及可选的 APTED 候选）构建局部锚点映射，对父 Section 的子节点做同父序列对齐（与步骤 2 流程一致）。局部范围内检测 reorder 和 move，但 move 范围仅限当前 Section 内部。

### 3.6 状态更新

根据对齐结果更新 AlignedPair 的状态：

- 有实际子节点变化 → descendantChanged=true
- 自身 selfHash 相同但子节点有变化 → selfChanged=false, descendantChanged=true，可将 primaryOp 降回 equal（descendantChanged 仍为 true）
- 自身 selfHash 不同 → selfChanged=true，保留 replace
- 如果 AlignedPair 是 heading 类型且 selfHash 不同但 headingBodyHash 相同且同级唯一性成立 → 标记为 heading rename 候选，等待步骤 6 最终确认

### 3.7 结果整合

步骤 3 完成后，原 AlignedPair 的子节点对齐结果作为 change.children 挂载。如果恢复出有效的 MatchPair，则局部范围内的节点间关系得到细化。此时原 AlignedPair 仍保持 pairKind='align'，不会在此步骤升级为 MatchPair。升级操作统一在步骤 6 进行。

---

## 步骤 4：生成基础变更树

### 4.1 DiffChange 结构

每个 DiffChange 包含：entity（section/block/metadata）、kind 或 blockType、oldId/newId、pairKey（格式为 "{pairKind}:{oldId}:{newId}"）、pairKind（'match' | 'align' | 临时 'move'）、primaryOp（equal/insert/delete/replace/move/meta-update）、status 标志位（isMatchPair/isAlignedPair/moved/movedWithinParent/renamed/selfChanged/descendantChanged/metaChanged/inlineStructureChanged）、matchKind（描述匹配来源，仅 MatchPair 有值）、score（仅用于排序和调试，不做匹配决策）、summary、inlineSpans、titleInlineSpans、children 子树、reordered 标记、degraded 标记、shortHeadingFallback 标记（仅兜底 AlignedPair）、warnings 列表。

**核心状态模型**：

```
primaryOp: equal | insert | delete | replace | move | meta-update

status flags（独立叠加，不互斥）:
  isMatchPair: boolean        // 来自 MatchPair
  isAlignedPair: boolean      // 来自 AlignedPair
  moved: boolean              // 跨父节点移动
  movedWithinParent: boolean  // 同父节点内位置变化
  renamed: boolean            // 标题或标识符变化
  selfChanged: boolean        // 自身内容变化
  descendantChanged: boolean  // 子节点有变化
  metaChanged: boolean        // 元数据变化
  inlineStructureChanged: boolean  // 内联结构变化
```

**rename 的语义**：永远作为 status flag，不作为 primaryOp。渲染时按组合优先级显示：renamed 且 selfChanged → "重命名+编辑"，renamed 且 moved → "移动+重命名"，仅 renamed → 蓝色背景重命名样式。

**primaryOp 与 status 的关系**：
- primaryOp 描述最基本的操作类别
- status flags 描述具体的语义修饰
- 同一个节点可以同时有 primaryOp='equal' 和 status.renamed=true（仅标题变化）
- 同一个节点可以同时有 primaryOp='equal' 和 status.descendantChanged=true（容器自身未变但子树有变化）
- 同一个节点可以同时有 primaryOp='equal' 和 status.movedWithinParent=true（节点自身未变但在同级内位置变化）
- 渲染时 status 修饰 primaryOp 的显示效果

### 4.2 变更树构建

步骤 2 和步骤 3 已经产出了完整的递归对齐结果，本步骤将其转换为 DiffChange 树结构：

- 注册到全局 byOldId/byNewId 索引
- 建立父子关系（change.children）
- 根据对齐类型设置 primaryOp 和 pairKind
- 设置 isMatchPair / isAlignedPair（根据 pairKind：'match' → isMatchPair=true, isAlignedPair=false；'align' → isMatchPair=false, isAlignedPair=true）
- 根据 selfHash 比较设置 selfChanged
- 根据 subtreeHash 比较设置 descendantChanged
- 标题/标识符变化标记 renamed（初步标记，步骤 6 会做最终确认）
- 传播 shortHeadingFallback 标记（如果 AlignedPair 是从兜底规则产生的）

### 4.3 基础操作确定

- matched（MatchPair, pairKind='match'）且 selfHash 相同 → primaryOp='equal', isMatchPair=true, isAlignedPair=false
- matched（MatchPair, pairKind='match'）但 selfHash 不同 → primaryOp='replace', isMatchPair=true, isAlignedPair=false, selfChanged=true
- delete → primaryOp='delete', isMatchPair=false, isAlignedPair=false, pairKind 不适用（设为 undefined 或空）
- insert → primaryOp='insert', isMatchPair=false, isAlignedPair=false, pairKind 不适用
- replace（AlignedPair, pairKind='align'）→ primaryOp='replace', isMatchPair=false, isAlignedPair=true

---

## 步骤 5：从 delete/insert 对中恢复 move

### 5.1 核心原则

move 不做主流程中的猜测，而是作为后处理步骤，从已经生成的 delete/insert 对中查找强证据来恢复。move 恢复不依赖 AlignedPair——它只在 delete/insert 子树之间寻找 exact hash、唯一 identity 或强上下文证据。一旦确认 move，即为这两个节点创建 MovePair（临时状态，pairKind='move'），然后立即升级为 MatchPair（pairKind='match'），matchKind 为对应的 move-exact / move-direct / move-heading / move-code。logicalMoveId 保持独立，格式为 "move:{oldId}:{newId}"。move 恢复成功后，被确认的 delete 和 insert 子树构成一个语义匹配对，在状态模型中等价于 MatchPair 级别。

### 5.2 候选对筛选

遍历变更树中所有 delete 子树和 insert 子树：

- 两者的 entity 和 kind/blockType 必须相同
- 如果是 Section，subtreeSize 比值在 [0.3, 3.0] 范围内（极端大小差异不太可能是移动）
- 两者在变更树中的深度差异 ≤ 2（避免跨层级误配）

### 5.3 候选对排序

按 subtreeSize 从大到小排序候选对。大子树先处理，一旦确认 move，其内部节点不再参与后续 move 恢复。这避免了"整个章节 move + 章节内段落各自 move"的双重计数。

### 5.4 强证据判定

对每对候选，按优先级检查确定性证据：

**第一级：subtreeHash 完全相同**
整个子树一模一样的 delete 和 insert → 确定为 move。同步创建 MovePair 并立即升级为 MatchPair：pairKind 从 'move' 更新为 'match'，pairKey 从 "move:{oldId}:{newId}" 更新为 "match:{oldId}:{newId}"，matchKind='move-exact'，logicalMoveId="move:{oldId}:{newId}"。这是最高置信度，因为子树哈希碰撞概率可忽略。

**第二级：directHash 相同且上下文唯一消歧**
Section 的 directHash 相同。此时可能有多个候选共享同一 directHash，进一步检查父上下文：如果 delete 在原父节点中的相邻 sibling 与 insert 在新父节点中的相邻 sibling 有重叠（至少有一个共同已匹配节点），则上下文唯一性成立 → 确定为 move。同步创建 MovePair 并立即升级为 MatchPair：pairKind 从 'move' 更新为 'match'，pairKey 从 "move:{oldId}:{newId}" 更新为 "match:{oldId}:{newId}"，matchKind='move-direct'，logicalMoveId="move:{oldId}:{newId}"。如果父上下文无法唯一消歧，则不建立 move。

**第三级：heading slug 相同且正文高度相似且唯一性成立**
仅对 heading Section 类型：
- 两侧 slug 完全相同
- 正文 contentOnlyHash 相同或正文 token Jaccard ≥ minSimilarity（0.75）；如果 headingBodyHash 相同（正文与子结构完全未变），则直接视为满足相似性条件，跳过 Jaccard 检查（headingBodyHash 相同是更强的证据）
- 在所有 delete/insert 候选对中，这一对的相似度最高且与第二名差距 ≥ minUniquenessMargin（0.12）

同时满足以上三条 → 确定为 move。同步创建 MovePair 并立即升级为 MatchPair：pairKind 从 'move' 更新为 'match'，pairKey 从 "move:{oldId}:{newId}" 更新为 "match:{oldId}:{newId}"，matchKind='move-heading'，logicalMoveId="move:{oldId}:{newId}"。

**headingBodyHash 增强规则**：如果 headingBodyHash 相同（标题下的子结构和正文未变），这是比 slug 相同更强、更确定性的证据。在这种情况下，即使未达到第三级的完整条件（如唯一性 margin 不够），也可以跳过 Jaccard 检查，直接将 headingBodyHash 相同作为"高度相似"的判定依据——但仍需满足 slug 相同和唯一性成立。

**第四级：代码块内容相同**
仅对 code Block 类型：
- contentOnlyHash 相同（代码文本一模一样）
- 在所有候选对中唯一（只有一个 delete code block 和一个 insert code block 共享此 contentOnlyHash）

→ 确定为 move。同步创建 MovePair 并立即升级为 MatchPair：pairKind 从 'move' 更新为 'match'，pairKey 从 "move:{oldId}:{newId}" 更新为 "match:{oldId}:{newId}"，matchKind='move-code'，logicalMoveId="move:{oldId}:{newId}"。

### 5.5 升级为 move

满足以上任一强证据条件的候选对，完成以下状态转换：

**状态机转换**：Unpaired delete + Unpaired insert → MovePair（临时，pairKind='move'）→ MatchPair（pairKind='match'）

- 为此 move 生成唯一 logicalMoveId = "move:{oldId}:{newId}"
- 同步创建 MatchPair：matchKind 为对应的 move-exact / move-direct / move-heading / move-code，pairKind='match'，pairKey="match:{oldId}:{newId}"，isMatchPair=true, isAlignedPair=false。这两个节点从现在起被视为已确认的语义匹配对。
- delete change 的 primaryOp 从 'delete' 改为 'move'，status.moved=true，status.isMatchPair=true, status.isAlignedPair=false，pairKind='match'，pairKey="match:{oldId}:{newId}"，moveRole='source'，movePeerKey=logicalMoveId
- insert change 的 primaryOp 从 'insert' 改为 'move'，status.moved=true，status.isMatchPair=true, status.isAlignedPair=false，pairKind='match'，pairKey="match:{oldId}:{newId}"，moveRole='target'，movePeerKey=logicalMoveId
- 从 byOldId/byNewId 索引中为这两个 change 注册 move peer 关系
- 将 delete 子树和 insert 子树内部的所有节点标记为"已被 move 覆盖"，不再参与后续 move 候选对筛选

### 5.6 不满足条件

没有强证据的 delete/insert 对保留原样。不尝试"可能是 move"的弱匹配。

### 5.7 Move 统计

统计时，共享同一 logicalMoveId 的两个 change（source + target）合并计为 **1 次移动操作**，不重复计数。

---

## 步骤 6：在匹配/对齐节点上恢复 rename 和 meta-update

### 6.1 核心原则

rename 和 meta-update 不是用来"发现匹配"的，而是在已配对节点上检查"发生了什么变化"。检查对象包括两类：

- **MatchPair**（pairKind='match', isMatchPair=true, isAlignedPair=false）：高置信度语义匹配（来自 exact-self、exact-direct、exact-self-with-context、exact-subtree、local-heading-slug、local-similarity、footnote-identity、definition-identity、local-identity、以及步骤 5 创建的 move-exact / move-direct / move-heading / move-code）
- **AlignedPair**（pairKind='align', isMatchPair=false, isAlignedPair=true）：局部序列对齐产生的 replace 对（来自步骤 2 的 delete+insert 合并或步骤 3 的恢复结果）

**关键区别**：在 MatchPair 上，rename/meta-update 的置信度更高，可以直接确定。在 AlignedPair 上，需要满足额外条件才能升级为 rename/meta-update，否则保持 replace。

**状态机转换**：当 AlignedPair 满足高置信度条件时：
- pairKind 从 'align' 变为 'match'
- pairKey 从 "align:{oldId}:{newId}" 更新为 "match:{oldId}:{newId}"
- isAlignedPair 从 true 变为 false
- isMatchPair 从 false 变为 true

### 6.2 Heading Rename 恢复

**检查对象**：所有 kind='heading' 的 MatchPair 或 AlignedPair。

**条件**：
- 两侧 normalizedTitle 不同
- 在新旧父节点的同级 sibling 中，不存在另一个 heading 的 normalizedTitle 与新标题相同（唯一性约束：排除结构重组导致的标题"巧合"匹配）

**高置信度条件**（同时满足以下三条）：
- headingBodyHash 相同（正文与子结构未变）
- headingDepth、listDepth、quoteDepth 等结构属性相同
- 同级唯一性成立（如上所述）

满足高置信度条件 → status.renamed=true。这表示仅标题变化，正文和子结构完全一致。

**中置信度条件**：
- headingBodyHash 不同（正文或子结构也有变化）
- 但 contentOnlyHash 相同且 subtreeHash 差异仅源于标题

满足中置信度条件 → status.renamed=true 且 status.selfChanged=true。这表示标题和正文都有变化，但标题变化被确认识别。

**结果**：
- status.renamed=true
- 如果 primaryOp='equal' 且仅标题变化（高置信度），保持不变（status.renamed 叠加）；如果 primaryOp='replace' 且满足高置信度条件，可降为 primaryOp='equal' + renamed=true
- 如果原来是 AlignedPair（pairKind='align'）且满足高置信度条件（headingBodyHash 相同且同级唯一性成立），执行状态机转换：pairKind 变为 'match'，pairKey 更新为 "match:{oldId}:{newId}"，isAlignedPair=false, isMatchPair=true

### 6.3 Footnote Rename 恢复

**检查对象**：所有 kind='footnote' 的 MatchPair 或 AlignedPair。

**条件**：
- 两侧 normalizeIdentifier 后的 identifier 不同
- 正文内容未变（identityHash 相同，即剔除 identifier 后哈希一致）

**结果**：
- status.renamed=true
- 记录旧新 identifier 用于通知引用位置更新
- 如果原来是 AlignedPair（pairKind='align'）且满足条件，执行状态机转换：pairKind 变为 'match'，pairKey 更新为 "match:{oldId}:{newId}"，isAlignedPair=false, isMatchPair=true

### 6.4 Definition Rename 恢复

**检查对象**：所有 blockType='definition' 的 MatchPair 或 AlignedPair。

**条件与分级结果**：
- 仅 identifier 变化（identityHash 相同，即 url/title/label 未变）→ status.renamed=true
- identifier 变化且 url/title/label 也有变化 → renamed=true 且 metaChanged=true
- 仅 url/title/label 变化，identifier 未变 → metaChanged=true，renamed=false

如果原来是 AlignedPair（pairKind='align'）且满足改名条件（至少 identityHash 相同），执行状态机转换：pairKind 变为 'match'，pairKey 更新为 "match:{oldId}:{newId}"，isAlignedPair=false, isMatchPair=true。

### 6.5 Meta-update 恢复

**检查对象**：所有 MatchPair 或 AlignedPair。

**代码块**：
- contentOnlyHash 相同（纯文本未变）但 selfHash 不同（lang 或 meta 变化）
- → primaryOp='meta-update', metaChanged=true, selfChanged=false
- 如果原来是 AlignedPair（pairKind='align'）且满足条件，执行状态机转换：pairKind 变为 'match'，pairKey 更新为 "match:{oldId}:{newId}"，isAlignedPair=false, isMatchPair=true

**表格**：
- cell 内容全部相同但对齐方式或列数变化
- → metaChanged=true
- 如果原来是 MatchPair 且 primaryOp='equal'，可升级为 meta-update

**列表项**：
- checked 状态变化（null/false/true 之间转换）
- → metaChanged=true
- 如果原来是 MatchPair 且 primaryOp='equal'，可升级为 meta-update

**Frontmatter**：
- 解析后做 path diff，每个 key 级变化作为 metadata 类型子变更，parent change 设为 meta-update
- 仅适用于 MatchPair（frontmatter 锚点已配对）或已确认对应的 AlignedPair

---

## 步骤 7：内联差异计算

### 7.1 处理范围

遍历变更树，对以下情况计算内联差异：

- Block replace（entity='block', primaryOp='replace'，包含 isMatchPair 和 isAlignedPair）
- Block meta-update（entity='block', primaryOp='meta-update'，仅在不做 inline diff 时直接跳过）
- Heading 重命名（entity='section', kind='heading', status.renamed=true, titleInlineSpans 为空）

### 7.2 Inline Token 定义

将 mdast inline AST 节点序列化为 InlineToken 序列。每种节点类型有独立的哈希策略：

- **text**：hash(value) + 保留 raw 用于 word-level 细化
- **emphasis/strong/delete**：hash(children) 
- **link**：hash(url + title + hash(children))
- **image**：hash(url + alt + title)
- **inlineCode**：hash(value)
- **math**：hash(value)
- **linkReference/imageReference/footnoteReference**：hash(normalizedIdentifier)
- **html**：hash(value)
- **break**：固定 hash

**InlineToken 哈希规范**：每个 InlineToken 的哈希使用 xxHash3-128，输入为 canonical JSON 序列化后的字节串。序列化时字段按 ASCII 字典序排列，包含 type、value、url、alt、title、normalizedIdentifier 等字段及递归的子 token 哈希。这保证了内联结构的任何变化都会反映在 token hash 的不同上。

### 7.3 差异计算流程

1. **检查预算**：新旧 inline 子节点总数超过 maxInlineDiffCost（默认 500）→ 标记 inline-deferred，由 UI 可见时异步计算
2. **token 序列化**：将两个 inline 子节点数组转为 InlineToken 数组
3. **Myers diff**：用 hash 做 token 级 Myers 最长公共子序列对齐
4. **word-level 细化**：对"text token 替换"的 span，在 raw 文本上做 word 级别的二次 Myers diff。分词使用 Intl.Segmenter，回退策略同步骤 0.2 的 heading tokenize
5. **inlineStructureChanged 标记**：如果任何非 text 的 inline token 发生了 add/remove/replace → inlineStructureChanged=true
6. **结果填入**：paragraph → change.inlineSpans；heading → change.titleInlineSpans

### 7.4 代码块行级 diff

代码块的 inline diff 是特殊路径：

1. contentOnlyHash 相同 → 跳过行级 diff，检查 lang/meta 变化
2. contentOnlyHash 不同 → 按换行分割，做 Heckel 行级对齐
3. 对齐但内容不同的行 → 做字符级 Myers diff
4. 超长代码块（> longCodeLineThreshold，默认 200 行）→ 折叠不变片段，保留首尾各 20 行和所有变更区域

### 7.5 表格 diff

表格按结构和内容两个维度处理：

1. 结构不同（行列数或对齐变化）→ 结构级差异标记
2. 结构相同 → 逐个对应 cell 做 paragraph 级的 inline diff

---

## 各类节点相似度计算规范

为避免实现中的随意性，以下明确各节点类型在 AlignedPair 合并、move 恢复、局部匹配中的相似度计算公式。所有类型的相似度阈值统一使用 minSimilarity（默认 0.75），唯一性 margin 统一使用 minUniquenessMargin（默认 0.12）。

### Paragraph 相似度

Paragraph 为 entity='block', blockType='paragraph'。

**计算方式**：

提取两侧 paragraph 的纯文本 token 集合，使用 Intl.Segmenter 分词（回退策略同步骤 0.2 heading tokenize）。同时提取 inline structure 指纹：记录 inline token 类型序列（如 text-strong-text-link-text），不包含 token 内容。

- textSimilarity = Jaccard(tokenSet_old, tokenSet_new)
- structureSimilarity = inline 类型序列的编辑距离相似度（1 - Levenshtein 距离 / 较长序列长度）
- 综合相似度 = 0.7 × textSimilarity + 0.3 × structureSimilarity

**token 数量优化**：当任一侧 token 数量 > 256 时，使用 MinHash sketch（64 个哈希函数，种子固定）估算 Jaccard，误差控制在 ±0.05 以内。

### Heading 相似度

Heading 为 entity='section', kind='heading'。

**计算方式**：

综合以下因子：

- titleSimilarity：两侧 normalizeTitle 后文本的 token Jaccard（使用 Intl.Segmenter 分词）
- headingBodySimilarity：如果两侧都有子节点，比较 headingBodyHash（相同=1.0，不同=0.5）；如果一侧或两侧无子节点，此因子权重为 0
- depthMatch：headingDepth 相同=1.0，不同=0.6
- structuralContext：父节点类型一致且同级位置偏移 ≤ 2 = 1.0，否则 = 0.7

**综合相似度**：
- 有子节点时：0.4 × titleSimilarity + 0.3 × headingBodySimilarity + 0.15 × depthMatch + 0.15 × structuralContext
- 无子节点时：0.6 × titleSimilarity + 0.2 × depthMatch + 0.2 × structuralContext

### Code 相似度

Code 为 entity='block', blockType='code'。

**计算方式**：

- 如果 contentOnlyHash 相同 → 相似度 = 1.0
- 如果 contentOnlyHash 不同 → 按行分割后计算行级 Jaccard（> 256 行时使用 MinHash sketch 估算），lang 相同权重 +0.1（上限 1.0）

### Table 相似度

Table 为 entity='block', blockType='table'。

**计算方式**：

- shapeSimilarity：行数比例和列数比例的最小值（如 4 行 vs 5 行 = 0.8，3 列 vs 3 列 = 1.0，取 min = 0.8）
- cellContentSimilarity：行列对齐后逐个对应 cell 的 text Jaccard 平均值（行列数不等时，超出的行列计为 0）
- alignmentMatch：对齐方式相同的列数 / 总列数（旧新列数取 min）

**综合相似度**：0.3 × shapeSimilarity + 0.5 × cellContentSimilarity + 0.2 × alignmentMatch

### Footnote / Definition 相似度

Footnote（entity='section', kind='footnote'）和 Definition（entity='block', blockType='definition'）。

**计算方式**：

- 如果 identityHash 相同 → 相似度 = 1.0（正文/url-title-label 完全一致）
- 如果 identityHash 不同 → 相似度 = contentOnlyHash 相同 + 结构属性匹配（footnote 比正文 token Jaccard，definition 比 url/title/label 的逐字段 Jaccard 加权平均）

---

## 步骤 8：操作分类与状态一致性校验

### 8.1 Status 与 primaryOp 一致性规则

遍历所有变更，确保 status flags 与 primaryOp 自洽：

- insert/delete → selfChanged=true, isMatchPair=false, isAlignedPair=false
- move → moved=true, isMatchPair=true, isAlignedPair=false（move 恢复时已同步创建 MatchPair）
- replace → selfChanged=true（除非步骤 6 降级为 equal+renamed）
- meta-update → metaChanged=true, selfChanged=false, isMatchPair=true, isAlignedPair=false
- equal → selfChanged 和 metaChanged 初始为 false，但可以被 renamed 或 movedWithinParent 或 descendantChanged 修饰。**primaryOp='equal' 只表示节点自身没有 insert/delete/replace/move/meta-update，不排斥子节点变化或元数据变化。**
- equal + descendantChanged=true → 合法状态，表示容器自身未变但子树有变化
- equal + renamed=true → 合法状态，表示内容未变但标题/标识符变了
- equal + movedWithinParent=true → 合法状态，表示节点自身未变但在同级内位置调整
- renamed → 作为独立 status flag 叠加，不清除其他 flags
- **equal 不清除 renamed**：primaryOp='equal' 且 status.renamed=true 是合法状态，表示"内容未变但标题/标识符变了"
- **equal 不清除 descendantChanged**：primaryOp='equal' 且 status.descendantChanged=true 是合法状态，表示"容器自身未变但子节点有变化"
- **equal 不清除 movedWithinParent**：primaryOp='equal' 且 status.movedWithinParent=true 是合法状态，表示"节点自身未变但在同级内位置变化"

### 8.2 状态渲染优先级规则

当节点同时具有多个 status flags 时，按以下优先级规则确定主渲染样式和标签：

**语义层级（从高到低）**：

```
跨位置语义：moved（跨父节点移动）
身份变化：renamed（标题/标识符重命名）
元数据变化：metaChanged（meta-update）
内容变化：selfChanged（replace / 自身编辑）
容器子树变化：descendantChanged（子节点有变化但自身未变）
位置微调：movedWithinParent（同父级内重排）
内联结构变化：inlineStructureChanged（内联格式变化但不影响块级匹配）
```

**复合状态渲染规则**：

1. **moved=true** → 主样式：黄色背景 (#fff8e1)。标签按优先级叠加：
   - moved + renamed + selfChanged → "移动+重命名+编辑"
   - moved + renamed → "移动+重命名"
   - moved + selfChanged → "移动+编辑"
   - 仅 moved → "已移动" / "移入"

2. **moved=false, renamed=true** → 主样式：蓝色背景 (#e3f2fd)。标签按优先级叠加：
   - renamed + selfChanged → "重命名+编辑"
   - 仅 renamed → 蓝色背景，显示新旧名称对比

3. **moved=false, renamed=false, metaChanged=true** → 主样式：淡紫背景 (#f3e5f5)。标签："元数据变更"

4. **moved=false, renamed=false, metaChanged=false, selfChanged=true** → 主样式：
   - isMatchPair=true → 实线内联高亮，无特殊背景
   - isAlignedPair=true → 虚线内联高亮（可选差异化），无特殊背景

5. **以上均为 false, descendantChanged=true** → 主样式：透明背景，可显示子树变化提示图标

6. **以上均为 false, movedWithinParent=true** → 主样式：透明背景，可显示位置调整标记

7. **全部 false** → equal，透明背景

### 8.3 降级统计

收集所有 degraded=true 的变更条目和所有 warnings，统计 inline-deferred 数量。这些信息用于向用户展示 diff 质量概览。

### 8.4 复合操作标签

根据 8.2 的优先级规则，自动确定复合操作标签。实现时按以下顺序检查：

```
if (moved && renamed && selfChanged) → "移动+重命名+编辑"
else if (moved && renamed) → "移动+重命名"
else if (moved && selfChanged) → "移动+编辑"
else if (moved) → "已移动"（source）/ "移入"（target）
else if (renamed && selfChanged) → "重命名+编辑"
else if (renamed) → "已重命名"
else if (metaChanged && selfChanged) → "元数据变更+编辑"
else if (metaChanged) → "元数据变更"
else if (selfChanged && isMatchPair) → "已修改"
else if (selfChanged && isAlignedPair) → "可能修改"
else if (descendantChanged) → "子节点变更"
else if (movedWithinParent) → "位置调整"
```

---

## 步骤 9：展平为渲染行

### 9.1 数据结构

- **allRows**：全部展平行（含折叠区内的）
- **visibleRows**：当前应显示的行（排除已折叠的）
- **foldRanges**：折叠区间信息，使用语义稳定 key 管理

### 9.2 Key 生成规则

key 只基于语义身份，不包含 primaryOp，保证同一实体在操作变化后 key 稳定。生成时利用 pairKind 和 pairKey 信息：

- Section（MatchPair, pairKind='match'）：`sec:{oldId}:{newId}`
- Section（仅旧侧）：`sec:{oldId}:del`
- Section（仅新侧）：`sec:ins:{newId}`
- Block（MatchPair, pairKind='match'）：`blk:{oldId}:{newId}`
- Block（AlignedPair, pairKind='align'）：`blk:align:{oldId}:{newId}`
- Block（仅旧侧）：`blk:{oldId}:del`
- Block（仅新侧）：`blk:ins:{newId}`
- Metadata：`meta:{metadataKind}:{oldId}:{newId}:{path}`
- Move placeholder：使用 logicalMoveId + role：`move:{logicalMoveId}:source` / `move:{logicalMoveId}:target`
- Fold marker：`fold:{parentKey}:{startKey}:{endKey}`

### 9.3 递归展平

从 diffTree.root 出发深度优先遍历，为每个 DiffChange 创建 RenderRow。根据 entity、primaryOp、status、pairKind 生成左右两侧内容。渲染样式严格遵循步骤 8.2 的状态渲染优先级规则：

- move（status.moved=true, moveRole='source'）→ 黄色背景 + "已移动"标签（或对应复合标签）
- move（status.moved=true, moveRole='target'）→ 黄色背景 + "移入"标签（或对应复合标签）
- rename（status.renamed=true, moved=false）→ 蓝色背景 + 新旧标题对比
- delete → 红色背景
- insert → 绿色背景
- replace（isAlignedPair=true, pairKind='align' 且未升级）→ 无特殊背景，虚线内联高亮（可选差异化）
- replace（isMatchPair=true, pairKind='match'）→ 无特殊背景，实线内联高亮（确定性更高的修改）
- meta-update → 淡紫背景
- equal → 透明
- equal + renamed → 蓝色背景或透明加蓝色标记，标题处显示新旧对比
- equal + descendantChanged → 透明，但可显示展开/折叠子节点变化的交互提示
- equal + movedWithinParent → 透明，但可显示位置调整标记

**isMatchPair vs isAlignedPair 的渲染差异**：isMatchPair（pairKind='match'）的 replace 显示更强的"确认修改"语义（如实线边框、更明确的高亮边界），isAlignedPair（pairKind='align'）的 replace 显示稍弱的"可能修改"语义（如虚线边框）。这是 UI 层的可选差异化。

### 9.4 折叠未变更区域

扫描 visibleRows 中连续的 equal 行：

- 连续未变更行数 > 3 且属于同一父 Section
- 保留上下文各 2 行（首尾各保留 2 行可见）
- 中间部分用 foldMarkerRow 替代
- 记录 foldRange：使用 key 标识起始和结束行，保存被隐藏行的 key 列表

当 Worker 返回 lazy inline diff 结果更新了某行内容后，基于 key 重新定位 fold range，保持折叠状态。

### 9.5 统计汇总

遍历 allChanges（排除 degraded 的降级条目），统计各维度变更数量：

- Move 统计：共享同一 logicalMoveId 的 source+target 行合并计为 1 次移动
- 新增/删除/修改/重命名的 Section 数
- 修改的 Block 数
- frontmatter 变更数
- meta-update 数量

---

## 步骤 10：虚拟滚动渲染

### 10.1 虚拟滚动配置

使用虚拟滚动仅渲染可视区域及 overscan（默认 10 行），预估行高 40px。以 key 作为虚拟列表的稳定标识。

### 10.2 Lazy Inline Diff

对标记为 inline-deferred 的 replace Block，使用 IntersectionObserver 监听行进入视口，触发 Worker 异步计算 inline diff。结果回填后更新对应行的 highlights，清除 inline-deferred 标记和 warning。

### 10.3 折叠展开交互

折叠展开基于 foldRange 的 key 操作：展开时通过 hiddenKeys 查找对应行并插入到正确位置，折叠时根据 key 定位并移除。不受行内容更新影响。

### 10.4 着色与渲染规则

渲染规则严格遵循步骤 8.2 的状态渲染优先级规则。以下是完整的渲染样式映射：

**背景色**：
- delete → #ffeef0
- insert → #e6ffed
- move（source/target）→ #fff8e1
- rename（仅当 moved=false）→ #e3f2fd
- meta-update → #f3e5f5
- equal / replace / equal+descendantChanged / equal+movedWithinParent → 透明

**内联高亮**：
- replace（isMatchPair=true, pairKind='match'）→ 实线内联高亮
- replace（isAlignedPair=true, pairKind='align'）→ 虚线内联高亮（可选）

**标签**：按步骤 8.4 的复合操作标签逻辑生成。

**代码块**：使用行级和字符级高亮，超长代码块折叠不变区域。

---

## 全局参数

### 质量参数（可调）

| 参数 | 默认值 | 含义 |
|------|--------|------|
| minSimilarity | 0.75 | AlignedPair 合并和 move 恢复中内容相似度的最低门檻 |
| minUniquenessMargin | 0.12 | 第一名候选必须明显优于第二名的差距 |
| maxLocalWindowSize | 50 | 小窗口局部恢复的子树节点数上限 |
| enhancedLocalRecovery | false | 是否启用 APTED 回退（默认关闭） |
| minHashTokenCount | 256 | MinHash sketch 切换阈值：token 数量超过此值时使用 MinHash 估算 Jaccard |

### 工程预算常量（固定）

| 常量 | 默认值 | 含义 |
|------|--------|------|
| maxRecursiveSubtreeSize | 500 | 递归对齐的子树节点数上限，超出则标记 degraded |
| maxInlineDiffCost | 500 | inline token 总数上限，超出则标记 inline-deferred |
| longCodeLineThreshold | 200 | 代码块行数阈值，超出则折叠不变区域 |
| codeFoldContextLines | 20 | 长代码块折叠时首尾保留行数 |
| foldContextLines | 2 | 未变更区域折叠时首尾保留行数 |
| virtualScrollOverscan | 10 | 虚拟滚动 overscan 行数 |
| estimatedRowHeight | 40 | 预估行高（px） |
| preorderOffsetThreshold | 3 | selfHash 上下文匹配的 preorder 偏移上限 |
| contextSiblingWindow | 5 | selfHash 上下文匹配的局部窗口大小 |
| shortSequenceThreshold | 80 | Myers 算法适用的序列长度上限 |
| heckelUniqueRatio | 0.6 | Heckel 算法适用的唯一 token 比例下限 |
| moveSubtreeSizeRatioMin | 0.3 | move 候选的子树大小比值下限 |
| moveSubtreeSizeRatioMax | 3.0 | move 候选的子树大小比值上限 |
| moveDepthDiffMax | 2 | move 候选的树深度差异上限 |
| minHashNumFunctions | 64 | MinHash 使用的哈希函数数量 |
| aptedMaxSubtreeSize | 50 | APTED 回退的单侧子树节点数上限（与 maxLocalWindowSize 一致） |
| aptedUnpairedThreshold | 0.5 | APTED 触发阈值：未配对子节点比例下限 |

---

## 哈希算法规格总结

| 哈希类型 | 算法 | 输入 |
|----------|------|------|
| selfHash | xxHash3-128 | Canonical JSON（不含 id/position/treeDepth） |
| directHash | xxHash3-128 | Canonical JSON（自身+直接子节点 selfHash） |
| subtreeHash | xxHash3-128 | Canonical JSON（自身+所有后代 subtreeHash） |
| identityHash | xxHash3-128 | Canonical JSON（去除可变身份字段） |
| contentOnlyHash | xxHash3-128 | extractText 纯文本 |
| headingBodyHash | xxHash3-128 | Canonical JSON（标题下的子结构，不含标题文本） |
| textSimHash | Charikar SimHash-64 | Intl.Segmenter 分词 + 结构化 token |
| InlineToken hash | xxHash3-128 | Canonical inline token object（字段按 ASCII 字典序排列） |
| MinHash sketch | 64-bit × 64 哈希函数 | Intl.Segmenter 分词的 token 集合 |

**Canonical JSON 要求**（对齐 RFC 8785 JCS 风格）：
- 字段按 ASCII 字典序递归排序
- 所有字符串使用 UTF-8 编码
- 数字按 JSON 规范序列化（不保留 trailing zeros，整数不带小数点）
- **绝对不包含 id、position、treeDepth 等跨树不可比字段**
- 数组元素保持原始顺序（不排序）

---

## 分词与多语言处理总结

| 场景 | 首选方案 | 回退方案 |
|------|----------|----------|
| heading 标题分词 | Intl.Segmenter（词粒度，locale 自动检测） | ICU 词边界迭代器 → 英文 word boundary + CJK 2-gram |
| 正文 tokenize（SimHash/Jaccard） | Intl.Segmenter | 同 heading 回退链 |
| word-level inline diff | Intl.Segmenter | 同 heading 回退链 |
| 结构化 token 提取 | 固定规则（URL/标识符/reference 等） | 无需回退 |
| MinHash 输入 | Intl.Segmenter 分词后的 token 集合 | 同 heading 回退链 |

**Intl.Segmenter 使用规范**：
- 粒度选择：heading 分词和正文 Jaccard 使用 `"word"` 粒度；word-level inline diff 使用 `"word"` 粒度
- locale 选择：优先使用文档的 HTML lang 属性或 frontmatter 语言标记；无法确定时使用 `navigator.language` 或自动检测
- 无法使用 Intl.Segmenter 的运行时（如部分 Node.js 版本）：回退到 ICU 词边界迭代器（如果宿主环境提供）；若 ICU 也不可用，回退到原方案规则（英文 word boundary + CJK 2-gram，不去停用词，不去 not/no/without）