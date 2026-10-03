# -*- coding: utf-8 -*-
"""App.tsx 拆分执行器（批次驱动，幂等，可中断重跑）。

用法（frontend/ 目录下）:
  ../.venv/Scripts/python.exe split_app.py B1|B2a|B2b|B3|status

机制:
 1. 重扫 App.tsx 顶层符号行界（含 export 前缀定义，保证行界不吞 App()）;
 2. 按注册表把本批符号块搬到目标文件（加 export 前缀 + 按剩余体实际使用自动生成 import 头）;
 3. 重写 App.tsx 的完整 import 头（防 verbatimModuleSyntax/noUnusedLocals）;
 4. 已存在的目标文件自动跳过（中断重跑安全）。
搬移是纯剪切：不改任何函数体。验证靠 tsc（npm run build）。
"""
import re
import sys
import pathlib

SRC = pathlib.Path('src')
APP = SRC / 'App.tsx'

REGISTRY = {}


def reg(module, syms):
    for s in syms:
        assert s not in REGISTRY, f'符号重复注册: {s}'
        REGISTRY[s] = module


reg('lib/shared', ['Screen', 'View', 'spring', 'Rconst', 'Cconst', 'EXAM_PRESETS',
                   'resolveExamDate', 'daysToExam', 'todayIso', 'genUUID',
                   'CAT_KEYS', 'CAT_STYLE',
                   'StudyNode', 'StudyMapData', 'KgNodeT', 'KgEdgeT', 'KgEvidence', 'KgTabDef', 'PortraitResult'])
reg('components/ui', ['Hex', 'CategoryTag', 'NodeChip', 'EvidenceNote', 'EmptyPanel', 'ErrorPanel'])
reg('views/QAView', ['QAMsg', 'QA_EXAMPLES', 'QA_SMART_SUGGESTIONS', 'ThinkingBox', 'QAView'])
reg('views/Profile', ['ArchiveData', 'Profile'])
reg('views/KnowledgeGraphView', ['KG_DOT', 'KG_RING', 'KG_LINE', 'KG_LABEL_TYPES',
                                 'kgOrbit', 'kgLabelRotate', 'KnowledgeGraphView'])
reg('views/QuickQuizModal', ['QuickQuizModal'])
reg('views/ChapterStudy', ['ConfusionPairCard', 'ChapterStudy'])
reg('views/CourseGraph', ['CourseGraph'])
reg('views/StudyMapOnboard', ['StudyMapOnboard'])
reg('views/Assessment', ['Assessment'])
reg('views/Portrait', ['Portrait'])
reg('views/LearningPathHome', ['PlanTask', 'DoneTask', 'DailyRec', 'MemoryDecayAlert',
                               'RetestCapsuleCard', 'LearningPathHome'])
reg('views/Welcome', ['Welcome'])
reg('views/Consent', ['Consent'])
reg('views/GoalPicker', ['GOALS', 'GoalPicker'])
reg('views/Material', ['ChapterWarmupCard', 'MaterialRoute', 'MaterialData', 'MaterialView'])
reg('views/WrongBook', ['WrongRow', 'RecallData', 'WrongAwakenModal', 'WrongBook',
                        'WrongGroups', 'RecallCardView'])
reg('views/PracticeFlow', ['TrainingResult', 'TikuFeedbackCard', 'PracticeFlow'])
reg('views/DiagnosisPanel', ['Analysis', 'Stamp', 'OpenAnswer', 'DiagnosisPanel'])

# verbatimModuleSyntax：类型符号必须以内联 type 修饰导入
API_VALUES = ['api', 'clearAuth', 'getToken', 'setToken', 'setAdminKey', 'getAdminKey']
API_TYPES = ['Diagnosis', 'Question', 'TikuFeedback', 'RetestCapsuleData', 'WrongBookItem',
             'EvalCategoryMetric', 'EvalReportData', 'KnowledgePointDetail']
TYPE_SYMBOLS = {'Screen', 'View', 'StudyNode', 'StudyMapData', 'KgNodeT', 'KgEdgeT', 'KgEvidence',
                'KgTabDef', 'PortraitResult', 'QAMsg', 'MaterialData', 'Analysis', 'ArchiveData', 'WrongRow',
                'RecallData', 'PlanTask', 'DoneTask', 'DailyRec', 'MemoryDecayAlert'} | set(API_TYPES)

# App.tsx 原生 src 根上的既有组件模块（api/Toast/pharmacyHighlight 显式处理，不在此列）
ROOT_MODULES = ['PharmacologyRadar', 'EvalBenchmarkModal', 'CustomQuizView', 'KnowledgeDetailModal',
                'WrongBookExportModal', 'SettingsModal', 'CommandSearchModal', 'ClinicalCaseView']

KEEP_IN_APP = {'App', 'AppInner', 'Sidebar', 'MobileTab', 'BackToTop', 'MolField',
               'USER_KEY', 'GOAL_KEY', 'EXAM_DATE_KEY'}

REACT_HOOKS = ['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer',
               'useLayoutEffect', 'useContext']
FRAMER = ['motion', 'AnimatePresence', 'MotionConfig', 'useReducedMotion', 'useScroll',
          'useMotionValueEvent']
ICONS = ['CheckCircle', 'XCircle', 'Warning', 'MagnifyingGlass', 'SkipForward', 'ArrowRight',
         'ArrowUp', 'CaretDown', 'Pill', 'CalendarBlank', 'ClockCounterClockwise', 'SquaresFour',
         'Gear', 'BookOpenText', 'ChatCircle', 'ChatCircleText', 'Lightning', 'Hourglass',
         'Sparkle', 'ShareNetwork', 'FirstAid', 'Printer', 'BookmarkSimple', 'Brain',
         'PaperPlaneRight', 'Plus', 'Minus', 'ArrowsCounterClockwise', 'CornersOut', 'CornersIn',
         'X', 'ArrowsLeftRight']
HL_FNS = ['highlightPharmacyKeywords', 'splitClauses', 'splitDistinction']

BATCHES = {
    'B1': ['lib/shared', 'components/ui', 'views/QAView', 'views/Profile', 'views/KnowledgeGraphView'],
    'B2a': ['views/ChapterStudy', 'views/QuickQuizModal', 'views/CourseGraph', 'views/StudyMapOnboard'],
    'B2b': ['views/Welcome', 'views/Consent', 'views/GoalPicker', 'views/Assessment',
            'views/Portrait', 'views/LearningPathHome', 'views/Material'],
    'B3': ['views/DiagnosisPanel', 'views/PracticeFlow', 'views/WrongBook'],
}

DEF_PAT = re.compile(r'^(export (?:default )?)?(function|const|type|interface)\s+([A-Za-z_][A-Za-z0-9_]*)')


def scan_defs(lines):
    return [(m.group(3), m.group(2), i) for i, ln in enumerate(lines) if (m := DEF_PAT.match(ln))]


def def_blocks(lines, defs):
    out = {}
    for idx, (name, _k, start) in enumerate(defs):
        end = defs[idx + 1][2] if idx + 1 < len(defs) else len(lines)
        out[name] = (start, end)
    return out


def relpath(from_module, to_module):
    if from_module == to_module:
        return None
    from_dir = from_module.split('/')[:-1] if from_module else []
    to_parts = to_module.split('/')
    common = 0
    while common < len(from_dir) and common < len(to_parts) - 1 and from_dir[common] == to_parts[common]:
        common += 1
    ups = len(from_dir) - common
    prefix = '../' * ups if ups else './'
    return prefix + '/'.join(to_parts[common:])


def imp_line(syms, spec):
    vals = [s for s in syms if s not in TYPE_SYMBOLS]
    typs = [s for s in syms if s in TYPE_SYMBOLS]
    parts = vals + [f'type {t}' for t in typs]
    return f"import {{ {', '.join(parts)} }} from '{spec}'"


def gen_header(body, from_module):
    out = []
    hooks = [h for h in REACT_HOOKS if re.search(r'\b' + h + r'\b', body)]
    if hooks:
        out.append(f"import {{ {', '.join(hooks)} }} from 'react'")
    fr = [f for f in FRAMER if re.search(r'\b' + f + r'\b', body)]
    if fr:
        out.append(f"import {{ {', '.join(fr)} }} from 'framer-motion'")
    if re.search(r'\becharts\b', body):
        out.append("import * as echarts from 'echarts'")
    icons = [ic for ic in ICONS if re.search(r'\b' + ic + r'\b', body)]
    if icons:
        out.append(f"import {{ {', '.join(icons)} }} from '@phosphor-icons/react'")
    if re.search(r'\bReactMarkdown\b', body):
        out.append("import ReactMarkdown from 'react-markdown'")
    if re.search(r'\bremarkGfm\b', body):
        out.append("import remarkGfm from 'remark-gfm'")
    api_vals = [v for v in API_VALUES if re.search(r'\b' + v + r'\b', body)]
    api_types = [t for t in API_TYPES if re.search(r'\b' + t + r'\b', body)]
    if api_vals or api_types:
        out.append(imp_line(api_vals + api_types, relpath(from_module, 'api')))
    if re.search(r'\buseToast\b', body) or re.search(r'\bToastProvider\b', body):
        toast_syms = [s for s in ['ToastProvider', 'useToast'] if re.search(r'\b' + s + r'\b', body)]
        out.append(f"import {{ {', '.join(toast_syms)} }} from '{relpath(from_module, 'Toast')}'")
    hl = [h for h in HL_FNS if re.search(r'\b' + h + r'\b', body)]
    if hl:
        out.append(imp_line(hl, relpath(from_module, 'pharmacyHighlight')))

    by_target = {}
    for sym, mod in REGISTRY.items():
        if mod == from_module:
            continue
        if re.search(r'\b' + re.escape(sym) + r'\b', body):
            by_target.setdefault(mod, []).append(sym)
    for rm in ROOT_MODULES:
        base = rm.split('/')[-1]
        if re.search(r'\b' + base + r'\b', body):
            by_target.setdefault(rm, []).append(base)
    for mod in sorted(by_target):
        out.append(imp_line(sorted(by_target[mod]), relpath(from_module, mod)))
    return '\n'.join(out)


def split_import_region(lines):
    """返回 (header_end, rest_lines)：header_end = 顶层 import 区之后的第一个内容行。"""
    i, in_import = 0, False
    while i < len(lines):
        ln = lines[i]
        if in_import:
            if "from '" in ln:
                in_import = False
            i += 1
            continue
        if ln.strip() == '' or ln.startswith('import '):
            if ln.startswith('import ') and "from '" not in ln:
                in_import = True
            i += 1
            continue
        break
    return i, lines[i:]


def do_batch(batch_key):
    modules = BATCHES[batch_key]
    lines = APP.read_text(encoding='utf-8').split('\n')
    defs = scan_defs(lines)
    blocks = def_blocks(lines, defs)
    pos = {name: start for name, _k, start in defs}

    delete_lines = set()
    for module in modules:
        target = SRC / (module + ('.tsx' if module.startswith(('views/', 'components/')) else '.ts'))
        if target.exists():
            print(f"[skip] {target} 已存在")
            continue
        syms = [s for s, m in REGISTRY.items() if m == module]
        missing = [s for s in syms if s not in pos]
        assert not missing, f'{module}: 符号不在 App.tsx 中: {missing}'
        parts = []
        for s in sorted(syms, key=lambda x: pos[x]):
            st, en = blocks[s]
            block = lines[st:en]
            m = DEF_PAT.match(block[0])
            if m and not m.group(1):
                block[0] = 'export ' + block[0]
            parts.append('\n'.join(block).rstrip() + '\n')
            delete_lines.update(range(st, en))
        body = '\n'.join(parts)
        content = gen_header(body, module) + '\n' + body
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        print(f"[move] {module} <- {len(syms)} 符号 ({len(content.splitlines())} 行)")

    if delete_lines:
        lines = [ln for i, ln in enumerate(lines) if i not in delete_lines]
        APP.write_text('\n'.join(lines), encoding='utf-8')
        print(f"[app] 删除 {len(delete_lines)} 行")

    regen_app_header()
    report()


def regen_app_header():
    lines = APP.read_text(encoding='utf-8').split('\n')
    header_end, rest_lines = split_import_region(lines)
    rest = '\n'.join(rest_lines)
    # 仍定义在 App.tsx 里的注册符号不发前瞻 import（分批中途状态可编译）
    local_defs = {name for name, _k, _s in scan_defs(rest_lines)}
    header = gen_header_excluding(rest, '', local_defs)
    APP.write_text(header + '\n' + rest, encoding='utf-8')
    print(f"[app] import 头重写完成（原 {header_end} 行头），现 {len(header.splitlines()) + len(rest_lines)} 行")


def gen_header_excluding(body, from_module, exclude):
    """gen_header 变体：跳过 exclude 集合里的注册符号（仍留在本文件的）。"""
    body = _strip_comments(body)
    by_target = {}
    for sym, mod in REGISTRY.items():
        if mod == from_module or sym in exclude:
            continue
        if re.search(r'\b' + re.escape(sym) + r'\b', body):
            by_target.setdefault(mod, []).append(sym)
    out = _base_imports(body, from_module)
    for rm in ROOT_MODULES:
        base = rm.split('/')[-1]
        if re.search(r'\b' + base + r'\b', body):
            by_target.setdefault(rm, []).append(base)
    for mod in sorted(by_target):
        out.append(imp_line(sorted(by_target[mod]), relpath(from_module, mod)))
    return '\n'.join(out)


def _strip_comments(body):
    return re.sub(r'/\*.*?\*/', '', body, flags=re.S)


def _base_imports(body, from_module):
    body = _strip_comments(body)
    out = []
    hooks = [h for h in REACT_HOOKS if re.search(r'\b' + h + r'\b', body)]
    if hooks:
        out.append(f"import {{ {', '.join(hooks)} }} from 'react'")
    fr = [f for f in FRAMER if re.search(r'\b' + f + r'\b', body)]
    if fr:
        out.append(f"import {{ {', '.join(fr)} }} from 'framer-motion'")
    if re.search(r'\becharts\b', body):
        out.append("import * as echarts from 'echarts'")
    icons = [ic for ic in ICONS if re.search(r'\b' + ic + r'\b', body)]
    if icons:
        out.append(f"import {{ {', '.join(icons)} }} from '@phosphor-icons/react'")
    if re.search(r'\bReactMarkdown\b', body):
        out.append("import ReactMarkdown from 'react-markdown'")
    if re.search(r'\bremarkGfm\b', body):
        out.append("import remarkGfm from 'remark-gfm'")
    api_vals = [v for v in API_VALUES if re.search(r'\b' + v + r'\b', body)]
    api_types = [t for t in API_TYPES if re.search(r'\b' + t + r'\b', body)]
    if api_vals or api_types:
        out.append(imp_line(api_vals + api_types, relpath(from_module, 'api')))
    if re.search(r'\buseToast\b', body) or re.search(r'\bToastProvider\b', body):
        toast_syms = [s for s in ['ToastProvider', 'useToast'] if re.search(r'\b' + s + r'\b', body)]
        out.append(f"import {{ {', '.join(toast_syms)} }} from '{relpath(from_module, 'Toast')}'")
    hl = [h for h in HL_FNS if re.search(r'\b' + h + r'\b', body)]
    if hl:
        out.append(imp_line(hl, relpath(from_module, 'pharmacyHighlight')))
    return out


def gen_header(body, from_module):
    body = _strip_comments(body)
    by_target = {}
    for sym, mod in REGISTRY.items():
        if mod == from_module:
            continue
        if re.search(r'\b' + re.escape(sym) + r'\b', body):
            by_target.setdefault(mod, []).append(sym)
    out = _base_imports(body, from_module)
    for rm in ROOT_MODULES:
        base = rm.split('/')[-1]
        if re.search(r'\b' + base + r'\b', body):
            by_target.setdefault(rm, []).append(base)
    for mod in sorted(by_target):
        out.append(imp_line(sorted(by_target[mod]), relpath(from_module, mod)))
    return '\n'.join(out)


def rehead():
    """① 收编 KgTabDef 等孤儿类型；② 重生成所有已拆文件的 import 头（幂等）。"""
    # ① App.tsx 里仍残留、且目标文件已存在的注册符号（真孤儿）→ 搬到其注册模块
    lines = APP.read_text(encoding='utf-8').split('\n')
    leftovers = []
    for s, mod in REGISTRY.items():
        target = SRC / (mod + ('.tsx' if mod.startswith(('views/', 'components/')) else '.ts'))
        if target.exists() and re.search(
                r'^(export )?(function|const|type|interface)\s+' + re.escape(s) + r'\b', '\n'.join(lines), re.M):
            leftovers.append((s, mod))
    for s, mod in leftovers:
        idx = next(i for i, ln in enumerate(lines) if re.match(r'^(export )?(function|const|type|interface)\s+' + re.escape(s) + r'\b', ln))
        line = lines.pop(idx)
        assert line.rstrip().endswith('}') or line.rstrip().endswith(';'), f'孤儿 {s} 是多行定义，需手工搬移'
        target = SRC / (mod + ('.tsx' if mod.startswith(('views/', 'components/')) else '.ts'))
        ttext = target.read_text(encoding='utf-8')
        if not re.search(r'\b' + re.escape(s) + r'\b', ttext.split('\n', 1)[1] if False else ttext):
            target.write_text(ttext.rstrip('\n') + '\n' + line + '\n', encoding='utf-8')
            print(f"[adopt] {s} -> {mod}")
        else:
            print(f"[adopt-skip] {s} 已在 {mod}")
        APP.write_text('\n'.join(lines), encoding='utf-8')
    # ② 重生成各已拆文件头
    for module in sorted(set(REGISTRY.values())):
        target = SRC / (module + ('.tsx' if module.startswith(('views/', 'components/')) else '.ts'))
        if not target.exists():
            continue
        flines = target.read_text(encoding='utf-8').split('\n')
        _he, rest_lines = split_import_region(flines)
        rest = '\n'.join(rest_lines)
        own = {s for s, m in REGISTRY.items() if m == module}
        local_defs = {name for name, _k, _s in scan_defs(rest_lines)} | own
        header = gen_header_excluding(rest, module, local_defs)
        target.write_text(header + '\n' + rest, encoding='utf-8')
        print(f"[rehead] {module}")
    regen_app_header()
    report()


def report():
    text = APP.read_text(encoding='utf-8')
    n = len(text.splitlines())
    remaining = [s for s in REGISTRY
                 if re.search(r'^(export )?(function|const|type|interface)\s+' + re.escape(s) + r'\b', text, re.M)]
    print(f"[status] App.tsx = {n} 行；仍未移出的注册符号: {remaining or '无'}")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'status':
        report()
    elif cmd == 'rehead':
        rehead()
    else:
        assert cmd in BATCHES, f'未知批次 {cmd}'
        do_batch(cmd)
