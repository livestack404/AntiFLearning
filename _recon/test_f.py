"""Scratch script for Section F: Upload Crash Tests."""

import sys
import io
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import numpy as np
from PIL import Image
import httpx
import json

def generate_test_payloads():
    payloads = {}
    
    # 1. Normal grayscale JPEG
    im1 = Image.fromarray(np.full((100, 100), 128, dtype=np.uint8), mode="L")
    b1 = io.BytesIO(); im1.save(b1, format="JPEG")
    payloads["normal_grayscale_jpeg"] = ("test.jpg", b1.getvalue(), "image/jpeg")
    
    # 2. RGB PNG 1200x900
    im2 = Image.fromarray(np.full((900, 1200, 3), 100, dtype=np.uint8), mode="RGB")
    b2 = io.BytesIO(); im2.save(b2, format="PNG")
    payloads["rgb_png_1200x900"] = ("large.png", b2.getvalue(), "image/png")
    
    # 3. RGBA PNG
    im3 = Image.fromarray(np.full((100, 100, 4), 150, dtype=np.uint8), mode="RGBA")
    b3 = io.BytesIO(); im3.save(b3, format="PNG")
    payloads["rgba_png"] = ("alpha.png", b3.getvalue(), "image/png")
    
    # 4. Palette (mode P) PNG
    im4 = Image.fromarray(np.full((100, 100), 1, dtype=np.uint8), mode="P")
    im4.putpalette([0,0,0, 255,255,255] + [0]*(254*3))
    b4 = io.BytesIO(); im4.save(b4, format="PNG")
    payloads["palette_mode_p_png"] = ("palette.png", b4.getvalue(), "image/png")
    
    # 5. 16-bit PNG
    arr_16 = np.full((100, 100), 30000, dtype=np.uint16)
    im5 = Image.fromarray(arr_16, mode="I;16")
    b5 = io.BytesIO(); im5.save(b5, format="PNG")
    payloads["16bit_png"] = ("16bit.png", b5.getvalue(), "image/png")
    
    # 6. 0-byte file
    payloads["zero_byte_file"] = ("empty.png", b"", "image/png")
    
    # 7. Text file renamed .png
    payloads["text_file_renamed_png"] = ("fake.png", b"This is not a real PNG image, just plain text.", "image/png")
    
    return payloads

def run_upload_tests():
    payloads = generate_test_payloads()
    results = {}
    
    client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=15.0)
    
    for name, (filename, content, content_type) in payloads.items():
        files = {"file": (filename, content, content_type)}
        try:
            resp = client.post("/api/predict", files=files)
            status_code = resp.status_code
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            results[name] = {
                "status_code": status_code,
                "body": body,
            }
        except Exception as e:
            results[name] = {
                "status_code": "ClientError",
                "body": str(e)
            }
        print(f"[{name}] HTTP {results[name]['status_code']} -> {results[name]['body']}")
        
    with open(BASE_DIR / "_recon" / "f_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Done! Saved to _recon/f_results.json")

if __name__ == "__main__":
    run_upload_tests()
