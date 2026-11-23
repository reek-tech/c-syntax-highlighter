import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-for-deployment")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + str(BASE_DIR / "database.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024
db = SQLAlchemy(app)

MAX_SOURCE_CHARS = 100_000
ALLOWED_EXTENSIONS = {".c"}
DOCKER_IMAGE = os.environ.get("C_RUNNER_IMAGE", "gcc:14")


class Program(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(120), nullable=False)
    source_code = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


with app.app_context():
    db.create_all()


def valid_source(source):
    return isinstance(source, str) and len(source) <= MAX_SOURCE_CHARS


def analyze_source(source):
    without_comments = re.sub(r"/\*.*?\*/|//[^\n]*", "", source, flags=re.S)
    strings_removed = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', without_comments)
    keywords = set("""
        auto break case char const continue default do double else enum extern float for
        goto if inline int long register restrict return short signed sizeof static struct
        switch typedef union unsigned void volatile while _Bool _Complex _Imaginary
    """.split())
    tokens = re.findall(r"\b[A-Za-z_]\w*\b", strings_removed)
    keyword_count = sum(1 for token in tokens if token in keywords)
    function_names = re.findall(r"\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{", strings_removed)
    variables = re.findall(
        r"\b(?:char|short|int|long|float|double|unsigned|signed|_Bool)\s+(?:\*+\s*)?([A-Za-z_]\w*)",
        strings_removed
    )
    return {
        "lines": len(source.splitlines()),
        "non_empty_lines": sum(1 for line in source.splitlines() if line.strip()),
        "comment_lines": sum(1 for line in source.splitlines() if line.strip().startswith("//") or "/*" in line or "*/" in line),
        "keywords": keyword_count,
        "functions": len(set(function_names)),
        "variables": len(set(variables)),
        "loops": len(re.findall(r"\b(for|while|do)\b", strings_removed)),
        "conditionals": len(re.findall(r"\b(if|switch)\b", strings_removed)),
        "estimated_complexity": 1 + len(re.findall(r"\b(if|for|while|case|catch)\b|&&|\|\|", strings_removed)),
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/analyze")
def api_analyze():
    data = request.get_json(silent=True) or {}
    source = data.get("code", "")
    if not valid_source(source):
        return jsonify(error="Code is missing or exceeds the 100 KB limit."), 400
    return jsonify(stats=analyze_source(source))


@app.post("/api/compile")
def api_compile():
    data = request.get_json(silent=True) or {}
    source = data.get("code", "")
    user_input = data.get("stdin", "")
    if not valid_source(source):
        return jsonify(error="Code is missing or exceeds the 100 KB limit."), 400
    if not isinstance(user_input, str) or len(user_input) > 20_000:
        return jsonify(error="Program input is too large."), 400

    docker = shutil.which("docker")
    if not docker:
        return jsonify(
            status="unavailable",
            output="Docker was not found. Install and start Docker Desktop, then run: docker pull gcc:14",
            errors="The compiler runner uses Docker isolation; it will not execute submitted C code directly on the host."
        ), 503

    with tempfile.TemporaryDirectory(prefix="c_highlighter_") as temp_dir:
        workdir = Path(temp_dir)
        (workdir / "main.c").write_text(source, encoding="utf-8")
        command = [
            docker, "run", "--rm", "-i",
            "--network", "none",
            "--memory", "128m",
            "--cpus", "0.5",
            "--pids-limit", "64",
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
            "--security-opt", "no-new-privileges",
            "--cap-drop", "ALL",
            "--ulimit", "cpu=5:5",
            "--ulimit", "fsize=1048576:1048576",
            "-v", f"{temp_dir}:/work:rw",
            "-w", "/work",
            DOCKER_IMAGE,
            "sh", "-lc",
            "gcc -std=c11 -Wall -Wextra -O0 main.c -o /work/program && /work/program"
        ]
        started_at = time.perf_counter()
        try:
            result = subprocess.run(
                command, input=user_input, text=True, capture_output=True,
                timeout=12, check=False
            )
        except subprocess.TimeoutExpired:
            return jsonify(status="timeout", output="", errors="Execution exceeded the 12-second server limit."), 200
        except Exception as exc:
            return jsonify(status="error", output="", errors=f"Could not start Docker runner: {exc}"), 500

        execution_time = round(time.perf_counter() - started_at, 3)
        stdout = result.stdout[-12000:]
        stderr = result.stderr[-12000:]
        if result.returncode == 0:
            return jsonify(status="success", output=stdout or "(Program finished with no output.)", errors=stderr, execution_time=execution_time)
        return jsonify(status="error", output=stdout, errors=stderr or f"Compiler/program exited with code {result.returncode}.", execution_time=execution_time)


@app.get("/api/programs")
def list_programs():
    programs = Program.query.order_by(Program.updated_at.desc()).all()
    return jsonify(programs=[{
        "id": p.id, "filename": p.filename,
        "updated_at": p.updated_at.isoformat(timespec="minutes")
    } for p in programs])


@app.post("/api/programs")
def save_program():
    data = request.get_json(silent=True) or {}
    filename = secure_filename(data.get("filename", "untitled.c")) or "untitled.c"
    if not filename.lower().endswith(".c"):
        filename += ".c"
    source = data.get("code", "")
    if not valid_source(source):
        return jsonify(error="Code is missing or exceeds the 100 KB limit."), 400
    program_id = data.get("id")
    program = db.session.get(Program, program_id) if program_id else None
    if program:
        program.filename, program.source_code = filename, source
    else:
        program = Program(filename=filename, source_code=source)
        db.session.add(program)
    db.session.commit()
    return jsonify(id=program.id, filename=program.filename, message="Program saved.")


@app.get("/api/programs/<int:program_id>")
def get_program(program_id):
    program = db.session.get(Program, program_id)
    if not program:
        return jsonify(error="Program not found."), 404
    return jsonify(id=program.id, filename=program.filename, code=program.source_code)


@app.delete("/api/programs/<int:program_id>")
def delete_program(program_id):
    program = db.session.get(Program, program_id)
    if not program:
        return jsonify(error="Program not found."), 404
    db.session.delete(program)
    db.session.commit()
    return jsonify(message="Program deleted.")


@app.post("/api/upload")
def upload_file():
    uploaded = request.files.get("file")
    if not uploaded or Path(uploaded.filename or "").suffix.lower() not in ALLOWED_EXTENSIONS:
        return jsonify(error="Please upload a .c file."), 400
    source = uploaded.read(100_001).decode("utf-8", errors="replace")
    if len(source) > MAX_SOURCE_CHARS:
        return jsonify(error="File exceeds the 100 KB limit."), 400
    return jsonify(filename=secure_filename(uploaded.filename) or "uploaded.c", code=source)


@app.post("/api/download")
def download_file():
    data = request.get_json(silent=True) or {}
    filename = secure_filename(data.get("filename", "program.c")) or "program.c"
    if not filename.lower().endswith(".c"):
        filename += ".c"
    source = data.get("code", "")
    if not valid_source(source):
        return jsonify(error="Code is missing or too large."), 400
    from io import BytesIO
    return send_file(BytesIO(source.encode("utf-8")), as_attachment=True, download_name=filename, mimetype="text/plain")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
