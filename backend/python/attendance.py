# imports
import os
import cv2
import numpy as np
import pandas as pd
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
# STYLE CLASS (For Attractive Output)
# ===============================
class Style:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# ===============================
# CONFIGURATION
# ===============================
class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
    KNOWN_FACES_DIR = os.path.join(BASE_DIR, 'known_faces')
    ATTENDANCE_FILE = os.path.join(BASE_DIR, 'attendance.xlsx')
    
    # Removed DB_FILE since we are not using cache anymore
    
    MODEL_NAME = "Facenet512" 
    DETECTOR_BACKEND = "ssd" 
    SIMILARITY_THRESHOLD = 0.80

class FaceRecognitionEngine:
    def __init__(self, config):
        self.config = config
        self.known_faces_db = []
        self._ensure_directories()
        self._load_faces_directly() # Changed from _load_or_build
    
    def _ensure_directories(self):
        os.makedirs(self.config.UPLOADS_DIR, exist_ok=True)
        os.makedirs(self.config.KNOWN_FACES_DIR, exist_ok=True)
    
    def _load_faces_directly(self):
        """
        Loads faces directly from the 'known_faces' folder every time.
        No caching involved.
        """
        print(f"{Style.CYAN}📂 Scanning 'known_faces' directory for profiles...{Style.ENDC}")
        
        self.known_faces_db = []
        
        if not os.path.exists(self.config.KNOWN_FACES_DIR):
            print(f"{Style.RED}❌ Error: 'known_faces' directory is missing.{Style.ENDC}")
            return
        
        profiles_found = 0
        
        # Iterate over folders in known_faces
        for person_name in os.listdir(self.config.KNOWN_FACES_DIR):
            person_path = os.path.join(self.config.KNOWN_FACES_DIR, person_name)
            
            if os.path.isdir(person_path):
                # print(f"   👤 Processing: {person_name}...") # Optional: Uncomment to see every name
                
                for filename in os.listdir(person_path):
                    if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                        img_path = os.path.join(person_path, filename)
                        try:
                            # Generate embedding fresh from the image
                            embeddings = DeepFace.represent(
                                img_path=img_path,
                                model_name=self.config.MODEL_NAME,
                                detector_backend=self.config.DETECTOR_BACKEND,
                                enforce_detection=False, 
                                align=True
                            )
                            for emb in embeddings:
                                self.known_faces_db.append({
                                    'name': person_name,
                                    'embedding': emb['embedding']
                                })
                        except:
                            pass
                profiles_found += 1
        
        print(f"{Style.GREEN}✅ Biometric Database Ready: {len(self.known_faces_db)} face encodings loaded from disk.{Style.ENDC}")
        print("-" * 50)

    def find_latest_uploaded_image(self):
        files = [f for f in os.listdir(self.config.UPLOADS_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if not files:
            raise FileNotFoundError("❌ No uploaded images found.")
        files.sort(key=lambda f: os.path.getmtime(os.path.join(self.config.UPLOADS_DIR, f)), reverse=True)
        return os.path.join(self.config.UPLOADS_DIR, files[0])

    def recognize_faces(self, image_path):
        print(f"{Style.BOLD}⚙️  Processing Image: {os.path.basename(image_path)}...{Style.ENDC}")
        
        try:
            target_embeddings = DeepFace.represent(
                img_path=image_path,
                model_name=self.config.MODEL_NAME,
                detector_backend=self.config.DETECTOR_BACKEND,
                enforce_detection=True, 
                align=True
            )
        except ValueError:
            print(f"{Style.YELLOW}⚠️  Alert: No human faces detected in the provided image.{Style.ENDC}")
            return []
        except Exception as e:
            print(f"{Style.RED}❌ Error during detection: {e}{Style.ENDC}")
            return []

        results = []
        print(f"{Style.CYAN}   🔍 Analyzing detected faces...{Style.ENDC}")
        
        for face_data in target_embeddings:
            name, confidence = self._match_face(face_data['embedding'])
            
            if name == "Unknown":
                print(f"   ⛔ Unknown Subject Detected (Match Score: {confidence:.2%}) -> {Style.RED}IGNORED{Style.ENDC}")
            else:
                print(f"   ✅ {Style.GREEN}MATCH FOUND: {name}{Style.ENDC} (Match Score: {confidence:.2%})")
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
        print("-" * 50)
        if not recognized_faces:
            print(f"{Style.BLUE}ℹ️  Status: No valid attendance entries to record.{Style.ENDC}")
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
                print(f"   📝 {Style.GREEN}Attendance Recorded: {name}{Style.ENDC}")
            else:
                print(f"   ℹ️  {name} is already marked for today.")
        
        df.to_excel(self.config.ATTENDANCE_FILE, index=False)
        return count

def main():
    print("\n" + "="*50)
    print(f"{Style.HEADER}🚀 Initializing AI Attendance System...{Style.ENDC}")
    print("="*50)
    
    try:
        engine = FaceRecognitionEngine(Config())
        try:
            img_path = engine.find_latest_uploaded_image()
        except FileNotFoundError:
            print(f"{Style.RED}❌ Error: No images found in 'uploads' directory.{Style.ENDC}")
            return

        recognized_faces = engine.recognize_faces(img_path)
        
        engine.mark_attendance(recognized_faces)
        
        print("-" * 50)
        print(f"{Style.GREEN}✅ Workflow Completed Successfully.{Style.ENDC}")
        print("="*50 + "\n")
            
    except Exception as e:
        print(f"{Style.RED}❌ Critical Error: {e}{Style.ENDC}")

if __name__ == "__main__":
    main()