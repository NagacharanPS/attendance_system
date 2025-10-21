import { useState, useRef, useEffect } from "react";
import "../css/UploadBox.css";

/*************  ✨ Windsurf Command ⭐  *************/
/**
 * The UploadBox component is a UI component that allows users to
 * upload photos or videos to mark their attendance. It also provides
 * a chat interface for users to interact with the attendance system.
 * The component uses the React Hooks API to manage state and side
 * effects.
 * The component renders a chat area with a text input field and a
 * button to send the text as a message. It also renders an attachment
 * area with buttons to attach a photo, video, document, or to
 * capture a photo using the device's camera.
 * The component uses the useState hook to manage state for the
 * attachment options, the preview of the uploaded photo or video, and
 * the messages and typing status.
 * The component uses the useEffect hook to auto-scroll to the bottom of
 * the chat area when the messages or preview changes.
 * The component uses the useRef hook to manage the file input fields and
 * the chat area's end ref.
 * The component provides a docstring with information about how to use
 * the component and its props.
 * @param {boolean} showOptions - Whether to show the attachment options.
 * @param {string} preview - The URL of the uploaded photo or video.
 * @param {object} file - The uploaded file object.
 * @param {boolean} isUploading - Whether the file is being uploaded.
 * @param {array} messages - The messages in the chat area.
 * @param {boolean} typing - Whether the user is typing a message.
 * @param {function} addBotResponse - A function to add a message to the chat area
 *   with the bot's response.
 * @param {function} handleFileChange - A function to handle the file change event.
 * @param {function} handleSend - A function to handle the send button click event.
 * @param {function} handleCameraCapture - A function to handle the camera capture
 *   button click event.
 * @param {function} handleRemove - A function to handle the remove button click event.
 * @param {function} scrollToBottom - A function to scroll to the bottom of the
 *   chat area.
 * @param {function} addBotResponse - A function to add a message to the chat area
 *   with the bot's response and a delay.
/*******  8da6d663-2fa5-4fa6-9923-29279dfb9bc8  *******/ export default function UploadBox() {
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
      time: "10:00 AM",
      avatar: "🤖",
    },
  ]);
  const [typing, setTyping] = useState(false);

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const messagesEndRef = useRef(null);

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
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
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
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
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

  // Send photo to backend - UPDATED FOR SPECIFIC MESSAGES
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
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
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

      if (data.success) {
        // Remove the sending message
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== sendingMessageId)
        );

        // Check the specific message from Python script
        if (data.python_success) {
          // SUCCESS: Attendance marked successfully
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              type: "system",
              content: "✅ Your attendance has been marked successfully!",
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);

          // Add bot confirmation
          addBotResponse("Attendance recorded for today. Thank you!", 1000);

          // Reset after successful upload
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
        } else {
          // UNKNOWN FACE: Display specific message
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              type: "system",
              content:
                "❌ The face in the photo is not recognized in our system. Please contact the administration.",
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);

          addBotResponse(
            "Please make sure you are a registered student or contact the administration for assistance.",
            1000
          );
        }
      } else {
        throw new Error(data.message || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== sendingMessageId),
        {
          id: Date.now(),
          type: "system",
          content: "❌ Failed to process attendance. Please try again.",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
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
                  <p>{message.content}</p>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59723 21.9983 8.00505 21.9983C6.41286 21.9983 4.88589 21.3658 3.76005 20.24C2.6342 19.1142 2.00171 17.5872 2.00171 15.995C2.00171 14.4028 2.6342 12.8759 3.76005 11.75L12.33 3.18C13.0877 2.42231 14.1432 1.9967 15.25 1.9967C16.3569 1.9967 17.4124 2.42231 18.17 3.18C18.9277 3.93769 19.3533 4.99318 19.3533 6.1C19.3533 7.20682 18.9277 8.26231 18.17 9.02L9.58005 17.6C9.20447 17.9756 8.65633 18.1953 8.08005 18.1953C7.50376 18.1953 6.95562 17.9756 6.58005 17.6C6.20447 17.2244 5.98479 16.6763 5.98479 16.1C5.98479 15.5237 6.20447 14.9756 6.58005 14.6L15.07 6.11"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
                {isUploading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ) : (
              <button className="send-btn disabled">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
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
                  <div className="option-icon photo">
                    <div className="icon-bg"></div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span>Photo & Video</span>
                </button>

                <button
                  className="option-item"
                  onClick={() => fileInputRef.current.click()}
                >
                  <div className="option-icon file">
                    <div className="icon-bg"></div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M13 2V9H20"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span>Document</span>
                </button>

                <button className="option-item" onClick={handleCameraCapture}>
                  <div className="option-icon camera">
                    <div className="icon-bg"></div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 3H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M15 13C15 14.6569 13.6569 16 12 16C10.3431 16 9 14.6569 9 13C9 11.3431 10.3431 10 12 10C13.6569 10 15 11.3431 15 13Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
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
