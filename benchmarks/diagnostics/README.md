# 浏览器瓶颈诊断

本目录是独立诊断工具，不改变生产索引或公开 ABI。热力图展示历史正式计时，CPU profiles
来自另外的 `release --no-strip` 模块，不参与速度排名。AABB 与点共同域始终分开。

## 热力图

```sh
node benchmarks/diagnostics/heatmap.mjs
```

生成 `_build/browser-results/heatmap.html`，内嵌 12 份原始记录，可直接用浏览器打开。
脚本重新计算并检查 1,890 行分位数，保存来源路径和文件 SHA-256。页面比较 AABB 的 after/STR
及点的 MOctree/普通/Loose Octree；不把旧 before 和射线数据放进 STR 排名。

选择域、对照、轮次、分布和指标；点击单元格查看原始样本、p50/p95/p99、八批次命中与工作量。
批次按原调度的 sampleIndex % 8 还原，逐批尾分位数仅有 12/13 个样本，不能作稳定尾延迟承诺。
缺失 visited/tested 显示为 null，零命中时 tested/hits 为 null。倍率以 1 为中心、按 log2 着色，
16 倍之外颜色饱和；绝对数值仍完整显示。没有业务权重和综合评分。

资源面板独立显示构建样本、模块字节/哈希与容量。容量不等于活跃堆，旧 AABB 资源包含不同阶段
的传输探针，不能把所有字段相加；点 all 包含预留槽位完整坐标复制。

## 专项采样

先按根 README 准备依赖与工具链，再执行：

```sh
node benchmarks/diagnostics/profile.mjs
```

自动构建带名称的分析模块，以新时间戳归档到 `benchmarks/results/*-diagnostics/`，不覆盖旧记录。
每轮新建 Chrome 会话，九场景共二十个后端组合；两轮反转后端顺序，共四十份 profile。
10 万条目、八批次序列；查询预热 24 次、构建预热 2 次。各场景固定迭代次数见 specs，
同场景各后端次数一致。采样间隔 1,000 μs；验证、输入生成、oracle、UI 和绘图均在采样外。

每组采样前对八批查询做独立扫描校验，保存坐标与实际统计。构建场景反复重建同一实例，
包含替换旧索引的释放成本；它与旧报告的独立实例首次构建不是同一测量，不能重新排名。
采样循环含校验和消费，但不含页面渲染或 GPU 工作。

每组保存 `.cpuprofile`、`.folded`、MoonFlame 0.2.0 `.svg`；summary.json 保存工具链、环境、
源码/依赖/模块/产物哈希、命名帧 self/inclusive 样本和未解析 WASM 叶帧数量。
相同函数可因调用上下文出现多项。inclusive 不可跨父子相加；self 合并也须按相同函数辨认。
样本不是精确 CPU 时间，函数内联会将谓词或循环归入调用者；不能据此证明缓存、分配字节或纯算法倍率。

## 验收与查看

```sh
node benchmarks/diagnostics/finalize.mjs benchmarks/results/<时间戳>-diagnostics
node benchmarks/diagnostics/verify.mjs benchmarks/results/<时间戳>-diagnostics
```

finalize 仅为 CPU profile JSON 补齐仓库要求的末尾换行，并更新产物哈希；原始捕获字节哈希
保留为 captureSha256，JSON 样本不变。重复运行不会再改变产物。
在生成热力图并采集后执行，核对源码/模块/产物哈希、折叠栈、两轮坐标/工作统计，
通过真实 Chrome 遍历 5,670 个筛选下的单元格详情。截图写入忽略目录。
本命令验证当前源码；历史复现应使用对应提交及原模块，不修改原样本哈希。
具体本轮结论和限制见 [诊断报告](../../docs/validation-diagnostics.md)。

修改后还需执行根 README 的浏览器及独立模块验收、暂存后的 prek 和差异检查。
当前 CI 不自动运行专项采样，也不把火焰图比例或历史耗时作为门禁。
