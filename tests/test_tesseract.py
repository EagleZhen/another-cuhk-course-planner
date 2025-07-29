import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import os

def preprocess_image(image_path):
    """Apply preprocessing to improve OCR accuracy"""
    img = Image.open(image_path)
    
    # Convert to grayscale
    img = img.convert('L')
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)
    
    # Apply slight sharpening
    img = img.filter(ImageFilter.SHARPEN)
    
    # Scale up the image (makes OCR more accurate)
    width, height = img.size
    img = img.resize((width * 3, height * 3), Image.LANCZOS)
    
    return img

def test_tesseract_captcha():
    captcha_files = [
        ('sample-webpages/sample_captcha_G6J1.png', 'G6J1'),
        ('sample-webpages/sample_captcha_PDG2.gif', 'PDG2')
    ]
    
    # Tesseract configuration for captcha-like text
    custom_config = r'--oem 3 --psm 8 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    
    for file_path, expected in captcha_files:
        if os.path.exists(file_path):
            print(f"\nTesting {file_path} (expected: {expected})")
            
            try:
                # Test with original image
                original_img = Image.open(file_path)
                original_text = pytesseract.image_to_string(original_img, config=custom_config).strip().upper()
                print(f"Original image: '{original_text}'")
                
                # Test with preprocessed image
                processed_img = preprocess_image(file_path)
                processed_text = pytesseract.image_to_string(processed_img, config=custom_config).strip().upper()
                print(f"Preprocessed: '{processed_text}'")
                
                print(f"Expected: '{expected}'")
                print(f"Original match: {original_text == expected}")
                print(f"Processed match: {processed_text == expected}")
                
                # Save preprocessed image for inspection
                debug_path = f"debug_{os.path.basename(file_path)}"
                processed_img.save(debug_path)
                print(f"Saved preprocessed image: {debug_path}")
                
            except Exception as e:
                print(f"Error: {e}")
        else:
            print(f"File not found: {file_path}")

if __name__ == "__main__":
    test_tesseract_captcha()