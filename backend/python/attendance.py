# imports
from deepface import DeepFace
import cv2
import os
import numpy as np
import pandas as pd
from datetime import datetime
from deepface import DeepFace
import warnings
warnings.filterwarnings('ignore')

class Config:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__)) #Get the directory of the current file(python folder)
    UPLOADS_DIR = f"{BASE_DIR}/uploads"
    KNOWN_FACES_DIR = f"{BASE_DIR}/known_faces"
    ATTENDANCE_FILE = f"{BASE_DIR}/attendance.xlsx"
    MODEL_NAME = "VGG-Face"
    DETECTOR_BACKEND = "opencv"
    SIMILARITY_THRESHOLD = 0.6

#face recognition logic
class FaceRecognition:
    def __init__(self, config):
        self.cfg = config
        self.known_faces = []
        self._setup_folders()
        self._load_known_faces()
        
    def _setup_folders(self):
        os.makedirs(self.cfg.UPLOADS_DIR, exist_ok=True) 
        os.makedirs(self.cfg.KNOWN_FACES_DIR, exist_ok=True)

    def _load_known_faces(self):
        print("Loading known faces...")

        for person in os.listdir(self.cfg.KNOWN_FACES_DIR):
            person_path = os.path.join(self.cfg.KNOWN_FACES_DIR, person)
            if not os.path.isdir(person_path):
                continue

            for file in os.listdir(person_path):
                if not file.lower().endswith(('.jpg', '.jpeg', '.png')):
                    continue

                img_path = os.path.join(person_path, file)
                try:
                    face = DeepFace.represent(
                        img_path=img_path,
                        model_name=self.cfg.MODEL_NAME,
                        detector_backend=self.cfg.DETECTOR_BACKEND,
                        enforce_detection=False
                    )
                    if face:
                        self.known_faces.append({
                            'name': person,
                            'embedding': face[0]['embedding']
                        })
                except Exception:
                    print(f"❌ Could not process {file}")
                    continue

        print(f"Loaded {len(self.known_faces)} known face(s).")

    def get_latest_upload(self):
        files = [f for f in os.listdir(self.cfg.UPLOADS_DIR)
                 if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if not files:
            raise FileNotFoundError("No uploaded images found!")

        files.sort(key=lambda f: os.path.getmtime(os.path.join(self.cfg.UPLOADS_DIR, f)), reverse=True)
        latest = files[0]
        print(f"📸 Latest uploaded image: {latest}")
        return os.path.join(self.cfg.UPLOADS_DIR, latest)

    def recognize_faces(self, image_path):
        print("⚙️ Recognizing faces...")
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Invalid image file")

        results = DeepFace.represent(
            img_path=image_path,
            model_name=self.cfg.MODEL_NAME,
            detector_backend=self.cfg.DETECTOR_BACKEND,
            enforce_detection=False
        )

        recognized = []
        for face in results:
            emb = np.array(face['embedding'])
            name, confidence = self._match_face(emb)
            recognized.append({'name': name, 'confidence': confidence})

            if name != "Unknown":
                print(f"✅ Recognized: {name} ({confidence:.2%})")
            else:
                print("❓ Unknown face detected")

        return recognized

    def _match_face(self, emb):
        if not self.known_faces:
            return "Unknown", 0.0

        best_name, best_score = "Unknown", 0.0

        for known in self.known_faces:
            known_emb = np.array(known['embedding'])
            similarity = np.dot(emb, known_emb) / (np.linalg.norm(emb) * np.linalg.norm(known_emb))
            confidence = (similarity + 1) / 2

            if confidence > best_score and confidence > self.cfg.SIMILARITY_THRESHOLD:
                best_score, best_name = confidence, known['name']

        return best_name, best_score

    # ✅ Updated section
    def mark_attendance(self, faces):
        df = pd.read_excel(self.cfg.ATTENDANCE_FILE) if os.path.exists(self.cfg.ATTENDANCE_FILE) \
             else pd.DataFrame(columns=["Name", "Date", "Time", "Confidence"])

        now = datetime.now()
        date, time = now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S")
        new_entries = 0

        for f in faces:
            if f['name'] == "Unknown":
                continue

            already_marked = df[(df['Name'] == f['name']) & (df['Date'] == date)]
            if not already_marked.empty:
                print(f"🕒 {f['name']}'s attendance is already marked for today.")
                continue

            df.loc[len(df)] = [f['name'], date, time, f"{f['confidence']:.2%}"]
            new_entries += 1
            print(f"✅ Attendance marked successfully for {f['name']}.")

        df.to_excel(self.cfg.ATTENDANCE_FILE, index=False)
        return new_entries
    
#main function
def main():
    print("🚀 Starting AI Attendance System...")

    try:
        cfg = Config()
        system = FaceRecognition(cfg)

        img_path = system.get_latest_upload()
        faces = system.recognize_faces(img_path)

        if not faces:
            print("⚠️ No faces detected.")
            return

        new_entries = system.mark_attendance(faces)
        unknown_count = len([f for f in faces if f['name'] == "Unknown"])

        print("\n📋 Summary:")
        print(f"  - Total Faces: {len(faces)}")
        print(f"  - New Attendance Entries: {new_entries}")
        print(f"  - Unknown Faces: {unknown_count}")
        print(f"💾 Attendance saved to: {cfg.ATTENDANCE_FILE}")

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()
