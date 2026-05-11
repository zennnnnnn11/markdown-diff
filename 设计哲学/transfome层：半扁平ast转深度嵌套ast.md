### 处理哲学
---

**一句话：容器互相认。任何容器内遇到另一个容器，递归处理，不降级为 Block。**

---

### 核心原则

1. **heading 建骨架**：标题按 depth 构建树的层级骨架，栈式管理。

2. **heading 不是容器**：heading 节点只负责创建 Section 作为结构节点。当前 heading Section 接收后续正文流节点（内容节点、list、blockquote 等），直到遇到下一个同级或更高级 heading 关闭。

3. **容器内 heading 不提升**：listItem、blockquote、footnote 内部遇到 heading，一律作为 Block，不参与全局 heading 栈。树的结构骨架仅由正文顶层 heading 决定。

4. **容器互递归**：listItem 和 blockquote 是两个通用容器递归函数，彼此认识。listItem 内遇 blockquote 调 `blockquoteToSection`，blockquote 内遇 list 调 `listItemToSection`。

5. **children/items 同步**：任何子 Section 加入 `parent.children` 时，必须同时加入 `parent.items`。`children` 存子 Section 集合，`items` 保留 Block 和 Section 的原始交错顺序。两者必须同步维护。

6. **脚注不特殊**：脚注内容也跑完整的容器递归规则，产出嵌套子树。

7. **表格不展开**：表格保持为单 Block，不拆成行级 Section。

8. **TOC 不例外**：TOC 生成的 list 按规则正常转 listItem Section，保持树的一致性。

9. **html 保持不透明**：HTML 包裹块作为单 Block，不深入解析内部。

10. **frontmatter 是元数据**：独立 Section，不参与正文嵌套。

11. **顺序是数据**：每个 Section 的 `items` 数组按原始顺序混合存放 Block 和子 Section，顺序本身就是结构信息。

12. **内容哈希离位置**：`contentHash` 不含 `depth` 和位置信息，相同内容移动后指纹不变。

13. **listItem 保留列表元信息**：`ordered`、`start`、`index`、`checked`。

14. **脚注双向关联**：定义存 `root.footnotes`，正文引用保留索引。

15. **definition 全局收集**：`definition` 节点无论出现在顶层还是容器内部，都不作为 Block，统一收集到 `root.definitions`。正文中的 `linkReference` 保留在所属 Block 内，通过 `identifier` 关联。

16. **definition 与容器递归**：容器递归函数（listItemToSection、blockquoteToSection、脚注内容处理）内部遍历子节点时，遇到 `definition` 跳过，交由全局收集。

---

### 顶层收集结构

遍历时，以下节点不进入正文内容规则，单独收集：

| 节点类型                     | 收集位置            | 收集范围              |
| ---------------------------- | ------------------- | --------------------- |
| `definition`                 | `root.definitions`  | 全局（顶层+容器内部） |
| `footnoteDefinition`         | `root.footnotes`    | 全局（顶层+容器内部） |
| `yaml`/`toml`（frontmatter） | frontmatter Section | 仅顶层                |

---

### 容器互递归总表

| 外层容器      | 内层遇到                | 处理方式                                    |
| ------------- | ----------------------- | ------------------------------------------- |
| listItem      | blockquote              | 调 blockquoteToSection                      |
| listItem      | list（子列表）          | 调 listItemToSection（递归）                |
| listItem      | heading                 | 作为 Block，不进全局栈                      |
| listItem      | definition              | 跳过，全局收集                              |
| listItem      | table/html/code 等      | 作为 Block                                  |
| blockquote    | list                    | 调 listItemToSection                        |
| blockquote    | blockquote（嵌套）      | 调 blockquoteToSection（递归）              |
| blockquote    | heading                 | 作为 Block，不进全局栈                      |
| blockquote    | definition              | 跳过，全局收集                              |
| blockquote    | table/html/code 等      | 作为 Block                                  |
| footnote 内容 | list/blockquote/heading | 复用容器递归规则，heading 作为 Block        |
| footnote 内容 | definition              | 跳过，全局收集                              |
| heading       | 后续流节点              | 按规则正常处理，遇同级或更高级 heading 关闭 |