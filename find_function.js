const fs = require('fs');
const content = fs.readFileSync('src/features/listen/stt/sttService.js', 'utf8');
const lines = content.split('\n');
let found = false;
lines.forEach((line, i) => {
    if (line.includes('initializeSttSessions')) {
        console.log((i+1) + ': ' + line.trim());
        found = true;
    }
});
if (!found) {
    console.log('Function not found');
}