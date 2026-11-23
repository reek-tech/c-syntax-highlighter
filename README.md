# C Syntax Studio — Web-based C IDE & Syntax Highlighter

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen?style=for-the-badge&logo=github)](https://reek-tech.github.io/c-syntax-highlighter/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/reek-tech/c-syntax-highlighter)

A modern, web-based C IDE and Syntax Highlighter built with **Monaco Editor** (the engine behind VS Code), featuring real-time syntax coloring, code metrics & static analysis, file management, and GCC compilation and execution.

🔗 **Live Project Link:** [https://reek-tech.github.io/c-syntax-highlighter/](https://reek-tech.github.io/c-syntax-highlighter/)

---

## 🌟 Key Features

- **Monaco C Code Editor**:
  - Full C syntax coloring and keyword recognition.
  - Bracket matching, auto-closing brackets and quotes.
  - Line numbers, code folding, word wrap, and indentation guides.
  - Search and replace (`Ctrl+F` / `Ctrl+H`).
- **Dark & Light Themes**: One-click toggle between dark and light editor themes.
- **Real-Time Code Analysis**:
  - Total line count and non-empty line count.
  - Comment line detection.
  - C keyword frequency.
  - Function and variable counter.
  - Loop and conditional statement metrics.
  - Estimated cyclomatic complexity score.
- **GCC Compile & Run**:
  - Compile and execute C programs with custom `stdin` input.
  - Displays standard output (`stdout`), compiler warnings, and error messages (`stderr`).
  - Supported directly online via Cloud GCC runner and locally via Docker isolation.
- **File Management**:
  - Create new `.c` files.
  - Upload local `.c` files directly into the workspace.
  - Save programs to the workspace Explorer with persistent storage.
  - Download edited code as `.c` files.

---

## 🚀 Running the Project

### Option 1: Instant Live Web Version (No Installation)
Visit the live demo directly in any modern browser:
👉 **[https://reek-tech.github.io/c-syntax-highlighter/](https://reek-tech.github.io/c-syntax-highlighter/)**

### Option 2: Running Locally with Python & Flask

#### 1. Clone the repository
```bash
git clone https://github.com/reek-tech/c-syntax-highlighter.git
cd c-syntax-highlighter
```

#### 2. Create and activate a virtual environment
**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

#### 3. Install dependencies
```bash
pip install -r requirements.txt
```

#### 4. (Optional) Run Docker for local isolated compiler
```bash
docker pull gcc:14
```

#### 5. Start the application
```bash
python app.py
```
Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

---

## 📁 Project Structure

```text
c-syntax-highlighter/
├── .github/
│   └── workflows/
│       └── pages.yml        # Automatic GitHub Pages deployment
├── static/
│   ├── css/
│   │   └── style.css        # Responsive dark/light theme styles
│   └── js/
│       └── editor.js        # Monaco editor, analysis & compile logic
├── templates/
│   └── index.html           # Flask web template
├── app.py                   # Flask backend with Docker runner & SQLite DB
├── index.html               # Live static web interface (GitHub Pages)
├── requirements.txt         # Python package dependencies
├── .gitignore               # Git ignore rules
└── README.md                # Project documentation
```

---

## 🛠️ Technologies Used

- **Frontend**: Monaco Editor, HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Python 3, Flask, Flask-SQLAlchemy, SQLite
- **Execution & Isolation**: GCC (GNU Compiler Collection), Docker
- **Deployment**: GitHub Pages, GitHub Actions

---

## 👤 Author

- **GitHub**: [@reek-tech](https://github.com/reek-tech)
- **Repository**: [reek-tech/c-syntax-highlighter](https://github.com/reek-tech/c-syntax-highlighter)
- **Live Demo**: [https://reek-tech.github.io/c-syntax-highlighter/](https://reek-tech.github.io/c-syntax-highlighter/)
