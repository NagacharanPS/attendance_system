import { useState, useRef } from "react";
import "../css/UploadBox.css";

export default function UploadBox() {
  const [showOptions, setShowOptions] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const imageUrl = URL.createObjectURL(selectedFile);
      setPreview(imageUrl);
      setFile(selectedFile); // Save actual file for sending
      setShowOptions(false);
    }
  };

  // Remove uploaded preview
  const handleRemove = () => {
    setPreview(null);
    setFile(null);
  };

  // Send photo to backend
  const handleSend = async () => {
    if (!file) {
      alert("Please select a photo first.");
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Photo uploaded successfully: ${data.file}`);
      } else {
        alert("❌ Upload failed.");
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ Error uploading photo.");
    }
  };

  return (
    <div className="container">
      <div className="box-container">
        <p className="instruction">Upload a photo to mark attendance</p>

        <div className="input-box">
          {preview ? (
            <div className="image-wrapper">
              <img src={preview} alt="Uploaded" className="preview-img" />
              <button className="remove-btn" onClick={handleRemove}>
                ×
              </button>
            </div>
          ) : (
            <>
              <button
                className="plus-btn"
                onClick={() => setShowOptions(!showOptions)}
              >
                +
              </button>
              <input type="text" placeholder="Upload here..." disabled />
            </>
          )}

          {/* Send button inside input box */}
          {preview && (
            <button className="send-btn" onClick={handleSend}>
              Send
            </button>
          )}

          {/* Options dropdown */}
          {showOptions && !preview && (
            <div className="options-menu">
              <div className="menu-header">
                <button
                  className="close-btn"
                  onClick={() => setShowOptions(false)}
                >
                  ×
                </button>
              </div>

              <button
                className="option"
                onClick={() => photoInputRef.current.click()}
              >
                🖼️ Photos
              </button>

              <button
                className="option"
                onClick={() => fileInputRef.current.click()}
              >
                📁 Files
              </button>
            </div>
          )}
        </div>

        {/* Hidden inputs */}
        <input
          type="file"
          accept="image/*"
          ref={photoInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
