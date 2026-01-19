const { marked } = require('marked');

function wrapParagraphs(match, tag, id, content) {
  const parts = content.split(/(\n\n+)/);
  return parts.map(part => {
    if (!part.trim() || /^\n+$/.test(part)) {
      return part;
    }
    return `<${tag} data-id="${id}">${part}</${tag}>`;
  }).join('');
}

// Simulate the input: insertion with two paragraphs
const input = '\x00INS0\x00First paragraph.\n\nSecond paragraph.\x00/INS\x00';
console.log('Original input:');
console.log(JSON.stringify(input));

// Apply the fix
let processed = input.replace(/\x00INS(\d+)\x00([\s\S]*?)\x00\/INS\x00/g,
  (match, id, content) => wrapParagraphs(match, 'diffinsert', id, content));
console.log('\nAfter wrapParagraphs:');
console.log(processed);

// Parse with marked
let html = marked.parse(processed);
console.log('\nAfter marked.parse:');
console.log(html);

// Convert placeholders to spans
html = html.replace(/<diffinsert data-id="(\d+)">([\s\S]*?)<\/diffinsert>/g,
  '<span class="diff-insert" data-change-id="$1">$2</span>');
console.log('\nFinal output:');
console.log(html);
