import React, {createContext, useContext} from 'react';
const Ctx = createContext({ value:'', onValueChange:()=>{} });
export function Tabs({ value, onValueChange, children, className='' }) {
  return <div className={className}><Ctx.Provider value={{value,onValueChange}}>{children}</Ctx.Provider></div>;
}
export function TabsList({ children, className='' }) {
  return <div className={['flex flex-wrap gap-2 border rounded-2xl p-1 bg-white/70 backdrop-blur',className].join(' ')}>{children}</div>;
}
export function TabsTrigger({ value, children, className='' }) {
  const ctx = useContext(Ctx);
  const active = ctx.value === value;
  const base='px-3.5 py-2 rounded-xl text-sm transition border';
  const style = active ? "bg-primary text-white border-primary shadow-soft" : "text-foreground/70 border-transparent hover:bg-primary/10"
  return <button className={[base,style,className].join(' ')} aria-selected={active} onClick={()=>ctx.onValueChange?.(value)}>{children}</button>;
}
export function TabsContent({ value, children }) {
  const ctx = useContext(Ctx);
  return ctx.value === value ? <div className="mt-5">{children}</div> : null;
}
