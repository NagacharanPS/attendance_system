// frontend/src/components/UploadBox.js
import { useState, useRef, useEffect } from "react";
import "../css/UploadBox.css";

export default function UploadBox() {
  const [showOptions, setShowOptions] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  // Initial messages for demonstration - removed the second static message
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
  const messagesEndRef = useRef(null);
  const menuRef = useRef(null);

  function getCurrentTime() {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, preview, showOptions]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        // Don't close if clicking on attach button
        if (!event.target.closest(".attach-btn")) {
          setShowOptions(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        addBotResponse("Please select an image file (JPG, PNG).", 500);
        return;
      }

      const imageUrl = URL.createObjectURL(selectedFile);
      setPreview(imageUrl);
      setFile(selectedFile);
      setShowOptions(false);

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

      // Auto-add bot response when photo is uploaded
      setTimeout(() => {
        addBotResponse("Great! Click the send button to mark your attendance.");
      }, 1000);
    }
  };

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setMessages((prev) =>
      prev.filter((msg) => msg.content !== "photo" && msg.imageUrl !== preview)
    );
  };

  const handleSend = async () => {
    if (!file) return;

    setIsUploading(true);
    const sendingMessageId = Date.now();

    setMessages((prev) => [
      ...prev,
      {
        id: sendingMessageId,
        type: "sent",
        content: "Sending photo...",
        time: getCurrentTime(),
        avatar: "👤",
        status: "sending",
      },
    ]);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setMessages((prev) => prev.filter((msg) => msg.id !== sendingMessageId));

      if (data.success) {
        let systemMessage = "";

        switch (data.status) {
          case "marked":
          case "already_marked":
            systemMessage = data.message;
            break;
          case "unknown":
          case "no_face":
          default:
            systemMessage = data.message;
            break;
        }

        if (systemMessage) {
          const parts = systemMessage.split("\n");
          parts.forEach((part, index) => {
            if (part.trim()) {
              setTimeout(() => {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + index,
                    type: "system",
                    content: part,
                    time: getCurrentTime(),
                  },
                ]);
              }, index * 250);
            }
          });
        }

        if (data.status === "marked" || data.status === "already_marked") {
          setTimeout(() => {
            handleRemove();
          }, 2000);
        }
      } else {
        throw new Error(data.message || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((msg) => msg.id !== sendingMessageId));
      addBotResponse(
        "❌ Could not connect to the server. Please try again.",
        500
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="glass-container">
      <div className="ambient-light one"></div>
      <div className="ambient-light two"></div>
      <div className="ambient-light three"></div>

      <div className="chat-interface">
        {/* Header */}
        <div className="chat-header">
          <div className="header-info">
            <div className="status-indicator online"></div>
            <div>
              <h2>AI Attendance Bot</h2>
              <p>Active now</p>
            </div>
          </div>
          <div className="header-decoration">
            <div className="decoration-dot"></div>
            <div className="decoration-dot"></div>
            <div className="decoration-dot"></div>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.type}`}>
              {msg.type !== "system" && (
                <div className="avatar">{msg.avatar}</div>
              )}

              <div className={`bubble ${msg.type}`}>
                {msg.content === "photo" ? (
                  <div className="photo-preview-bubble">
                    <img src={msg.imageUrl} alt="Upload" />
                    {file && preview === msg.imageUrl && !isUploading && (
                      <button
                        onClick={handleRemove}
                        className="remove-photo-btn"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : msg.status === "sending" ? (
                  <div className="typing-indicator-bubble">
                    <div className="dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ) : (
                  <div className="text-content">{msg.content}</div>
                )}
                {msg.time && <span className="timestamp">{msg.time}</span>}
              </div>
            </div>
          ))}

          {typing && (
            <div className="message-row received">
              <div className="avatar">🤖</div>
              <div className="bubble received typing">
                <div className="dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          {/* Enhanced Attachment Menu - Only Photo Option */}
          <div
            ref={menuRef}
            className={`attachment-menu ${showOptions ? "open" : ""}`}
          >
            <div className="menu-header">
              <h3>Upload Photo</h3>
              <button
                className="menu-close-btn"
                onClick={() => setShowOptions(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>

            <div className="menu-options-grid">
              {/* Only Photo Library Option */}
              <button
                onClick={() => photoInputRef.current.click()}
                className="menu-option"
              >
                <div className="glossy-icon photo">
                  <div className="icon-inner">📷</div>
                </div>
                <div className="option-text">
                  <span className="option-title">Photo Library</span>
                  <span className="option-subtitle">Choose from gallery</span>
                </div>
              </button>
            </div>
          </div>

          {/* Attach Button */}
          <button
            className={`attach-btn ${showOptions ? "active" : ""}`}
            onClick={() => setShowOptions(!showOptions)}
            aria-label={showOptions ? "Close menu" : "Open menu"}
          >
            <span className="plus-icon">+</span>
          </button>

          <div className="input-wrapper">
            {preview ? (
              <div className="mini-preview-bar">
                <div className="preview-info">
                  <div className="preview-icon">🖼️</div>
                  <span>Image ready to send</span>
                </div>
                <button onClick={handleRemove} disabled={isUploading}>
                  Cancel
                </button>
              </div>
            ) : (
              <input
                type="text"
                placeholder="Upload a photo to start..."
                readOnly
                onClick={() => setShowOptions(true)}
              />
            )}
          </div>

          <button
            className={`send-btn ${!file || isUploading ? "disabled" : ""}`}
            onClick={handleSend}
            disabled={!file || isUploading}
          >
            {isUploading ? <div className="spinner"></div> : "➤"}
          </button>
        </div>
      </div>

      {/* Hidden Inputs - Only photo input remains */}
      <input
        type="file"
        accept="image/*"
        ref={photoInputRef}
        hidden
        onChange={handleFileChange}
      />
    </div>
  );
}
