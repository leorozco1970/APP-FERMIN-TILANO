import fs from 'fs';
import path from 'path';

const dir = './src/pages';
const newText = 'Una solución de arquitectura pedagógica diseñada por Leonardo Orozco, Tutor PTA/FI 3.O - Atlántico, orientada a la armonización curricular y la excelencia en la Formación Integral de la I.E. Fermín Tilano.';

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    if (fs.statSync(filePath).isDirectory()) {
      processDirectory(filePath);
    } else if (filePath.endsWith('.tsx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      let modified = false;
      
      const regexText = /const footerText = ["'].*?["'];/g;
      if (regexText.test(content)) {
        content = content.replace(regexText, `const footerText = "${newText}";`);
        modified = true;
      }
      
      const regexCredit1 = /const credits = ["'].*?["'];\n\s*doc\.text\(credits.*?;\n/g;
      if (regexCredit1.test(content)) {
         content = content.replace(regexCredit1, '');
         modified = true;
      }

      const regexCredit2 = /const credits = ["'].*?["'];\n\s*pdfDoc\.text\(credits.*?;\n/g;
      if (regexCredit2.test(content)) {
         content = content.replace(regexCredit2, '');
         modified = true;
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
        console.log('Updated', filePath);
      }
    }
  }
}

processDirectory(dir);
console.log('Done');
