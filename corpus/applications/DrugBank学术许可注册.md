# DrugBank 学术许可注册指南

## 结论
DrugBank 对学术用户**免费开放 Academic License**：用教育机构邮箱注册 → 审批（通常数个工作日）→ 获得**非商业用途**的批量数据下载权限。批准后即可把 DrugCentral 之外的 DrugBank 专有字段（药物相互作用详细数据、代谢通路、目录编号等）接入语料库。

## 注册步骤
1. 访问 https://go.drugbank.com/university_qa_registration 或首页 "Academic Licensing"
2. 使用**学校教育邮箱**注册（个人邮箱会被拒），机构名称填学校全称
3. 用途声明可参考下方《用途说明（可直接粘贴）》
4. 审批通过后：账号权限为 Academic；**下载的数据只存本地 corpus/raw/drugbank/，禁止提交进 git 仓库**（EULA 禁止再分发）
5. 批准后告诉我，我配置下载与入库流程

## 用途说明（注册表单可直接粘贴）
> This academic license is requested for a student-led educational software project ("YaoZhi", 药知) at our university. The project is a pharmacology learning assistant for undergraduate pharmacy students: it diagnoses students' error causes on multiple-choice questions and provides evidence-based explanations. DrugBank data will be used strictly as a non-commercial, local reference corpus for generating evidence citations (drug mechanisms, interactions, categories), with clear attribution to DrugBank shown in the application UI. No data will be redistributed, sublicensed, or used in any commercial setting. The project is part of a university competition (Datawhale Xingyue Program) and a small-scale on-campus pilot under faculty supervision.

## 合规义务（批准后必须遵守）
- 仅限非商业用途；比赛若引入商业化（收费/广告）需升级商业许可
- 数据文件**不入 git、不对外分发**，只在本地运行环境使用
- UI 引用处显示 "Data source: DrugBank (academic license)"

## 状态
- [ ] 注册提交（负责人：____，使用学校邮箱）
- [ ] 审批通过
- [ ] 数据下载并本地入库（corpus/raw/drugbank/，gitignore）
