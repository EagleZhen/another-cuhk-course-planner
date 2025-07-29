import ddddocr
import onnxruntime
import os

# Suppress ONNX warnings like in your example
onnxruntime.set_default_logger_severity(3)

def test_ddddocr_captcha():
    ocr = ddddocr.DdddOcr()
    
    captcha_files = [
        ('sample-webpages/sample_captcha_G6J1.png', 'G6J1'),
        ('sample-webpages/sample_captcha_PDG2.gif', 'PDG2')
    ]
    
    for file_path, expected in captcha_files:
        if os.path.exists(file_path):
            print(f"\nTesting {file_path} (expected: {expected})")
            
            try:
                with open(file_path, 'rb') as f:
                    image_bytes = f.read()
                
                # Test multiple times to see consistency
                for attempt in range(5):
                    result = ocr.classification(image_bytes)
                    result_clean = result.strip().upper()
                    print(f"Attempt {attempt + 1}: '{result_clean}' (match: {result_clean == expected})")
                
            except Exception as e:
                print(f"Error: {e}")
        else:
            print(f"File not found: {file_path}")

if __name__ == "__main__":
    test_ddddocr_captcha()