// Shared prompt state helpers also exercised by the Node unit suite.
export function promptIncomplete(prompt, input = prompt?.inputValue || "", selected = prompt?.selectValue || "") {
  return Boolean(prompt?.required && !String(input).trim() || prompt?.selectOptions?.length && !selected);
}
export function retainPromptValues(prompt, input, selected) {
  if (!prompt) return;
  if (input !== undefined) prompt.inputValue = input;
  if (selected !== undefined) prompt.selectValue = selected;
}
export function takePromptSubmission(prompt, input, selected) {
  if (!prompt || prompt.submitting || promptIncomplete(prompt, input, selected)) return null;
  prompt.submitting = true;
  return { value: String(input || "").trim(), selected: selected || "" };
}
export function rememberFocus(element) {
  if (!element || element === document.body) return () => null;
  const attributes = [...element.attributes].filter(item => item.name === "id" || item.name.startsWith("data-") || item.name === "aria-label");
  const tag = element.tagName.toLowerCase(), text = element.textContent;
  return () => {
    if (element.isConnected) return element;
    for (const attribute of attributes) {
      const match = [...document.querySelectorAll(`${tag}[${attribute.name}]`)].find(node => node.getAttribute(attribute.name) === attribute.value);
      if (match) return match;
    }
    return [...document.querySelectorAll(tag)].find(node => node.textContent === text) || null;
  };
}
