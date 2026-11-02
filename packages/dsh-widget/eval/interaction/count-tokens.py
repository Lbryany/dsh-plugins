"""Offline official DeepSeek V4 vocabulary; counts semantic content, not wire escapes.

This is a fixed estimate of API framing, audited against authoritative final usage.
It never downloads code, loads a remote model, or reads credentials.
"""
import sys, json, hashlib, math
from tokenizers import Tokenizer

path = sys.argv[1]
with open(path, "rb") as source:
    fingerprint = hashlib.sha256(source.read()).hexdigest()
tokenizer = Tokenizer.from_file(path)

def blocks(value):
    if isinstance(value, str):
        return [value]
    result = []
    for block in value or []:
        kind = block.get("type")
        if kind == "text":
            result.append(block["text"])
        elif kind == "tool_use":
            result += [block["name"], json.dumps(block["input"], ensure_ascii=False, separators=(",", ":"))]
        elif kind == "tool_result":
            result += blocks(block.get("content", ""))
        else:
            raise ValueError("Unreviewed content block for token estimation: " + str(kind))
    return result

for line in sys.stdin:
    try:
        request = json.loads(line)
        body = request["body"]
        texts = blocks(body.get("system", ""))
        for message in body["messages"]:
            texts += [message["role"]] + blocks(message["content"])
        for tool in body.get("tools", []):
            texts.append(json.dumps({k: tool[k] for k in ["name", "description", "input_schema"] if k in tool}, ensure_ascii=False, separators=(",", ":")))
        content = sum(len(tokenizer.encode(text, add_special_tokens=False).ids) for text in texts)
        framing = 256 + 16 * len(body["messages"]) + 4 * len(body.get("tools", []))
        print(json.dumps({"id": request["id"], "contentTokens": content, "estimate": math.ceil((content + framing) * 1.08), "framingAllowance": framing, "margin": 1.08, "tokenizerSha256": fingerprint}), flush=True)
    except Exception as error:
        print(json.dumps({"id": request.get("id"), "error": str(error)}), flush=True)
