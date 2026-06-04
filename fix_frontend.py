import os
import re

def fix_all():
    html_files = []
    for root, dirs, files in os.walk('.'):
        if 'node_modules' in root: continue
        for file in files:
            if file.endswith('.html'):
                html_files.append(os.path.join(root, file))
                
    css_block = '''
    <style>
        .dark input, .dark textarea, .dark select {
            color: #f8fafc !important;
            background-color: #18181b !important;
            border-color: rgba(255, 255, 255, 0.15) !important;
        }
        .dark input::placeholder, .dark textarea::placeholder {
            color: #71717a !important;
            opacity: 1;
        }
        .dark select option {
            background-color: #18181b !important;
            color: #f8fafc !important;
        }
    </style>
'''
    
    for file in html_files:
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        
        # 1. Reorder scripts
        # Find module script
        module_script = r'<script type="module" src="[^"]*main\.js"></script>'
        match = re.search(module_script, new_content)
        if match:
            script_str = match.group(0)
            # Remove it from current location
            new_content = new_content.replace(script_str, '')
            # Insert it BEFORE alpinejs
            alpine_persist = r'<script defer src="[^"]*@alpinejs/persist[^"]*"></script>'
            if re.search(alpine_persist, new_content):
                new_content = re.sub(alpine_persist, script_str + '\n    ' + r'\g<0>', new_content)
            else:
                alpine_core = r'<script defer src="[^"]*alpinejs@[^"]*"></script>'
                if re.search(alpine_core, new_content):
                    new_content = re.sub(alpine_core, script_str + '\n    ' + r'\g<0>', new_content)
        
        # 2. Inject CSS block before </head> if not already there
        if 'color: #f8fafc !important;' not in new_content:
            new_content = new_content.replace('</head>', css_block + '</head>')
            
        if content != new_content:
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {file}")

if __name__ == '__main__':
    fix_all()
