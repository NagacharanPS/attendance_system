# imports
import os
import cv2
import numpy as np
import pandas as pd
import pickle
from datetime import datetime
import warnings
import sys
import subprocess

# Suppress TensorFlow logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 
warnings.filterwarnings('ignore')

# Import DeepFace
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    print("📦 DeepFace not found. Installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "deepface"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tf-keras"])
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True

# ===============================
# CONFIGURATION
# ===============================
class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
    KNOWN_FACES_DIR = os.path.join(BASE_DIR, 'known_faces')
    ATTENDANCE_FILE = os.path.join(BASE_DIR, 'attendance.xlsx')
    DB_FILE = os.path.join(BASE_DIR, 'known_faces_encodings.pkl')

    # Facenet512 is accurate.
    MODEL_NAME = "Facenet512" 
    
    # --- FIX 1: CHANGE DETECTOR ---
    # 'opencv' is too glitchy (sees faces in walls).
    # 'ssd' is much more stable and still fast.
    DETECTOR_BACKEND = "ssd" 
    
    # Similarity Threshold (0.80 - 0.85 is good for Facenet512)
    SIMILARITY_THRESHOLD = 0.80

class FaceRecognitionEngine:
    def __init__(self, config):
        self.config = config
        self.known_faces_db = []
        self._ensure_directories()
        self._load_or_build_database()
    
    def _ensure_directories(self):
        os.makedirs(self.config.UPLOADS_DIR, exist_ok=True)
        os.makedirs(self.config.KNOWN_FACES_DIR, exist_ok=True)
    
    def _load_or_build_database(self):
        if os.path.exists(self.config.DB_FILE):
            print(f"⚡ Loading database from cache...")
            try:
                with open(self.config.DB_FILE, 'rb') as f:
                    self.known_faces_db = pickle.load(f)
                print(f"✅ Loaded {len(self.known_faces_db)} known people.")
                return
            except Exception:
                print(f"⚠️ Cache corrupted. Rebuilding...")

        self._build_known_faces_database()

    def _build_known_faces_database(self):
        print("🔨 Building known faces database...")
        new_db = []
        
        if not os.path.exists(self.config.KNOWN_FACES_DIR):
            return
        
        for person_name in os.listdir(self.config.KNOWN_FACES_DIR):
            person_path = os.path.join(self.config.KNOWN_FACES_DIR, person_name)
            
            if os.path.isdir(person_path):
                print(f"  👤 Encoding: {person_name}")
                for filename in os.listdir(person_path):
                    if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                        img_path = os.path.join(person_path, filename)
                        try:
                            # We use enforce_detection=False here just to ensure we capture
                            # the known faces even if the crop is weird.
                            embeddings = DeepFace.represent(
                                img_path=img_path,
                                model_name=self.config.MODEL_NAME,
                                detector_backend=self.config.DETECTOR_BACKEND,
                                enforce_detection=False, 
                                align=True
                            )
                            for emb in embeddings:
                                new_db.append({
                                    'name': person_name,
                                    'embedding': emb['embedding']
                                })
                        except:
                            pass
        
        self.known_faces_db = new_db
        with open(self.config.DB_FILE, 'wb') as f:
            pickle.dump(self.known_faces_db, f)
        print(f"✅ Database built and saved.")

    def find_latest_uploaded_image(self):
        files = [f for f in os.listdir(self.config.UPLOADS_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if not files:
            raise FileNotFoundError("❌ No uploaded images found.")
        files.sort(key=lambda f: os.path.getmtime(os.path.join(self.config.UPLOADS_DIR, f)), reverse=True)
        return os.path.join(self.config.UPLOADS_DIR, files[0])

    def recognize_faces(self, image_path):
        print(f"⚙️  Analyzing image: {os.path.basename(image_path)}")
        
        try:
            # --- FIX 2: ENFORCE DETECTION = TRUE ---
            # This ensures that if no face is found, it throws an error immediately
            # instead of trying to process the wall/chair as a face.
            target_embeddings = DeepFace.represent(
                img_path=image_path,
                model_name=self.config.MODEL_NAME,
                detector_backend=self.config.DETECTOR_BACKEND,
                enforce_detection=True, 
                align=True
            )
        except ValueError:
            # This catches "Face could not be detected"
            print("⚠️  No face detected in the image.")
            return []
        except Exception as e:
            print(f"⚠️  Error during detection: {e}")
            return []

        results = []
        for face_data in target_embeddings:
            name, confidence = self._match_face(face_data['embedding'])
            
            # --- LOGGING ---
            if name == "Unknown":
                # We do NOT add unknowns to the results list we return
                # So they are completely ignored.
                print(f"  ⛔ Unknown Face Detected (Score: {confidence:.2%}) -> IGNORING")
            else:
                print(f"  ✅ MATCH FOUND: {name} (Score: {confidence:.2%})")
                results.append({'name': name, 'confidence': confidence})

        return results

    def _match_face(self, source_emb):
        if not self.known_faces_db:
            return "Unknown", 0.0
        
        best_name = "Unknown"
        best_score = 0.0
        
        src = np.array(source_emb)
        
        for known in self.known_faces_db:
            target = np.array(known['embedding'])
            score = np.dot(src, target) / (np.linalg.norm(src) * np.linalg.norm(target))
            score = (score + 1) / 2
            
            if score > best_score:
                best_score = score
                if score > self.config.SIMILARITY_THRESHOLD:
                    best_name = known['name']
        
        return best_name, best_score

    def mark_attendance(self, recognized_faces):
        if not recognized_faces:
            print("ℹ️  No valid attendance to mark.")
            return 0
            
        if os.path.exists(self.config.ATTENDANCE_FILE):
            try:
                df = pd.read_excel(self.config.ATTENDANCE_FILE)
            except:
                df = pd.DataFrame(columns=["Name", "Date", "Time", "Confidence"])
        else:
            df = pd.DataFrame(columns=["Name", "Date", "Time", "Confidence"])

        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        count = 0
        
        for face in recognized_faces:
            name = face['name']
            if df[(df['Name'] == name) & (df['Date'] == date_str)].empty:
                new_entry = pd.DataFrame([{
                    "Name": name, 
                    "Date": date_str, 
                    "Time": time_str, 
                    "Confidence": f"{face['confidence']:.2%}"
                }])
                df = pd.concat([df, new_entry], ignore_index=True)
                count += 1
                print(f"  📝 Attendance Marked: {name}")
            else:
                print(f"  ℹ️  {name} is already marked for today.")
        
        df.to_excel(self.config.ATTENDANCE_FILE, index=False)
        return count

def main():
    print("🚀 Starting AI Attendance...")
    try:
        engine = FaceRecognitionEngine(Config())
        try:
            img_path = engine.find_latest_uploaded_image()
        except FileNotFoundError:
            print("❌ No images in 'uploads' folder.")
            return

        # recognized_faces will be empty if no face is found
        recognized_faces = engine.recognize_faces(img_path)
        
        engine.mark_attendance(recognized_faces)
        print("✅ Done.")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()