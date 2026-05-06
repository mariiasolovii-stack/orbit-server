import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

models = [
    "claude-3-5-sonnet-20240620",
    "claude-3-haiku-20240307",
    "claude-2.1",
    "claude-instant-1.2"
]

print("--- Anthropic Model Diagnostic ---")
for model in models:
    try:
        print(f"Testing {model}...", end=" ", flush=True)
        client.messages.create(
            model=model,
            max_tokens=10,
            messages=[{"role": "user", "content": "Hi"}]
        )
        print("✅ SUCCESS")
    except Exception as e:
        print(f"❌ FAILED ({e})")
