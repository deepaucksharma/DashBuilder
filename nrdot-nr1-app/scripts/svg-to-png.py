#!/usr/bin/env python3
"""
Convert SVG to PNG for New Relic icon requirement
Requires: pip install pillow cairosvg
"""

import os
import sys

try:
    from cairosvg import svg2png
    from PIL import Image
    import io
except ImportError:
    print("❌ Required packages not installed!")
    print("Please run: pip install pillow cairosvg")
    sys.exit(1)

def convert_svg_to_png(svg_path, png_path, size=512):
    """Convert SVG to PNG with specified size"""
    
    print(f"🎨 Converting {svg_path} to {png_path}...")
    
    try:
        # Convert SVG to PNG bytes
        png_bytes = svg2png(
            url=svg_path,
            output_width=size,
            output_height=size
        )
        
        # Open with PIL to ensure it's valid
        img = Image.open(io.BytesIO(png_bytes))
        
        # Ensure RGBA mode for transparency
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Save as PNG
        img.save(png_path, 'PNG', optimize=True)
        
        print(f"✅ Successfully created {png_path} ({size}x{size})")
        return True
        
    except Exception as e:
        print(f"❌ Error converting SVG: {e}")
        return False

def create_fallback_icon(png_path, size=512):
    """Create a fallback icon if SVG conversion fails"""
    
    print("🎨 Creating fallback icon...")
    
    try:
        # Create a new RGBA image
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        
        # Draw a simple icon using PIL
        from PIL import ImageDraw, ImageFont
        
        draw = ImageDraw.Draw(img)
        
        # Background circle
        margin = 20
        draw.ellipse(
            [margin, margin, size-margin, size-margin],
            fill=(0, 126, 139, 255)  # #007e8b
        )
        
        # Inner circle
        inner_margin = 60
        draw.ellipse(
            [inner_margin, inner_margin, size-inner_margin, size-inner_margin],
            fill=(255, 255, 255, 255)
        )
        
        # Text
        text = "NRDOT"
        font_size = 80
        
        # Try to use a nice font, fall back to default
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            font = ImageFont.load_default()
        
        # Calculate text position
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        
        draw.text((x, y), text, fill=(0, 126, 139, 255), font=font)
        
        # Save
        img.save(png_path, 'PNG', optimize=True)
        print(f"✅ Successfully created fallback icon at {png_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error creating fallback icon: {e}")
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    svg_path = os.path.join(project_root, 'icon.svg')
    png_path = os.path.join(project_root, 'icon.png')
    
    # Check if SVG exists
    if os.path.exists(svg_path):
        success = convert_svg_to_png(svg_path, png_path)
        if not success:
            print("⚠️  SVG conversion failed, creating fallback icon...")
            create_fallback_icon(png_path)
    else:
        print("⚠️  No icon.svg found, creating fallback icon...")
        create_fallback_icon(png_path)
    
    # Verify the result
    if os.path.exists(png_path):
        img = Image.open(png_path)
        print(f"\n📊 Icon details:")
        print(f"   Size: {img.size[0]}x{img.size[1]}")
        print(f"   Mode: {img.mode}")
        print(f"   Format: {img.format}")
        print(f"\n✅ Icon ready for New Relic deployment!")
    else:
        print("\n❌ Failed to create icon.png")
        sys.exit(1)

if __name__ == "__main__":
    main()