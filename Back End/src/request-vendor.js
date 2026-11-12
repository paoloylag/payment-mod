export function generalRequestVendor(fields, vendors = []) {
  if (fields.general_vendor_mode === "new") return {name: String(fields.general_vendor_name || "").trim(), pending: true};
  const vendor = vendors.find(item => item.id === fields.vendor_external_id && item.source !== "procurement" && item.status === "active");
  return {name: vendor?.name || "", pending: false};
}
