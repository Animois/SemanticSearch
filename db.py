#!/usr/bin/env python3
import json
import sqlite3
import sys
from pathlib import Path
from datetime import datetime
import uuid

DB_PATH = Path(__file__).resolve().parent / "app.db"


def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with conn() as cx:
        cx.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                user_id TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','user'))
            )
            """
        )
        cx.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                summary TEXT NOT NULL,
                summary_embedding TEXT,
                embedding_model TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
            """
        )

        admin = cx.execute("SELECT id FROM users WHERE user_id='admin'").fetchone()
        user = cx.execute("SELECT id FROM users WHERE user_id='user1'").fetchone()
        if not admin:
            cx.execute(
                "INSERT INTO users (id,name,user_id,password,role) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), "Default Admin", "admin", "admin123", "admin"),
            )
        if not user:
            cx.execute(
                "INSERT INTO users (id,name,user_id,password,role) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), "Sample User", "user1", "user123", "user"),
            )


def to_user(r):
    return {"id": r["id"], "name": r["name"], "userId": r["user_id"], "password": r["password"], "role": r["role"]}


def to_doc(r):
    emb = json.loads(r["summary_embedding"]) if r["summary_embedding"] else None
    return {
        "id": r["id"],
        "ownerId": r["owner_id"],
        "title": r["title"],
        "description": r["description"],
        "summary": r["summary"],
        "summaryEmbedding": {"vector": emb, "model": r["embedding_model"]} if emb is not None else None,
        "createdAt": r["created_at"],
        "updatedAt": r["updated_at"],
    }


def action(name, payload):
    with conn() as cx:
        if name == "login":
            r = cx.execute("SELECT * FROM users WHERE user_id=? AND password=?", (payload["userId"], payload["password"])).fetchone()
            return {"user": to_user(r)} if r else {"user": None}

        if name == "list_users":
            rows = cx.execute("SELECT * FROM users ORDER BY name").fetchall()
            return {"users": [to_user(x) for x in rows]}

        if name == "create_user":
            uid = str(uuid.uuid4())
            cx.execute(
                "INSERT INTO users (id,name,user_id,password,role) VALUES (?,?,?,?,?)",
                (uid, payload["name"], payload["userId"], payload["password"], payload["role"]),
            )
            r = cx.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            return {"user": to_user(r)}

        if name == "update_user":
            cx.execute(
                "UPDATE users SET name=?, user_id=?, password=?, role=? WHERE id=?",
                (payload["name"], payload["userId"], payload["password"], payload["role"], payload["id"]),
            )
            r = cx.execute("SELECT * FROM users WHERE id=?", (payload["id"],)).fetchone()
            return {"user": to_user(r) if r else None}

        if name == "delete_user":
            cx.execute("DELETE FROM documents WHERE owner_id=?", (payload["id"],))
            cx.execute("DELETE FROM users WHERE id=?", (payload["id"],))
            return {"ok": True}

        if name == "list_documents":
            if payload.get("ownerId"):
                rows = cx.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY updated_at DESC", (payload["ownerId"],)).fetchall()
            else:
                rows = cx.execute("SELECT * FROM documents ORDER BY updated_at DESC").fetchall()
            return {"documents": [to_doc(x) for x in rows]}

        if name == "create_document":
            did = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            emb = payload.get("summaryEmbedding")
            cx.execute(
                """INSERT INTO documents
                (id,owner_id,title,description,summary,summary_embedding,embedding_model,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    did,
                    payload["ownerId"],
                    payload["title"],
                    payload["description"],
                    payload["summary"],
                    json.dumps(emb.get("vector")) if emb else None,
                    emb.get("model") if emb else None,
                    now,
                    now,
                ),
            )
            r = cx.execute("SELECT * FROM documents WHERE id=?", (did,)).fetchone()
            return {"document": to_doc(r)}

        if name == "update_document":
            emb = payload.get("summaryEmbedding")
            now = datetime.utcnow().isoformat()
            cx.execute(
                """UPDATE documents SET title=?,description=?,summary=?,summary_embedding=?,embedding_model=?,updated_at=? WHERE id=?""",
                (
                    payload["title"],
                    payload["description"],
                    payload["summary"],
                    json.dumps(emb.get("vector")) if emb else None,
                    emb.get("model") if emb else None,
                    now,
                    payload["id"],
                ),
            )
            r = cx.execute("SELECT * FROM documents WHERE id=?", (payload["id"],)).fetchone()
            return {"document": to_doc(r) if r else None}

        if name == "delete_document":
            cx.execute("DELETE FROM documents WHERE id=?", (payload["id"],))
            return {"ok": True}

    return {"error": f"Unknown action: {name}"}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command"}))
        sys.exit(1)

    cmd = sys.argv[1]
    init_db()

    if cmd == "init":
        print(json.dumps({"ok": True, "db": str(DB_PATH)}))
        return

    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    result = action(cmd, payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
