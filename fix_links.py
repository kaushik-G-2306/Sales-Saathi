import os
import re

def fix_links():
    html_files = [f for f in os.listdir('.') if f.endswith('.html')]
    
    replacements = [
        (r'<a href="#"([^>]*>Features</a>)', r'<a href="features.html"\1'),
        (r'<a href="#"([^>]*>Pricing</a>)', r'<a href="pricing.html"\1'),
        (r'<a href="#"([^>]*>Resources</a>)', r'<a href="resources.html"\1'),
        (r'<a href="#"([^>]*>Contact</a>)', r'<a href="contact.html"\1'),
        (r'<a href="#"([^>]*>Dashboard Workspace</a>)', r'<a href="dashboard.html"\1'),
        (r'<a href="#"([^>]*>Account Settings</a>)', r'<a href="settings.html"\1'),
        (r'<a href="#"( class="flex items-center gap-2\.5 (?:mb-6|group outline-none).*?>\s*<img[^>]*>.*?<span[^>]*>Sales Saathi</span>\s*</a>)', r'<a href="index.html"\1')
    ]

    for file in html_files:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for old, new in replacements:
            new_content = re.sub(old, new, new_content, flags=re.DOTALL)
            
        if content != new_content:
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed links in {file}")

if __name__ == '__main__':
    fix_links()
