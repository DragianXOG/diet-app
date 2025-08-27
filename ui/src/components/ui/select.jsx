import React, { createContext, useContext } from 'react';
const Ctx = createContext({ value:'', onValueChange:()=>{}, options:[] });
function collectOptions(children, arr=[]) {
  React.Children.forEach(children, child => {
    if (!child) return;
    if (child.type && child.type.__selectItem) arr.push({ value: child.props.value, label: child.props.children });
    if (child.props && child.props.children) collectOptions(child.props.children, arr);
  });
  return arr;
}
export function Select({ value, onValueChange, children }) {
  const options = collectOptions(children, []);
  return (
    <Ctx.Provider value={{ value, onValueChange, options }}>
      <select
        value={value}
        onChange={e=>onValueChange?.(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-zinc-900"
      >
        {options.map((o,i)=> <option key={i} value={o.value}>{o.label}</option>)}
      </select>
    </Ctx.Provider>
  );
}
export function SelectTrigger({ children }) { return <>{children}</>; }
export function SelectValue() { const ctx = useContext(Ctx); const opt = ctx.options.find(o=>o.value===ctx.value); return <span>{opt?.label ?? ''}</span>; }
export function SelectContent({ children }) { return <>{children}</>; }
export function SelectItem({ value, children }) {}
SelectItem.__selectItem = true;
