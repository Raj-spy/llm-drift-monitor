from dotenv import load_dotenv
load_dotenv()  # .env file se GROQ_API_KEY / OPENAI_API_KEY padho

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_cB-8vyyD7831DfnuPwyuprbYVLMk0QYdCm5798JU77w",
    project_id="a7bc3d84-f958-471e-a400-f09b0c794f86",
    backend_url="https://innovative-learning-production-7c85.up.railway.app/v1",
)

response = monitor.chat(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Your message here"}],
)
monitor.flush()
print(response.choices[0].message.content)