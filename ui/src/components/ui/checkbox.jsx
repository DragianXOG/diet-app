import React from 'react';
export function Checkbox({ checked=false, onCheckedChange=()=>{}, className='' }) {
  return <input type="checkbox" className={['h-4 w-4 rounded border-gray-300',className].join(' ')} checked={!!checked} onChange={e=>onCheckedChange(e.target.checked)} style={{accentColor:'#4CBB17'}} />;
}
