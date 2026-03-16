const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

console.log('Starting build process...');

// 1. Create public directory if it does not exist
if (!fs.existsSync(publicDir)){
    fs.mkdirSync(publicDir);
    console.log('Created public/ directory');
}

// 2. Copy index.html to public/
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(publicDir, 'index.html'));

// 3. Copy app.js to public/
fs.copyFileSync(path.join(__dirname, 'app.js'), path.join(publicDir, 'app.js'));

// 4. Copy styles.css to public/
fs.copyFileSync(path.join(__dirname, 'styles.css'), path.join(publicDir, 'styles.css'));

console.log('Build complete: All files copied to public/ folder for Vercel deployment.');
