// backend/server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

const UPLOAD_DIR = path.join(__dirname, "python", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

app.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });

  const savedPath = path.join(UPLOAD_DIR, req.file.filename);
  console.log("✅ File received:", savedPath);

  const pythonExec =
    process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

  const pythonScriptPath = path.join(__dirname, "python", "attendance.py");

  // Force unbuffered mode and UTF-8 environment
  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
  const pythonProcess = spawn(
    pythonExec,
    ["-u", pythonScriptPath, req.file.filename],
    { env }
  );

  let pythonOutput = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    const text = data.toString();
    pythonOutput += text;
    // also log to Node console for debugging
    process.stdout.write("Python stdout: " + text);
  });

  pythonProcess.stderr.on("data", (data) => {
    const text = data.toString();
    pythonError += text;
    process.stderr.write("Python stderr: " + text);
  });

  pythonProcess.on("close", (code) => {
    console.log("Python script finished with code:", code);
    // keep a copy of the full raw output in logs
    console.log("Full Python output:", pythonOutput);

    // If python failed, return both stdout & stderr and code
    if (code !== 0) {
      console.error("Python script failed with error:", pythonError);
      return res.status(500).json({
        success: false,
        status: "internal_error",
        message:
          "Internal server error during image processing. See python_error for details.",
        python_output: pythonOutput,
        python_error: pythonError,
        exit_code: code,
        filename: req.file.filename,
      });
    }

    // --- Keep your existing parsing logic (unchanged) ---
    const includesPhrase = (hay, phraseVariants) =>
      phraseVariants.some((p) => hay.includes(p));

    const markedVariants = [
      "✅ Attendance marked successfully for",
      "Attendance marked successfully for",
    ];
    const alreadyMarkedVariants = [
      "attendance is already marked for today",
      "already marked for today",
    ];
    const unknownVariant = [
      "❓ Unknown face detected",
      "Unknown face detected",
    ];
    const noFaceVariant = [
      "⚠️ No faces detected",
      "No faces detected",
      "No face detected",
    ];

    // If marked
    if (includesPhrase(pythonOutput, markedVariants)) {
      const recognizedPersons = [];
      const lines = pythonOutput.split("\n");
      lines.forEach((line) => {
        if (line.includes("Attendance marked successfully for")) {
          const idx = line.indexOf("Attendance marked successfully for");
          const namePart = line
            .slice(idx + "Attendance marked successfully for".length)
            .trim();
          if (namePart)
            recognizedPersons.push(namePart.replace(/\.$/, "").trim());
        } else if (line.includes("✅ Attendance marked successfully for")) {
          const name = line
            .split("✅ Attendance marked successfully for")[1]
            .trim()
            .replace(/\.$/, "");
          if (name) recognizedPersons.push(name);
        }
      });

      return res.json({
        success: true,
        status: "marked",
        message: "Your attendance has been marked successfully!",
        recognized_persons: recognizedPersons,
        filename: req.file.filename,
        python_output: pythonOutput, // raw terminal-like output (exact)
        python_error: pythonError,
        summary: {
          detectedFaces: parseInt(
            pythonOutput.match(/Detected Faces:\s*(\d+)/)?.[1] || 0
          ),
          newEntries: parseInt(
            pythonOutput.match(/New Attendance Entries:\s*(\d+)/)?.[1] || 0
          ),
          unknownFaces: parseInt(
            pythonOutput.match(/Unknown Faces:\s*(\d+)/)?.[1] || 0
          ),
        },
      });
    }

    // If already marked
    else if (includesPhrase(pythonOutput, alreadyMarkedVariants)) {
      const alreadyMarked = [];
      const lines = pythonOutput.split("\n");
      lines.forEach((line) => {
        const mEmoji = line.match(
          /🕒\s*(.+?)'s attendance is already marked for today/i
        );
        const mPlain = line.match(
          /(.+?)'s attendance is already marked for today/i
        );
        if (mEmoji && mEmoji[1]) alreadyMarked.push(mEmoji[1].trim());
        else if (mPlain && mPlain[1]) alreadyMarked.push(mPlain[1].trim());
      });

      let persons = alreadyMarked;
      if (persons.length === 0) {
        const recogMatches =
          pythonOutput.match(/✅\s*Recognized:\s*([^\n(]+)/g) || [];
        persons = recogMatches.map((m) =>
          m.replace(/✅\s*Recognized:\s*/, "").trim()
        );
      }
      if (persons.length === 0) {
        const fallback = pythonOutput.match(
          /([A-Za-z0-9_]+)'s attendance is already marked/i
        );
        if (fallback && fallback[1]) persons = [fallback[1]];
      }

      const messageText =
        persons.length > 0
          ? `${persons.join(", ")}'s attendance is already marked for today.`
          : "Attendance is already marked for today.";

      return res.json({
        success: true,
        status: "already_marked",
        message: messageText,
        recognized_persons: persons,
        filename: req.file.filename,
        python_output: pythonOutput,
        python_error: pythonError,
        summary: {
          detectedFaces: parseInt(
            pythonOutput.match(/Detected Faces:\s*(\d+)/)?.[1] || 0
          ),
          newEntries: parseInt(
            pythonOutput.match(/New Attendance Entries:\s*(\d+)/)?.[1] || 0
          ),
          unknownFaces: parseInt(
            pythonOutput.match(/Unknown Faces:\s*(\d+)/)?.[1] || 0
          ),
        },
      });
    }

    // Unknown face
    else if (includesPhrase(pythonOutput, unknownVariant)) {
      return res.json({
        success: true,
        status: "unknown",
        message:
          "The face in the photo is not recognized in our system. Please try again or contact the administration.",
        filename: req.file.filename,
        python_output: pythonOutput,
        python_error: pythonError,
        summary: {
          detectedFaces: parseInt(
            pythonOutput.match(/Detected Faces:\s*(\d+)/)?.[1] || 0
          ),
          newEntries: parseInt(
            pythonOutput.match(/New Attendance Entries:\s*(\d+)/)?.[1] || 0
          ),
          unknownFaces: parseInt(
            pythonOutput.match(/Unknown Faces:\s*(\d+)/)?.[1] || 0
          ),
        },
      });
    }

    // No faces
    else if (includesPhrase(pythonOutput, noFaceVariant)) {
      return res.json({
        success: true,
        status: "no_face",
        message:
          "No face detected in the image! Please try again with a clearer photo.",
        filename: req.file.filename,
        python_output: pythonOutput,
        python_error: pythonError,
        summary: {
          detectedFaces: 0,
          newEntries: 0,
          unknownFaces: 0,
        },
      });
    }

    // Fallback - still return raw text so client can exactly show terminal output
    else {
      return res.json({
        success: true,
        status: "raw",
        message: "Image processed. Raw python output included.",
        filename: req.file.filename,
        python_output: pythonOutput,
        python_error: pythonError,
      });
    }
  });
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
