// frontend/src/components/UploadBox.js
// Updated to show each already-marked person as a separate system message (and keep summary)

import { useState, useRef, useEffect } from "react";
import "../css/UploadBox.css";

export default function UploadBox() {
  const [showOptions, setShowOptions] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "received",
      content:
        "Hello! Please upload a photo to mark your attendance for today.",
      time: getCurrentTime(),
      avatar: "🤖",
    },
  ]);
  const [typing, setTyping] = useState(false);

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Function to get current time in 12-hour format
  function getCurrentTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, preview]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Simulate bot response
  const addBotResponse = (message, delay = 1500) => {
    setTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: "received",
          content: message,
          time: getCurrentTime(),
          avatar: "🤖",
        },
      ]);
      setTyping(false);
    }, delay);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        addBotResponse("Please select an image file (JPG, PNG, or GIF).");
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        addBotResponse(
          "File size too large. Please select an image under 10MB."
        );
        return;
      }

      const imageUrl = URL.createObjectURL(selectedFile);
      setPreview(imageUrl);
      setFile(selectedFile);
      setShowOptions(false);

      // Add user message with preview
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: "sent",
          content: "photo",
          imageUrl: imageUrl,
          time: getCurrentTime(),
          avatar: "👤",
        },
      ]);

      addBotResponse("Great! Click the send button to mark your attendance.");
    }
  };

  // Handle camera capture
  const handleCameraCapture = () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      addBotResponse("Opening camera... Please allow camera permissions.");

      // For demo, we'll simulate camera with file input
      setTimeout(() => {
        cameraInputRef.current?.click();
      }, 1000);
    } else {
      addBotResponse(
        "Camera not supported in this browser. Please use photo upload instead."
      );
    }
  };

  // Remove uploaded preview
  const handleRemove = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setFile(null);

    // Remove the photo message
    setMessages((prev) => prev.filter((msg) => msg.content !== "photo"));

    addBotResponse("Photo removed. You can upload a new one.");
  };

  // Send photo to backend
  const handleSend = async () => {
    if (!file) {
      addBotResponse("Please select a photo first.");
      return;
    }

    setIsUploading(true);

    // Add sending message
    const sendingMessageId = Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: sendingMessageId,
        type: "sent",
        content:
          "Photo sent successfully. Please wait, processing face recognition...",
        time: getCurrentTime(),
        avatar: "👤",
        status: "sending",
      },
    ]);

    try {
      // Create FormData and append the file
      const formData = new FormData();
      formData.append("photo", file);

      // Send to your backend
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      // Remove the sending message
      setMessages((prev) => prev.filter((msg) => msg.id !== sendingMessageId));

      if (data.success) {
        // Handle different status cases
        let systemMessage = "";
        let botResponse = "";

        switch (data.status) {
          case "marked": {
            // include recognized person names if available
            const names =
              data.recognized_persons && data.recognized_persons.length
                ? data.recognized_persons.join(", ")
                : null;

            systemMessage = `✅ ${data.message}${
              names ? " (" + names + ")" : ""
            }`;
            botResponse = "Attendance recorded for today. Thank you!";

            // Add system message
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + 1,
                type: "system",
                content: systemMessage,
                time: getCurrentTime(),
              },
            ]);
            break;
          }

          case "already_marked": {
            // Use recognized_persons array if present, otherwise fall back to recognized_name
            const persons =
              data.recognized_persons && data.recognized_persons.length
                ? data.recognized_persons
                : data.recognized_name
                ? [data.recognized_name]
                : [];

            if (persons.length > 0) {
              // Add one system message per person for clarity (matches your existing UI)
              persons.forEach((p, idx) => {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + 10 + idx,
                    type: "system",
                    content: `🕒 ${p}'s attendance is already marked for today.`,
                    time: getCurrentTime(),
                  },
                ]);
              });
            } else {
              // Fallback generic message
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now() + 1,
                  type: "system",
                  content: `🕒 ${data.message}`,
                  time: getCurrentTime(),
                },
              ]);
            }

            botResponse =
              "Your attendance has already been recorded for today.";
            break;
          }

          case "unknown":
            systemMessage = `❌ ${data.message}`;
            botResponse =
              "Please make sure you are a registered student or contact the administration for assistance.";

            // Add system message
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + 1,
                type: "system",
                content: systemMessage,
                time: getCurrentTime(),
              },
            ]);
            break;

          case "no_face":
            systemMessage = `⚠️ ${data.message}`;
            botResponse =
              "Please try again with a clearer photo that shows your face clearly.";

            // Add system message
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + 1,
                type: "system",
                content: systemMessage,
                time: getCurrentTime(),
              },
            ]);
            break;

          default:
            systemMessage = `❓ ${data.message}`;
            botResponse =
              "There was an issue processing your attendance. Please try again.";

            // Add system message
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + 1,
                type: "system",
                content: systemMessage,
                time: getCurrentTime(),
              },
            ]);
        }

        // Add summary if available
        if (data.summary) {
          const summaryMessage = `📋 Summary:\n• Detected Faces: ${data.summary.detectedFaces}\n• New Attendance Entries: ${data.summary.newEntries}\n• Unknown Faces: ${data.summary.unknownFaces}`;

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 2,
              type: "system",
              content: summaryMessage,
              time: getCurrentTime(),
            },
          ]);
        }

        // Add bot confirmation after the system messages are enqueued
        addBotResponse(botResponse, 1000);

        // Reset after successful upload for marked and already_marked cases
        if (data.status === "marked" || data.status === "already_marked") {
          setTimeout(() => {
            if (preview) {
              URL.revokeObjectURL(preview);
            }
            setPreview(null);
            setFile(null);
            setMessages((prev) =>
              prev.filter((msg) => msg.content !== "photo")
            );
          }, 4000);
        }
      } else {
        throw new Error(data.message || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: "system",
          content: "❌ Failed to process attendance. Please try again.",
          time: getCurrentTime(),
        },
      ]);
      addBotResponse(
        "There was an error processing your attendance. Please try uploading the photo again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-avatar">
            <div className="avatar">🏢</div>
            <div className="status-indicator"></div>
          </div>
          <div className="chat-info">
            <h3>Attendance System</h3>
            <p>Upload your photo to mark attendance</p>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              {message.type !== "system" && (
                <div className="message-avatar">{message.avatar}</div>
              )}
              <div className="message-content">
                {message.content === "photo" ? (
                  <div className="upload-preview">
                    <img src={message.imageUrl} alt="Uploaded" />
                    <button className="preview-remove" onClick={handleRemove}>
                      ×
                    </button>
                  </div>
                ) : message.status === "sending" ? (
                  <div className="sending-message">
                    <span>{message.content}</span>
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                ) : (
                  <p style={{ whiteSpace: "pre-line" }}>{message.content}</p>
                )}
                <span className="message-time">{message.time}</span>
                {message.type === "sent" && !message.status && (
                  <div className="message-status">✓</div>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="message received">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="input-container">
            <button
              className={`attach-btn ${showOptions ? "active" : ""}`}
              onClick={() => setShowOptions(!showOptions)}
              title="Attach files"
            >
              {/* attach icon (omitted for brevity) */}
              📎
            </button>

            <div className="input-wrapper">
              {preview ? (
                <div className="preview-message">
                  <div className="preview-info">
                    <span className="preview-icon">🖼️</span>
                    <span>Photo ready to send for attendance</span>
                  </div>
                  <button className="change-photo-btn" onClick={handleRemove}>
                    Change
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Type a message or attach a photo..."
                  className="message-input"
                  onFocus={() => setShowOptions(false)}
                />
              )}
            </div>

            {preview ? (
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={isUploading}
              >
                {isUploading ? <div className="loading-spinner"></div> : "Send"}
              </button>
            ) : (
              <button className="send-btn disabled">Send</button>
            )}
          </div>

          {/* Attachment Options */}
          {showOptions && (
            <div className="attachment-options">
              <div className="options-header">
                <h4>Send Attachment</h4>
                <button
                  className="close-options"
                  onClick={() => setShowOptions(false)}
                >
                  ×
                </button>
              </div>
              <div className="options-grid">
                <button
                  className="option-item"
                  onClick={() => photoInputRef.current.click()}
                >
                  <span>Photo</span>
                </button>

                <button
                  className="option-item"
                  onClick={() => fileInputRef.current.click()}
                >
                  <span>File</span>
                </button>

                <button className="option-item" onClick={handleCameraCapture}>
                  <span>Camera</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hidden inputs */}
        <input
          type="file"
          accept="image/*,video/*"
          ref={photoInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
