// Escape every message segment; only known participant mentions receive markup.
const escape = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
export function conversationMessage(body, participants = []) {
  const text = String(body ?? "");
  const names = [...new Set(participants.map(person => person.display_name).filter(Boolean))].sort((a,b) => b.length-a.length);
  if (!names.length) return escape(text);
  const alternatives = names.map(name => Array.from(name, character => "\\u{" + character.codePointAt(0).toString(16) + "}").join(""));
  const pattern = new RegExp(`(?<![\p{L}\p{N}_@])@(?:${alternatives.join("|")})(?![\p{L}\p{N}_])`, "giu");
  let output = "", position = 0;
  for (const match of text.matchAll(pattern)) {
    output += escape(text.slice(position,match.index)) + `<span class="conversation-mention">${escape(match[0])}</span>`;
    position = match.index + match[0].length;
  }
  return output + escape(text.slice(position));
}
