import easyocr
import os

def test_captcha_ocr():
    reader = easyocr.Reader(['en'], gpu=False)
    
    captcha_files = [
        ('sample-webpages/sample_captcha_G6J1.png', 'G6J1'),
        ('sample-webpages/sample_captcha_PDG2.gif', 'PDG2')
    ]
    
    for file_path, expected in captcha_files:
        if os.path.exists(file_path):
            print(f"\nTesting {file_path} (expected: {expected})")
            
            try:
                results = reader.readtext(file_path, detail=1)
                print(f"Raw results: {results}")
                
                if results:
                    text = results[0][1].strip().upper()
                    confidence = results[0][2]
                    print(f"Extracted: '{text}' (confidence: {confidence:.2f})")
                    print(f"Expected: '{expected}'")
                    print(f"Match: {text == expected}")
                else:
                    print("No text detected")
                    
            except Exception as e:
                print(f"Error: {e}")
        else:
            print(f"File not found: {file_path}")

if __name__ == "__main__":
    test_captcha_ocr()