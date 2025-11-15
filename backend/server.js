// backend/server.js
// Edited: force UTF-8 for Python, use -u, Windows fallback, and return full recognized_persons array for already_marked

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

// Correct upload folder for your structure
const UPLOAD_DIR = path.join(__dirname, "python", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR)); // Static file serving

// Multer setup for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Upload route
app.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });

  const savedPath = path.join(UPLOAD_DIR, req.file.filename);
  console.log("✅ File received:", savedPath);

  // Determine python executable:
  // - allow overriding via env var
  // - use 'python' on Windows, 'python3' elsewhere by default
  const pythonExec =
    process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

  // Run Python face recognition script, passing the filename as an argument
  const pythonScriptPath = path.join(__dirname, "python", "attendance.py");

  // Use -u to force unbuffered stdout and set environment vars to enforce utf-8
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
    console.log("Python stdout:", text);
  });

  pythonProcess.stderr.on("data", (data) => {
    const text = data.toString();
    pythonError += text;
    console.error("Python stderr:", text);
  });

  pythonProcess.on("close", (code) => {
    console.log("Python script finished with code:", code);
    console.log("Full Python output:", pythonOutput);

    if (code !== 0) {
      console.error("Python script failed with error:", pythonError);
      return res.status(500).json({
        success: false,
        status: "internal_error",
        message:
          "Internal server error during image processing. Please check backend logs.",
        filename: req.file.filename,
      });
    }

    // Helper to safely test for phrases (emoji or plain text)
    const includesPhrase = (hay, phraseVariants) =>
      phraseVariants.some((p) => hay.includes(p));

    // Variants for matching (emoji and plain-text)
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

    // Outcome 1: SUCCESS - Attendance marked
    if (includesPhrase(pythonOutput, markedVariants)) {
      const recognizedPersons = [];
      const lines = pythonOutput.split("\n");
      lines.forEach((line) => {
        // Try to find either emoji or plain phrase then extract name
        const idxEmoji = line.indexOf("Attendance marked successfully for");
        if (idxEmoji !== -1) {
          const name = line
            .slice(idxEmoji + "Attendance marked successfully for".length)
            .trim()
            .replace(/^[\:\-–\s]+/, "")
            .replace(/\.$/, "");
          if (name) recognizedPersons.push(name);
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

    // Outcome 2: ALREADY MARKED
    else if (includesPhrase(pythonOutput, alreadyMarkedVariants)) {
      const alreadyMarked = [];
      const lines = pythonOutput.split("\n");
      lines.forEach((line) => {
        // Example lines:
        // "🕒 Name's attendance is already marked for today."
        // "Name's attendance is already marked for today."
        const mEmoji = line.match(
          /🕒\s*(.+?)'s attendance is already marked for today/i
        );
        const mPlain = line.match(
          /(.+?)'s attendance is already marked for today/i
        );
        if (mEmoji && mEmoji[1]) alreadyMarked.push(mEmoji[1].trim());
        else if (mPlain && mPlain[1]) alreadyMarked.push(mPlain[1].trim());
      });

      // If we didn't find any via the above pattern, try to fallback to all recognized names
      let persons = alreadyMarked;
      if (persons.length === 0) {
        const recogMatches =
          pythonOutput.match(/✅\s*Recognized:\s*([^\n(]+)/g) || [];
        persons = recogMatches.map((m) =>
          m.replace(/✅\s*Recognized:\s*/, "").trim()
        );
      }

      // final fallback single name
      if (persons.length === 0) {
        const fallback = pythonOutput.match(
          /([A-Za-z0-9_]+)'s attendance is already marked/i
        );
        if (fallback && fallback[1]) persons = [fallback[1]];
      }

      // Create a friendly message (if multiple, join with commas)
      const messageText =
        persons.length > 0
          ? `${persons.join(", ")}'s attendance is already marked for today.`
          : "Attendance is already marked for today.";

      return res.json({
        success: true,
        status: "already_marked",
        message: messageText,
        recognized_persons: persons, // <-- return array of all names
        filename: req.file.filename,
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

    // Outcome 3: UNKNOWN FACE DETECTED
    else if (includesPhrase(pythonOutput, unknownVariant)) {
      return res.json({
        success: true,
        status: "unknown",
        message:
          "The face in the photo is not recognized in our system. Please try again or contact the administration.",
        filename: req.file.filename,
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

    // Outcome 4: NO FACES DETECTED
    else if (includesPhrase(pythonOutput, noFaceVariant)) {
      return res.json({
        success: true,
        status: "no_face",
        message:
          "No face detected in the image! Please try again with a clearer photo.",
        filename: req.file.filename,
        summary: {
          detectedFaces: 0,
          newEntries: 0,
          unknownFaces: 0,
        },
      });
    }

    // Fallback: unclear
    else {
      return res.json({
        success: true,
        status: "processing_error",
        message:
          "Image processed, but the attendance result was unclear. Please try again.",
        filename: req.file.filename,
      });
    }
  });
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
