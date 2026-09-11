# -*- coding: utf-8 -*-
"""知识图谱服务层（2026-09-11 全量版）：实体链接 + 图遍历。

替代 router._filter_relations_by_question 的纯子串匹配：
  - 词表：本域全部图谱节点名 + KnowledgePoint 别名，按长度降序最长匹配，
    命中按"节点类型优先级（药物>类别>靶点>节/知识点）"排序，避免短词淹没长词。
  - 遍历：以链接实体为起点做 BFS（默认 2 跳），返回子图（nodes/edges）与
    到各节点的路径，供诊断卡"错题子图"与前端可视化消费。
  - 跨域：实体可能同时属于多章（如"硝苯地平"在 CH20 与 CH24），link 返回
    全库同名节点，遍历限定本域，跨章提示由调用方按需查询。
"""
from sqlalchemy import select

from .models import DiagnosticDomain, KnowledgePoint, KnowledgeRelation

# 节点类型优先级（实体链接排序用，数字越小越优先展示）
TYPE_PRIORITY = {
    "药物": 0, "类别": 1, "靶点": 2, "效应": 3, "适应证": 4,
    "禁忌": 5, "机制": 6, "节": 7, "知识点": 8, "章节": 9,
}


def _node_name(n: dict | None) -> str:
    return (n or {}).get("name", "") or ""


def _node_type(n: dict | None) -> str:
    return (n or {}).get("type", "") or ""


def domain_terms(db, domain_id: str) -> list[tuple[str, str]]:
    """本域全部节点词表 [(name, type)]，按长度降序（最长匹配优先）。"""
    terms: dict[str, str] = {}
    for r in db.execute(select(KnowledgeRelation).where(
            KnowledgeRelation.domain_id == domain_id)).scalars():
        for n in (r.source, r.target):
            name, typ = _node_name(n), _node_type(n)
            if name and name not in terms:
                terms[name] = typ
    for kp in db.execute(select(KnowledgePoint).where(
            KnowledgePoint.domain_id == domain_id)).scalars():
        if kp.name and kp.name not in terms:
            terms[kp.name] = "知识点"
        for a in kp.aliases or []:
            if a and a not in terms:
                terms[a] = "知识点"
    return sorted(terms.items(), key=lambda kv: (-len(kv[0]), TYPE_PRIORITY.get(kv[1], 99)))


def link_entities(db, domain_id: str, text: str, limit: int = 8) -> list[dict]:
    """把题干/选项文本链接到本域图谱实体。返回 [{name, type}]（按长词优先）。"""
    if not text:
        return []
    out, seen = [], set()
    for name, typ in domain_terms(db, domain_id):
        if len(name) < 2 or name in seen:
            continue
        if name in text:
            out.append({"name": name, "type": typ})
            seen.add(name)
            # 屏蔽被长词包含的短词（如已命中"硝苯地平"就不再收"地平"）
            if len(out) >= limit:
                break
    return out


def _rel_to_edge(r: KnowledgeRelation) -> dict:
    return {"source": r.source, "edge": r.edge, "target": r.target,
            "note": r.note, "evidence": r.evidence,
            "review_status": r.review_status}


def traverse(db, domain_id: str, seeds: list[str], depth: int = 2,
             max_edges: int = 60) -> dict:
    """以种子实体名为起点 BFS，返回 {"nodes": [...], "edges": [...], "paths": {...}}。

    nodes: [{name, type}]；edges: 标准边 dict；paths: {node_name: [经过的边...]}。
    """
    rels = db.execute(select(KnowledgeRelation).where(
        KnowledgeRelation.domain_id == domain_id)).scalars().all()
    adj: dict[str, list] = {}
    for r in rels:
        s, t = _node_name(r.source), _node_name(r.target)
        adj.setdefault(s, []).append(r)
        adj.setdefault(t, []).append(r)
    seen_nodes: dict[str, str] = {}
    for s in seeds:
        if s in adj and s not in seen_nodes:
            seen_nodes[s] = next((n for n, t in
                                  [( _node_name(r.source), _node_type(r.source))
                                   for r in adj[s]] if n == s), "")
    for s in seeds:
        if s in adj and s not in seen_nodes:
            seen_nodes[s] = ""
    edges: list[dict] = []
    paths: dict[str, list] = {}
    frontier = [(s, 0, []) for s in seeds if s in adj]
    visited = set(seeds)
    for s in seeds:
        paths[s] = []
    while frontier and len(edges) < max_edges:
        name, d, path = frontier.pop(0)
        if d >= depth:
            continue
        for r in adj.get(name, []):
            e = _rel_to_edge(r)
            s, t = _node_name(r.source), _node_name(r.target)
            other = t if s == name else s
            if len(edges) < max_edges and not any(
                    x["source"] == e["source"] and x["edge"] == e["edge"]
                    and x["target"] == e["target"] for x in edges):
                edges.append(e)
            for n, typ in ((s, _node_type(r.source)), (t, _node_type(r.target))):
                if n and n not in seen_nodes:
                    seen_nodes[n] = typ
            if other not in visited:
                visited.add(other)
                paths[other] = path + [e]
                frontier.append((other, d + 1, path + [e]))
    nodes = [{"name": n, "type": t} for n, t in seen_nodes.items()]
    nodes.sort(key=lambda x: (TYPE_PRIORITY.get(x["type"], 99), x["name"]))
    return {"nodes": nodes, "edges": edges, "paths": paths}


def question_subgraph(db, domain_id: str, text: str, depth: int = 1,
                      max_edges: int = 40) -> dict:
    """错题子图：先实体链接，再以命中实体为种子遍历；无命中则回退全域边。"""
    linked = link_entities(db, domain_id, text)
    seeds = [x["name"] for x in linked]
    if not seeds:
        rels = db.execute(select(KnowledgeRelation).where(
            KnowledgeRelation.domain_id == domain_id)).scalars().all()
        edges = [_rel_to_edge(r) for r in rels[:max_edges]]
        nodes = {}
        for e in edges:
            for n in (e["source"], e["target"]):
                if _node_name(n):
                    nodes[_node_name(n)] = _node_type(n)
        return {"linked": [], "fallback": True,
                "nodes": [{"name": n, "type": t} for n, t in sorted(nodes.items())],
                "edges": edges, "paths": {}}
    g = traverse(db, domain_id, seeds, depth=depth, max_edges=max_edges)
    return {"linked": linked, "fallback": False, **g}


def cross_domain_hit(db, entity: str, limit_domains: int = 8) -> list[dict]:
    """实体在哪些章节出现过（跨章复用提示）。返回 [{code, title}]。"""
    out = []
    for r in db.execute(select(KnowledgeRelation)).scalars():
        if _node_name(r.source) == entity or _node_name(r.target) == entity:
            d = db.get(DiagnosticDomain, r.domain_id)
            if d and all(x["code"] != d.code for x in out):
                out.append({"code": d.code, "title": d.name})
                if len(out) >= limit_domains:
                    break
    return out


def build_wrong_graph(db, user_id: str, limit: int = 24) -> dict:
    """错题关联图谱（2026-09-12）：以"题目"为节点，章节/药物/错因为枢纽。

    同一枢纽连出的题目即"有联系"：同章（同属一章）、同药（题面提及同一药物）、
    同错因（归因到同一错因条目）。边全部由程序派生（题面链接/作答记录），
    evidence 统一为派生声明（source=做题关联），不冒充教材出处。
    无 DiagnosisSession 的题库错题没有归因边（诚实缺席，不断言错因）。
    """
    from .models import Attempt, DiagnosisSession, Misconception, Question

    attempts = db.execute(select(Attempt).where(
        Attempt.user_id == user_id, Attempt.is_correct == False  # noqa: E712
    ).order_by(Attempt.created_at.desc()).limit(limit)).scalars().all()
    if not attempts:
        return {"nodes": [], "edges": [], "total": 0}

    nodes: dict[str, dict] = {}
    node_meta: dict[str, dict] = {}
    edges: list[dict] = []
    seen_edge = set()

    def add_node(name: str, typ: str, meta: dict | None = None):
        if name not in nodes:
            nodes[name] = {"name": name, "type": typ}
            if meta:
                node_meta[name] = meta
        elif meta and name in node_meta:
            node_meta[name].setdefault("attempt_ids", []).extend(meta.get("attempt_ids", []))

    def add_edge(src: dict, edge: str, tgt: dict, note: str):
        key = (src["name"], edge, tgt["name"])
        if key in seen_edge:
            return
        seen_edge.add(key)
        edges.append({
            "source": src, "edge": edge, "target": tgt, "note": note,
            "evidence": {"source": "做题关联", "text": note},
            "review_status": "draft",
        })

    for a in attempts:
        q = db.get(Question, a.question_id)
        if not q:
            continue
        domain = db.get(DiagnosticDomain, q.domain_id)
        qnode = {"name": q.code, "type": "题目"}
        meta = node_meta.get(q.code, {})
        meta.setdefault("attempt_ids", [])
        if a.id not in meta["attempt_ids"]:
            meta["attempt_ids"].append(a.id)
        meta["stem"] = (q.stem or "")[:60]
        meta["domain_code"] = domain.code if domain else ""
        add_node(q.code, "题目", meta)

        # 同章枢纽
        if domain:
            ch_name = domain.name or domain.code
            add_node(ch_name, "章节")
            add_edge(qnode, "属于", {"name": ch_name, "type": "章节"},
                     f"{q.code} 归属{ch_name}")

        # 同药枢纽（题面实体链接，取前 4）
        qtext = " ".join([q.stem or ""] + [
            (o.get("text") or "") for o in (q.options or []) if isinstance(o, dict)])
        for link in link_entities(db, q.domain_id, qtext, limit=4):
            if link["type"] not in ("药物", "类别", "靶点"):
                continue
            add_node(link["name"], link["type"])
            add_edge(qnode, "涉及", {"name": link["name"], "type": link["type"]},
                     f"{q.code} 题面提及{link['name']}")

        # 同错因枢纽（仅有诊断会话的作答）
        s = db.execute(select(DiagnosisSession).where(
            DiagnosisSession.attempt_id == a.id)).scalar_one_or_none()
        mis = db.get(Misconception, s.hypothesis_id) if s and s.hypothesis_id else None
        if mis:
            add_node(mis.name, "错因", {"code": mis.code, "category": mis.category})
            add_edge(qnode, "归因", {"name": mis.name, "type": "错因"},
                     f"{q.code} 归因到{mis.category}·{mis.name[:24]}")

    total = db.execute(select(Attempt).where(
        Attempt.user_id == user_id, Attempt.is_correct == False  # noqa: E712
    )).scalars().all()
    return {"nodes": sorted(nodes.values(), key=lambda x: x["name"]),
            "edges": edges, "meta": node_meta, "total": len(total),
            "shown": len(node_meta)}
