import cv2
import os
import numpy as np
import pandas as pd
from datetime import datetime
import warnings
import subprocess
import platform
warnings.filterwarnings('ignore')

# Try to import DeepFace, install if not available
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
    print("✅ DeepFace loaded successfully")
except ImportError:
    print("📦 DeepFace not found. Installing...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "deepface"])
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
    print("✅ DeepFace installed and loaded")

# ------------------------------------------------------------
# Configuration - Optimized for YOUR project structure
# ------------------------------------------------------------
class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
    KNOWN_FACES_DIR = os.path.join(BASE_DIR, 'known_faces')
    ATTENDANCE_FILE = os.path.join(BASE_DIR, 'attendance.xlsx')
    MODEL_NAME = "VGG-Face"
    DETECTOR_BACKEND = "opencv"
    SIMILARITY_THRESHOLD = 0.6

# ------------------------------------------------------------
# Face Recognition Engine - Optimized for your structure
# ------------------------------------------------------------
class FaceRecognitionEngine:
    def __init__(self, config):
        self.config = config
        self.known_faces_db = []
        self._ensure_directories()
        self._build_known_faces_database()
    
    def _ensure_directories(self):
        """Create necessary directories if they don't exist"""
        os.makedirs(self.config.UPLOADS_DIR, exist_ok=True)
        os.makedirs(self.config.KNOWN_FACES_DIR, exist_ok=True)
        
        if not os.path.exists(self.config.UPLOADS_DIR):
            raise FileNotFoundError(f"❌ Uploads directory could not be created: {self.config.UPLOADS_DIR}")
    
    def _build_known_faces_database(self):
        """Build database from your known_faces/charan and known_faces/kiran folders"""
        print("🔨 Building known faces database from your folder structure...")
        
        if not os.path.exists(self.config.KNOWN_FACES_DIR):
            print(f"⚠️ Known faces directory not found: {self.config.KNOWN_FACES_DIR}")
            return
        
        # Count total images
        total_images = 0
        successful_encodings = 0
        
        # Walk through all subdirectories (charan, kiran, etc.)
        for person_folder in os.listdir(self.config.KNOWN_FACES_DIR):
            person_path = os.path.join(self.config.KNOWN_FACES_DIR, person_folder)
            
            if os.path.isdir(person_path):
                print(f"👤 Processing: {person_folder}")
                
                for filename in os.listdir(person_path):
                    if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                        total_images += 1
                        img_path = os.path.join(person_path, filename)
                        
                        try:
                            # Use person folder name as the identity (charan, kiran)
                            embedding_obj = DeepFace.represent(
                                img_path=img_path,
                                model_name=self.config.MODEL_NAME,
                                detector_backend=self.config.DETECTOR_BACKEND,
                                enforce_detection=False,
                                align=True
                            )
                            
                            if embedding_obj:
                                self.known_faces_db.append({
                                    'name': person_folder,  # Use folder name as person's name
                                    'embedding': embedding_obj[0]['embedding'],
                                    'filename': filename,
                                    'path': img_path,
                                    'person_folder': person_folder
                                })
                                successful_encodings += 1
                                print(f"    ✅ {filename}")
                            else:
                                print(f"    ⚠️ No face in: {filename}")
                                
                        except Exception as e:
                            print(f"    ❌ Failed: {filename} - {str(e)[:50]}...")
        
        print(f"✅ Database built: {successful_encodings}/{total_images} images encoded")
        print(f"📁 Persons in database: {set([face['name'] for face in self.known_faces_db])}")
    
    def find_latest_uploaded_image(self):
        """Find the most recently uploaded image from uploads folder"""
        image_files = [
            f for f in os.listdir(self.config.UPLOADS_DIR)
            if os.path.isfile(os.path.join(self.config.UPLOADS_DIR, f)) and 
            f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ]
        
        if not image_files:
            raise FileNotFoundError("❌ No image files found in uploads directory!")
        
        # Sort by modification time (newest first)
        image_files.sort(
            key=lambda f: os.path.getmtime(os.path.join(self.config.UPLOADS_DIR, f)),
            reverse=True
        )
        
        latest_image = image_files[0]
        image_path = os.path.join(self.config.UPLOADS_DIR, latest_image)
        
        print(f"🔍 Latest uploaded image: {latest_image}")
        return image_path
    
    def process_image(self, image_path):
        """Process image and recognize faces using your known_faces database"""
        # Validate image
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"❌ Image not found: {image_path}")
        
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"❌ Failed to load image: {image_path}")
        
        print(f"🖼 Image loaded: {img.shape[1]}x{img.shape[0]} pixels")
        
        # Detect and recognize faces
        try:
            # FIXED: Use represent instead of analyze with empty actions
            face_embeddings = DeepFace.represent(
                img_path=image_path,
                model_name=self.config.MODEL_NAME,
                detector_backend=self.config.DETECTOR_BACKEND,
                enforce_detection=False,
                align=True
            )
            
            recognized_faces = []
            
            for i, face_data in enumerate(face_embeddings):
                facial_area = face_data.get('facial_area', {})
                x = facial_area.get('x', 0)
                y = facial_area.get('y', 0)
                w = facial_area.get('w', 0)
                h = facial_area.get('h', 0)
                
                if w == 0 or h == 0:
                    continue
                
                # Convert to (top, right, bottom, left) format
                top = y
                right = x + w
                bottom = y + h
                left = x
                
                # Get the embedding for this face
                face_embedding = face_data['embedding']
                
                # Recognize face against your known_faces database
                name, confidence = self._recognize_face_by_embedding(face_embedding)
                
                recognized_faces.append({
                    'location': (top, right, bottom, left),
                    'name': name,
                    'confidence': confidence,
                    'face_number': i + 1
                })
                
                status = "👤 Recognized" if name != "Unknown" else "❓ Unknown"
                print(f"  {status}: {name} (Confidence: {confidence:.2%})")
            
            return img, recognized_faces
            
        except Exception as e:
            print(f"❌ Face processing failed: {e}")
            raise
    
    def _recognize_face_by_embedding(self, source_embedding):
        """Recognize a face by comparing embeddings directly (more efficient)"""
        if not self.known_faces_db:
            return "Unknown", 0.0
        
        best_match = "Unknown"
        best_confidence = 0.0
        
        for known_face in self.known_faces_db:
            try:
                # Calculate cosine similarity between embeddings
                from numpy import dot
                from numpy.linalg import norm
                
                # Convert to numpy arrays if they aren't already
                source_emb = np.array(source_embedding)
                known_emb = np.array(known_face['embedding'])
                
                # Calculate cosine similarity
                cosine_similarity = dot(source_emb, known_emb) / (norm(source_emb) * norm(known_emb))
                confidence = (cosine_similarity + 1) / 2  # Convert from [-1,1] to [0,1]
                
                # Update best match if this is better
                if confidence > best_confidence and confidence > self.config.SIMILARITY_THRESHOLD:
                    best_confidence = confidence
                    best_match = known_face['name']
                    
            except Exception as e:
                continue
        
        return best_match, best_confidence

    def _recognize_face_alternative(self, source_image_path):
        """Alternative recognition method using DeepFace verify"""
        if not self.known_faces_db:
            return "Unknown", 0.0
        
        best_match = "Unknown"
        best_confidence = 0.0
        
        for known_face in self.known_faces_db:
            try:
                # Compare faces using DeepFace verification
                verification = DeepFace.verify(
                    img1_path=source_image_path,
                    img2_path=known_face['path'],
                    model_name=self.config.MODEL_NAME,
                    detector_backend=self.config.DETECTOR_BACKEND,
                    distance_metric='cosine',
                    enforce_detection=False,
                    align=True
                )
                
                # Convert distance to confidence (lower distance = higher confidence)
                distance = verification['distance']
                confidence = 1 - distance
                
                # Update best match if this is better
                if verification['verified'] and confidence > best_confidence and confidence > self.config.SIMILARITY_THRESHOLD:
                    best_confidence = confidence
                    best_match = known_face['name']
                    
            except Exception as e:
                continue
        
        return best_match, best_confidence
    
    def mark_attendance(self, recognized_faces):
        """Mark attendance in Excel file - prevents duplicates for same day"""
        # Load or create attendance file
        if os.path.exists(self.config.ATTENDANCE_FILE):
            df = pd.read_excel(self.config.ATTENDANCE_FILE)
        else:
            df = pd.DataFrame(columns=["Name", "Date", "Time", "Confidence"])
        
        new_entries = 0
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        
        for face in recognized_faces:
            name = face['name']
            confidence = face['confidence']
            
            if name != "Unknown":
                # Check if this person already marked attendance today
                today_attendance = df[
                    (df['Name'] == name) & 
                    (df['Date'] == date_str)
                ]
                
                if today_attendance.empty:
                    # Add new attendance entry
                    new_entry = pd.DataFrame([{
                        "Name": name,
                        "Date": date_str,
                        "Time": time_str,
                        "Confidence": f"{confidence:.2%}"
                    }])
                    df = pd.concat([df, new_entry], ignore_index=True)
                    new_entries += 1
                    print(f"  ✅ Attendance marked for: {name}")
                else:
                    print(f"  ℹ️ {name} already marked attendance today")
        
        # Save to Excel
        df.to_excel(self.config.ATTENDANCE_FILE, index=False)
        return new_entries
    
    def draw_results(self, img, recognized_faces):
        """Draw bounding boxes and labels on image with your folder names"""
        img_display = img.copy()
        
        for face in recognized_faces:
            top, right, bottom, left = face['location']
            name = face['name']
            confidence = face['confidence']
            
            # Colors: Green for recognized, Red for unknown
            color = (26, 237, 30) if name != "Unknown" else (0, 0, 255)
            
            # Draw face rectangle
            cv2.rectangle(img_display, (left, top), (right, bottom), color, 3)
            
            # Prepare label text
            if name != "Unknown":
                label = f"{name} ({confidence:.1%})"
            else:
                label = "Unknown"
            
            # Calculate text size for background
            text_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            
            # Draw label background
            cv2.rectangle(
                img_display, 
                (left, bottom - text_size[1] - 15), 
                (left + text_size[0] + 10, bottom), 
                color, 
                -1
            )
            
            # Draw label text
            cv2.putText(
                img_display, 
                label, 
                (left + 5, bottom - 5), 
                cv2.FONT_HERSHEY_SIMPLEX, 
                0.7, 
                (255, 255, 255), 
                2
            )
        
        return img_display

def open_attendance_file():
    """Open the attendance Excel file automatically"""
    attendance_file = os.path.join(os.path.dirname(__file__), 'attendance.xlsx')
    
    if os.path.exists(attendance_file):
        print(f"📊 Opening attendance file: {attendance_file}")
        
        try:
            if platform.system() == 'Windows':
                os.startfile(attendance_file)
            elif platform.system() == 'Darwin':  # macOS
                subprocess.call(['open', attendance_file])
            else:  # Linux
                subprocess.call(['xdg-open', attendance_file])
            print("✅ Excel file opened successfully!")
        except Exception as e:
            print(f"❌ Could not open Excel file automatically: {e}")
            print(f"💡 Please open manually: {attendance_file}")
    else:
        print("❌ Attendance file not found!")

# ------------------------------------------------------------
# Main Application
# ------------------------------------------------------------
def main():
    print("🚀 AI Attendance System - Starting...")
    print("=" * 50)
    print("📁 Project Structure:")
    print("  ├── uploads/           (Your uploaded images)")
    print("  ├── known_faces/       (Reference photos)")
    print("  │   ├── charan/        (Charan's photos)") 
    print("  │   └── kiran/         (Kiran's photos)")
    print("  └── attendance.xlsx    (Attendance records)")
    print("=" * 50)
    
    try:
        # Initialize engine with your project structure
        config = Config()
        engine = FaceRecognitionEngine(config)
        
        # Find and process latest uploaded image
        image_path = engine.find_latest_uploaded_image()
        img, recognized_faces = engine.process_image(image_path)
        
        if not recognized_faces:
            print("⚠️ No faces detected in the image")
            return
        
        print(f"\n📋 Processing Summary:")
        print(f"  - Faces detected: {len(recognized_faces)}")
        print(f"  - Known persons: {len([f for f in recognized_faces if f['name'] != 'Unknown'])}")
        print(f"  - Unknown persons: {len([f for f in recognized_faces if f['name'] == 'Unknown'])}")
        
        # Mark attendance
        new_entries = engine.mark_attendance(recognized_faces)
        
        # Display results
        result_img = engine.draw_results(img, recognized_faces)
        
        # Show image
        window_name = 'AI Attendance System - Press any key to close'
        cv2.imshow(window_name, result_img)
        print(f"\n🖼 Results displayed. Press any key to close window...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        
        print(f"\n✅ Process completed successfully!")
        print(f"📊 New attendance entries: {new_entries}")
        print(f"💾 Attendance file: {os.path.basename(config.ATTENDANCE_FILE)}")
        
        # OPEN EXCEL FILE AUTOMATICALLY
        open_attendance_file()
        
    except FileNotFoundError as e:
        print(f"\n❌ File error: {e}")
        print("💡 Solution: Make sure you have images in the 'uploads' folder")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        print("💡 Check that all dependencies are installed correctly")
    
    print("\n" + "=" * 50)

# ------------------------------------------------------------
# Run the application
# ------------------------------------------------------------
if __name__ == "__main__":
    main()