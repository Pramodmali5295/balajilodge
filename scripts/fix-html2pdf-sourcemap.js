const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'node_modules', 'html2pdf.js', 'dist');

try {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    files.forEach(file => {
      const p = path.join(dir, file);
      let content = fs.readFileSync(p, 'utf8');
      const newContent = content
        .replace(/\/\/#[ \t]*sourceMappingURL=.*$/mg, '')
        .replace(/\/\*# sourceMappingURL=.*\*\//mg, '');
      if (newContent !== content) {
        fs.writeFileSync(p, newContent, 'utf8');
        console.log('Removed sourceMappingURL from', p);
      }
    });

    // remove any placeholder map file we might have created earlier
    const placeholder = path.join(dir, 'SVGPathData.module.js.map');
    if (fs.existsSync(placeholder)) {
      try { fs.unlinkSync(placeholder); console.log('Removed placeholder map', placeholder); } catch(e) {}
    }
  } else {
    // nothing to fix
  }
} catch (err) {
  console.error('Error while cleaning html2pdf source maps:', err);
  // don't fail install
}
