const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directory exists
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

// Helper to remove ANSI color codes from Python output
const stripAnsi = (str) =>
  str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );

app.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });

  const pythonExec =
    process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const pythonScriptPath = path.join(__dirname, "python", "attendance.py");

  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

  const pythonProcess = spawn(
    pythonExec,
    ["-u", pythonScriptPath, req.file.filename],
    { env }
  );

  let rawOutput = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    const text = data.toString();
    rawOutput += text;
    process.stdout.write(text); // Log to node terminal for debugging
  });

  pythonProcess.stderr.on("data", (data) => {
    const text = data.toString();
    pythonError += text;
    process.stderr.write(text);
  });

  pythonProcess.on("close", (code) => {
    // 1. Clean the output (remove colors)
    const cleanOutput = stripAnsi(rawOutput);
    const lines = cleanOutput.split("\n");

    // 2. Initialize trackers
    const newAttendance = [];
    const alreadyMarked = [];
    let unknownCount = 0;
    let noFaceDetected = false;

    // 3. Parse line by line
    lines.forEach((line) => {
      const trimmed = line.trim();

      // Check for New Attendance (📝 Attendance Recorded: Name)
      if (trimmed.includes("Attendance Recorded:")) {
        const name = trimmed.split(":")[1].trim();
        if (name) newAttendance.push(name);
      }

      // Check for Already Marked (ℹ️ Name is already marked...)
      else if (trimmed.includes("is already marked for today")) {
        // Extract name from start of line up to "is already"
        // remove "ℹ️" and extra spaces
        const namePart = trimmed.split("is already marked")[0];
        const name = namePart.replace("ℹ️", "").trim();
        if (name) alreadyMarked.push(name);
      }

      // Check for No Face
      else if (
        trimmed.includes("No human faces detected") ||
        trimmed.includes("No face detected")
      ) {
        noFaceDetected = true;
      }

      // Check for Unknown
      else if (trimmed.includes("Unknown Subject Detected")) {
        unknownCount++;
      }
    });

    // 4. Construct the Chat Message
    let userMessage = "";
    let status = "raw";

    if (noFaceDetected) {
      status = "no_face";
      userMessage =
        "⚠️ I couldn't find a face in that photo. Please try again with a clearer selfie.";
    } else if (
      newAttendance.length === 0 &&
      alreadyMarked.length === 0 &&
      unknownCount > 0
    ) {
      status = "unknown";
      userMessage =
        "🚫 Face recognized as 'Unknown'. Please contact admin to register.";
    } else {
      const parts = [];

      if (newAttendance.length > 0) {
        status = "marked";
        parts.push(
          `✅ Success! Attendance marked for: ${newAttendance.join(", ")}.`
        );
      }

      if (alreadyMarked.length > 0) {
        // If status wasn't 'marked' yet, set it to 'already_marked'
        if (status === "raw") status = "already_marked";
        parts.push(
          `🕒 Welcome back! Attendance already marked for: ${alreadyMarked.join(
            ", "
          )}.`
        );
      }

      if (unknownCount > 0) {
        parts.push(
          `(Plus ${unknownCount} unknown face${
            unknownCount > 1 ? "s" : ""
          } detected).`
        );
      }

      userMessage = parts.join("\n");
    }

    // Fallback if message is still empty
    if (!userMessage) {
      userMessage = "Process completed, but no status change detected.";
    }

    // 5. Send Response
    res.json({
      success: true,
      status: status,
      message: userMessage,
      recognized_persons: [...newAttendance, ...alreadyMarked],
      python_output: rawOutput, // Send raw for debugging if needed
    });
  });
});

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
