from PIL import Image
import os

folder = "known_faces/kiran"  # folder containing your images

for filename in os.listdir(folder):
    if filename.lower().endswith((".jpg", ".jpeg")):
        path = os.path.join(folder, filename)
        with Image.open(path) as img:
            print(f"{filename}: mode={img.mode}, size={img.size}, format={img.format}")
