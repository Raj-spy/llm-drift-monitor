from dotenv import load_dotenv
load_dotenv()

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_-AtQZdUmk5kIyQOW2es6hvSv4Y8AQm-1wUEEHSLLw3U",
    project_id="5516498e-6502-4a9f-b83b-e340ab113923",
    backend_url="https://innovative-learning-production-7c85.up.railway.app/v1",
)

response = monitor.chat(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}],
)
monitor.flush()
print(response.choices[0].message.content)