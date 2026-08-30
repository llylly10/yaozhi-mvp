# -*- coding: utf-8 -*-
"""冒烟：摸底提交 → 弱项带域名称。"""
import json
import urllib.request


def req(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"http://localhost:8000{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    return json.loads(urllib.request.urlopen(r).read())


qs = req("/questions?usage=diagnostic")
answers = {q["id"]: q["options"][0]["key"] for q in qs[:5]}
u = req("/sessions/demo", {"account": "smoke", "invite_code": "DEMO2026"})["user_id"]
req(f"/users/{u}/consent", {"user_agreement": True, "privacy_policy": True, "data_collection": True})
r = req(f"/assessment/{u}/submit", {"answers": answers})
print("domains:", r["domains"])
print("weak:", [(w["domain"], w["category"]) for w in r["weak"]])
