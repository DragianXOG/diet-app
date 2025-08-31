import React, { forwardRef } from "react";
function cx(...p){ return p.filter(Boolean).join(" "); }

// Strip any incoming utility tokens that could fight the spec.
// Keep spacing/layout helpers like px-*, py-*, ml-*, mr-*, w-*, h-*, gap-*, etc.
function sanitize(user) {
  if (!user) return "";
  const toks = String(user).split(/\s+/).filter(Boolean);
  return toks.filter(t =>
    !/^bg-/.test(t) && t !== "bg-transparent" &&
    !/^text-/.test(t) &&
    !/^border-/.test(t)  // allow "border" but not "border-..."
  ).join(" ");
}

// Base: shared structure + focus ring + soft shadow
const base = "inline-flex items-center justify-center rounded-xl transition border shadow-soft gap-2 " +
             "select-none disabled:opacity-50 disabled:pointer-events-none " +
             "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

// Green → Purple spec (idle green; hover/active/selected purple; white text)
const SPEC = "bg-[#48A860] text-white border-[#48A860] " +
             "hover:bg-[#4B0082] hover:border-[#4B0082] " +
             "active:bg-[#4B0082] active:border-[#4B0082] " +
             "focus-visible:ring-[#4B0082] " +
             "aria-selected:bg-[#4B0082] aria-selected:border-[#4B0082] aria-selected:text-white " +
             "data-[state=active]:bg-[#4B0082] data-[state=active]:border-[#4B0082]";

// All variants map to the same spec
const variants = {
  default: SPEC,
  outline: SPEC,
  secondary: SPEC,
  ghost: SPEC,
};

// Sizes (padding + font-size)
const sizes = {
  sm: "px-2.5 py-1.5 text-sm",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-3 text-base",   // match overlay need
};

export const Button = forwardRef(function Button(
  { className, variant = "default", size = "md", type = "button", ...props },
  ref
) {
  const v = variants[variant] || variants.default;
  const s = sizes[size] || sizes.md;
  const safe = sanitize(className);
  // Place user classes BEFORE spec so the spec wins on conflicts
  const cls = cx(base, safe, s, v);
  return (
    <button ref={ref} type={type} className={cls} {...props} />
  );
});

export default Button;
