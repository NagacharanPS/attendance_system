const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 5000;

// Correct upload folder for your structure
const UPLOAD_DIR = path.join(__dirname, "python", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// Multer setup for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Upload route - UPDATED FOR SPECIFIC PYTHON OUTPUTS
app.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });

  const savedPath = path.join(UPLOAD_DIR, req.file.filename);
  console.log("✅ File received:", savedPath);

  // Run Python face recognition script
  const pythonScriptPath = path.join(__dirname, "python", "attendance.py");

  const pythonProcess = spawn("python", [pythonScriptPath]);

  let pythonOutput = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    pythonOutput += data.toString();
    console.log("Python output:", data.toString());
  });

  pythonProcess.stderr.on("data", (data) => {
    pythonError += data.toString();
    console.error("Python error:", data.toString());
  });

  pythonProcess.on("close", (code) => {
    console.log("Python script finished with code:", code);
    console.log("Full Python output:", pythonOutput);

    if (code === 0) {
      // Python script executed successfully
      if (pythonOutput.includes("unknown face(s) detected")) {
        // UNKNOWN FACE DETECTED
        res.json({
          success: true,
          python_success: false,
          message:
            "The face in the photo is not recognized in our system. Please contact the administration.",
          filename: req.file.filename,
          path: `/uploads/${req.file.filename}`,
        });
      } else if (
        pythonOutput.includes("Attendance marked for") ||
        pythonOutput.includes("Process completed successfully") ||
        pythonOutput.includes("New attendance entries")
      ) {
        // SUCCESS: Attendance marked
        // Extract recognized names from Python output
        const recognizedPersons = [];
        const lines = pythonOutput.split("\n");
        lines.forEach((line) => {
          if (line.includes("✅ Attendance marked for:")) {
            const name = line.split("✅ Attendance marked for:")[1].trim();
            recognizedPersons.push(name);
          } else if (line.includes("👤 Recognized:")) {
            const match = line.match(/👤 Recognized:\s+(\w+)/);
            if (match) recognizedPersons.push(match[1]);
          }
        });

        res.json({
          success: true,
          python_success: true,
          message: "Your attendance has been marked successfully!",
          recognized_persons: recognizedPersons,
          filename: req.file.filename,
          path: `/uploads/${req.file.filename}`,
        });
      } else if (pythonOutput.includes("No faces detected")) {
        res.json({
          success: true,
          python_success: false,
          message:
            "No face detected in the image! Please try again with a clearer photo.",
          filename: req.file.filename,
          path: `/uploads/${req.file.filename}`,
        });
      } else {
        res.json({
          success: true,
          python_success: false,
          message: "Unable to process the image. Please try again.",
          filename: req.file.filename,
          path: `/uploads/${req.file.filename}`,
        });
      }
    } else {
      // Python script failed
      console.error("Python script error:", pythonError);
      res.json({
        success: true,
        python_success: false,
        message: "Error processing image. Please try again.",
        filename: req.file.filename,
        path: `/uploads/${req.file.filename}`,
      });
    }
  });
});

// Static file serving for uploads
app.use("/uploads", express.static(UPLOAD_DIR));

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
