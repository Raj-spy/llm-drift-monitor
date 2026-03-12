from dotenv import load_dotenv
load_dotenv()  # .env file se GROQ_API_KEY / OPENAI_API_KEY padho

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_4o5MZsMGs0xGx4TDh30h2dFurG_-_dErYa4KgYJU6XM",
    project_id="15a8c941-b496-43cd-8cd1-fa193de30561",
    backend_url="https://innovative-learning-production-7c85.up.railway.app/v1",
)

response = monitor.chat(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Your message here"}],
)
monitor.flush()
print(response.choices[0].message.content)