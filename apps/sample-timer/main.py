"""간단한 타이머 - 빌드 파이프라인 동작 확인용 샘플 앱"""
import tkinter as tk


class Timer:
    def __init__(self, root):
        self.root = root
        self.root.title("타이머")
        self.root.geometry("280x180")
        self.seconds = 0
        self.running = False

        self.label = tk.Label(root, text="00:00", font=("Helvetica", 48))
        self.label.pack(pady=20)

        box = tk.Frame(root)
        box.pack()
        self.btn = tk.Button(box, text="시작", width=8, command=self.toggle)
        self.btn.pack(side="left", padx=5)
        tk.Button(box, text="초기화", width=8, command=self.reset).pack(side="left", padx=5)

        self.tick()

    def toggle(self):
        self.running = not self.running
        self.btn.config(text="멈춤" if self.running else "시작")

    def reset(self):
        self.running = False
        self.seconds = 0
        self.btn.config(text="시작")
        self.draw()

    def draw(self):
        self.label.config(text=f"{self.seconds // 60:02d}:{self.seconds % 60:02d}")

    def tick(self):
        if self.running:
            self.seconds += 1
            self.draw()
        self.root.after(1000, self.tick)


if __name__ == "__main__":
    root = tk.Tk()
    Timer(root)
    root.mainloop()
