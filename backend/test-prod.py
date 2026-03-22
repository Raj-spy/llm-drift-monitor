from dotenv import load_dotenv
load_dotenv()

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_c0fdNo5AvSFTGGNbakcDEPFw49TPC5UaBxbutfyyyF4",
    project_id="f7b3f313-eb4d-4b1f-8c4f-d6f6fb957173",
    backend_url="https://innovative-learning-production-7c85.up.railway.app/v1",
)

# Add this to the file where your LLM calls happen
# e.g. main.py, app.py, routes/chat.py, services/ai.py
# Replace your existing LLM calls with monitor.chat()

response = monitor.chat(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Your message here"}],
)
monitor.flush()
print(response.choices[0].message.content)