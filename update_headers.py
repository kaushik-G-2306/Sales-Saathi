import os
import re

def update_headers():
    cwd = os.getcwd()
    print(f"Working in {cwd}")
    
    # 1. Read index.html
    with open('index.html', 'r', encoding='utf-8') as f:
        index_content = f.read()
        
    # Extract the header block from index.html
    header_pattern = re.compile(r'(<header.*?</header>)', re.DOTALL | re.IGNORECASE)
    match = header_pattern.search(index_content)
        
    if not match:
        print("Error: Could not find header in index.html")
        return
        
    base_new_header = match.group(1)
    print(f"Found header, length: {len(base_new_header)} chars")
    
    # 2. Iterate through all html files
    html_files = []
    for root, dirs, files in os.walk(cwd):
        for file in files:
            if file.endswith('.html'):
                html_files.append(os.path.join(root, file))
                
    print(f"Found {len(html_files)} HTML files to check.")
    
    updated_count = 0
    for file_path in html_files:
        # Skip index.html itself
        if file_path.endswith('index.html'):
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # find the header in the current file
        file_header_match = header_pattern.search(content)
        if file_header_match:
            new_header = base_new_header
            rel_depth = file_path.replace(cwd, '').strip(os.sep).count(os.sep)
            if rel_depth > 0:
                prefix = '../' * rel_depth
                # Quick and dirty path replacement for known local assets/pages
                # Replace href="page.html" with href="../page.html"
                new_header = re.sub(r'href="([^h#][^"]*)"', rf'href="{prefix}\1"', new_header)
                new_header = re.sub(r'src="([^h][^"]*)"', rf'src="{prefix}\1"', new_header)
                new_header = re.sub(r"window\.location\.href='([^h][^']*)'", rf"window.location.href='{prefix}\1'", new_header)
                
            new_content = content[:file_header_match.start()] + new_header + content[file_header_match.end():]
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
                
            updated_count += 1
            print(f"Updated header in {os.path.basename(file_path)}")
            
    print(f"Successfully updated {updated_count} files.")

if __name__ == '__main__':
    update_headers()
