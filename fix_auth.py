import os
import re

dir_path = r'c:\Kaushik\Courses\Courses\Bitsom\Project\Phase 5\Version\3-6-26\2-6-26\2-6-26\salessaathi'

files = [
    'dashboard.html', # added to cover any profile issues
    'solutions.html',
    'solutions/sales-leaders.html',
    'solutions/revenue-operations.html',
    'solutions/account-executives.html',
    'resources.html',
    'pricing.html',
    'index.html',
    'features.html',
    'contact.html',
    'auth.html',
    'header.html'
]

for file_name in files:
    full_path = os.path.join(dir_path, file_name)
    if not os.path.exists(full_path):
        continue
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove isLoggedIn and userName from x-data
    content = re.sub(r',\s*isLoggedIn:\s*(?:false|\$persist\(false\))', '', content)
    content = re.sub(r'isLoggedIn:\s*(?:false|\$persist\(false\)),\s*', '', content)
    
    content = re.sub(r',\s*userName:\s*(?:\'[^\']*\'|\$persist\(\'[^\']*\'\)|"[^"]*")', '', content)
    content = re.sub(r'userName:\s*(?:\'[^\']*\'|\$persist\(\'[^\']*\'\)|"[^"]*"),\s*', '', content)

    # 2. Replace x-if="!isLoggedIn" with x-if="!$store.auth.isLoggedIn"
    content = content.replace('x-if="!isLoggedIn"', 'x-if="!$store.auth.isLoggedIn"')

    # 3. Replace x-if="isLoggedIn" with x-if="$store.auth.isLoggedIn"
    content = content.replace('x-if="isLoggedIn"', 'x-if="$store.auth.isLoggedIn"')

    # 4. Replace x-text="userName" with x-text="$store.auth.user?.name || 'Loading...'"
    content = content.replace('x-text="userName"', 'x-text="$store.auth.user?.name || \'Loading...\'"')

    # 5. Handle image URL: encodeURIComponent(userName)
    content = content.replace('encodeURIComponent(userName)', 'encodeURIComponent($store.auth.user?.name || \'Loading...\')')

    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Replacement completed.")
