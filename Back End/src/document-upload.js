export const documentAccept = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc";
export const documentFormats = "PDF, JPG, JPEG, PNG, XLSX, XLS, DOCX or DOC";
const mediaTypes = {
  pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], doc: ["application/msword"],
};
export function documentSelectionError(file) {
  const suffix = String(file.name || "").split(".").pop().toLowerCase();
  const prefix = `“${file.name || "Unnamed file"}”`;
  if (!String(file.name || "").includes(".") || !mediaTypes[suffix])
    return `${prefix} has an unsupported format. Choose ${documentFormats}.`;
  if (!file.size) return `${prefix} is empty. Choose a file containing your document.`;
  if (file.type && !mediaTypes[suffix].includes(file.type.toLowerCase()))
    return `${prefix} has a file type that does not match its extension. Export it again as ${documentFormats}; do not just rename it.`;
  return "";
}
export function documentUploadError(file, error) {
  const message = error?.message || "Upload failed. Try again.";
  return message.includes(file.name) ? message : `“${file.name}”: ${message}`;
}
