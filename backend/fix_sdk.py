path = r'C:\Users\RAJTAYDE\AppData\Local\Programs\Python\Python312\Lib\site-packages\llm_monitor\monitor.py'

with open(path, 'r') as f:
    content = f.read()

old = '''    def flush(self) -> None:
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if events:
            self._send_batch(events)'''

new = '''    def flush(self) -> None:
        import time
        time.sleep(0.6)  # background thread ko process karne do
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if events:
            self._send_batch(events)'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print('SUCCESS')
else:
    print('NOT FOUND')