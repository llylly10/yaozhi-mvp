# 语料许可证台账

| 目录 | 来源 | 许可证 | 署名/义务 | 抓取日期 |
|---|---|---|---|---|
| raw/cmb_val | FreedomIntelligence/CMB (HuggingFace) val 子集 | Apache-2.0 | 保留来源声明；题目源自真实考试，二次分发前复核 | 2026-08-30 |
| raw/cmb_train | CMB-train-merge.json：269,359 题全量（含答案、无解析），药相关类目 46,703 题（单选 40,593；含执业西药师 7,838）。⚠️ 真题版权溯源待复核，同 val | ✅ |
| raw/dailymed | NIH NLM DailyMed SPL | 公共领域（美国联邦政府作品） | 保留 setid 溯源 | 2026-08-30 |
| raw/livertox | NIH NCBI Bookshelf LiverTox | 公共领域（联邦作品，文本部分） | 逐章核验无第三方版权内容 | 2026-08-30 |
| raw/whoeeml | WHO eEML (list.essentialmeds.org) | CC BY 3.0 IGO | 署名 WHO；译文挂"非官方译文"声明；可用商用 | 2026-08-30 |
| raw/nhc_docs | 国家卫健委诊疗方案/路径（行政文件，第5条例外） | 不受著作权保护 | 注明文号与来源 | ⚠️ 待抓取：nhc.gov.cn 有反爬（412），需浏览器渲染方案 |
| raw/openrn | Open RN Nursing Pharmacology 2e | CC BY 4.0 | 署名 Ernstmeyer & Christman (Open RN) + 链接 | 2026-08-30 |
| raw/medguides | FDA Medication Guides | 公共领域 | 不篡改安全内容 | 2026-08-30 |

## 明确不入库（红线记录）
人卫版《药理学》教材、中国药典、执业药师应试指南（中国医药科技社专有出版）；中华医学会指南全文（明示禁止数据库收录，只存出处+要点摘要）；MSD 中文版（申请中）；DrugBank/KEGG/StatPearls（ND）/百度百科；丁香园等第三方说明书库（反不正当竞争判例）。

## 抓取状态（2026-08-30）

| 目录 | 实际内容 | 状态 |
|---|---|---|
| raw/cmb_val | CMB-val-merge.json：280 题（题干/选项/答案/解析），其中药师药理类目 90 题。⚠️ 部分解析含"医\|学教育网"水印，仅内部研究用 | ✅ |
| raw/dailymed | 6 个常用药最新 SPL XML（atorvastatin/metformin/amoxicillin/amlodipine/omeprazole/aspirin），HL7 分节可按 LOINC 切块 | ✅ |
| raw/whoeeml | 650 个药品页面 HTML（WHO 基本药物清单全量） | ✅ |
| raw/livertox | 5 篇药物性肝损伤专论样例（全库约 1300 篇可扩展） | ✅ 样例 |
| raw/openrn | Nursing Pharmacology 2e 全书 PDF（132MB，CC BY 4.0） | ✅ |
| raw/medguides | FDA 索引页已迁移 404；Medication Guide 本身随 DailyMed SPL 分发，已被 dailymed 覆盖 | ➖ 不需要 |
| raw/nhc_docs | nhc.gov.cn 反爬（412），需浏览器渲染下载 | ⚠️ 待办 |
