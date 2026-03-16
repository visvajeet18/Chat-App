const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(appJsPath, 'utf-8');

const key = process.env.SUPABASE_ANON_KEY;

if (key) {
    // Replace placeholder with env var
    content = content.replace('YOUR_SUPABASE_ANON_KEY', key);
    fs.writeFileSync(appJsPath, content);
    console.log('Build complete: Injected SUPABASE_ANON_KEY from environment.');
} else {
    console.log('No SUPABASE_ANON_KEY found in environment variables. Skipping injection.');
}
