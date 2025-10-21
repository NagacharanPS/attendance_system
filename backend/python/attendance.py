import cv2
import os
import numpy as np
import pandas as pd
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Import DeepFace
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    print("📦 DeepFace not found. Installing...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "deepface"])
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True

class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
    KNOWN_FACES_DIR = os.path.join(BASE_DIR, 'known_faces')
    ATTENDANCE_FILE = os.path.join(BASE_DIR, 'attendance.xlsx')
    MODEL_NAME = "VGG-Face"
    DETECTOR_BACKEND = "opencv"
    SIMILARITY_THRESHOLD = 0.6

class FaceRecognitionEngine:
    def __init__(self, config):
        self.config = config
        self.known_faces_db = []
        self._ensure_directories()
        self._build_known_faces_database()
    
    def _ensure_directories(self):
        os.makedirs(self.config.UPLOADS_DIR, exist_ok=True)
        os.makedirs(self.config.KNOWN_FACES_DIR, exist_ok=True)
    
    def _build_known_faces_database(self):
        print("🔨 Building known faces database...")
        
        if not os.path.exists(self.config.KNOWN_FACES_DIR):
            print(f"⚠️ Known faces directory not found: {self.config.KNOWN_FACES_DIR}")
            return
        
        total_images = 0
        successful_encodings = 0
        
        for person_folder in os.listdir(self.config.KNOWN_FACES_DIR):
            person_path = os.path.join(self.config.KNOWN_FACES_DIR, person_folder)
            
            if os.path.isdir(person_path):
                print(f"👤 Processing: {person_folder}")
                
                for filename in os.listdir(person_path):
                    if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                        total_images += 1
                        img_path = os.path.join(person_path, filename)
                        
                        try:
                            embedding_obj = DeepFace.represent(
                                img_path=img_path,
                                model_name=self.config.MODEL_NAME,
                                detector_backend=self.config.DETECTOR_BACKEND,
                                enforce_detection=False,
                                align=True
                            )
                            
                            if embedding_obj:
                                self.known_faces_db.append({
                                    'name': person_folder,
                                    'embedding': embedding_obj[0]['embedding'],
                                    'path': img_path,
                                })
                                successful_encodings += 1
                                
                        except Exception as e:
                            print(f"    ❌ Failed: {filename}")
        
        print(f"✅ Database built: {successful_encodings}/{total_images} images encoded")
    
    def find_latest_uploaded_image(self):
        image_files = [
            f for f in os.listdir(self.config.UPLOADS_DIR)
            if os.path.isfile(os.path.join(self.config.UPLOADS_DIR, f)) and 
            f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ]
        
        if not image_files:
            raise FileNotFoundError("❌ No image files found in uploads directory!")
        
        image_files.sort(
            key=lambda f: os.path.getmtime(os.path.join(self.config.UPLOADS_DIR, f)),
            reverse=True
        )
        
        latest_image = image_files[0]
        image_path = os.path.join(self.config.UPLOADS_DIR, latest_image)
        
        print(f"🔍 Latest uploaded image: {latest_image}")
        return image_path
    
    def process_image(self, image_path):
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"❌ Image not found: {image_path}")
        
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"❌ Failed to load image: {image_path}")
        
        print(f"🖼 Image loaded: {img.shape[1]}x{img.shape[0]} pixels")
        
        try:
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
                
                top = y
                right = x + w
                bottom = y + h
                left = x
                
                face_embedding = face_data['embedding']
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
        if not self.known_faces_db:
            return "Unknown", 0.0
        
        best_match = "Unknown"
        best_confidence = 0.0
        
        for known_face in self.known_faces_db:
            try:
                source_emb = np.array(source_embedding)
                known_emb = np.array(known_face['embedding'])
                
                cosine_similarity = np.dot(source_emb, known_emb) / (np.linalg.norm(source_emb) * np.linalg.norm(known_emb))
                confidence = (cosine_similarity + 1) / 2
                
                if confidence > best_confidence and confidence > self.config.SIMILARITY_THRESHOLD:
                    best_confidence = confidence
                    best_match = known_face['name']
                    
            except Exception:
                continue
        
        return best_match, best_confidence

    def mark_attendance(self, recognized_faces):
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
                today_attendance = df[
                    (df['Name'] == name) & 
                    (df['Date'] == date_str)
                ]
                
                if today_attendance.empty:
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
        
        df.to_excel(self.config.ATTENDANCE_FILE, index=False)
        return new_entries

def main():
    print("🚀 AI Attendance System - Starting...")
    
    try:
        config = Config()
        engine = FaceRecognitionEngine(config)
        
        image_path = engine.find_latest_uploaded_image()
        img, recognized_faces = engine.process_image(image_path)
        
        if not recognized_faces:
            print("⚠️ No faces detected in the image")
            return
        
        print(f"\n📋 Processing Summary:")
        print(f"  - Faces detected: {len(recognized_faces)}")
        
        # Check if there are any unknown faces
        unknown_faces = [face for face in recognized_faces if face['name'] == 'Unknown']
        known_faces = [face for face in recognized_faces if face['name'] != 'Unknown']
        
        print(f"  - Known persons: {len(known_faces)}")
        print(f"  - Unknown persons: {len(unknown_faces)}")
        
        # Mark attendance (only for known faces)
        new_entries = engine.mark_attendance(recognized_faces)
        
        # REMOVED: Image display code for all cases
        if unknown_faces:
            print(f"\n🚫 Security Alert: {len(unknown_faces)} unknown face(s) detected!")
            print(f"✅ Attendance marked for {new_entries} known person(s)")
            print(f"💾 Attendance saved to: {config.ATTENDANCE_FILE}")
        else:
            print(f"\n✅ Process completed successfully!")
            print(f"📊 New attendance entries: {new_entries}")
            print(f"💾 Attendance saved to: {config.ATTENDANCE_FILE}")
        
    except FileNotFoundError as e:
        print(f"\n❌ File error: {e}")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()