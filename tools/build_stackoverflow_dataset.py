#!/usr/bin/env python3
"""Download 3000 rows from Hugging Face dataset and save as JSON.
Usage:
  python3 tools/build_stackoverflow_dataset.py
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

DATASET = "MartinElMolon/stackoverflow_preguntas_con_embeddings"
BASE = "https://datasets-server.huggingface.co/rows"
TARGET = 3000
CHUNK = 100


def fetch_rows():
    rows = []
    offset = 0
    while len(rows) < TARGET:
        params = urllib.parse.urlencode({
            "dataset": DATASET,
            "config": "default",
            "split": "train",
            "offset": offset,
            "length": CHUNK,
        })
        with urllib.request.urlopen(f"{BASE}?{params}", timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))

        batch = payload.get("rows", [])
        if not batch:
            break

        for entry in batch:
            row = entry.get("row", {})
            embedding = row.get("embeddings") or row.get("embedding") or row.get("vector")
            question = row.get("question") or row.get("pregunta") or row.get("title") or row.get("text") or ""
            answer = row.get("answer") or row.get("respuesta") or row.get("body") or ""
            tags = row.get("tags") or []
            if embedding is None:
                continue
            rows.append({
                "id": row.get("id", len(rows)),
                "question": question,
                "answer": answer,
                "tags": tags,
                "embedding": embedding,
            })
            if len(rows) >= TARGET:
                break
        offset += len(batch)
        print(f"Fetched {len(rows)} rows")
    return rows[:TARGET]


if __name__ == "__main__":
    out = fetch_rows()
    Path("data").mkdir(exist_ok=True)
    with open("data/stackoverflow_3000.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"Saved {len(out)} rows to data/stackoverflow_3000.json")
