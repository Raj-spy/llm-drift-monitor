from llm_monitor import monitor
import openai
import time

groq_client = openai.OpenAI(
    api_key="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",
    base_url="https://api.groq.com/openai/v1",
)

monitor.configure(
    api_key="lmd_GwpZIljycAEk2uYn3RvQA9QxLlLM8ul_-1DgMijTJUo",
    project_id="372752c0-b8bc-4e0d-9671-337687dc625a",
    backend_url="http://localhost:8000/v1",
)

wrapped = monitor.wrap_openai(groq_client)

questions = ["What is AI?", "What is Python?", "What is a database?"]
models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

total = 0
for model in models:
    print("\n--- " + model + " ---")
    for q in questions:
        try:
            r = wrapped.chat.create(
                model=model,
                messages=[{"role": "user", "content": q}],
            )
            total += 1
            print("[" + str(total) + "] " + q + " -> OK")
            time.sleep(0.5)
        except Exception as e:
            print("ERR: " + str(e))

monitor.flush()
print("\nDone! " + str(total) + " requests sent.")